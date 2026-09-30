/**
 * canon-a/scripts/new-run.js（run の開始・architecture.md §6・§7）の回帰テスト。
 *
 * 一時 git リポジトリを canon のルートに見立てて createRun を呼び、worktree・run ブランチ・
 * work/output の骨格・handoff.md の雛形ができることを確かめる。本物の canon リポジトリには
 * worktree を作らない（CLI は失敗経路だけを実際の起動経路で確かめる）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { createRun, skeletonDirs, RunError } from '../.claude/skills/canon-a/scripts/new-run.js';
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

test('new-run: worktree を ../canon-runs/<ts> に run/<ts> ブランチで作り、骨格と handoff.md を置く', (t) => {
  const s = setup(t);
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.worktree, path.join(s.tmp, 'canon-runs', TS));
  assert.equal(r.branch, `run/${TS}`);
  assert.equal(git(r.worktree, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), `run/${TS}`);
  assert.match(git(s.canonRoot, 'worktree', 'list'), new RegExp(`canon-runs/${TS}`));
  for (const d of skeletonDirs(TS)) assert.ok(existsSync(path.join(r.worktree, d)), `${d} が無い`);

  const h = parseHandoff(readFileSync(r.handoff, 'utf8'));
  assert.deepEqual(h, { ts: TS, target: s.target.split(path.sep).join('/'), mode: 'refactor', phase: 'A', status: 'in_progress' });
  const body = readFileSync(r.handoff, 'utf8');
  for (const heading of ['## 進捗', '## 承認', '## 差し戻し', '## 申し送り', '## canon 課題候補']) {
    assert.ok(body.includes(heading), `handoff.md に ${heading} が無い`);
  }
});

test('new-run: 対象に既存のカスタマイズが無ければ mode は new', (t) => {
  const s = setup(t, { existing: false });
  const r = createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.equal(r.mode, 'new');
});

test('new-run: 同じ ts の worktree・ブランチが既にあれば拒否する。対象が無ければ拒否する', (t) => {
  const s = setup(t);
  createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS });
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: TS }), RunError);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: path.join(s.tmp, 'nope'), ts: '21000101_000002' }), /対象プロジェクトのディレクトリが無い/);
  assert.throws(() => createRun({ canonRoot: s.canonRoot, target: s.target, ts: 'bad' }), /不正な <ts>/);
});

test('new-run CLI: 引数が無い・ts の形式違いは exit 2、対象が無ければ exit 1（worktree を作らない）', (t) => {
  assert.equal(runScript('canon-a', 'new-run.js', []).code, 2);
  assert.equal(runScript('canon-a', 'new-run.js', ['/tmp', 'bad']).code, 2);
  const missing = path.join(scratchDir(t, 'canon-new-run-cli-'), 'nope');
  const r = runScript('canon-a', 'new-run.js', [missing, TS]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /対象プロジェクトのディレクトリが無い/);
});
