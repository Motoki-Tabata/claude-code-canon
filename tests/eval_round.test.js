/**
 * eval の2周目（差分だけ再判定）・判定の引き継ぎ・決定論の集約（eval/round.js・eval/aggregate.js・
 * eval/report.js の --write）の回帰テスト。
 *
 * 中心的な関心は「引き継ぎが未判定を pass に変えないこと」:
 *   - 再判定すべき対象が新しい判定の coverage に無ければ落ちる
 *   - 古い判定が新しい判定に見えない（再判定する軸のファイルは round 開始時に消える）
 *   - violation が集約で1件も落ちない
 * 実 work/output は触らず、すべて一時ディレクトリの roots で動かす。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tsFor } from './helpers/ts.js';
import { AXES } from '../eval/verdict.js';
import {
  snapshotGenerated,
  diffSnapshots,
  startFirstRound,
  planRound,
  applyRound,
  mergeVerdict,
  loadEffectiveVerdicts,
  effectivePath,
  snapshotPath,
  RoundError,
} from '../eval/round.js';
import { checkEvalReport } from '../eval/report.js';

const TS = tsFor(import.meta.url, 0);
const DM = ['# dm', '## 既存判定（existing_disposition）', '```yaml', 'existing_disposition:', '  - path: CLAUDE.md', '    disposition: modify', '    interface_change: none', '```', ''].join('\n');

function mkRun(t, { generated = { 'a.md': 'A', 'b.md': 'B' } } = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'eval-round-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const roots = { outputDir: path.join(tmp, 'output'), workDir: path.join(tmp, 'work'), generatedRoot: path.join(tmp, 'output', 'generated') };
  mkdirSync(roots.generatedRoot, { recursive: true });
  mkdirSync(roots.workDir, { recursive: true });
  writeFileSync(path.join(roots.outputDir, 'design-map.md'), DM);
  for (const [rel, body] of Object.entries(generated)) writeGen(roots, rel, body);
  return roots;
}
const writeGen = (roots, rel, body) => {
  mkdirSync(path.dirname(path.join(roots.generatedRoot, rel)), { recursive: true });
  writeFileSync(path.join(roots.generatedRoot, rel), body);
};

/** 判定ファイル output/eval/<axis>.md（本文＋json フェンス1個）を書く。 */
function writeAxis(roots, axis, { coverage = ['a.md', 'b.md'], findings = [] } = {}) {
  mkdirSync(path.join(roots.outputDir, 'eval'), { recursive: true });
  const body = `# ${axis}\n本文\n\n\`\`\`json\n${JSON.stringify({ axis, ts: TS, coverage, findings })}\n\`\`\`\n`;
  writeFileSync(path.join(roots.outputDir, 'eval', `${axis}.md`), body);
}
const finding = (target, verdict = 'violation', extra = {}) => ({ target, condition: null, verdict, confidence: 'high', rationale: `${target} の理由`, evidence: [], ...extra });
const round1 = (roots, perAxis = {}) => {
  startFirstRound({ ts: TS, roots });
  for (const axis of AXES) writeAxis(roots, axis, perAxis[axis] ?? {});
};
const report = (roots) => checkEvalReport({ ts: TS, roots, write: true });

test('スナップショット差分: 追加・内容変更・削除を区別する', () => {
  const d = diffSnapshots({ 'a.md': '1', 'b.md': '2', 'c.md': '3' }, { 'a.md': '1', 'b.md': 'X', 'd.md': '4' });
  assert.deepEqual([d.changed, d.removed], [['b.md', 'd.md'], ['c.md']]);
});

test('round 1: 前の試行の判定（eval/・eval-report.md）と eval-bundle/ を消し、スナップショット r1 を保存する', (t) => {
  const roots = mkRun(t);
  writeAxis(roots, 'security', { findings: [finding('a.md')] }); // 前の試行の残骸
  writeFileSync(path.join(roots.outputDir, 'eval-report.md'), '# 古い');
  mkdirSync(path.join(roots.workDir, 'eval-bundle'), { recursive: true });
  writeFileSync(path.join(roots.workDir, 'eval-bundle', 'round.json'), '{}');
  const { removed } = startFirstRound({ ts: TS, roots });
  assert.equal(existsSync(path.join(roots.outputDir, 'eval')), false, '前の試行の判定が残っている');
  assert.equal(existsSync(path.join(roots.outputDir, 'eval-report.md')), false);
  assert.equal(existsSync(path.join(roots.workDir, 'eval-bundle', 'round.json')), false, '前の round.json が残ると、やり直しが round 2 と誤認される');
  assert.equal(removed.length, 2);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(snapshotPath(roots.workDir, 1), 'utf8'))).sort(), ['a.md', 'b.md']);
});

