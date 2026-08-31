/**
 * G13 ワーカー権限ポリシー（自己・preflight）の回帰テスト。詳細設計書 §11.2・§11.3(b)。
 *
 * 中心的な関心:
 *   1. コマンド実行系ツール（Bash・PowerShell・Monitor）混入の検出
 *   2. tools: 省略（全ツール継承）の検出
 *   3. frontmatter 破損（vacuous pass 防止）の検出
 *   4. 適用範囲がパスで截然と分かれていること（生成物側は絶対に弾かない）
 *   5. 対象0件のときに黙って「検査済み」と区別なく pass にしないこと
 *   6. CLI として exit 2 を返すこと
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkG13, agentsRootFor, COMMAND_EXECUTION_TOOLS } from '../gates/g13_worker_privilege.js';
import { ROOT } from './helpers/paths.js';
import { scratchDir } from './helpers/fixtures.js';

const GATE_SCRIPT = path.join(ROOT, 'gates', 'g13_worker_privilege.js');

/** 使い捨ての <canonRoot> を作る。テストごとに完全隔離し、実リポジトリの .claude/agents は一切触らない。 */
function makeCanonRoot(t) {
  return scratchDir(t, 'g13-test-');
}

function writeAgent(canonRoot, relPath, content) {
  const p = path.join(agentsRootFor(canonRoot), relPath);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf8');
  return p;
}

