/**
 * canon-a/scripts/new-run.js（run の開始・architecture.md §6・§7）の回帰テスト。
 *
 * 一時 git リポジトリを canon のルートに見立てて createRun を呼び、canon のルート直下に
 * work/output の骨格と handoff.md の雛形ができ、canon_commit が HEAD と一致することを確かめる。
 * 本物の canon リポジトリには run を作らない（CLI は失敗経路だけを実際の起動経路で確かめる）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { createRun, skeletonDirs } from '../.claude/skills/canon-a/scripts/new-run.js';
import { parseHandoff } from '../lib/handoff.js';

const TS = '21000101_000001';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** 一時ディレクトリに canon 役の git リポジトリ（コミット1件）と対象プロジェクトを作る。 */
function setup(t, { existing = true } = {}) {
  const tmp = scratchDir(t, 'canon-new-run-');
  const canonRoot = path.join(tmp, 'canon');
  mkdirSync(canonRoot);
  git(canonRoot, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(canonRoot, 'README.md'), '# canon\n');
  git(canonRoot, 'add', '.');
  git(canonRoot, 'commit', '-q', '-m', 'init');
  const target = path.join(tmp, 'target');
  mkdirSync(path.join(target, '.claude', 'rules'), { recursive: true });
  if (existing) writeFileSync(path.join(target, '.claude', 'rules', 'x.md'), '# x\n');
  return { tmp, canonRoot, target };
}

test('new-run: canon のルート直下に骨格と handoff.md を置き、canon_commit に HEAD を記録する（worktree・ブランチは作らない）', (t) => {
  const s = setup(t);
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.handoff, path.join(s.canonRoot, 'work', TS, 'handoff.md'));
  for (const d of skeletonDirs(TS)) assert.ok(existsSync(path.join(s.canonRoot, d)), `${d} が無い`);
  const head = git(s.canonRoot, 'log', '-1', '--format=%H').trim();
  assert.equal(r.canonCommit, head);
  assert.equal(git(s.canonRoot, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
  assert.equal(git(s.canonRoot, 'branch', '--format=%(refname:short)').trim(), 'main');

  const h = parseHandoff(readFileSync(r.handoff, 'utf8'));
  assert.deepEqual(h, {
    ts: TS,
    target: s.target.split(path.sep).join('/'),
    mode: 'refactor',
    phase: 'A',
    status: 'in_progress',
    canon_commit: head,
  });
  const body = readFileSync(r.handoff, 'utf8');
  for (const heading of ['## 進捗', '## 承認', '## 差し戻し', '## 申し送り']) {
    assert.ok(body.includes(heading), `handoff.md に ${heading} が無い`);
  }
  assert.ok(!body.includes('canon 課題候補'), 'canon 課題は tasks/lessons.md に直接書くので、handoff に節を置かない');
});

test('new-run: 対象に既存のカスタマイズが無ければ mode は new', (t) => {
  const s = setup(t, { existing: false });
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.mode, 'new');
});

test('new-run: 同じ ts の run が既にあれば拒否する。対象が無ければ拒否する', (t) => {
  const s = setup(t);
  createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS }), /同じ ts の run が既にある/);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: path.join(s.tmp, 'nope'), ts: '21000101_000002' }), /対象プロジェクトのディレクトリが無い/);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: 'bad' }), /不正な <ts>/);
});

test('new-run CLI: 引数が無い・ts の形式違いは exit 2、対象が無ければ exit 1（run を作らない）', (t) => {
  assert.equal(runScript('canon-a', 'new-run.js', []).code, 2);
  assert.equal(runScript('canon-a', 'new-run.js', ['/tmp', 'bad']).code, 2);
  const missing = path.join(scratchDir(t, 'canon-new-run-cli-'), 'nope');
  const r = runScript('canon-a', 'new-run.js', [missing, TS]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /対象プロジェクトのディレクトリが無い/);
});