test('決定論の集約: round 1 は全軸から eval-report.md を書き、violation を1件も落とさず、有効な判定を保存する', (t) => {
  const roots = mkRun(t);
  round1(roots, {
    security: { findings: [finding('a.md', 'violation', { rationale: '権限が広すぎる' }), finding('b.md', 'clean')] },
    canon: { findings: [finding('b.md')] },
  });
  const r = report(roots);
  assert.equal(r.ok, true, r.violations.join('\n'));
  const md = readFileSync(path.join(roots.outputDir, 'eval-report.md'), 'utf8');
  assert.match(md, /権限が広すぎる/, 'rationale が転記されていない');
  assert.match(md, /violation: 2件/);
  for (const axis of AXES) assert.ok(md.includes(axis), `${axis} が集約に無い`);
  assert.ok(existsSync(effectivePath(roots.workDir, 1)), '有効な判定が保存されていない');
});

test('判定不能の軸があれば eval-report.md は書かれても ok にならず、有効な判定は保存されない（未判定を pass と読まない）', (t) => {
  const roots = mkRun(t);
  round1(roots);
  rmSync(path.join(roots.outputDir, 'eval', 'canon.md'));
  const r = report(roots);
  assert.equal(r.ok, false);
  assert.deepEqual(r.undecided, ['canon']);
  assert.match(readFileSync(path.join(roots.outputDir, 'eval-report.md'), 'utf8'), /判定不能/);
  assert.equal(existsSync(effectivePath(roots.workDir, 1)), false);
});

test('round 2 の計画: 前 round が clean なら、変更があっても security だけを再判定し、他は引き継ぐ', (t) => {
  const roots = mkRun(t);
  round1(roots);
  assert.equal(report(roots).ok, true);
  writeGen(roots, 'a.md', 'A2');
  const plan = planRound({ ts: TS, round: 2, roots });
  assert.deepEqual(plan.rejudge_axes, ['security']);
  assert.deepEqual(plan.carry_axes, ['correctness', 'canon', 'context', 'keep-review']);
  assert.deepEqual(plan.rejudge_targets.security, ['a.md']);
});

test('round 2 の計画: 前 round に違反があった軸は再判定し、対象は違反対象＋変更ファイル', (t) => {
  const roots = mkRun(t);
  round1(roots, { canon: { findings: [finding('b.md')] } });
  assert.equal(report(roots).ok, true);
  writeGen(roots, 'a.md', 'A2');
  const plan = planRound({ ts: TS, round: 2, roots });
  assert.deepEqual(plan.rejudge_axes.sort(), ['canon', 'security']);
  assert.deepEqual(plan.rejudge_targets.canon, ['a.md', 'b.md']);
});

test('round 2 の計画: 変更も違反も無ければ何も再判定しない（全軸を引き継ぐ）', (t) => {
  const roots = mkRun(t);
  round1(roots);
  assert.equal(report(roots).ok, true);
  const plan = planRound({ ts: TS, round: 2, roots });
  assert.deepEqual(plan.rejudge_axes, []);
});

test('round 2 の計画: 前 round の有効な判定が無ければ拒否する（round 1 が確定していない）', (t) => {
  const roots = mkRun(t);
  round1(roots);
  assert.throws(() => planRound({ ts: TS, round: 2, roots }), RoundError);
  assert.throws(() => planRound({ ts: TS, round: 1, roots }), /2 以上/);
});

test('applyRound: 再判定する軸のファイルと eval-report.md を消し、前 round を退避する（古い判定を新しい判定に見せない）', (t) => {
  const roots = mkRun(t);
  round1(roots, { canon: { findings: [finding('b.md')] } });
  assert.equal(report(roots).ok, true);
  writeGen(roots, 'a.md', 'A2');
  const plan = planRound({ ts: TS, round: 2, roots });
  applyRound({ ts: TS, plan, roots });
  const ev = (f) => path.join(roots.outputDir, 'eval', f);
  assert.equal(existsSync(ev('canon.md')), false, '再判定する軸の古い判定が残っている');
  assert.equal(existsSync(ev('security.md')), false);
  assert.equal(existsSync(ev('context.md')), true, '引き継ぐ軸のファイルは残す（evalComplete が5軸の実在を要求する）');
  assert.equal(existsSync(ev('round1/canon.md')), true, '前 round の判定が退避されていない');
  assert.equal(existsSync(path.join(roots.outputDir, 'eval-report.md')), false);
});

