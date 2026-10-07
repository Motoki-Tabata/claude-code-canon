/**
 * canon-d/scripts/pre-deploy-check.js（工程9 の配置前照合・artifacts.md §10.2）の統合テスト。
 * 「消えるファイル」を retired/uncaptured に区分し、uncaptured を検出したら exit 1 で
 * 配置を止める（差し戻し）ことを固定する。0件を成功と誤認しないため、故意に未捕捉ファイルを
 * 注入して検出器の生存を証明する（vacuous pass 対策）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { renderReport } from '../.claude/skills/canon-d/scripts/pre-deploy-check.js';

test('pre-deploy-check: greenfield は消失0件で exit 0', (t) => {
  const c = setupTmpCase(t, 'new');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /消失予定: 0 件/);
});

test('pre-deploy-check: 既存改修は retired のみで exit 0', (t) => {
  const c = setupTmpCase(t, 'existing');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\[retired\] \.claude\/skills\/legacy-skill\/SKILL\.md/);
  assert.match(r.stdout, /uncaptured 0/);
});

test('pre-deploy-check: 未捕捉ファイルは uncaptured 検出で exit 1（差し戻し）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const surprise = path.join(c.target, '.claude', 'skills', 'surprise', 'SKILL.md');
  mkdirSync(path.dirname(surprise), { recursive: true });
  writeFileSync(surprise, '---\nname: surprise\ndescription: 調査取りこぼし\n---\n本文\n');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 1, 'uncaptured は配置中断でなければならない');
  assert.match(r.stdout, /\[uncaptured\] \.claude\/skills\/surprise\/SKILL\.md/);
});

test('pre-deploy-check: managed-paths.list の glob 行を P5 の前に検出して exit 1', (t) => {
  // retired.list だけを読むと、glob 行の list が「消失予定: 0 件」で通り、--confirm を打った
  // deploy.js が rolled-back するまで気づけない。
  const c = setupTmpCase(t, 'new');
  writeFileSync(path.join(c.output, 'deploy', 'managed-paths.list'), '.claude/skills/**\n');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 1, 'glob 行のまま配置へ進ませてはならない');
  assert.match(r.stdout, /\[glob\] managed-paths\.list: \.claude\/skills\/\*\*/);
});

test('pre-deploy-report: 走査不能エントリを本照合の盲点として明示する', () => {
  // walkManaged が種別判定に失敗したエントリは「管理パス集合の一部を列挙できていない」
  // ことを意味する。落ちずに続行する代わりに黙殺すると、防波堤が静かに素通りになる。
  const body = renderReport('/o/20260722_000000', '/t', {
    vanishing: [],
    retired: [],
    uncaptured: [],
    unreadable: [{ rel: '.claude/skills', code: 'EACCES' }],
  });
  assert.match(body, /走査不能: 1 件/);
  assert.match(body, /\[unreadable:EACCES\] \.claude\/skills/);
});

test('pre-deploy-check: managed-paths.list の `..`・集合外・絶対パスの行を P5 の前に検出して exit 1', (t) => {
  // `.claude/rules/../../x` は generated/ に実在し（join で解決される）、パターン `.claude/rules/.+` にも合うが、
  // 配置すると対象ルート直下の x を書く＝集合の外へ出る。
  const c = setupTmpCase(t, 'new');
  writeFileSync(path.join(c.output, 'generated', 'x'), 'escaped\n');
  writeFileSync(path.join(c.output, 'deploy', 'managed-paths.list'), 'CLAUDE.md\n.claude/rules/../../x\nsrc/app.js\n');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /\[unmanaged\] managed-paths\.list: \.claude\/rules\/\.\.\/\.\.\/x/);
  assert.match(r.stdout, /\[unmanaged\] managed-paths\.list: src\/app\.js/);
  assert.doesNotMatch(r.stdout, /\[unmanaged\] managed-paths\.list: CLAUDE\.md/);
});

// ---------------------------------------------------------------------------
// 配置先のブランチと未コミットの変更（warning のみ。exit には影響しない）
// ---------------------------------------------------------------------------

/** 対象を git リポジトリにし、最初のコミットを作る。 */
function gitInit(dir, branch = 'main') {
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
  g('init', '-q', '-b', branch);
  g('config', 'user.email', 't@example.com');
  g('config', 'user.name', 't');
  g('add', '-A');
  g('commit', '-q', '-m', 'init');
  return g;
}

test('pre-deploy-check: 既定ブランチにいると warning を書くが exit 0', (t) => {
  const c = setupTmpCase(t, 'new');
  gitInit(c.target, 'main');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /既定ブランチ（main）にいる/);
  assert.doesNotMatch(r.stdout, /未コミットの変更/);
});

test('pre-deploy-check: 作業ブランチでクリーンなら git の warning は出ない', (t) => {
  const c = setupTmpCase(t, 'new');
  gitInit(c.target, 'feat/x');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /既定ブランチ|未コミット|確認できなかった/);
});

test('pre-deploy-check: 未コミットの変更を件数付きで warning にする（過去の .bak は数えない）', (t) => {
  const c = setupTmpCase(t, 'new');
  gitInit(c.target, 'feat/x');
  writeFileSync(path.join(c.target, 'wip.txt'), 'x\n');
  mkdirSync(path.join(c.target, '.claude-canon.bak.19990101_000000'));
  writeFileSync(path.join(c.target, '.claude-canon.bak.19990101_000000', 'a'), 'x\n');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /未コミットの変更が 1 件/);
  assert.match(r.stdout, /\[dirty\] \?\? wip\.txt/);
});

test('pre-deploy-check: git でない対象は「確認できなかった」と書く（黙って無警告にしない）', (t) => {
  const c = setupTmpCase(t, 'new');
  const r = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /確認できなかった/);
});

test('emit-run-manifest: 配置の前に作業ブランチを切る手順を置く', (t) => {
  const c = setupTmpCase(t, 'new');
  const r = runScript('canon-d', 'emit-run-manifest.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  const body = readFileSync(path.join(c.output, 'deploy', 'RUN.md'), 'utf8');
  const sw = body.indexOf('switch -c');
  assert.ok(sw > 0, 'switch -c の手順がある');
  assert.ok(sw < body.indexOf('--confirm', body.indexOf('### 3.')), '--confirm のコマンドより前');
});
