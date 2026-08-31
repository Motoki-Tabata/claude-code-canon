/**
 * eval/report.js（§16.5）の回帰テスト。
 *
 * 決定論的に確かめるのは「judge が judge すべきものを実際に judge したか」であって、
 * 判定の中身ではない。ゆえに主眼は **未判定・欠落・集約漏れを合格にしないこと**。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { checkEvalReport, referredTargets } from '../eval/report.js';
import { AXES } from '../eval/verdict.js';
import { scratchDir } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

// 合成 verdict のスキーマが要求する飾りの ts（filesystem には一切触れない）。
const TS = tsFor(import.meta.url, 0);

const KEEP = '.claude/skills/kept/SKILL.md';
const MERGE_SRC = '.claude/skills/merge-a/SKILL.md';

const DESIGN_MAP = `# design-map

## 既存判定（existing_disposition・§8）

\`\`\`yaml
existing_disposition:
  - path: ${KEEP}
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
  - path: ${MERGE_SRC}
    disposition: merge
    superseded_by: .claude/skills/merged/SKILL.md
    manifest_note: "統合"
\`\`\`
`;

function verdictText(axis, coverage, findings) {
  const body = { axis, ts: TS, coverage, findings };
  return `# ${axis}\n\n本文。\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`;
}

const fullFindings = [
  { target: KEEP, condition: 'C2', verdict: 'clean', confidence: 'high', rationale: 'r', evidence: [] },
  { target: KEEP, condition: 'C4', verdict: 'clean', confidence: 'high', rationale: 'r', evidence: [] },
  { target: MERGE_SRC, condition: 'merge_target', verdict: 'clean', confidence: 'high', rationale: 'r', evidence: [] },
];

/** 完全な output/<ts>/ 相当を作る。overrides で個別に壊せる。 */
function setup(t, overrides = {}) {
  const dir = scratchDir(t, 'canon-eval-report-');
  mkdirSync(path.join(dir, 'eval'), { recursive: true });
  if (overrides.designMap !== null) writeFileSync(path.join(dir, 'design-map.md'), overrides.designMap ?? DESIGN_MAP);

  for (const axis of AXES) {
    if (overrides.skipAxis === axis) continue;
    const isKR = axis === 'keep-review';
    const coverage = isKR ? overrides.coverage ?? [KEEP, MERGE_SRC] : [];
    const findings = isKR ? overrides.findings ?? fullFindings : [];
    writeFileSync(path.join(dir, 'eval', `${axis}.md`), overrides.rawAxis?.[axis] ?? verdictText(axis, coverage, findings));
  }

  if (overrides.report !== null) {
    const violated = (overrides.findings ?? fullFindings).filter((f) => f.verdict === 'violation');
    const lines = ['# eval-report', '', '## 軸ごとの結果', ...AXES.map((a) => `- ${a}: 実施`), ''];
    if (overrides.omitViolationsInReport !== true) {
      lines.push('## 要確認（P5/P7 強制表示）', ...violated.map((f) => `- ${f.target}（${f.condition}）`));
    }
    writeFileSync(path.join(dir, 'eval-report.md'), overrides.report ?? lines.join('\n') + '\n');
  }

  return { dir };
}

test('回付対象の導出: keep は C2/C4、merge は merge_target', () => {
  const r = referredTargets(DESIGN_MAP);
  assert.deepEqual(r, [
    { target: KEEP, condition: 'C2' },
    { target: KEEP, condition: 'C4' },
    { target: MERGE_SRC, condition: 'merge_target' },
  ]);
});

test('全軸そろい・全対象を判定済みなら合格', (t) => {
  const c = setup(t);
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, true, r.violations.join(' / '));
  assert.equal(r.referred.length, 3);
  assert.equal(r.forcedReview.length, 0);
});

test('coverage に対象が欠けていたら不合格（未判定を pass と読まない）', (t) => {
  const c = setup(t, { coverage: [KEEP], findings: fullFindings.slice(0, 2) });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('coverage に無い')), r.violations.join(' / '));
});

test('条件単位の未判定（C4 だけ判定していない）も不合格', (t) => {
  const c = setup(t, { findings: [fullFindings[0], fullFindings[2]] });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('条件単位で未判定')), r.violations.join(' / '));
});

test('軸ファイルの欠落を「違反なし」と読まない', (t) => {
  const c = setup(t, { skipAxis: 'security' });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('security')));
});

test('violation は forcedReview（P5/P7 の強制表示リスト）に載る', (t) => {
  const findings = [
    { ...fullFindings[0], verdict: 'violation', rationale: '新要件と重複' },
    fullFindings[1],
    fullFindings[2],
  ];
  const c = setup(t, { findings });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, true, r.violations.join(' / '));
  assert.equal(r.forcedReview.length, 1);
  assert.equal(r.forcedReview[0].condition, 'C2');
});

test('violation が eval-report.md に集約されていなければ不合格（強制表示が成立しない）', (t) => {
  const findings = [{ ...fullFindings[0], verdict: 'violation' }, fullFindings[1], fullFindings[2]];
  const c = setup(t, { findings, omitViolationsInReport: true });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('集約で違反が落ちる')), r.violations.join(' / '));
});

test('eval-report.md 不在・空を合格にしない', (t) => {
  const c1 = setup(t, { report: null });
  assert.equal(checkEvalReport({ ts: 'x', roots: { outputDir: c1.dir } }).ok, false);

  const c2 = setup(t, { report: '   ' });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c2.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('空')));
});

test('design-map 不在を「対象0件＝合格」と読まない', (t) => {
  const c = setup(t, { designMap: null });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('design-map')));
});

test('回付0件（keep/merge なし）は違反ではないが「eval 実施済み」と誤認させない注記が出る', (t) => {
  const dm = DESIGN_MAP.replace('disposition: keep', 'disposition: modify')
    .replace('disposition: merge', 'disposition: retire');
  const c = setup(t, { designMap: dm, coverage: [], findings: [] });
  const r = checkEvalReport({ ts: 'x', roots: { outputDir: c.dir } });
  assert.equal(r.referred.length, 0);
  assert.ok(r.notes.some((n) => n.includes('意味しない')), r.notes.join(' / '));
});
