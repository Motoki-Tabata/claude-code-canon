/**
 * tools/impact.js・lib/impact.js の回帰テスト。
 *
 * 触らないファイルのうち、変えるファイルの路径・相対リンク・語・スラッシュコマンドに触れているものと、
 * 変えるファイルの中で語に触れている行だけが、行番号付きで挙がること（誤検出の境界を含む）、走査件数が 0 のとき合格にしないことを、
 * 実際の起動経路（子プロセス）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir, writeFile } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { gitInit } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';
import { parseChangePlan } from '../lib/change-plan.js';

const IMPACT = path.join(ROOT, 'tools', 'impact.js');

function buildRepo(t) {
  const tmp = scratchDir(t, 'canon-impact-');
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  writeFile(repo, 'docs/old.md', '# old\nverifyX と /canon-x を自分で言及する\n');
  writeFile(repo, 'README.md', '# R\n詳細は docs/old.md を見る。\n起動は /canon-x。\nverifyXY は別の語。\nskills/canon-x は別物。\n');
  writeFile(repo, 'docs/other.md', '[旧](./old.md)\nverifyX を呼ぶ。\n');
  writeFile(repo, 'docs/unrelated.md', '何も言及しない\n');
  writeFile(repo, 'bin.dat', 'verifyX\0binary');
  gitInit(repo);
  return { tmp, repo };
}

function run(repo, out, args) {
  const r = runNodeScript(IMPACT, ['--root', repo, '--out', out, ...args]);
  return { ...r, res: r.code === 0 ? JSON.parse(readFileSync(path.join(out, 'impact.json'), 'utf8')) : null };
}

test('impact: 触らないファイルはパス・リンク・語で、変えるファイルの中は語だけで、行番号付きの安定した ID で挙げる', (t) => {
  const { tmp, repo } = buildRepo(t);
  const { code, stdout, res } = run(repo, path.join(tmp, 'o'), ['--files', 'docs/old.md', '--terms', 'verifyX,/canon-x']);
  assert.equal(code, 0, stdout);
  const ids = res.hits.map((h) => h.id);
  assert.deepEqual(ids, [
    'README.md:2:docs/old.md',
    'README.md:3:/canon-x',
    'docs/old.md:2:/canon-x', // 変えるファイルの中で、instruct の外に語が残りうる行
    'docs/old.md:2:verifyX',
    'docs/other.md:1:docs/old.md', // 相対リンク ./old.md を、解決した先で照合した
    'docs/other.md:2:verifyX',
  ]);
  assert.equal(res.hits.find((h) => h.id === 'docs/other.md:1:docs/old.md').via, 'link');
  assert.deepEqual(res.hits.filter((h) => h.scope === 'changed').map((h) => h.id), ['docs/old.md:2:/canon-x', 'docs/old.md:2:verifyX']);
  assert.ok(res.hits.filter((h) => h.path !== 'docs/old.md').every((h) => h.scope === 'untouched'));
  // 無関係なファイル・バイナリ・語の境界を越える出現（verifyXY・skills/canon-x）は挙げない。
  assert.equal(res.hits.some((h) => h.path === 'docs/unrelated.md' || h.path === 'bin.dat'), false);
  assert.equal(res.hits.some((h) => h.path === 'README.md' && (h.line === 4 || h.line === 5)), false);
  assert.equal(res.scanned, 3, '走査件数（触らない追跡テキスト。変えるファイルとバイナリを除く）');
  assert.match(stdout, /該当 4 件（2 ファイル）/);
  assert.match(stdout, /変えるファイルの中の語の該当 2 件（1 ファイル/);
  assert.match(stdout, /docs\/old\.md:2:verifyX/);
});

test('impact: 変えるファイル同士のパスの参照は挙げない（verify V6 が見る）。語が無ければ変えるファイルの中は走査しない', (t) => {
  const { tmp, repo } = buildRepo(t);
  const both = run(repo, path.join(tmp, 'o1'), ['--files', 'docs/old.md,README.md', '--terms', 'verifyX']);
  assert.equal(both.code, 0, both.stdout);
  assert.equal(both.res.hits.some((h) => h.id === 'README.md:2:docs/old.md'), false, 'README.md も変えるので、old.md への参照は照合しない');
  assert.deepEqual(both.res.hits.filter((h) => h.scope === 'changed').map((h) => h.id), ['docs/old.md:2:verifyX']);
  const noTerms = run(repo, path.join(tmp, 'o2'), ['--files', 'docs/old.md']);
  assert.equal(noTerms.res.hits.some((h) => h.scope === 'changed'), false);
});

test('impact: --files に追跡されていないパス（綴りの誤り・新規）があれば、要約と JSON に挙げる', (t) => {
  const { tmp, repo } = buildRepo(t);
  const { code, stdout, res } = run(repo, path.join(tmp, 'o'), ['--files', 'docs/old.md,docs/olt.md']);
  assert.equal(code, 0, stdout);
  assert.deepEqual(res.untracked_files, ['docs/olt.md']);
  assert.match(stdout, /追跡されていない.*docs\/olt\.md/);
  assert.deepEqual(run(repo, path.join(tmp, 'o2'), ['--files', 'docs/old.md']).res.untracked_files, [], '追跡されているときは挙げない');
});

test('impact: 語だけ・ファイルだけの入力でも動く', (t) => {
  const { tmp, repo } = buildRepo(t);
  assert.equal(run(repo, path.join(tmp, 'o1'), ['--terms', 'verifyX']).res.hits.length, 2, 'old.md は変えるファイルに挙げていないので、触らないファイルとして挙がる');
  assert.equal(run(repo, path.join(tmp, 'o2'), ['--files', 'docs/old.md']).res.hits.length, 2);
});

test('impact: 走査したテキストが 0 件なら exit 1（空の結果を合格にしない）', (t) => {
  const tmp = scratchDir(t, 'canon-impact-zero-');
  const repo = path.join(tmp, 'repo');
  mkdirSync(repo);
  writeFile(repo, 'only.md', 'x\n');
  gitInit(repo);
  const r = runNodeScript(IMPACT, ['--root', repo, '--out', path.join(tmp, 'o'), '--files', 'only.md']);
  assert.equal(r.code, 1, r.stdout + r.stderr);
});

test('impact: git でない root は exit 1、引数不正（files・terms が両方空・必須の欠落・未知の引数）は exit 2', (t) => {
  const tmp = scratchDir(t, 'canon-impact-bad-');
  const o = path.join(tmp, 'o');
  assert.equal(runNodeScript(IMPACT, ['--root', tmp, '--out', o, '--terms', 'x']).code, 1);
  assert.equal(runNodeScript(IMPACT, ['--root', tmp, '--out', o]).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--root', tmp, '--out', o, '--files', ',']).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--terms', 'x']).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--nope']).code, 2);
});

const PLAN = '# change-plan\n\n## ファイル\n\n- path: docs/old.md\n  op: modify\n  reqs: [R1]\n  instruct: 直す\n\n## 影響の語\n\n- `verifyX`（R1）\n- `/canon-x`（R1）\n';

test('impact: --from-plan は --files・--terms と同じ入力・同じ該当になり、impact-ids.txt に1行1件の ID と抜粋を書く', (t) => {
  const { tmp, repo } = buildRepo(t);
  const plan = path.join(tmp, 'change-plan.md');
  writeFileSync(plan, PLAN);
  const direct = run(repo, path.join(tmp, 'o1'), ['--files', 'docs/old.md', '--terms', 'verifyX,/canon-x']);
  const fromPlan = run(repo, path.join(tmp, 'o2'), ['--from-plan', plan]);
  assert.equal(fromPlan.code, 0, fromPlan.stdout);
  assert.deepEqual(fromPlan.res.input, direct.res.input);
  assert.deepEqual(fromPlan.res.hits, direct.res.hits);
  const lines = readFileSync(path.join(tmp, 'o2', 'impact-ids.txt'), 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, fromPlan.res.hits.length);
  assert.deepEqual(lines.map((l) => l.split('\t')[0]), fromPlan.res.hits.map((h) => h.id));
  assert.equal(lines.find((l) => l.startsWith('README.md:3:/canon-x')).split('\t')[1], '起動は /canon-x。');
  assert.match(fromPlan.stdout, /impact-ids\.txt/);
});

test('impact: --from-plan の語は、「影響の語なし（理由）」の行の理由に書かれたバッククォートの語を含めない', (t) => {
  const { tmp, repo } = buildRepo(t);
  const plan = path.join(tmp, 'change-plan.md');
  writeFileSync(plan, `${PLAN}- R2: 影響の語なし（\`reasonWord\` は語でなく説明）\n`);
  assert.deepEqual(parseChangePlan(readFileSync(plan, 'utf8')).terms, ['verifyX', '/canon-x']);
  const r = run(repo, path.join(tmp, 'o'), ['--from-plan', plan]);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(r.res.input.terms, ['verifyX', '/canon-x']);
});

test('impact: --from-plan は、併用・読めない・構造が不正なとき exit 2', (t) => {
  const { tmp, repo } = buildRepo(t);
  const plan = path.join(tmp, 'change-plan.md');
  writeFileSync(plan, PLAN);
  const bad = path.join(tmp, 'bad.md');
  writeFileSync(bad, '# 節が無い\n');
  const o = path.join(tmp, 'o');
  assert.equal(runNodeScript(IMPACT, ['--root', repo, '--out', o, '--from-plan', plan, '--files', 'docs/old.md']).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--root', repo, '--out', o, '--from-plan', plan, '--terms', 'x']).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--root', repo, '--out', o, '--from-plan', path.join(tmp, 'none.md')]).code, 2);
  assert.equal(runNodeScript(IMPACT, ['--root', repo, '--out', o, '--from-plan', bad]).code, 2);
});