describe('G13 純関数（checkG13）', () => {
  test('tools: Read Bash は違反', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read Bash\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, false);
    assert.equal(r.checked, 1);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /コマンド実行系ツール.*Bash/);
  });

  test('tools: Read Grep は通過', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read Grep\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, true);
    assert.equal(r.checked, 1);
    assert.deepEqual(r.violations, []);
  });

  test('tools: 省略（全ツール継承）は違反', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, false);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /省略/);
    assert.match(r.violations[0].source, /TOOLS\.md/);
  });

  test('frontmatter 破損（終端 --- が無い）は違反', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ntools: Read Grep\nbody（終端マーカー無し）');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, false);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].message, /解析に失敗|frontmatter/);
  });

  test('tools: Read PowerShell は違反（Bash だけを見る実装では漏れる）', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read PowerShell\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, false);
    assert.match(r.violations[0].message, /PowerShell/);
  });

  test('tools: Read Monitor は違反（Bash と同一 permission rule で駆動されるコマンド実行系）', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read Monitor\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, false);
    assert.match(r.violations[0].message, /Monitor/);
  });

  test('COMMAND_EXECUTION_TOOLS は Bash・PowerShell・Monitor の3つのみ（過剰に含めない）', () => {
    assert.deepEqual(new Set(COMMAND_EXECUTION_TOOLS), new Set(['Bash', 'PowerShell', 'Monitor']));
  });

  test('複数ファイル・複数違反を正しく集計する', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'a/a.md', '---\nname: a\ndescription: d\ntools: Read Grep\n---\nbody');
    writeAgent(root, 'b/b.md', '---\nname: b\ndescription: d\ntools: Read Bash\n---\nbody');
    writeAgent(root, 'c/c.md', '---\nname: c\ndescription: d\ntools: Read PowerShell Monitor\n---\nbody');
    const r = checkG13({ canonRoot: root });
    assert.equal(r.checked, 3);
    assert.equal(r.ok, false);
    assert.equal(r.violations.length, 2, 'a は違反ではないので2件のはず');
  });

  test('対象0件（.claude/agents が未作成）: 黙って合格にしない透明性を持つが、run は許可する', (t) => {
    const root = makeCanonRoot(t);
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, true, '0件は正当な状態（まだ agent が無い）なので run はブロックしない');
    assert.equal(r.checked, 0);
    assert.equal(r.agentsRootExists, false, '「ディレクトリごと存在しない」ことを結果に残し、暗黙の合格と区別できるようにする');
  });

  test('対象0件（.claude/agents は存在するが中身が空）も同様に正当', (t) => {
    const root = makeCanonRoot(t);
    mkdirSync(agentsRootFor(root), { recursive: true });
    const r = checkG13({ canonRoot: root });
    assert.equal(r.ok, true);
    assert.equal(r.checked, 0);
    assert.equal(r.agentsRootExists, true);
  });

  test('適用範囲: output/<ts>/generated/.claude/agents/** の Bash 混入は弾かない（正当な生成物）', (t) => {
    const root = makeCanonRoot(t);
    // 生成物側のパス（対象プロジェクト向け Subagent）。ここに Bash があるのは正当。
    const generatedAgent = path.join(root, 'output', '20260716_000000', 'generated', '.claude', 'agents', 'x', 'x.md');
    mkdirSync(path.dirname(generatedAgent), { recursive: true });
    writeFileSync(generatedAgent, '---\nname: x\ndescription: d\ntools: Read Bash\n---\nbody', 'utf8');

    // claude-canon 自身の .claude/agents/ は空のまま。
    const r = checkG13({ canonRoot: root });
    assert.equal(r.checked, 0, '生成物側は checkG13 のスキャン対象に含まれてはならない');
    assert.equal(r.ok, true);
  });

  test('適用範囲: claude-canon 自身に違反があり、かつ生成物側にも Bash があっても、違反は自身の分のみ', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'self/self.md', '---\nname: self\ndescription: d\ntools: Read Bash\n---\nbody');
    const generatedAgent = path.join(root, 'output', '20260716_000000', 'generated', '.claude', 'agents', 'x', 'x.md');
    mkdirSync(path.dirname(generatedAgent), { recursive: true });
    writeFileSync(generatedAgent, '---\nname: x\ndescription: d\ntools: Read Bash\n---\nbody', 'utf8');

    const r = checkG13({ canonRoot: root });
    assert.equal(r.checked, 1, '生成物側の1件はカウントされてはならない');
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0].path, /self\.md$/);
  });

  test('実リポジトリの .claude/agents/** は違反0件（対象0件で通ったのではないことも確認）', () => {
    // 開発初期は agents 不在（checked=0）で通っていた。現在は実在するので、
    // 「対象0件だから通った」と「実在するが違反0件」を取り違えないよう checked も見る。
    // 自己適用の網羅は tests/self_application.test.js が担う。
    const r = checkG13();
    assert.equal(r.ok, true, JSON.stringify(r.violations));
    assert.ok(r.checked > 0, 'agents が1件も検査されていない（vacuous pass）');
  });
});

describe('G13 CLI（UserPromptExpansion@/canon・preflight）', () => {
  function runCli(canonRootOverride) {
    try {
      const out = execFileSync(process.execPath, [GATE_SCRIPT], {
        input: '{}',
        encoding: 'utf8',
        env: { ...process.env, G13_CANON_ROOT_OVERRIDE: canonRootOverride },
      });
      return { code: 0, stdout: out };
    } catch (err) {
      return { code: err.status, stdout: err.stdout, stderr: err.stderr };
    }
  }

  test('違反があれば exit 2 を返す', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read Bash\n---\nbody');
    const r = runCli(root);
    assert.equal(r.code, 2, 'exit 2 のみが blocking（docs/L4_AUTOMATION.md §2.1）');
    assert.match(r.stderr, /G13/);
  });

  test('違反が無ければ exit 0 を返す', (t) => {
    const root = makeCanonRoot(t);
    writeAgent(root, 'x/x.md', '---\nname: x\ndescription: d\ntools: Read Grep\n---\nbody');
    const r = runCli(root);
    assert.equal(r.code, 0);
  });

  test('対象0件でも exit 0（run のブートストラップを止めない）', (t) => {
    const root = makeCanonRoot(t);
    const r = runCli(root);
    assert.equal(r.code, 0);
  });
});
