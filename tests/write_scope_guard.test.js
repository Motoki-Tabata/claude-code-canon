/**
 * write-scope-guard の回帰テスト（詳細設計書 §11.3）。
 *
 * 中心的な関心は **シェル経路の封鎖**。当初の実装は `Bash` のみを検査しており、
 * 正典 TOOLS.md の44種（2026-08-19時点。旧42種）に実在する `PowerShell`（Windows の主シェル）が素通りしていた。
 * その結果 `PowerShell: Set-Content <ts>/.gate/approvals/spec.approved ''` で
 * **承認サイドカーを捏造でき、承認鋳造経路の一本化の deny-all と前進ゲートのラチェットが崩壊**した。
 *
 * このテストは「列挙の網羅性が単一障害点」であることを固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/paths.js';
import { decide } from './helpers/hook.js';
import { withRun, withoutSentinel } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

const GUARD = path.join(ROOT, 'gates', 'write-scope-guard.js');
const TS = tsFor(import.meta.url, 0);
const SESSION_TS_FILE = path.join(ROOT, 'work', '.session-ts');

test('シェル経路の封鎖: PowerShell 経由の保護パス書込を deny する（Bash だけでは不十分）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "Set-Content docs/foo.md 'x'" } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "'x' | Out-File gates/g5_tool_names.js" } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Remove-Item .claude/settings.json' } }), 'deny');
});

test('シェル経路の封鎖×承認鋳造経路の一本化: PowerShell で承認サイドカーを捏造できないこと（最重要）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  const forge = `Set-Content output/${TS}/.gate/approvals/spec.approved ''`;
  assert.equal(
    decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: forge } }),
    'deny',
    '承認の捏造が通ると前進ゲート（§11.3 a/b）のラチェット全体が崩壊する'
  );
});

test('シェル経路の封鎖: Bash も引き続き封鎖されている（退行防止）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'echo x > docs/foo.md' } }), 'deny');
});

test('シェルの読取・承認 CLI は誤検出しない', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-Content docs/00_INDEX.md' } }), 'allow');
  // 承認の正規経路。ここを弾くと §4.4 の承認鋳造が不可能になり設計が破綻する。
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: `npm run approve -- ${TS} spec` } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: `npm run approve -- ${TS} spec` } }), 'allow');
});

test('承認鋳造経路の一本化: .gate/** への Write は deny-all', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  const p = `${ROOT.replace(/\\/g, '/')}/output/${TS}/.gate/approvals/spec.approved`;
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: p } }), 'deny');
});

test('ガードの有効条件: run 外ではガードが素通りする（保守ループ・実装作業を通す）', (t) => {
  // .session-ts が無い状態。ここが deny だと /update-docs も実装作業も不可能になる。
  withoutSentinel(t, SESSION_TS_FILE);
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/docs/foo.md` } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "Set-Content docs/foo.md 'x'" } }), 'allow');
});

test('シェル経路の封鎖: Monitor 経由の保護パス書込を deny する', (t) => {
  // 公式 tools-reference: Monitor は "Runs a command in the background" であり、
  // permission rule 対応表で `Bash(npm run *)` ルールが Bash と Monitor の両方に適用される。
  // 公式自身が Bash と同じコマンド実行系として扱っている。
  withRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'Monitor', tool_input: { command: "Set-Content docs/foo.md 'x'" } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Monitor', tool_input: { command: 'echo x > gates/g5_tool_names.js' } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Monitor', tool_input: { command: 'npm run build' } }), 'allow', '誤検出しないこと');
});

// L023（fd 複製の誤検知・退行防止）は3ガード共通の SSoT（gates/lib/shell-write.js）に
// 由来する振る舞いのため、tests/shell_guard_ssot.test.js のテーブル駆動テストへ統合した。

test('コマンド実行系ツールの列挙が正典の全ツール集合と整合していること', async () => {
  // 「列挙の網羅性が単一障害点」（§11.3(b)）。正典にコマンド実行系が増えたら気づけるようにする。
  // ツール総数自体は正典側で変動しうる（2026-08-19時点で44種）ため、ここでは総数を固定せず
  // Bash/PowerShell/Monitor の3種が実在し漏れなく列挙されているかのみ検査する。
  const tools = JSON.parse(
    readFileSync(path.join(ROOT, 'gates', 'conformance_tables', 'tools.json'), 'utf8')
  );
  const names = new Set(tools.canonical_tool_set.tools.map((t) => t.name));
  // 現時点で正典に実在する既知のコマンド実行系。増えていたらこのテストで気づく。
  for (const shell of ['Bash', 'PowerShell', 'Monitor']) {
    assert.ok(names.has(shell), `正典に ${shell} が実在すること`);
  }

  // SHELL_TOOLS は3ガード共有 SSoT（gates/lib/shell-write.js）から読む（L023 リファクタで集約）。
  const sharedLibSrc = readFileSync(path.join(ROOT, 'gates', 'lib', 'shell-write.js'), 'utf8');
  const decl = sharedLibSrc.match(/export const SHELL_TOOLS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(decl, 'gates/lib/shell-write.js に SHELL_TOOLS の宣言が読めること');
  const listed = new Set([...decl[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual(
    [...listed].sort(),
    ['Bash', 'Monitor', 'PowerShell'],
    'SSoT は既知のコマンド実行系を漏れなく列挙すること（漏れたツール経由で全ガードを迂回できる）'
  );

  // ガード側は SSoT を import していること（リテラル重複に戻っていないか）。
  const src = readFileSync(GUARD, 'utf8');
  assert.match(src, /from '\.\/lib\/shell-write\.js'/, 'ガードは SHELL_TOOLS を SSoT から import すること');
});
