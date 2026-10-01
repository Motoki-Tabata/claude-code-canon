/**
 * canon-d/scripts/self-target-guard.js（自己指定の拒否・artifacts.md §10.5）の回帰テスト。
 * 同一パスの文字列比較では、symlink・サブディレクトリ・祖先・別 worktree からの指定が素通りする。
 * isCanonSelfTarget は canonRoot を引数で差し替えられるので、一時ディレクトリで判定を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { ROOT as CANON_ROOT } from './helpers/paths.js';
import { runScript } from './helpers/run-cli.js';
import { isCanonSelfTarget, pathKey } from '../.claude/skills/canon-d/scripts/self-target-guard.js';

function fakeCanon(t) {
  const base = scratchDir(t, 'canon-guard-');
  const canon = path.join(base, 'canon');
  mkdirSync(path.join(canon, 'sub', 'deeper'), { recursive: true });
  mkdirSync(path.join(base, 'other'), { recursive: true });
  return { base, canon };
}

function canTrySymlink(t, target, link) {
  try {
    symlinkSync(target, link, 'dir');
    return true;
  } catch (e) {
    // Windows の CI などで symlink 作成権限が無い場合（EPERM）は作れないので skip する。
    t.skip(`symlink を作れない環境（${e.code}）`);
    return false;
  }
}

test('guard: canon ルートそのものは自己指定', (t) => {
  const { canon } = fakeCanon(t);
  assert.equal(isCanonSelfTarget(canon, canon), true);
  assert.equal(isCanonSelfTarget(canon + path.sep, canon), true, '末尾区切りでも同じ');
  assert.equal(isCanonSelfTarget(path.join(canon, 'sub', '..'), canon), true, '`..` を含む表記でも同じ');
});

test('guard: canon の配下（サブディレクトリ）は自己指定', (t) => {
  const { canon } = fakeCanon(t);
  assert.equal(isCanonSelfTarget(path.join(canon, 'sub'), canon), true);
  assert.equal(isCanonSelfTarget(path.join(canon, 'sub', 'deeper'), canon), true);
});

test('guard: canon を含む祖先ディレクトリも自己指定（配下の管理パスに canon が入る）', (t) => {
  const { base, canon } = fakeCanon(t);
  assert.equal(isCanonSelfTarget(base, canon), true);
});

test('guard: 無関係なディレクトリ・名前が前方一致するだけの兄弟は自己指定ではない', (t) => {
  const { base, canon } = fakeCanon(t);
  mkdirSync(path.join(base, 'canon-other'), { recursive: true });
  assert.equal(isCanonSelfTarget(path.join(base, 'other'), canon), false);
  assert.equal(isCanonSelfTarget(path.join(base, 'canon-other'), canon), false);
});

test('guard: canon への symlink は realpath で自己指定と判定する', (t) => {
  const { base, canon } = fakeCanon(t);
  const link = path.join(base, 'link-to-canon');
  if (!canTrySymlink(t, canon, link)) return;
  assert.equal(isCanonSelfTarget(link, canon), true);
  assert.equal(isCanonSelfTarget(path.join(link, 'sub'), canon), true);
});

test('guard: canon が symlink 経由で指されていても（canonRoot 側が symlink）自己指定と判定する', (t) => {
  const { base, canon } = fakeCanon(t);
  const link = path.join(base, 'link-to-canon');
  if (!canTrySymlink(t, canon, link)) return;
  assert.equal(isCanonSelfTarget(canon, link), true);
});

test('guard: 存在しないパスは例外にせず、文字列の包含で判定する', (t) => {
  const { base, canon } = fakeCanon(t);
  assert.equal(isCanonSelfTarget(path.join(canon, 'no-such'), canon), true);
  assert.equal(isCanonSelfTarget(path.join(base, 'no-such'), canon), false);
});

test('pathKey: Windows では大文字小文字を区別しない比較キーにする', () => {
  assert.equal(pathKey('/Foo/Bar', 'win32'), pathKey('/foo/BAR', 'win32'));
  assert.notEqual(pathKey('/Foo/Bar', 'linux'), pathKey('/foo/bar', 'linux'));
});

test('guard: 別 worktree（セッション用）から実行しても、main の canon を指定されたら自己指定', (t) => {
  const base = scratchDir(t, 'canon-guard-wt-');
  const main = path.join(base, 'main');
  const wt = path.join(base, 'wt');
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: main, stdio: 'pipe' });
  try {
    mkdirSync(main);
    git('init', '-q');
    writeFileSync(path.join(main, 'f.txt'), 'x\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    git('worktree', 'add', '-q', '-b', 'session', wt);
  } catch (e) {
    t.skip(`git worktree を作れない環境: ${e.message}`);
    return;
  }
  // canonRoot は「いま実行している canon」＝ セッション用の worktree。対象に main のチェックアウトが指定された。
  assert.equal(isCanonSelfTarget(main, wt), true);
  assert.equal(isCanonSelfTarget(path.join(main, 'sub-not-exist'), wt), true);
  assert.equal(isCanonSelfTarget(path.join(base, 'elsewhere'), wt), false);
});

test('CLI: pre-deploy-check・deploy・emit-run-manifest は canon 配下・祖先の対象を exit 1 で拒否する', (t) => {
  const out = scratchDir(t, 'canon-guard-cli-');
  mkdirSync(path.join(out, '20260722_000000', 'generated'), { recursive: true });
  mkdirSync(path.join(out, '20260722_000000', 'deploy'), { recursive: true });
  writeFileSync(path.join(out, '20260722_000000', 'deploy', 'managed-paths.list'), 'CLAUDE.md\n');
  const o = path.join(out, '20260722_000000');
  for (const target of [path.join(CANON_ROOT, 'lib'), path.dirname(CANON_ROOT), CANON_ROOT]) {
    for (const script of ['pre-deploy-check.js', 'deploy.js', 'emit-run-manifest.js']) {
      const r = runScript('canon-d', script, [o, target]);
      assert.equal(r.code, 1, `${script} ${target}: ${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /自身は指定できない/);
    }
  }
});
