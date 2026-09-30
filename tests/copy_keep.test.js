/**
 * tools/copy-keep.js（keep の決定論的な verbatim コピー）の回帰テスト。
 *
 * keep は原本とバイト同一でなければ G8 違反になる。LLM の Read/Write でなく CLI で写し、sha256 で
 * 照合することを固定する（run 20260927_003229 で generator が keep 10件を Read/Write で写していた）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { setupSampleRepo, sampleRepoDir } from './helpers/fixtures.js';
import { runToolCli } from './helpers/run-cli.js';
import { tsFor } from './helpers/ts.js';
import { sha256File } from '../gates/lib/managed-paths.js';
import { parseExistingDisposition } from '../gates/lib/design-map.js';

const keepsOf = (c) =>
  parseExistingDisposition(readFileSync(path.join(c.out, 'design-map.md'), 'utf8')).filter((r) => r.disposition === 'keep').map((r) => r.path);

test('copy-keep: keep を原本とバイト同一で generated/ に置く（事前に generated/ から消しておいても復元される）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 1));
  const keeps = keepsOf(c);
  assert.ok(keeps.length > 0, 'fixture に keep が無いと本テストが vacuous');
  for (const rel of keeps) rmSync(path.join(c.gen, rel), { force: true });
  const r = runToolCli('copy-keep.js', [c.ts]);
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
  const r = runToolCli('copy-keep.js', [c.ts]);
  assert.equal(r.code, 1, r.stdout);
  assert.deepEqual(JSON.parse(r.stdout).missing, ['.claude/skills/ghost/SKILL.md']);
  assert.equal(existsSync(path.join(c.gen, '.claude/skills/ghost/SKILL.md')), false);

  const noDesign = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 3));
  rmSync(path.join(noDesign.out, 'design-map.md'));
  const refused = runToolCli('copy-keep.js', [noDesign.ts]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /design-map\.md が無い/);
});
