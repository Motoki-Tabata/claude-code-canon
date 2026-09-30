/**
 * 代表シナリオ(3)「制約強め」の統合テスト（§15.3）。
 *
 * sample repo「constrained」を実 output/<ts>・work/<ts> へ配置し、
 * **生成物に対する決定論の検査（G7・G8・G9・G11・G12。G12 が G3〜G6 を含む）を実際に走らせて全通過**することを固定する。
 *
 * L002 の規律: 「全部 ok で通った」だけを成功の根拠にしない。同じ入力へ制約違反を
 * 注入すると検査が落ちることを対で確認する（検出器が生きていることの証明）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupSampleRepo } from './helpers/fixtures.js';
import { ROOT } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';

const nextTs = tsSeq(import.meta.url);

/** 生成物に対する決定論の検査モジュール（gates/ 直下）。 */
const GENERATION_GATES = [
  'g7_ref_integrity.js',
  'g8_non_regression.js',
  'g9_snapshot_completeness.js',
  'g11_constraints.js',
  'g12_output_perfile.js',
];

async function runGenerationGates(ts) {
  const results = {};
  for (const name of GENERATION_GATES) {
    const mod = await import(pathToFileURL(path.join(ROOT, 'gates', name)).href);
    results[name] = await mod.check({ ts });
  }
  return results;
}

test('代表シナリオ(3): 制約強め fixture が generation の決定論ゲートを全通過する', async (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
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
  const c = setupSampleRepo(t, 'constrained', nextTs());
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
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const results = await runGenerationGates(c.ts);
  assert.equal(results['g8_non_regression.js'].ok, true, JSON.stringify(results['g8_non_regression.js'].violations));
});
