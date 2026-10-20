/**
 * tools/worktree.js・lib/worktree.js の回帰テスト。
 *
 * 置き場所は環境変数 CANON_WT_ROOT で一時ディレクトリに向け、本物のホームには書かない。
 * 作成・コミット・片付けと、拒否（git でない・変更なし・未コミット・未マージ・canon の worktree でない）を、
 * 実際の起動経路（子プロセス）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir, writeFile } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { git, gitInit } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';

const WORKTREE = path.join(ROOT, 'tools', 'worktree.js');
const IDENTITY = { GIT_AUTHOR_NAME: 'canon-test', GIT_AUTHOR_EMAIL: 'canon@example.invalid', GIT_COMMITTER_NAME: 'canon-test', GIT_COMMITTER_EMAIL: 'canon@example.invalid' };
let seq = 0;
const nextTs = () => `2100010${1 + (seq % 9)}_00${String(10 + seq++).padStart(4, '0')}`;

function setup(t) {
  const tmp = scratchDir(t, 'canon-worktree-');
  const repo = path.join(tmp, 'target');
  mkdirSync(repo);
  writeFile(repo, 'CLAUDE.md', '# t\n');
  gitInit(repo);
  const home = path.join(tmp, '.claude-canon');
  const env = { ...process.env, ...IDENTITY, CANON_WT_ROOT: path.join(home, 'wt') };
  const wt = (...args) => runNodeScript(WORKTREE, args, { env });
  const create = (ts = nextTs()) => {
    const r = wt('create', '--target', repo, '--ts', ts);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const field = (k) => new RegExp(`^${k}: (.+)$`, 'm').exec(r.stdout)[1];
    return { ts, worktree: field('worktree'), branch: field('branch'), base: field('base') };
  };
  return { tmp, repo, home, env, wt, create };
}

test('create: canon/<ts> のブランチと worktree を、CANON_WT_ROOT の下に作り、base の sha を返す', (t) => {
  const s = setup(t);
  const c = s.create('21000102_000001');
  assert.equal(c.branch, 'canon/21000102_000001');
  assert.equal(c.worktree, path.join(s.home, 'wt', 'target-21000102_000001'));
  assert.equal(c.base, git(s.repo, 'rev-parse', 'HEAD').trim());
  assert.equal(readFileSync(path.join(c.worktree, 'CLAUDE.md'), 'utf8'), '# t\n');
  assert.equal(git(c.worktree, 'branch', '--show-current').trim(), c.branch);
  assert.equal(git(s.repo, 'branch', '--show-current').trim(), 'main', '元の対象のブランチを動かしていない');
});

test('create: git でない・コミットが無い・ブランチが既にある対象は exit 1、引数不正は exit 2', (t) => {
  const s = setup(t);
  const plain = path.join(s.tmp, 'plain');
  mkdirSync(plain);
  assert.equal(s.wt('create', '--target', plain, '--ts', '21000102_000002').code, 1);
  const empty = path.join(s.tmp, 'empty');
  mkdirSync(empty);
  git(empty, 'init', '-q', '-b', 'main');
  assert.equal(s.wt('create', '--target', empty, '--ts', '21000102_000003').code, 1);
  assert.equal(s.wt('create', '--target', path.join(s.tmp, 'ghost'), '--ts', '21000102_000004').code, 1);
  s.create('21000102_000005');
  assert.equal(s.wt('create', '--target', s.repo, '--ts', '21000102_000005').code, 1, '同じ ts のブランチが既にある');
  assert.equal(s.wt('create', '--target', s.repo, '--ts', 'bad').code, 1);
  assert.equal(s.wt('create', '--target', s.repo).code, 2);
  assert.equal(s.wt().code, 2);
  assert.equal(s.wt('nope').code, 2);
  assert.equal(s.wt('create', '--target', s.repo, '--ts', '21000102_000006', '--nope').code, 2);
  assert.ok(!existsSync(path.join(s.home, 'wt', 'plain-21000102_000002')), '失敗した create が置き場所を残している');
});

test('rm: 追跡中のファイルを git rm し、worktree の外・追跡外・未指定は何も消さず exit 1、引数なしは exit 2', (t) => {
  const s = setup(t);
  const c = s.create();
  writeFile(c.worktree, 'a.md', 'a\n');
  writeFile(c.worktree, 'b.md', 'b\n');
  git(c.worktree, 'add', '.');
  git(c.worktree, 'commit', '-q', '-m', 'add', '--no-gpg-sign');
  writeFile(c.worktree, 'untracked.md', 'u\n');

  assert.equal(s.wt('rm', '--worktree', c.worktree).code, 2, '消すファイルが無い');
  const outside = s.wt('rm', '--worktree', c.worktree, '../x.md');
  assert.equal(outside.code, 1);
  assert.match(outside.stderr, /worktree の外/);
  const untracked = s.wt('rm', '--worktree', c.worktree, 'a.md', 'untracked.md');
  assert.equal(untracked.code, 1);
  assert.match(untracked.stderr, /追跡されていない/);
  assert.ok(existsSync(path.join(c.worktree, 'a.md')), '1つでも拒否なら何も消さない');

  const ok = s.wt('rm', '--worktree', c.worktree, 'a.md');
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stdout, /removed: a\.md/);
  assert.ok(!existsSync(path.join(c.worktree, 'a.md')));
  assert.ok(existsSync(path.join(c.worktree, 'b.md')));
  assert.match(git(c.worktree, 'status', '--porcelain'), /^D  a\.md/m, '削除はステージされる');

  const notCanon = s.wt('rm', '--worktree', s.repo, 'CLAUDE.md');
  assert.equal(notCanon.code, 1, 'canon の worktree でないものは触らない');
  assert.ok(existsSync(path.join(s.repo, 'CLAUDE.md')));
});

test('commit: 変更が無ければ exit 1、あれば sha を返し、作者はスクリプトに埋め込まず環境から取る', (t) => {
  const s = setup(t);
  const c = s.create();
  const none = s.wt('commit', '--worktree', c.worktree, '--message', 'm');
  assert.equal(none.code, 1, none.stdout + none.stderr);
  writeFileSync(path.join(c.worktree, 'CLAUDE.md'), '# changed\n');
  writeFile(c.worktree, '.claude/rules/new.md', '# n\n');
  const r = s.wt('commit', '--worktree', c.worktree, '--message', 'canon: 変更');
  assert.equal(r.code, 0, r.stderr);
  const sha = /^sha: ([0-9a-f]{40})$/m.exec(r.stdout)[1];
  assert.equal(sha, git(c.worktree, 'rev-parse', 'HEAD').trim());
  assert.equal(git(c.worktree, 'log', '-1', '--format=%an').trim(), 'canon-test');
  assert.deepEqual(git(c.worktree, 'diff', '--name-only', `${c.base}..HEAD`).trim().split('\n').sort(), ['.claude/rules/new.md', 'CLAUDE.md']);
  assert.equal(s.wt('commit', '--worktree', c.worktree).code, 2);
});

test('cleanup: 未コミットの変更があれば exit 1 で何も消さない', (t) => {
  const s = setup(t);
  const c = s.create();
  writeFile(c.worktree, 'dirty.md', 'x\n');
  const r = s.wt('cleanup', '--worktree', c.worktree);
  assert.equal(r.code, 1, r.stdout);
  assert.ok(existsSync(c.worktree));
});

test('cleanup: 既定ではブランチを残し、空になった置き場所（wt と .claude-canon）を消す', (t) => {
  const s = setup(t);
  const c = s.create();
  writeFile(c.worktree, 'a.md', 'x\n');
  assert.equal(s.wt('commit', '--worktree', c.worktree, '--message', 'm').code, 0);
  const r = s.wt('cleanup', '--worktree', c.worktree);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!existsSync(c.worktree));
  assert.ok(!existsSync(path.join(s.home, 'wt')), '空の wt が残っている');
  assert.ok(!existsSync(s.home), '空の .claude-canon が残っている');
  assert.match(git(s.repo, 'branch', '--list', c.branch), /canon\//, 'ブランチは成果物なので残す');
  assert.equal(git(s.repo, 'worktree', 'list').trim().split('\n').length, 1, '元の対象に worktree の管理情報が残っている');
});

test('cleanup: 他の run の worktree が残っていれば、置き場所を消さない', (t) => {
  const s = setup(t);
  const a = s.create();
  const b = s.create();
  assert.equal(s.wt('cleanup', '--worktree', a.worktree).code, 0);
  assert.ok(existsSync(b.worktree));
  assert.ok(existsSync(path.join(s.home, 'wt')));
});

test('cleanup --delete-branch: 未マージなら何も変えず exit 1、マージ済みならブランチも消す', (t) => {
  const s = setup(t);
  const c = s.create();
  writeFile(c.worktree, 'a.md', 'x\n');
  assert.equal(s.wt('commit', '--worktree', c.worktree, '--message', 'm').code, 0);
  const refused = s.wt('cleanup', '--worktree', c.worktree, '--delete-branch');
  assert.equal(refused.code, 1, refused.stdout);
  assert.ok(existsSync(c.worktree), '拒否したのに worktree を消している');
  assert.match(git(s.repo, 'branch', '--list', c.branch), /canon\//);

  git(s.repo, 'merge', '-q', '--no-ff', '-m', 'merge', c.branch);
  const ok = s.wt('cleanup', '--worktree', c.worktree, '--delete-branch');
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(!existsSync(c.worktree));
  assert.equal(git(s.repo, 'branch', '--list', c.branch).trim(), '');
});

test('cleanup --discard: 未コミットの変更も未マージのブランチも捨てる', (t) => {
  const s = setup(t);
  const c = s.create();
  writeFile(c.worktree, 'a.md', 'x\n');
  assert.equal(s.wt('commit', '--worktree', c.worktree, '--message', 'm').code, 0);
  writeFile(c.worktree, 'dirty.md', 'y\n');
  const r = s.wt('cleanup', '--worktree', c.worktree, '--discard');
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!existsSync(c.worktree));
  assert.equal(git(s.repo, 'branch', '--list', c.branch).trim(), '');
});

test('cleanup・commit: canon の worktree（canon/ のブランチ）でないものは exit 1 で触らない', (t) => {
  const s = setup(t);
  const other = path.join(s.tmp, 'other-wt');
  git(s.repo, 'worktree', 'add', '-q', '-b', 'feature/x', other);
  writeFile(other, 'a.md', 'x\n');
  assert.equal(s.wt('cleanup', '--worktree', other).code, 1);
  assert.equal(s.wt('commit', '--worktree', other, '--message', 'm').code, 1);
  assert.ok(existsSync(other));
  assert.equal(s.wt('cleanup', '--worktree', path.join(s.tmp, 'ghost')).code, 1);
  assert.equal(s.wt('cleanup').code, 2);
});

test('canon 自身が対象でも作成・コミット・片付けが動く（一時ディレクトリへの clone）', (t) => {
  const s = setup(t);
  const clone = path.join(s.tmp, 'canon-clone');
  git(s.tmp, 'clone', '-q', '--local', '--no-hardlinks', ROOT, clone);
  const ts = nextTs();
  const r = s.wt('create', '--target', clone, '--ts', ts);
  assert.equal(r.code, 0, r.stderr);
  const wt = /^worktree: (.+)$/m.exec(r.stdout)[1];
  assert.ok(existsSync(path.join(wt, '.claude', 'skills', 'canon-reference', 'SKILL.md')));
  writeFile(wt, 'design/self.md', 'x\n');
  assert.equal(s.wt('commit', '--worktree', wt, '--message', 'm').code, 0);
  assert.equal(s.wt('cleanup', '--worktree', wt).code, 0);
});
