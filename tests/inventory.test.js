/**
 * tools/inventory.js・lib/inventory.js・lib/refs.js の回帰テスト。
 *
 * 故意に注入した参照（実在・壊れた・プレースホルダ・外部・リポジトリの外・コードフェンスの中）が、
 * それぞれ別の分類になること、走査件数が1件以上であることを、実際の起動経路（子プロセス）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir, writeFile } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { git, gitInit } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';

const INVENTORY = path.join(ROOT, 'tools', 'inventory.js');
const WORKTREE = path.join(ROOT, 'tools', 'worktree.js');
const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };

const CLAUDE_MD = [
  '# 対象',
  '@docs/exists.md',
  '[壊れたリンク](./nope.md) と [外部](https://example.com/a.md) と [外](../outside.md)',
  '置き場所は `work/<ts>/handoff.md` と `NNN.md`、ホームは `~/x/y.md`。',
  '```',
  '`missing-in-fence.md`',
  '```',
  '',
].join('\n');

function buildTarget(t) {
  const tmp = scratchDir(t, 'canon-inventory-');
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  writeFile(repo, 'CLAUDE.md', CLAUDE_MD);
  writeFile(repo, 'docs/exists.md', '# e\n');
  writeFile(repo, 'sub/CLAUDE.md', '# sub\n');
  writeFile(repo, '.claude/agents/a.md', '---\nname: a\ndescription: x\nskills: [real, ghost]\n---\n本文\n');
  writeFile(repo, '.claude/skills/real/SKILL.md', '---\nname: real\ndescription: x\n---\n`ref.md`\n');
  writeFile(repo, '.claude/skills/real/ref.md', '# r\n');
  writeFile(repo, '.claude/hooks/x.sh', '#!/bin/sh\n');
  writeFile(
    repo,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/x.sh' }, { type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/ghost.sh' }] }] } }, null, 2)
  );
  gitInit(repo);
  return { tmp, repo };
}

function run(repo, out, extra = []) {
  const r = runNodeScript(INVENTORY, ['--root', repo, '--out', out, ...extra]);
  const file = path.join(out, 'inventory.json');
  return { ...r, inv: r.code === 0 ? JSON.parse(readFileSync(file, 'utf8')) : null };
}

const refOf = (inv, from, raw) => {
  const r = inv.refs.find((x) => x.from === from && x.raw === raw);
  assert.ok(r, `${from} の参照 ${raw} が抽出されていない`);
  return r;
};

test('inventory: 参照を exists・missing・placeholder・external・outside-repo に分け、フェンスの中は読まない', (t) => {
  const { tmp, repo } = buildTarget(t);
  const { code, stdout, inv } = run(repo, path.join(tmp, 'out'));
  assert.equal(code, 0, stdout);
  assert.equal(inv.scanned_files, 8, "追跡ファイルを全件走査していない");
  assert.match(stdout, /参照 \d+ 件: exists \d+・missing \d+・placeholder \d+・external \d+・outside-repo \d+/);

  assert.equal(refOf(inv, 'CLAUDE.md', 'docs/exists.md').status, 'exists');
  assert.equal(refOf(inv, 'CLAUDE.md', 'docs/exists.md').kind, 'import');
  assert.equal(refOf(inv, 'CLAUDE.md', './nope.md').status, 'missing');
  assert.equal(refOf(inv, 'CLAUDE.md', 'https://example.com/a.md').status, 'external');
  assert.equal(refOf(inv, 'CLAUDE.md', '../outside.md').status, 'outside-repo');
  assert.equal(refOf(inv, 'CLAUDE.md', 'work/<ts>/handoff.md').status, 'placeholder');
  assert.equal(refOf(inv, 'CLAUDE.md', 'NNN.md').status, 'placeholder');
  assert.equal(refOf(inv, 'CLAUDE.md', '~/x/y.md').status, 'outside-repo');
  assert.equal(inv.refs.some((r) => r.raw === 'missing-in-fence.md'), false, 'コードフェンスの中を参照として読んでいる');

  // Agent の skills: と hook の command は、実在と欠落が別の分類になる。
  assert.equal(refOf(inv, '.claude/agents/a.md', '.claude/skills/real/SKILL.md').status, 'exists');
  assert.equal(refOf(inv, '.claude/agents/a.md', '.claude/skills/ghost/SKILL.md').status, 'missing');
  assert.equal(refOf(inv, '.claude/settings.json', '.claude/hooks/x.sh').status, 'exists');
  assert.equal(refOf(inv, '.claude/settings.json', '.claude/hooks/ghost.sh').status, 'missing');
  // Skill 内の `ref.md` は Skill のディレクトリからの相対で解決する。
  assert.equal(refOf(inv, '.claude/skills/real/SKILL.md', 'ref.md').status, 'exists');
});

test('inventory: カスタマイズを機能別に並べ、配置パスに当たらない .claude/ 配下は分類外に残す', (t) => {
  const { tmp, repo } = buildTarget(t);
  const { inv } = run(repo, path.join(tmp, 'out'));
  const byPath = new Map(inv.items.map((i) => [i.path, i]));
  assert.equal(byPath.get('CLAUDE.md').feature, 'claude-md');
  assert.equal(byPath.get('sub/CLAUDE.md').feature, 'claude-md');
  assert.equal(byPath.get('.claude/agents/a.md').feature, 'subagents');
  assert.deepEqual(byPath.get('.claude/agents/a.md').frontmatter.name, 'a');
  assert.equal(byPath.get('.claude/skills/real/SKILL.md').feature, 'skills');
  assert.deepEqual(byPath.get('.claude/settings.json').json_keys, ['hooks']);
  assert.equal(byPath.has('docs/exists.md'), false);
  assert.deepEqual(inv.unclassified.map((u) => [u.path, u.feature_hint]).sort(), [
    ['.claude/hooks/x.sh', 'hooks'],
    ['.claude/skills/real/ref.md', 'skills'],
  ]);
  assert.deepEqual(inv.summary.unclassified_by_hint, { hooks: 1, skills: 1 });
  assert.equal(inv.summary.items, inv.items.length);
});

test('inventory: 入れ子の Agent（.claude/agents/<name>/<name>.md）は分類外に残り、subagents のヒントが付く', (t) => {
  const tmp = scratchDir(t, 'canon-inventory-nested-');
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  writeFile(repo, '.claude/agents/b/b.md', '---\nname: b\ndescription: x\n---\n');
  gitInit(repo);
  const { inv, stdout } = run(repo, path.join(tmp, 'out'));
  assert.equal(inv.summary.items, 0);
  assert.deepEqual(inv.unclassified, [{ path: '.claude/agents/b/b.md', feature_hint: 'subagents' }]);
  assert.match(stdout, /ヒント別: subagents 1/);
});

test('inventory: --origin で、worktree に現れない未追跡・gitignore・未コミットのカスタマイズを警告する', (t) => {
  const { tmp, repo } = buildTarget(t);
  writeFile(repo, '.gitignore', '.claude/settings.local.json\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'ignore');
  writeFile(repo, '.claude/settings.local.json', '{}\n');
  writeFile(repo, 'CLAUDE.local.md', '# local\n');
  writeFileSync(path.join(repo, 'CLAUDE.md'), `${CLAUDE_MD}変更\n`);
  const wtRoot = path.join(tmp, 'wt');
  const c = runNodeScript(WORKTREE, ['create', '--target', repo, '--ts', '21000101_000002'], { env: { ...process.env, ...IDENTITY, CANON_WT_ROOT: wtRoot } });
  assert.equal(c.code, 0, c.stderr);
  const wt = /^worktree: (.+)$/m.exec(c.stdout)[1];

  const { code, inv, stdout } = run(wt, path.join(tmp, 'out'), ['--origin', repo]);
  assert.equal(code, 0, stdout);
  const w = Object.fromEntries(inv.warnings.map((x) => [x.path, x.reason]));
  assert.equal(w['.claude/settings.local.json'], 'gitignored');
  assert.equal(w['CLAUDE.local.md'], 'untracked');
  assert.equal(w['CLAUDE.md'], 'uncommitted-change');
  assert.match(stdout, /警告 3 件/);
  assert.equal(inv.items.some((i) => i.path === 'CLAUDE.local.md'), false);
});

test('inventory: カスタマイズが 0 件でも書いて exit 0、要約に 0 件と明記する', (t) => {
  const tmp = scratchDir(t, 'canon-inventory-empty-');
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  writeFile(repo, 'README.md', '# x\n');
  gitInit(repo);
  const { code, stdout, inv } = run(repo, path.join(tmp, 'out'));
  assert.equal(code, 0);
  assert.equal(inv.items.length, 0);
  assert.equal(inv.scanned_files, 1);
  assert.match(stdout, /カスタマイズは 0 件/);
});

test('inventory: git でない root は exit 1、引数不正は exit 2', (t) => {
  const tmp = scratchDir(t, 'canon-inventory-bad-');
  assert.equal(runNodeScript(INVENTORY, ['--root', tmp, '--out', path.join(tmp, 'o')]).code, 1);
  assert.equal(runNodeScript(INVENTORY, ['--root', path.join(tmp, 'ghost'), '--out', path.join(tmp, 'o')]).code, 1);
  assert.equal(runNodeScript(INVENTORY, []).code, 2);
  assert.equal(runNodeScript(INVENTORY, ['--root', tmp]).code, 2);
  assert.equal(runNodeScript(INVENTORY, ['--nope']).code, 2);
});

test('inventory: canon 自身の root でも動き、Skill を棚卸しする', (t) => {
  const tmp = scratchDir(t, 'canon-inventory-self-');
  const { code, inv } = run(ROOT, path.join(tmp, 'out'));
  assert.equal(code, 0);
  assert.ok(inv.items.some((i) => i.path === '.claude/skills/canon-reference/SKILL.md'));
});
