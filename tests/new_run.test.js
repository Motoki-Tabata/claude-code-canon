/**
 * tools/new-run.js（run の開始・design/architecture.md §3・§5）の回帰テスト。
 *
 * 一時 git リポジトリを canon のルートに見立てて createRun を呼び、canon のルート直下に work/<ts>/ と
 * handoff.md の雛形ができ、対象の worktree（ブランチ canon/<ts>）が作られ、canon_commit が HEAD と一致することを確かめる。
 * 本物の canon リポジトリには run を作らない（CLI は失敗経路だけを実際の起動経路で確かめる）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { git } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';
import { createRun } from '../tools/new-run.js';
import { parseHandoff } from '../lib/handoff.js';

const TS = '21000101_000001';

/** 一時ディレクトリに canon 役の git リポジトリ（コミット1件）と、git で管理した対象プロジェクトを作る。 */
function setup(t) {
  const tmp = scratchDir(t, 'canon-new-run-');
  const canonRoot = path.join(tmp, 'canon');
  mkdirSync(canonRoot);
  git(canonRoot, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(canonRoot, 'README.md'), '# canon\n');
  git(canonRoot, 'add', '.');
  git(canonRoot, 'commit', '-q', '-m', 'init');
  const target = path.join(tmp, 'target');
  mkdirSync(path.join(target, '.claude', 'rules'), { recursive: true });
  writeFileSync(path.join(target, '.claude', 'rules', 'x.md'), '# x\n');
  git(target, 'init', '-q', '-b', 'main');
  git(target, 'add', '.');
  git(target, 'commit', '-q', '-m', 'init');
  const prev = process.env.CANON_WT_ROOT;
  process.env.CANON_WT_ROOT = path.join(tmp, 'wt');
  t.after(() => {
    if (prev === undefined) delete process.env.CANON_WT_ROOT;
    else process.env.CANON_WT_ROOT = prev;
  });
  return { tmp, canonRoot, target };
}

test('new-run: work/<ts>/ と handoff.md を作り、worktree・branch・base・canon_commit を記録する（output/ は作らない）', (t) => {
  const s = setup(t);
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.handoff, path.join(s.canonRoot, 'work', TS, 'handoff.md'));
  assert.ok(!existsSync(path.join(s.canonRoot, 'output')), 'v3 に output/ は無い');
  const head = git(s.canonRoot, 'log', '-1', '--format=%H').trim();
  assert.equal(r.canonCommit, head);

  assert.equal(r.branch, `canon/${TS}`);
  assert.equal(git(r.worktree, 'branch', '--show-current').trim(), r.branch);
  assert.equal(r.base, git(s.target, 'rev-parse', 'HEAD').trim());
  assert.equal(git(s.target, 'branch', '--show-current').trim(), 'main', '元の対象のブランチを動かしていない');
  assert.ok(existsSync(path.join(r.worktree, '.claude', 'rules', 'x.md')));
  assert.ok(r.worktree.startsWith(path.join(s.tmp, 'wt')), 'CANON_WT_ROOT の下に作る');

  const h = parseHandoff(readFileSync(r.handoff, 'utf8'));
  assert.deepEqual(h, {
    ts: TS,
    target: s.target.split(path.sep).join('/'),
    worktree: r.worktree,
    branch: r.branch,
    base: r.base,
    canon_commit: head,
    stage: 'plan',
    status: 'in_progress',
  });
  assert.ok(!('route' in h), 'route は /canon-plan が要件を固めたあとに決める');
  const body = readFileSync(r.handoff, 'utf8');
  for (const heading of ['## 進捗', '## 承認', '## 差し戻し', '## 申し送り', '## セッション']) {
    assert.ok(body.includes(heading), `handoff.md に ${heading} が無い`);
  }
  assert.equal(body.split('\n').filter((l) => /^- \[ \] /.test(l)).length, 9);
});

test('new-run: 対象が git でなければ exit 1 で、work/<ts>/ も worktree も残さない', (t) => {
  const s = setup(t);
  const plain = path.join(s.tmp, 'plain');
  mkdirSync(plain);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: plain, ts: TS }), /git で管理されていない/);
  assert.ok(!existsSync(path.join(s.canonRoot, 'work', TS)));
  assert.ok(!existsSync(path.join(s.tmp, 'wt')));
});

test('new-run: 同じ ts の run が既にあれば拒否する。対象が無い・ts が不正でも拒否する', (t) => {
  const s = setup(t);
  createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS }), /同じ ts の run が既にある/);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: path.join(s.tmp, 'nope'), ts: '21000101_000002' }), /対象プロジェクトのディレクトリが無い/);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: 'bad' }), /不正な <ts>/);
});

test('new-run: 対象に未コミットの変更があれば dirty を立てる（worktree には入らない）', (t) => {
  const s = setup(t);
  writeFileSync(path.join(s.target, '.claude', 'rules', 'x.md'), '# 変更中\n');
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.dirty, true);
  assert.equal(readFileSync(path.join(r.worktree, '.claude', 'rules', 'x.md'), 'utf8'), '# x\n');
});

test('new-run CLI: 引数不正は exit 2、対象が無ければ exit 1（実際の起動経路。run は作らない）', () => {
  const script = path.join(ROOT, 'tools', 'new-run.js');
  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, ['/x', 'bad-ts']).code, 2);
  const r = runNodeScript(script, ['/nonexistent-canon-target', '21000101_000009']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /対象プロジェクトのディレクトリが無い/);
  assert.ok(!existsSync(path.join(ROOT, 'work', '21000101_000009')));
});
