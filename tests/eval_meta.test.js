/**
 * eval/meta-eval.js（§16.6）の回帰テスト＝**測定器の測定器**。
 *
 * メタ評価は judge を測る道具だが、その道具自身が「常に合格を返す」バグを持ちうる。
 * それを検出できるのは、**答えが分かっている合成 judge** を食わせて期待どおりの合否が
 * 出ることを固定する以外にない（実 LLM を回しても、通ったことが道具の正しさを証明しない）。
 *
 * 合成 judge:
 *   oracle           … ラベルどおり答える     → 合格しなければならない
 *   always-clean     … 何でも clean          → recall 0 で不合格・退化として名指し
 *   always-violation … 何でも violation      → precision で不合格・退化として名指し
 *   one-miss         … 違反1件だけ見逃す      → recall < 1.0 で不合格（閾値の厳しさの固定）
 *   partial          … 一部を判定しない       → unjudged で不合格（未判定を clean と読まない）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCorpus, score, RECALL_MIN, PRECISION_MIN } from '../eval/meta-eval.js';
import { ROOT } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';

const AXIS_DIR = path.join(ROOT, 'fixtures', 'eval-corpus', 'keep-review');
// 合成 verdict のスキーマが要求する飾りの ts（filesystem には一切触れない・純関数テスト）。
const TS = tsFor(import.meta.url, 0);

/** ラベルから合成 judge の verdict を作る。 */
function synth(cases, mode) {
  const verdicts = new Map();
  let missed = false;
  for (const c of cases) {
    const findings = [];
    for (const e of c.expected) {
      let v;
      if (mode === 'oracle') v = e.verdict;
      else if (mode === 'always-clean') v = 'clean';
      else if (mode === 'always-violation') v = 'violation';
      else if (mode === 'one-miss') {
        v = e.verdict;
        if (e.verdict === 'violation' && !missed) {
          v = 'clean';
          missed = true;
        }
      } else if (mode === 'partial') {
        v = e.verdict;
        if (c.caseId === cases[0].caseId) continue; // 先頭ケースを丸ごと未判定にする
      }
      findings.push({
        target: e.target,
        condition: e.condition,
        verdict: v,
        confidence: 'high',
        rationale: '合成',
        evidence: [],
      });
    }
    verdicts.set(c.caseId, {
      axis: 'keep-review',
      ts: TS,
      coverage: [...new Set(c.expected.map((e) => e.target))],
      findings,
    });
  }
  return verdicts;
}

test('コーパスが読め、正例と違反例の両方を含む（メタ評価が成立する前提）', () => {
  const cases = loadCorpus(AXIS_DIR);
  assert.ok(cases.length >= 4, `ケース数が少なすぎる: ${cases.length}`);
  const s = score({ cases, verdicts: synth(cases, 'oracle') });
  assert.ok(s.corpus.labelViolations > 0, 'コーパスに違反例が無い（検出器の生存を示せない）');
  assert.ok(s.corpus.labelCleans > 0, 'コーパスに正例が無い（過剰検出を測れない）');
});

test('oracle judge は合格する（測定器が正解を落とさない）', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: synth(cases, 'oracle') });
  assert.equal(s.pass, true, s.reasons.join(' / '));
  assert.equal(s.recall, 1);
  assert.equal(s.precision, 1);
  assert.equal(s.matrix.fn, 0);
  assert.equal(s.matrix.fp, 0);
});

test('always-clean judge は recall 0 で不合格・退化として名指しされる', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: synth(cases, 'always-clean') });
  assert.equal(s.pass, false);
  assert.equal(s.recall, 0);
  assert.ok(s.reasons.some((r) => r.includes('always-clean')), s.reasons.join(' / '));
});

test('always-violation judge は precision で不合格・退化として名指しされる', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: synth(cases, 'always-violation') });
  assert.equal(s.pass, false);
  assert.equal(s.recall, 1, '何でも違反と言えば recall は 1.0 になる（だから precision が要る）');
  assert.ok(s.precision < PRECISION_MIN);
  assert.ok(s.reasons.some((r) => r.includes('always-violation')), s.reasons.join(' / '));
});

test('違反を1件だけ見逃す judge も不合格（recall = 1.0 の厳しさを固定）', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: synth(cases, 'one-miss') });
  assert.equal(s.pass, false);
  assert.equal(s.matrix.fn, 1);
  assert.ok(s.recall < RECALL_MIN);
  assert.ok(s.reasons.some((r) => r.includes('見逃し')), s.reasons.join(' / '));
});

test('一部を判定しない judge は unjudged で不合格（未判定を clean と読まない）', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: synth(cases, 'partial') });
  assert.equal(s.pass, false);
  assert.ok(s.unjudged.length > 0);
  assert.ok(s.reasons.some((r) => r.includes('未判定')), s.reasons.join(' / '));
});

test('verdict がまったく無い judge は不合格（沈黙を合格に数えない）', () => {
  const cases = loadCorpus(AXIS_DIR);
  const s = score({ cases, verdicts: new Map() });
  assert.equal(s.pass, false);
  assert.equal(s.missingVerdict.length, cases.length);
});

test('違反例だけのコーパスは不合格（正例が無いと過剰検出を測れない）', () => {
  const cases = [
    { caseId: 'only-violation', expected: [{ target: 'a', condition: 'C2', verdict: 'violation' }] },
  ];
  const s = score({ cases, verdicts: synth(cases, 'oracle') });
  assert.equal(s.pass, false);
  assert.ok(s.reasons.some((r) => r.includes('正例')), s.reasons.join(' / '));
});

test('正例だけのコーパスは不合格（違反例が無いと検出器の生存を示せない・L002）', () => {
  const cases = [{ caseId: 'only-clean', expected: [{ target: 'a', condition: 'C2', verdict: 'clean' }] }];
  const s = score({ cases, verdicts: synth(cases, 'oracle') });
  assert.equal(s.pass, false);
  assert.ok(s.reasons.some((r) => r.includes('違反例')), s.reasons.join(' / '));
});
