/**
 * canon-c/scripts/copy-keep.js（keep の決定論的な verbatim コピー）の回帰テスト。
 *
 * keep は原本とバイト同一でなければ V7 の違反になる。LLM の Read/Write でなく CLI で写し、sha256 で
 * 照合することを固定する。対象リポジトリは handoff.md の target から解決する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { setupSampleRepo, sampleRepoDir } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { tsFor } from './helpers/ts.js';
import { sha256File } from '../lib/managed-paths.js';
import { parseExistingDisposition } from '../lib/design-map.js';

const keepsOf = (c) =>
  parseExistingDisposition(readFileSync(path.join(c.out, 'design-map.md'), 'utf8')).filter((r) => r.disposition === 'keep').map((r) => r.path);

test('copy-keep: keep を原本とバイト同一で generated/ に置く（事前に generated/ から消しておいても復元される）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 1));
  const keeps = keepsOf(c);
  assert.ok(keeps.length > 0, 'fixture に keep が無いと本テストが vacuous');
  for (const rel of keeps) rmSync(path.join(c.gen, rel), { force: true });
  const r = runScript('canon-c', 'copy-keep.js', [c.ts]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).copied.sort(), [...keeps].sort());
  for (const rel of keeps) {
    assert.equal(sha256File(path.join(c.gen, rel)), sha256File(path.join(sampleRepoDir('existing'), rel)), rel);
  }
});

test('copy-keep（違反注入）: 原本が無い keep は写さず exit 1。design-map が無ければ拒否する', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 2));
  const dm = path.join(c.out, 'design-map.md');
  const [first] = keepsOf(c);
  writeFileSync(dm, readFileSync(dm, 'utf8').replace(`path: ${first}`, 'path: .claude/skills/ghost/SKILL.md'));
  const r = runScript('canon-c', 'copy-keep.js', [c.ts]);
  assert.equal(r.code, 1, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).missing, ['.claude/skills/ghost/SKILL.md']);
  assert.equal(existsSync(path.join(c.gen, '.claude/skills/ghost/SKILL.md')), false);

  const noDesign = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 3));
  rmSync(path.join(noDesign.out, 'design-map.md'));
  const refused = runScript('canon-c', 'copy-keep.js', [noDesign.ts]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /design-map\.md が無い/);
});

// ---- 参照元からのコピー ----

import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';

/** 参照元の一式（tmpdir）と、それを指す requirements.md の `## 参照元`・design-map の `## 参照元からのコピー` を作る。 */
function setupRefCopy(t, n, { lines, withSource = true }) {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, n));
  const ref = mkdtempSync(path.join(os.tmpdir(), 'canon-ref-'));
  t.after(() => rmSync(ref, { recursive: true, force: true }));
  mkdirSync(path.join(ref, 'skills/x'), { recursive: true });
  writeFileSync(path.join(ref, 'skills/x/run.mjs'), 'export const big = "参照元の大きなファイル";\n');
  writeFileSync(path.join(ref, 'skills/x/data.json'), '{"a":1}\n');
  const dm = path.join(c.out, 'design-map.md');
  writeFileSync(dm, `${readFileSync(dm, 'utf8')}\n## 参照元からのコピー\n${lines(ref).join('\n')}\n`);
  const base = existsSync(c.req) ? readFileSync(c.req, 'utf8') : '## 確定要件\n- id: R1\n  want: x\n  strength_needed: advisory\n  priority: must\n';
  writeFileSync(c.req, withSource ? `${base}\n## 参照元\n- path: ${ref}\n  role: 移植の基準\n` : base);
  return { c, ref };
}

test('copy-keep: 参照元からのコピーを generated/ にバイト同一で置く（ref_copied に出る）', (t) => {
  const { c, ref } = setupRefCopy(t, 4, {
    lines: (ref) => [`- ${ref}/skills/x/run.mjs → .claude/skills/x/scripts/run.mjs`, `- \`${ref}/skills/x/data.json\` -> \`.claude/skills/x/data.json\``],
  });
  const r = runScript('canon-c', 'copy-keep.js', [c.ts]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).ref_copied.sort(), ['.claude/skills/x/data.json', '.claude/skills/x/scripts/run.mjs']);
  assert.equal(sha256File(path.join(c.gen, '.claude/skills/x/scripts/run.mjs')), sha256File(path.join(ref, 'skills/x/run.mjs')));
});

test('copy-keep（違反注入）: 参照元の配下でない・参照元が未宣言・管理パス外・原本なしは写さず exit 1', (t) => {
  const outside = mkdtempSync(path.join(os.tmpdir(), 'canon-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(path.join(outside, 'secret.txt'), 'x');
  const { c, ref } = setupRefCopy(t, 5, {
    lines: (ref) => [
      `- ${outside}/secret.txt → .claude/skills/x/secret.txt`, // 参照元の配下でない
      `- ${ref}/skills/x/run.mjs → docs/run.mjs`, // 管理パス外
      `- ${ref}/skills/x/ghost.mjs → .claude/skills/x/ghost.mjs`, // 原本なし
      `- ${ref}/skills/x/../../../etc/passwd → .claude/skills/x/p`, // .. で配下の外へ
      '- 矢印の無い行',
    ],
  });
  const r = runScript('canon-c', 'copy-keep.js', [c.ts]);
  assert.equal(r.code, 1, r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ref_copied.length, 0);
  assert.equal(j.rejected.length, 4, JSON.stringify(j));
  assert.deepEqual(j.missing, [`${ref}/skills/x/ghost.mjs`]);
  assert.equal(existsSync(path.join(c.gen, '.claude/skills/x/secret.txt')), false);

  // `## 参照元` が requirements.md に無ければ、参照元からのコピーは全件 rejected
  const noSrc = setupRefCopy(t, 6, { lines: (ref) => [`- ${ref}/skills/x/run.mjs → .claude/skills/x/run.mjs`], withSource: false });
  const r2 = runScript('canon-c', 'copy-keep.js', [noSrc.c.ts]);
  assert.equal(r2.code, 1);
  assert.equal(JSON.parse(r2.stdout).rejected.length, 1);
});

test('copy-keep: 既存判定の無い new モードの design-map でも、参照元からのコピーだけは行う', (t) => {
  const { c, ref } = setupRefCopy(t, 7, { lines: (ref) => [`- ${ref}/skills/x/run.mjs → .claude/skills/x/run.mjs`] });
  const dm = path.join(c.out, 'design-map.md');
  writeFileSync(dm, readFileSync(dm, 'utf8').replace(/## 既存判定[\s\S]*?(?=\n## )/, ''));
  const r = runScript('canon-c', 'copy-keep.js', [c.ts]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).ref_copied, ['.claude/skills/x/run.mjs']);
});
