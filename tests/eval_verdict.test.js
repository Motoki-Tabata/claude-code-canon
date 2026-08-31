/**
 * eval/verdict.js（§16.4）の回帰テスト。
 *
 * 主眼は「**壊れた judge 出力を『違反なし』と読まないこと**」。eval は非決定論だが、
 * その出力形式は決定論的に検査できる。ここが緩いと、judge が沈黙しただけの run が
 * 「品質検査を通過した」ことになる（§11.5 の vacuous pass と同型）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdictText, loadVerdict, violationFindings } from '../eval/verdict.js';

const OK_JSON = {
  axis: 'keep-review',
  ts: '20260723_000000',
  coverage: ['.claude/skills/a/SKILL.md'],
  findings: [
    {
      target: '.claude/skills/a/SKILL.md',
      condition: 'C2',
      verdict: 'violation',
      confidence: 'high',
      rationale: '新要件と役割が重複する',
      evidence: ['spec.md#R1'],
    },
  ],
};

function wrap(obj, body = '本文の根拠。') {
  return `# eval verdict\n\n${body}\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;
}

test('正常な verdict をパースできる', () => {
  const r = parseVerdictText(wrap(OK_JSON), 'x');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(r.verdict.findings.length, 1);
  assert.equal(violationFindings(r.verdict).length, 1);
});

test('findings 空（違反0件）は正常にパースできる — 空配列は明示されている', () => {
  const r = parseVerdictText(wrap({ ...OK_JSON, findings: [] }), 'x');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(violationFindings(r.verdict).length, 0);
});

test('json フェンスが無い verdict を「違反なし」と読まない', () => {
  const r = parseVerdictText('# eval\n\n問題ありませんでした。\n', 'x');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('json フェンスが無い')));
});

test('空の verdict を「違反なし」と読まない', () => {
  const r = parseVerdictText('   ', 'x');
  assert.equal(r.ok, false);
});

test('壊れた JSON を「違反なし」と読まない', () => {
  const r = parseVerdictText('```json\n{ "axis": "keep-review",,, }\n```\n', 'x');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('パースできない')));
});

test('coverage 欠落は違反（「見なかった」と「見て問題なし」を区別できなくなる）', () => {
  const { coverage, ...noCoverage } = OK_JSON;
  const r = parseVerdictText(wrap({ ...noCoverage, findings: [] }), 'x');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('coverage')));
});

test('未知キー・enum 外の値を検出する', () => {
  const r1 = parseVerdictText(wrap({ ...OK_JSON, extra: 1 }), 'x');
  assert.equal(r1.ok, false);
  assert.ok(r1.violations.some((v) => v.includes('未知のキー')));

  const r2 = parseVerdictText(wrap({ ...OK_JSON, axis: 'そのほか' }), 'x');
  assert.equal(r2.ok, false);
  assert.ok(r2.violations.some((v) => v.includes('axis')));

  const bad = JSON.parse(JSON.stringify(OK_JSON));
  bad.findings[0].verdict = 'maybe';
  const r3 = parseVerdictText(wrap(bad), 'x');
  assert.equal(r3.ok, false);
  assert.ok(r3.violations.some((v) => v.includes('verdict が不正')));

  const bad2 = JSON.parse(JSON.stringify(OK_JSON));
  bad2.findings[0].condition = 'C9';
  const r4 = parseVerdictText(wrap(bad2), 'x');
  assert.equal(r4.ok, false);
  assert.ok(r4.violations.some((v) => v.includes('condition が不正')));
});

test('必須キー欠落（rationale なし）を検出する', () => {
  const bad = JSON.parse(JSON.stringify(OK_JSON));
  delete bad.findings[0].rationale;
  const r = parseVerdictText(wrap(bad), 'x');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('rationale')));
});

test('coverage に無い target への finding を検出する（coverage の網羅性が嘘になる）', () => {
  const bad = JSON.parse(JSON.stringify(OK_JSON));
  bad.coverage = ['.claude/skills/other/SKILL.md'];
  const r = parseVerdictText(wrap(bad), 'x');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('coverage に含まれていない')));
});

test('ファイル不在を「違反なし」と読まない', () => {
  const r = loadVerdict('/存在しない/eval/keep-review.md', 'missing');
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('存在しない')));
});
