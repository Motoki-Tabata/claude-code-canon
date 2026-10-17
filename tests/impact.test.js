/**
 * tools/impact.js・lib/impact.js の回帰テスト。
 *
 * 触らないファイルのうち、変えるファイルの路径・相対リンク・語・スラッシュコマンドに触れているものだけが
 * 行番号付きで挙がること（誤検出の境界を含む）、走査件数が 0 のとき合格にしないことを、
 * 実際の起動経路（子プロセス）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir, writeFile } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { gitInit } from './helpers/git.js';
import { ROOT } from './helpers/paths.js';

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

test('impact: 触らないファイルだけを、行番号付きの安定した ID で挙げる', (t) => {
  const { tmp, repo } = buildRepo(t);
  const { code, stdout, res } = run(repo, path.join(tmp, 'o'), ['--files', 'docs/old.md', '--terms', 'verifyX,/canon-x']);
  assert.equal(code, 0, stdout);
  const ids = res.hits.map((h) => h.id);
  assert.deepEqual(ids, [
    'README.md:2:docs/old.md',
    'README.md:3:/canon-x',
    'docs/other.md:1:docs/old.md', // 相対リンク ./old.md を、解決した先で照合した
    'docs/other.md:2:verifyX',
  ]);
  assert.equal(res.hits.find((h) => h.id === 'docs/other.md:1:docs/old.md').via, 'link');
  // 変えるファイル自身・無関係なファイル・バイナリ・語の境界を越える出現（verifyXY・skills/canon-x）は挙げない。
  assert.equal(res.hits.some((h) => h.path === 'docs/old.md' || h.path === 'docs/unrelated.md' || h.path === 'bin.dat'), false);
  assert.equal(res.hits.some((h) => h.line === 4 || h.line === 5), false);
  assert.equal(res.scanned, 3, '走査件数（変えるファイルとバイナリを除く追跡テキスト）');
  assert.match(stdout, /該当 4 件（2 ファイル）/);
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
