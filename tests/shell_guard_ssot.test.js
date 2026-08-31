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
}