test('mergeVerdict: 再判定対象の判定は新しいものに置き換わり、それ以外は前 round のまま残る', () => {
  const prior = { axis: 'canon', ts: TS, coverage: ['a.md', 'b.md', 'c.md'], findings: [finding('a.md'), finding('c.md')] };
  const next = { axis: 'canon', ts: TS, coverage: ['a.md'], findings: [] };
  const m = mergeVerdict(prior, next, ['a.md']);
  assert.deepEqual(m.coverage.sort(), ['a.md', 'b.md', 'c.md']);
  assert.deepEqual(m.findings.map((f) => f.target), ['c.md'], 'a.md の違反は再判定で解消・c.md は前 round のまま');
});

test('round 2 E2E: 再判定の結果と引き継いだ判定が合成され、集約に両方が現れ、有効な判定が更新される', (t) => {
  const roots = mkRun(t);
  round1(roots, { canon: { findings: [finding('b.md', 'violation', { rationale: '段階的開示ができていない' })] }, context: { findings: [finding('a.md', 'violation', { rationale: '重複' })] } });
  assert.equal(report(roots).ok, true);

  writeGen(roots, 'b.md', 'B2'); // canon の指摘に対応して直した
  const plan = planRound({ ts: TS, round: 2, roots });
  assert.deepEqual(plan.rejudge_axes.sort(), ['canon', 'context', 'security']);
  applyRound({ ts: TS, plan, roots });
  writeAxis(roots, 'canon', { coverage: ['b.md'], findings: [finding('b.md', 'clean')] }); // 解消
  writeAxis(roots, 'context', { coverage: ['a.md', 'b.md'], findings: [finding('a.md')] }); // 未解消
  writeAxis(roots, 'security', { coverage: ['b.md'], findings: [] });

  const r = report(roots);
  assert.equal(r.ok, true, r.violations.join('\n'));
  const md = readFileSync(path.join(roots.outputDir, 'eval-report.md'), 'utf8');
  assert.match(md, /a\.md.*context|context.*a\.md/s, '未解消の violation が集約に残っていない');
  assert.doesNotMatch(md.split('## 軸ごとの結果')[0].split('## 要確認')[1], /段階的開示/, '解消済みの violation が要確認に残っている');
  assert.match(md, /前 round（round 1）の判定を引き継ぎ/);
  assert.ok(existsSync(effectivePath(roots.workDir, 2)));
});

test('【違反注入】round 2 で再判定すべき対象を coverage に書かない判定は未判定として落ちる（未判定を pass と読まない）', (t) => {
  const roots = mkRun(t);
  round1(roots, { canon: { findings: [finding('b.md')] } });
  assert.equal(report(roots).ok, true);
  writeGen(roots, 'a.md', 'A2');
  const plan = planRound({ ts: TS, round: 2, roots });
  applyRound({ ts: TS, plan, roots });
  writeAxis(roots, 'canon', { coverage: ['a.md'], findings: [] }); // 違反対象 b.md を再判定していない
  writeAxis(roots, 'security', { coverage: ['a.md'], findings: [] });
  const r = report(roots);
  assert.equal(r.ok, false, '違反対象を再判定せずに clean と読まれた（vacuous pass）');
  assert.match(r.violations.join('\n'), /再判定すべき対象が coverage に無い.*b\.md/);
  assert.equal(existsSync(effectivePath(roots.workDir, 2)), false, '未判定を含むのに有効な判定として保存された');
});

test('【違反注入】再判定する軸のファイルを書き直さなければ、古い判定を読まずに判定不能になる', (t) => {
  const roots = mkRun(t);
  round1(roots, { canon: { findings: [finding('b.md')] } });
  assert.equal(report(roots).ok, true);
  writeGen(roots, 'a.md', 'A2');
  applyRound({ ts: TS, plan: planRound({ ts: TS, round: 2, roots }), roots });
  // canon・security を書き直さない
  const { perAxis } = loadEffectiveVerdicts({ ts: TS, roots });
  assert.equal(perAxis.canon.ok, false);
  assert.equal(perAxis.security.ok, false);
  assert.equal(perAxis.context.ok, true, '引き継ぐ軸は判定済み');
});
