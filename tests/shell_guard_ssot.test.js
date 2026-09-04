/**
 * 3極性ガード（write-scope-guard／canon-update-scope-guard／self-optimize-scope-guard）が
 * 共有する `gates/lib/shell-write.js`（SHELL_TOOLS・WRITE_OP_RE）に由来する振る舞いの
 * テーブル駆動テスト。詳細設計書 §11.3「ガードの2系統」・§13.2.1「ガードの3系統」。
 *
 * 3ガードは極性（sanctioned/protected の対象）がそれぞれ異なるため、極性固有のテストは
 * `write_scope_guard.test.js`・`canon_update_guard.test.js`・`self_optimize.test.js` に残す。
 * ここでまとめるのは **SSoT（gates/lib/shell-write.js）に由来し、3ガード共通のはずの振る舞い**
 * だけである（L023: fd 複製の誤検知・その退行防止・コマンド実行系3種の網羅性）。
 *
 * 従来この4系統のテストは3ファイルへ全文コピペされており（同一コマンド・同一 assert）、
 * SSoT を触った際の検証がファイル単位で分散していた。テーブル化することで、新しいガードが
 * 増えたときも配列に1行足すだけで同じ検証が横展開される。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT } from './helpers/paths.js';
import { decide } from './helpers/hook.js';
import { withRun, withCanonUpdateRun, withSelfOptim } from './helpers/run-state.js';
import { tsSeq } from './helpers/ts.js';

/**
 * 3ガード共通で保護される場所は `.claude/`・`gates/`（極性が逆な `docs/` はここでは扱わない）。
 * setup は各ガードを「有効化された run 中」にする——sentinel が無いと全ガードが素通りに
 * なり、この検証全体が vacuous になるため必須。
 */
const GUARDS = [
  {
    name: 'write-scope-guard',
    file: 'write-scope-guard.js',
    setup: (t, ts) => withRun(t, ts, { dirs: ['approvals'] }),
  },
  {
    name: 'canon-update-scope-guard',
    file: 'canon-update-scope-guard.js',
    setup: (t, ts) => withCanonUpdateRun(t, ts, { dirs: ['approvals'] }),
  },
  {
    name: 'self-optimize-scope-guard',
    file: 'self-optimize-scope-guard.js',
    setup: (t, ts) => withSelfOptim(t, ts),
  },
];

const freshTs = tsSeq(import.meta.url);

for (const g of GUARDS) {
  const GUARD = path.join(ROOT, 'gates', g.file);

  test(`${g.name}: L023 fd 複製（2>&1 等）は書込操作と誤検知しない（機能Y ライブ e2e で発見）`, (t) => {
    g.setup(t, freshTs());
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'node gates/build-conformance-tables.js 2>&1' } }),
      'allow',
      '2>&1 は fd 複製であり書込ではない'
    );
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'node gates/canary.js 1>&2' } }),
      'allow',
      '1>&2 も fd 複製'
    );
    assert.equal(
      decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'node gates/foo.js >&2' } }),
      'allow',
      '>&2 も fd 複製'
    );
  });

  test(`${g.name}: L023 退行防止 — 実書込（1>out.txt・&>out.txt）は fd 複製の除去後も引き続き deny する`, (t) => {
    g.setup(t, freshTs());
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'echo x 1> gates/out.txt' } }),
      'deny',
      '1>file は fd 複製と字面が違うため検出力を落としてはいけない'
    );
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'echo x &> gates/out.txt' } }),
      'deny',
      '&>file も実書込'
    );
  });

  test(`${g.name}: コマンド実行系3ツール（Bash/PowerShell/Monitor）すべてで保護パス書込を deny する`, (t) => {
    g.setup(t, freshTs());
    for (const tool of ['Bash', 'PowerShell', 'Monitor']) {
      assert.equal(
        decide(GUARD, { tool_name: tool, tool_input: { command: 'echo x > .claude/settings.json' } }),
        'deny',
        `${tool} 経由でも .claude/ への書込は deny（漏れたツール経由で全ガードを迂回できる・§11.3(b)）`
      );
    }
  });

  test(`${g.name}: 無害なコマンド（npm test・読取）は誤検出しない`, (t) => {
    g.setup(t, freshTs());
    assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'npm test' } }), 'allow');
    assert.equal(
      decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-Content docs/00_INDEX.md' } }),
      'allow'
    );
  });

  // ---------------------------------------------------------------------------
  // 宛先ベース判定（analyzeShellWrite・2026-09-04）。ライブ run 20260903_091044 で実測した
  // 2種の偽陽性（出現ベース AND が「保護パス文字列がどこかにある」だけを見て、書込宛先か
  // どうかの位置関係を見ていなかったこと）に由来する、3ガード共通の振る舞い。
  // .claude/ は3ガードすべてが保護するため、極性差なくテーブル化できる。
  // ---------------------------------------------------------------------------

  test(`${g.name}: 偽陽性1（heredoc 本文の混入）は allow・対になる真の違反は deny`, (t) => {
    const ts = freshTs();
    g.setup(t, ts);
    // データ heredoc（opener がファイルへリダイレクトする形）: 本文に保護パス文字列が
    // 含まれていても、書込先（リダイレクト先）が sanctioned なら allow。
    const dataHeredocToSanctioned = `cat > work/${ts}/notes.md <<'EOF'\n.claude/ と gates/ に触れる話\nEOF`;
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: dataHeredocToSanctioned } }),
      'allow',
      'heredoc 本文はデータであり判定対象ではない'
    );
    // 対になる真の違反: heredoc の宛先そのものが保護パスなら deny。
    const dataHeredocToProtected = `cat > .claude/settings.json <<'EOF'\nx=1\nEOF`;
    assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: dataHeredocToProtected } }), 'deny');
    // 対になる真の違反その2: リダイレクト先を持たない heredoc は本文が実行されるコード。
    const execHeredoc = `bash <<'EOF'\necho x > .claude/settings.json\nEOF`;
    assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: execHeredoc } }), 'deny');
  });

  test(`${g.name}: 偽陽性2（読取コマンドの引数＋fd リダイレクトの混入）は allow`, (t) => {
    g.setup(t, freshTs());
    assert.equal(
      decide(GUARD, {
        tool_name: 'Bash',
        tool_input: { command: 'grep -rn "x" .claude/ gates/ 2>/dev/null | head -10' },
      }),
      'allow',
      'grep は書込コマンドでなく、2>/dev/null は null シンクへの fd リダイレクト'
    );
    assert.equal(
      decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-ChildItem .claude/ 2>$null' } }),
      'allow',
      '$null も null シンク'
    );
  });

  test(`${g.name}: 同定不能な書込構文（node -e・bash -c）は従来どおり広域スキャンへフォールバックし deny する`, (t) => {
    g.setup(t, freshTs());
    assert.equal(
      decide(GUARD, {
        tool_name: 'Bash',
        tool_input: { command: "node -e \"require('fs').writeFileSync('.claude/x','y')\"" },
      }),
      'deny',
      'node -e は宛先を静的に解決できない → unresolved → 出現ベース広域スキャンへフォールバック'
    );
    assert.equal(
      decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'bash -c "echo x > .claude/settings.json"' } }),
      'deny'
    );
  });
}
