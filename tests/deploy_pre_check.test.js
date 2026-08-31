/**
 * deploy/pre-deploy-check.js（工程10①・§10.2）の統合テスト。
 * 「消えるファイル」を retired/uncaptured に区分し、uncaptured を検出したら exit 2 で
 * 配置を止める（差し戻し）ことを固定する。0件を成功と誤認しないため、故意に未捕捉ファイルを
 * 注入して検出器の生存を証明する（L002/L004: vacuous pass 対策）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runDeployCli } from './helpers/hook.js';

test('pre-deploy-check: greenfield は消失0件で exit 0', (t) => {
  const c = setupTmpCase(t, 'new');
  const r = runDeployCli('pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /消失予定: 0 件/);
});

test('pre-deploy-check: 既存改修は retired のみで exit 0', (t) => {
  const c = setupTmpCase(t, 'existing');
  const r = runDeployCli('pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\[retired\] \.claude\/skills\/legacy-skill\/SKILL\.md/);
  assert.match(r.stdout, /uncaptured 0/);
});

test('pre-deploy-check: 未捕捉ファイルは uncaptured 検出で exit 2（差し戻し）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const surprise = path.join(c.target, '.claude', 'skills', 'surprise', 'SKILL.md');
  mkdirSync(path.dirname(surprise), { recursive: true });
  writeFileSync(surprise, '---\nname: surprise\ndescription: 調査取りこぼし\n---\n本文\n');
  const r = runDeployCli('pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 2, 'uncaptured は配置中断でなければならない');
  assert.match(r.stdout, /\[uncaptured\] \.claude\/skills\/surprise\/SKILL\.md/);
});
