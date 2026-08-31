#!/usr/bin/env node
/**
 * gen-guard（SubagentStop/Stop）。基本設計書 §4.3・§4.5・詳細設計書 §11.1・§11.2。
 *
 * 「snapshot 系統」ゲートのディスパッチ: generation の完了リクエストのみを扱う
 * （investigation/requirements/spec/design は stage-guard.js の担当・競合回避のため分離）。
 *
 * generation で発火するゲート: G1（工程順・状態）＋ G7〜G12（§11.2 の表はいずれも
 * SubagentStop@generation）。未実装ゲートの扱いは gates/gate-manifest.js が決める:
 * 「不在だが宣言済み」ならスキップ、「不在で未宣言」「実装済みなのに宣言が残存」は
 * いずれも違反としてブロックする。素朴に「ファイルが無ければ通す」と実装すると、
 * 未実装（正当）とゲート削除（退行）を区別できず vacuous pass になるため（§11.5）。
 *
 * generation.done は TERMINAL_STAGE（gates/lib/run.js）＝ガードの有効条件の
 * 判定材料そのものなので、本スクリプトが鋳造する marker は run 全体の in-flight 判定に
 * 直結する。鋳造は §4.5 の共有処理（processStageRequests）に一本化し、二重実装しない。
 */

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
  isMainModule,
  blockStop,
  passStop,
  TERMINAL_STAGE,
} from './lib/run.js';

const GEN_STAGES = [TERMINAL_STAGE]; // = ['generation']

const GATE_MODULES = {
  generation: [
    'g1_stage_order.js',
    'g7_ref_integrity.js',
    'g8_non_regression.js',
    'g9_snapshot_completeness.js',
    'g10_readme.js',
    'g11_constraints.js',
    'g12_output_perfile.js', // 名前は基本設計書 §14 の明記に従う（ずれると永久に発火しない）
  ],
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
      `[gen-guard] ${stage}: ${s.gate} 未実装のためスキップ（${s.planned_phase} で実装予定・${s.design_ref}）。` +
        `この run では ${s.gate} の検査は行われていない。\n`
    );
  }
  return { ok: violations.length === 0, violations, skipped };
}

async function main() {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('gen-guard: .session-ts 不在のため対象なし');
    return;
  }

  const precomputed = {};
  for (const stage of listRequests(ts)) {
    if (!GEN_STAGES.includes(stage)) continue;
    if (hasMarker(ts, stage)) continue;
    precomputed[stage] = await runRegisteredChecks(ts, stage);
  }

  const batch = processStageRequests({
    ts,
    stages: GEN_STAGES,
    runChecks: (_ts, stage) => precomputed[stage] ?? { ok: true, violations: [] },
  });

  if (batch.length === 0) {
    passStop('gen-guard: 対象リクエストなし');
    return;
  }

  const failed = batch.filter((r) => r.ok === false);
  if (failed.length > 0) {
    const msg = failed.map((f) => `${f.stage}: ${f.violations.join(' / ')}`).join('\n');
    blockStop(`gen-guard: 違反を検出（blocks/<stage>.blocked を鋳造）\n${msg}`);
    return;
  }

  passStop(`gen-guard: 通過 (${batch.map((r) => `${r.stage}:${r.action}`).join(', ')})`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`gen-guard 内部エラー: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
