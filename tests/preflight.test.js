/**
 * tools/preflight.js（段の開始時の照合・design/architecture.md §5）の回帰テスト。
 *
 * 「OK と言うだけの恒真」にならないことを、故意の違反（canon の HEAD の移動・ブランチの付け替え・入力の欠け・
 * 承認後の文書の改変・route の食い違い）を注入して確かめる。CLI は実際の起動経路（exit code）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { git, gitInit } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';
import { tsFor, tsSeq } from './helpers/ts.js';
import { changePlan, setupRun } from './helpers/v3-run.js';
import { formatItems, runPreflight } from '../tools/preflight.js';
import { recordApproval } from '../tools/approvals.js';

const nextTs = tsSeq(import.meta.url);

/** canon 役の git リポジトリの上に run を組み立てる（handoff に canon_commit を足す）。 */
function run(t, route = 'small', opts = {}) {
  const root = scratchDir(t, 'canon-preflight-');
  mkdirSync(path.join(root, 'lib'));
  writeFileSync(path.join(root, 'lib', 'x.js'), '// x\n');
  gitInit(root);
  const r = setupRun(t, nextTs(), { route, root, plan: changePlan(), ...opts });
  const hp = path.join(r.work, 'handoff.md');
  const canonCommit = git(root, 'rev-parse', 'HEAD').trim();
  writeFileSync(hp, readFileSync(hp, 'utf8').replace('stage: build', `canon_commit: ${canonCommit}\nstage: build`));
  const patchHandoff = (from, to) => writeFileSync(hp, readFileSync(hp, 'utf8').replace(from, to));
  return { ...r, root, canonCommit, patchHandoff };
}
const levels = (items) => items.map((i) => `${i.level}:${i.name}`);
const find = (items, name) => items.filter((i) => i.name === name);
const inventory = (r) => r.writeWork('inventory.json', '{}\n');
const impact = (r) => r.writeWork('impact.json', '{}\n');

test('plan: handoff・canon・worktree がそろえば NG なし（route 未決でもよい）', (t) => {
  const r = run(t);
  r.patchHandoff('route: small\n', 'route:\n');
  const items = runPreflight(r.root, r.ts, 'plan');
  assert.deepEqual(levels(items), ['OK:handoff', 'OK:canon', 'OK:worktree']);
  assert.match(formatItems(items), /未コミットの変更 0 件/);
});

test('handoff が無い・frontmatter の欠けは NG（空の入力を合格にしない）', (t) => {
  const r = run(t);
  assert.equal(runPreflight(r.root, tsFor(import.meta.url, 999999), 'plan')[0].level, 'NG');
  r.patchHandoff(/worktree: .*\n/.exec(readFileSync(path.join(r.work, 'handoff.md'), 'utf8'))[0], '');
  const items = runPreflight(r.root, r.ts, 'plan');
  assert.equal(items.length, 1);
  assert.match(items[0].detail, /worktree/);
});

test('canon の HEAD が動いた・未コミットの改修がある → WARN（NG ではない）', (t) => {
  const r = run(t);
  writeFileSync(path.join(r.root, 'lib', 'x.js'), '// 変更\n');
  git(r.root, 'commit', '-qam', '改修');
  writeFileSync(path.join(r.root, 'lib', 'y.js'), '// y\n');
  const items = runPreflight(r.root, r.ts, 'plan');
  const canon = find(items, 'canon')[0];
  assert.equal(canon.level, 'WARN');
  assert.match(canon.detail, /開始時/);
  assert.match(canon.detail, /1 件/);
  assert.ok(!items.some((i) => i.level === 'NG'));
});

