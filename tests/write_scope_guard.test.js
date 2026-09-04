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

// ---------------------------------------------------------------------------
// 宛先ベース判定（analyzeShellWrite・2026-09-04）。ライブ run 20260903_091044 で
// 実測した2種の偽陽性（出現ベース AND が位置関係を見ないことに由来）を回帰させない。
// 極性差の無いケース（.claude/ 保護等）は tests/shell_guard_ssot.test.js のテーブルへ、
// write-scope-guard 固有の極性（docs/ 保護・work/<ts> sanctioned）はここに置く。
// ---------------------------------------------------------------------------

test('宛先ベース判定: ライブ run 20260903_091044 の偽陽性2件を回帰させない', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  // 偽陽性1（heredoc 本文の混入）: 書込先は sanctioned（work/<ts>/）で、保護パス文字列は
  // heredoc の**データ本文**にしか現れない → allow。
  const heredocFp = `cat > work/${TS}/project_profile.md <<'EOF'\n- .claude/rules/*.md を参照\n- .claude/settings.json あり\nEOF`;
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: heredocFp } }), 'allow');

  // 対になる真の違反: heredoc の**宛先**（リダイレクト先）が保護パスなら本文の中身に関係なく deny。
  const heredocRealDest = `cat > .claude/settings.json <<'EOF'\nx=1\nEOF`;
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: heredocRealDest } }), 'deny');

  // 対になる真の違反その2: リダイレクト先を持たない heredoc（`bash <<EOF`）は本文が
  // **即実行されるコード**なので、データとして除去せず走査対象に残す。
  const heredocExecBody = `bash <<'EOF'\nrm -rf docs/\nEOF`;
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: heredocExecBody } }), 'deny');

  // 偽陽性2（読取引数＋fd リダイレクトの混入）: grep は書込コマンドでないため引数に保護パスが
  // 複数出現しても、また 2>/dev/null が同時にあっても allow。
  const grepFp = 'grep -rn "canon_version" docs/ design/ .claude/ 2>/dev/null | head -10';
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: grepFp } }), 'allow');
});

test('宛先ベース判定: 出現ベースが見落としていた既存ホールを新たに締める（副産物・正味では網羅性が増す）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  // 末尾スラッシュ無しの保護ディレクトリ名（旧 PROTECTED_TOKEN_RE は "docs/" 前提で "docs" 単体を見落としていた）。
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'rm -rf docs' } }), 'deny');
  // cd による相対パス化（旧実装はコマンド文字列に "docs" という語自体が出現しないため素通りしていた）。
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'cd docs && echo x > foo.md' } }), 'deny');
});

test('宛先ベース判定: 読取コマンドの引数・null シンクは誤検出しない', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: "sed -n '1,5p' gates/g1_evidence.js" } }), 'allow', '-i 無し sed は読取専用');
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'cat docs/00_INDEX.md' } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-Content .claude/settings.json' } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-ChildItem .claude/ 2>$null' } }), 'allow', '$null は実質的な書込ではない');
});

test('宛先ベース判定: sanctioned 配下の .claude/ をシェル経由で作っても誤検出しない（偽陽性3の解消）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  // 旧実装は "output/<ts>/generated/.claude/agents/foo" のような sanctioned 配下の .claude/ も
  // 出現ベースで deny していた（未報告だった偽陽性）。宛先を repo-relative に正規化して
  // 判定することで、トップレベルの .claude/ とは区別できる。
  assert.equal(
    decide(GUARD, { tool_name: 'Bash', tool_input: { command: `mkdir -p output/${TS}/generated/.claude/agents/foo` } }),
    'allow'
  );
});

test('宛先ベース判定: 同定不能な書込構文は従来どおり広域スキャンへフォールバックする（網羅性の非後退）', (t) => {
  withRun(t, TS, { dirs: ['approvals'] });
  // node -e は文字列として渡されたコードを実行するため宛先を静的に解決できない → unresolved
  // → 出現ベース広域スキャンへフォールバックし、従来どおり deny する。
  assert.equal(
    decide(GUARD, { tool_name: 'Bash', tool_input: { command: "node -e \"require('fs').writeFileSync('docs/x','y')\"" } }),
    'deny'
  );
  // bash -c も同様（文字列として渡されたシェルスクリプトを実行する）。
  assert.equal(
    decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'bash -c "echo x > docs/foo.md"' } }),
    'deny'
  );
});

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
