/**
 * verify.js（npm run verify・artifacts.md §8.1）の統合テスト。
 *
 * - 実際の起動経路（子プロセス）で exit code・report の出力先・中身を確かめる。
 * - ファイルごとの振り分け（スキーマを持つ定義だけに V1〜V4、非スキーマは素通り、種別不明は V1 違反）。
 * - 検査対象ゼロ（generated/ が無い・空）を合格にしない。
 * - report のハッシュが、report に書いたシェルコマンドの結果と一致する（POSIX のみ）。
 *
 * 「全部通った」だけを根拠にしない: 同じ入力へ違反を注入すると exit 1 になることを対で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo, cleanupTs, writeSkill } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { genDir, outputDir } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { buildContext, runChecks, CHECKS } from '../.claude/skills/canon-c/scripts/verify.js';
import { hashTree } from '../lib/tree-hash.js';

const nextTs = tsSeq(import.meta.url);
const verifyCli = (ts) => runScript('canon-c', 'verify.js', ts === undefined ? [] : [ts]);
const reportOf = (ts) => readFileSync(path.join(outputDir(ts), 'verify-report.md'), 'utf8');

function write(root, rel, text) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

// ---- CLI の実経路 ----

test('verify CLI: 制約強めのサンプルは V1〜V9 を全通過し exit 0、report を output/<ts>/ に書く', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const r = verifyCli(c.ts);
  assert.equal(r.code, 0, r.stdout + r.stderr + (existsSync(path.join(c.out, 'verify-report.md')) ? reportOf(c.ts) : ''));
  const report = reportOf(c.ts);
  for (const [id] of CHECKS) assert.match(report, new RegExp(`^## ${id} `, 'm'), `${id} の節が report に無い`);
  assert.match(report, /結果: 合格（違反 0 件/);
  assert.match(report, /generated\/ のハッシュ: `[0-9a-f]{64}`（4 ファイル）/);
  assert.match(report, /V9: .*organization_policy/, 'V9 の warning（自由文は機械判定しない）も report に残す');
});

test('verify CLI（違反注入）: hooks 禁止の環境に hook 設定を生成すると exit 1、report に V9 の違反が載る', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c.gen, '.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } }));
  const r = verifyCli(c.ts);
  assert.equal(r.code, 1, r.stdout);
  assert.match(r.stdout, /V9:違反/);
  assert.match(reportOf(c.ts), /- 違反: V9: constraints で "hooks" は禁止/);
});

test('verify CLI: 引数が無い・形式違いなら exit 2（report を書かない）', () => {
  assert.equal(verifyCli().code, 2);
  const bad = verifyCli('not-a-ts');
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /npm run verify -- <ts>/);
});

test('verify CLI: generated/ が無いときは全検査を違反にして exit 1（検査対象ゼロを合格にしない）', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  const r = verifyCli(ts);
  assert.equal(r.code, 1);
  const report = reportOf(ts);
  for (const [id] of CHECKS) assert.match(report, new RegExp(`- 違反: ${id}: generated/ が無い`));
  assert.match(report, /generated\/ のハッシュ: なし/);
});

test('verify: generated/ が空でも全検査を違反にする', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  mkdirSync(genDir(ts), { recursive: true });
  const results = runChecks(buildContext(ts));
  for (const [id] of CHECKS) assert.ok(results[id].violations.some((v) => v.includes('generated/ が空')), id);
});

test('verify: report のハッシュは report に書いたシェルコマンドと同じ値になる', { skip: process.platform === 'win32' }, (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c.gen, '.claude/skills/style-guide/examples/a b.md', '空白を含む名前\n');
  const { hash } = hashTree(c.gen);
  const shell = execSync(`(cd "${c.gen}" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) | sha256sum`, {
    encoding: 'utf8',
    shell: '/bin/sh',
  });
  assert.equal(shell.split(/\s+/)[0], hash);
});

// ---- ファイルごとの振り分け（V1〜V4 の対象の決め方）----

test('verify: 生成物の旧称ツール（Task）を V3 で捕まえる', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  write(genDir(ts), '.claude/agents/w/w.md', '---\nname: w\ndescription: x\ntools: Read Task\n---\n本文\n');
  const r = runChecks(buildContext(ts));
  assert.ok(r.V3.violations.some((v) => v.includes('Task')), JSON.stringify(r.V3));
  assert.equal(r.V3.checked, 1);
});

test('verify: CLAUDE.md と README.md に agent/skill のスキーマを当てない（V1〜V3 は対象なし）', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  write(genDir(ts), 'CLAUDE.md', '# c\n本文\n');
  write(genDir(ts), '.claude/README.md', '# 使い方\n');
  const r = runChecks(buildContext(ts));
  for (const id of ['V1', 'V2', 'V3']) {
    assert.deepEqual(r[id].violations, [], `${id}: ${r[id].violations}`);
    assert.match(r[id].na ?? '', /スキーマを持つファイル/, `${id} は「対象なし」と理由を書く`);
  }
});

test('verify: 定義でない .md を黙って飛ばさない（agents 配下の走り書きは V2、種別不明の .md は V1 の違反）', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  write(genDir(ts), '.claude/agents/reviewer/reviewer.md', '---\nname: reviewer\ndescription: x\ntools: Read\n---\n本文\n');
  write(genDir(ts), '.claude/agents/reviewer/notes.md', '走り書き\n');
  write(genDir(ts), '.claude/notes.md', '走り書き\n');
  const r = runChecks(buildContext(ts));
  assert.ok(r.V2.violations.some((v) => v.includes('agents/reviewer/notes.md')), JSON.stringify(r.V2.violations));
  assert.ok(r.V1.violations.some((v) => v.includes('.claude/notes.md') && v.includes('種別')), JSON.stringify(r.V1.violations));
});

test('verify: skill の supporting files は V1 を通り、skills ルート直下の孤児 .md は V1 の違反', (t) => {
  const ts = nextTs();
  cleanupTs(t, ts);
  writeSkill(genDir(ts), 'demo', { body: 'テンプレートは [template.md](./template.md)。' });
  write(genDir(ts), '.claude/skills/demo/template.md', '# テンプレート\n');
  write(genDir(ts), '.claude/skills/demo/scripts/validate.mjs', 'process.exit(0);\n');
  assert.deepEqual(runChecks(buildContext(ts)).V1.violations, []);

  write(genDir(ts), '.claude/skills/orphan.md', '---\nname: orphan\ndescription: x\n---\n本文\n');
  const r = runChecks(buildContext(ts));
  assert.ok(r.V1.violations.some((v) => v.includes('orphan.md') && v.includes('SKILL.md')), JSON.stringify(r.V1.violations));
});

test('verify: 生成物を1回だけ読む（各ファイルの本文と artifact を1回の走査で持つ）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const ctx = buildContext(c.ts);
  assert.equal(ctx.files.length, 4);
  for (const f of ctx.files) {
    assert.equal(typeof f.text, 'string');
    assert.equal(f.artifact !== null, f.rel.endsWith('.md'), `${f.rel}: .md だけが artifact を持つ`);
  }
  // 以降の検査は ctx だけを見る: generated/ を消しても結果が変わらない。
  const before = runChecks(ctx);
  rmSync(c.gen, { recursive: true, force: true });
  const after = runChecks(ctx);
  for (const [id] of CHECKS) assert.deepEqual(after[id], before[id], id);
});
