#!/usr/bin/env node
/**
 * canon-guard（SubagentStop/Stop）。詳細設計書 §13.1・§11.2「G14/G15/G16 実装契約」。
 *
 * 機能X（正典更新）run 専用の snapshot 系統ディスパッチ。gen-guard.js（`/canon` の
 * generation 専任）と対称の実装だが、名前空間は `work/.canon-update-ts`（gates/lib/canon-run.js）、
 * 消費するリクエストは `work/<ts>/.requests/canon-update` のみ。
 *
 * canon-update で発火するゲート: G14（正典整合）・G15（波及 stale 検出・非ブロッキング）・
 * G16（`[要確認]` 台帳整合）。未実装ゲートの扱いは gates/gate-manifest.js が決める
 * （§11.5 vacuous pass 対策・stage-guard/gen-guard と同じ規律）。
 *
 * canon-update.done は CANON_UPDATE_TERMINAL_STAGE（gates/lib/canon-run.js）＝
 * canon-update-scope-guard の in-flight 判定材料そのもの。鋳造は §4.5 の共有処理
 * （processStageRequests・run.js）に一本化し、二重実装しない。
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GATES_DIR } from './lib/canon.js';
import { resolveGates } from './gate-manifest.js';
import {
  readHookInput,
  listRequests,
  hasMarker,
  processStageRequests,
  isMainModule,
  blockStop,
  passStop,
} from './lib/run.js';
import { readCanonUpdateTs, CANON_UPDATE_TERMINAL_STAGE } from './lib/canon-run.js';

const CANON_UPDATE_STAGES = [CANON_UPDATE_TERMINAL_STAGE]; // = ['canon-update']

const GATE_MODULES = {
  'canon-update': ['g14_canon_consistency.js', 'g15_propagation.js', 'g16_ledger.js'],
};

async function runRegisteredChecks(ts, stage) {
  const moduleNames = GATE_MODULES[stage] || [];
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
  for (const s of skipped) {
    process.stderr.write(
      `[canon-guard] ${stage}: ${s.gate} 未実装のためスキップ（${s.planned_phase} で実装予定・${s.design_ref}）。` +
        `この run では ${s.gate} の検査は行われていない。\n`
    );
  }
  return { ok: violations.length === 0, violations, skipped };
}

async function main() {
  readHookInput(); // 内容は使わないが stdin を読み切る（hook 契約上の作法）
  const ts = readCanonUpdateTs();
  if (!ts) {
    passStop('canon-guard: .canon-update-ts 不在のため対象なし');
    return;
  }

  const precomputed = {};
  for (const stage of listRequests(ts)) {
    if (!CANON_UPDATE_STAGES.includes(stage)) continue;
    if (hasMarker(ts, stage)) continue;
    precomputed[stage] = await runRegisteredChecks(ts, stage);
  }

  const batch = processStageRequests({
    ts,
    stages: CANON_UPDATE_STAGES,
    runChecks: (_ts, stage) => precomputed[stage] ?? { ok: true, violations: [] },
  });

  if (batch.length === 0) {
    passStop('canon-guard: 対象リクエストなし');
    return;
  }

  const failed = batch.filter((r) => r.ok === false);
  if (failed.length > 0) {
    const msg = failed.map((f) => `${f.stage}: ${f.violations.join(' / ')}`).join('\n');
    blockStop(`canon-guard: 違反を検出（blocks/<stage>.blocked を鋳造）\n${msg}`);
    return;
  }

  passStop(`canon-guard: 通過 (${batch.map((r) => `${r.stage}:${r.action}`).join(', ')})`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`canon-guard 内部エラー: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
