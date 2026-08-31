/**
 * 代表シナリオ(3)「制約強め」の統合テスト（§15.3）。
 *
 * fixtures/sample-repos/constrained/ を実 output/<ts>・work/<ts> へ配置し、
 * **generation ステージで発火する決定論ゲート群を実際に走らせて全通過**することを固定する。
 * ゲート名は gen-guard.js の GATE_MODULES から実ファイル経由で拾う（テストが独自にゲートを
 * 列挙すると、gen-guard に足されたゲートを検査しないまま「通った」と言えてしまう）。
 *
 * L002 の規律: 「全部 ok で通った」だけを成功の根拠にしない。同じ fixture へ制約違反を
 * 注入するとバッチが落ちることを対で確認する（検出器が生きていることの証明）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupSampleRepo } from './helpers/fixtures.js';
import { ROOT } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { resolveGates } from '../gates/gate-manifest.js';

const nextTs = tsSeq(import.meta.url);

/** gen-guard.js が generation で回すゲートモジュール名（コメントを除いた文字列リテラル）。 */
function generationGateNames() {
  const src = readFileSync(path.join(ROOT, 'gates', 'gen-guard.js'), 'utf8');
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...withoutComments.matchAll(/'(g\d+_[a-z0-9_]+\.js)'/g)].map((m) => m[1]);
}

async function runGenerationGates(ts) {
  const names = generationGateNames();
  assert.ok(names.length >= 7, `gen-guard からゲート名を拾えないなら本テスト自体が vacuous（${names.length}件）`);
  const { runnable, skipped, violations } = resolveGates(names);
  assert.deepEqual(skipped, [], '未実装スキップがあってはならない（全ゲート実装済み）');
  assert.deepEqual(violations, [], 'マニフェスト突合の違反があってはならない');

  const results = {};
  for (const name of runnable) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'gates', name)).href);
    results[name] = await (mod.check ?? mod.default)({ ts, stage: 'generation' });
  }
  return results;
}

test('代表シナリオ(3): 制約強め fixture が generation の決定論ゲートを全通過する', async (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  const results = await runGenerationGates(c.ts);
  const failed = Object.entries(results).filter(([, r]) => r.ok !== true);
  assert.deepEqual(
    failed.map(([n, r]) => `${n}: ${r.violations.join(' / ')}`),
    [],
    '全ゲート ok であること'
  );
  assert.ok(Object.keys(results).includes('g11_constraints.js'), 'G11 が実際に走っていること');
});

test('代表シナリオ(3): 制約違反を注入するとバッチが落ちる（通過だけを根拠にしない）', async (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  // hooks 禁止の環境に、生成物として hook 設定を注入する。
  const p = path.join(c.gen, '.claude', 'settings.json');
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const results = await runGenerationGates(c.ts);
  assert.equal(results['g11_constraints.js'].ok, false, 'G11 が制約違反を検出すること');
  assert.ok(results['g11_constraints.js'].violations.some((v) => v.includes('hooks')));
});

test('代表シナリオ(3): keep の style-guide が原本と sha256 同一（G8・縮退しても既存は保全）', async (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  const results = await runGenerationGates(c.ts);
  assert.equal(results['g8_non_regression.js'].ok, true, JSON.stringify(results['g8_non_regression.js'].violations));
});