test('worktree: ブランチの付け替え・base が祖先でない・worktree の消失は NG', (t) => {
  const r = run(t);
  git(r.worktree, 'checkout', '-q', '-b', 'other');
  assert.match(find(runPreflight(r.root, r.ts, 'plan'), 'worktree')[0].detail, /branch/);
  git(r.worktree, 'checkout', '-q', r.branch);
  r.patchHandoff(r.base, '0'.repeat(40));
  assert.match(find(runPreflight(r.root, r.ts, 'plan'), 'worktree')[0].detail, /祖先でない/);
  r.patchHandoff('0'.repeat(40), r.base);
  r.patchHandoff(r.worktree, `${r.worktree}-gone`);
  assert.match(find(runPreflight(r.root, r.ts, 'plan'), 'worktree')[0].detail, /worktree が無い/);
});

test('design: 小の経路・route 未決は NG。大で入力と G1 がそろえば合格', (t) => {
  const small = run(t, 'small');
  assert.ok(find(runPreflight(small.root, small.ts, 'design'), 'route').some((i) => i.level === 'NG' && /大の経路だけ/.test(i.detail)));
  small.patchHandoff('route: small', 'route:');
  assert.ok(find(runPreflight(small.root, small.ts, 'design'), 'route').some((i) => i.level === 'NG'));

  const r = run(t, 'large');
  let items = runPreflight(r.root, r.ts, 'design');
  assert.match(find(items, 'inputs')[0].detail, /inventory\.json/);
  assert.ok(find(items, 'approvals').some((i) => i.level === 'NG' && /G1/.test(i.detail)), 'G1 の承認行が無い');
  inventory(r);
  recordApproval(r.root, r.ts, 'G1', '要件');
  items = runPreflight(r.root, r.ts, 'design');
  assert.ok(!items.some((i) => i.level === 'NG'), formatItems(items));
  assert.ok(find(items, 'approvals').every((i) => i.level === 'OK'));

  // 承認の後で requirements.md を変えると、G1 は無効になる
  r.writeWork('requirements.md', `${readFileSync(path.join(r.work, 'requirements.md'), 'utf8')}\n追記\n`);
  assert.ok(find(runPreflight(r.root, r.ts, 'design'), 'approvals').some((i) => i.level === 'NG'));
});

test('build: 入力が欠ければ NG。小は G1、大は G1・G2 が有効なら合格（差分のゲートは要求しない）', (t) => {
  const r = run(t, 'small');
  let items = runPreflight(r.root, r.ts, 'build');
  assert.match(find(items, 'inputs')[0].detail, /inventory\.json・impact\.json/);
  inventory(r);
  impact(r);
  assert.ok(find(runPreflight(r.root, r.ts, 'build'), 'approvals').some((i) => i.level === 'NG' && /G1/.test(i.detail)));
  recordApproval(r.root, r.ts, 'G1', '計画');
  items = runPreflight(r.root, r.ts, 'build');
  assert.ok(!items.some((i) => i.level === 'NG'), formatItems(items));
  assert.match(find(items, 'approvals')[0].detail, /^G1 は有効/);

  const big = run(t, 'large');
  inventory(big);
  impact(big);
  recordApproval(big.root, big.ts, 'G1', '要件');
  assert.ok(find(runPreflight(big.root, big.ts, 'build'), 'approvals').some((i) => i.level === 'NG' && /G2/.test(i.detail)), 'G2 が無い');
  recordApproval(big.root, big.ts, 'G2', '設計');
  assert.ok(!runPreflight(big.root, big.ts, 'build').some((i) => i.level === 'NG'));
});

test('preflight CLI: 引数不正は exit 2、handoff が無ければ exit 1（実際の起動経路）', () => {
  const script = path.join(ROOT, 'tools', 'preflight.js');
  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, [tsFor(import.meta.url, 999998)]).code, 2);
  assert.equal(runNodeScript(script, [tsFor(import.meta.url, 999998), '--stage', 'run']).code, 2);
  const r = runNodeScript(script, [tsFor(import.meta.url, 999998), '--stage', 'plan']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /NG\s+handoff: .*handoff\.md が無い/);
  assert.match(r.stdout, /照合: NG 1件/);
});
