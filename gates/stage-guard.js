#!/usr/bin/env node
/**
 * stage-guard（SubagentStop/Stop）。基本設計書 §4.3・§4.5・詳細設計書 §11.1・§11.2。
 *
 * 「stage 系統」ゲートのディスパッチ: investigation / requirements / spec / design の
 * 完了リクエストを work/<ts>/.requests/ から走査し、§4.5 の消費規約（鋳造→削除・
 * marker 存在キー付けの冪等演算）でバッチを処理する。
 *
 *   G1（工程順・状態）: 全リクエストで発火（§11.2 の表: SubagentStop@各リクエスト）
 *   G2（維持判定妥当性）: design リクエストでのみ追加発火（SubagentStop@design）
 *
 * G1/G2 の純関数実装（gates/g1_*.js・g2_*.js）は基本設計書 §14 の命名規約に従い動的 import する。
 * 未実装ゲートの扱いは gates/gate-manifest.js が決める:「不在だが宣言済み」ならスキップ、
 * 「不在で未宣言」「実装済みなのに宣言が残存」はいずれも違反としてブロックする。
 * 素朴に「ファイルが無ければ通す」と実装すると、未実装（正当）とゲート削除（退行）を
 * 区別できず vacuous pass になるため（§11.5）。
 *
 * generation の完了リクエストは gen-guard.js が専任で扱う（本スクリプトの対象外）。
 * 同一リクエスト/マーカーを2スクリプトが競合して扱う事故を避けるための分担。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GATES_DIR } from './lib/canon.js';
import { resolveGates } from './gate-manifest.js';
import {
  readHookInput,
  readSessionTs,
  listRequests,
  hasMarker,
  processStageRequests,
  workDir,
  isMainModule,
  blockStop,
  passStop,
} from './lib/run.js';

const STAGE_ORDER = ['investigation', 'requirements', 'spec', 'design'];

/**
 * マーカー／ブロックラッチのキー名（§4.5 investigation phase 別マーカー）。
 *
 * 調査工程は1段目（要件確定前）と2段目 focused（要件確定後）が同じ 'investigation' 完了
 * リクエストを書く（§4.3 の既知語彙に "investigation2" は無い）。既定でリクエスト名を
 * マーカーキーにすると、1段目で investigation.done が鋳造された後、2段目の SubagentStop が
 * §4.5 ①の冪等スキップに入り、G1 の focused 検査（focused 空欄・evidence_paths 実在・§6.2）が
 * 実 hook 経路で一度も走らない。そこで investigation に限り、work/<ts>/requirements.md が
 * 存在するとき（＝2段目）キーを 'investigation.focused' にし、2段目に別マーカーを与える。
 * リクエストの消費（削除）は processStageRequests がリクエスト名で行う（リクエストは1つ）。
 * 他ステージは phase を持たないためキー＝ステージ名のまま。
 */
export function investigationMarkerKey(ts, stage) {
  if (stage === 'investigation' && existsSync(path.join(workDir(ts), 'requirements.md'))) {
    return 'investigation.focused';
  }
  return stage;
}

/** ステージごとに発火する純関数ゲートのファイル名（gates/ 直下・未実装なら動的にスキップ）。 */
const GATE_MODULES = {
  investigation: ['g1_stage_order.js'],
  requirements: ['g1_stage_order.js'],
  spec: ['g1_stage_order.js'],
  design: ['g1_stage_order.js', 'g2_keep_judgement.js'],
};

async function runRegisteredChecks(ts, stage) {
  const moduleNames = GATE_MODULES[stage] || [];
  // 実体と宣言を突き合わせる。未宣言の不在・宣言の残存は violations に入りブロックされる（§11.5）。
  const { runnable, skipped, violations } = resolveGates(moduleNames);
  for (const name of runnable) {
    const modPath = path.join(GATES_DIR, name);
    let mod;
    try {
      mod = await import(pathToFileURL(modPath).href);
    } catch (err) {
      violations.push(`${name}: import 失敗 - ${err.message}`);
      continue;
    }
    const checkFn = mod.check ?? mod.default;
    if (typeof checkFn !== 'function') {
      violations.push(`${name}: check()（または default export）が関数でない`);
      continue;
    }
    let result;
    try {
      result = await checkFn({ ts, stage });
    } catch (err) {
      violations.push(`${name}: 実行時例外 - ${err.message}`);
      continue;
    }
    if (!result || result.ok !== true) {
      violations.push(`${name}: ${(result && result.violations && result.violations.join(', ')) || '違反'}`);
    }
  }
  // スキップは必ず可視化する。黙って飛ばすと「検査した」と誤認される（§11.5）。
  for (const s of skipped) {
    process.stderr.write(
      `[stage-guard] ${stage}: ${s.gate} 未実装のためスキップ（${s.planned_phase} で実装予定・${s.design_ref}）。` +
        `この run では ${s.gate} の検査は行われていない。\n`
    );
  }
  return { ok: violations.length === 0, violations, skipped };
}

async function main() {
  readHookInput(); // 内容は使わないが stdin を読み切る（hook 契約上の作法）
  const ts = readSessionTs();
  if (!ts) {
    passStop('stage-guard: .session-ts 不在のため対象なし');
    return;
  }

  // processStageRequests の runChecks は同期シグネチャなので、事前に非同期で
  // チェック結果を集めてから渡す（① marker 有のケースは判定不要なので事前計算をスキップする）。
  const precomputed = {};
  for (const stage of listRequests(ts)) {
    if (!STAGE_ORDER.includes(stage)) continue;
    if (hasMarker(ts, investigationMarkerKey(ts, stage))) continue; // phase 別マーカーで冪等スキップ判定
    precomputed[stage] = await runRegisteredChecks(ts, stage);
  }

  const batch = processStageRequests({
    ts,
    stages: STAGE_ORDER,
    runChecks: (_ts, stage) => precomputed[stage] ?? { ok: true, violations: [] },
    markerKey: investigationMarkerKey,
  });

  if (batch.length === 0) {
    passStop('stage-guard: 対象リクエストなし');
    return;
  }

  const failed = batch.filter((r) => r.ok === false);
  if (failed.length > 0) {
    const msg = failed.map((f) => `${f.stage}: ${f.violations.join(' / ')}`).join('\n');
    blockStop(`stage-guard: 違反を検出（blocks/<stage>.blocked を鋳造）\n${msg}`);
    return;
  }

  passStop(`stage-guard: 通過 (${batch.map((r) => `${r.stage}:${r.action}`).join(', ')})`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`stage-guard 内部エラー: ${err.stack || err.message}\n`);
    process.exit(1); // 内部異常は non-blocking（環境要因で誤って run を止めない）
  });
}
