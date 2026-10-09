/**
 * requirements.md のパーサ（lib/requirements.js の parseRequirementsDoc）の単体テスト。
 * constraints・conflicts の書式の揺れと、0件・ブロック不在を黙って通さないことを固定する。
 * V9 と `npm run check` がこのパーサを入力にする。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_REPOS } from './helpers/sample-repos.js';
import { parseRequirementsDoc } from '../lib/requirements.js';

// ---------------------------------------------------------------------------

test('requirements パーサ: インライン形の constraints と conflicts を読む', () => {
  const doc = parseRequirementsDoc(SAMPLE_REPOS.constrained['expected-work/requirements.md']);
  assert.equal(doc.requirements.length, 2);
  assert.equal(doc.requirements[0].strength_needed, 'deterministic');
  assert.equal(doc.constraintsFound, true);
  assert.equal(doc.constraints.length, 5);
  const hooks = doc.constraints.find((c) => c.key === 'hooks');
  assert.equal(hooks.allowed, false);
  assert.match(hooks.reason, /組織ポリシー/);
  const org = doc.constraints.find((c) => c.key === 'organization_policy');
  assert.equal(org.freeform, true);
  assert.equal(doc.conflicts.length, 1);
  assert.match(doc.conflicts[0].requirement, /R1/);
});

test('requirements パーサ: `conflicts: []` は空（[]）で、ブロックが無いとき（null）と区別する', () => {
  const base = '## 確定要件\n- id: R1\n  strength_needed: advisory\n  priority: must\n\n## 使用可能なカスタマイズ機能\nconstraints:\n  hooks: { allowed: true, reason: "x" }\n';
  assert.deepEqual(parseRequirementsDoc(base + '\n## 制約と要件の衝突\nconflicts: []\n').conflicts, []);
  assert.deepEqual(parseRequirementsDoc(base + '\nconflicts: [ ]  # 無し\n').conflicts, []);
  assert.equal(parseRequirementsDoc(base).conflicts, null);
});

test('requirements パーサ: 複数行形の constraints も読む（書式の揺れで沈黙しない）', () => {
  const doc = parseRequirementsDoc(
    [
      '## 確定要件',
      '- id: R1',
      '  strength_needed: advisory',
      '  priority: must',
      '',
      '## 使用可能なカスタマイズ機能',
      'constraints:',
      '  hooks:',
      '    allowed: false',
      '    reason: "禁止"',
      '  mcp:',
      '    allowed: true',
      '',
    ].join('\n')
  );
  assert.equal(doc.constraints.length, 2);
  assert.equal(doc.constraints[0].allowed, false);
  assert.equal(doc.constraints[1].allowed, true);
  assert.equal(doc.conflicts, null, 'conflicts ブロック不在は null（空リストと区別する）');
});

test('requirements パーサ: 要件0件・確定要件節なしは throw（0件を黙って通さない）', () => {
  assert.throws(() => parseRequirementsDoc('# 何もない\n'), /確定要件/);
  assert.throws(() => parseRequirementsDoc('## 確定要件\n\n（なし）\n'), /1件もレコードが無い/);
});

