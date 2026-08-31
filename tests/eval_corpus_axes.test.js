/**
 * 4軸（correctness / security / canon / context）の収録済みライブ verdict に対する
 * メタ評価の回帰テスト（§16.6・B 2026-08-12）。keep-review は tests/eval_corpus.test.js が
 * 別途カバーする（採点単位が (target, condition) で異なるため軸ごとに分離）。
 *
 * ここで固定するのは「judge が賢いこと」ではなく、収録時点の実測値が閾値を満たしていたこと・
 * 判定が契約どおりの形式で残っていることである。将来 judge のプロンプトを改訂したら収録し直す。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadCorpus, loadVerdicts, score, formatScore } from '../eval/meta-eval.js';
import { ROOT } from './helpers/paths.js';

const CORPUS_ROOT = path.join(ROOT, 'fixtures', 'eval-corpus');

const AXES_4 = ['correctness', 'security', 'canon', 'context'];

for (const axis of AXES_4) {
  const axisDir = path.join(CORPUS_ROOT, axis);
  const recorded = path.join(axisDir, 'recorded');

  test(`${axis}: 収録済み verdict が全ケース分そろい、スキーマ違反0件`, () => {
    assert.ok(existsSync(recorded), `${axis}/recorded/ が無い（ライブ収録の成果物が失われている）`);
    const cases = loadCorpus(axisDir);
    const { verdicts, problems } = loadVerdicts(recorded, cases);
    assert.deepEqual(problems, [], `収録 verdict のスキーマ違反:\n${problems.join('\n')}`);
    assert.equal(verdicts.size, cases.length, '収録されていないケースがある');
  });

  test(`${axis}: 収録済み verdict でメタ評価が閾値を満たす（2026-08-12 実測: 4軸較正新設・B）`, () => {
    const cases = loadCorpus(axisDir);
    const { verdicts } = loadVerdicts(recorded, cases);
    const s = score({ cases, verdicts });
    assert.equal(s.pass, true, formatScore(s));
    assert.equal(s.recall, 1, '違反例の見逃しが発生している');
  });

  test(`${axis}: コーパスに正例・違反例が両方あり、退化していない`, () => {
    const cases = loadCorpus(axisDir);
    assert.ok(cases.length >= 4, `${axis}: ケース数が減っている（実際: ${cases.length}）`);
    const pairs = cases.flatMap((c) => c.expected);
    const violations = pairs.filter((p) => p.verdict === 'violation').length;
    const cleans = pairs.filter((p) => p.verdict === 'clean').length;
    assert.ok(violations >= 2, `${axis}: 違反ラベルが少なすぎる（実際: ${violations}）`);
    assert.ok(cleans >= 2, `${axis}: 正例ラベルが少なすぎる（実際: ${cleans}）`);
  });
}

test('B で発見した境界（judge 改訂の経緯）: canon-progressive と corr-grounded と sec-scoped-bash が存置されている', () => {
  // これらは「私のケース著作の欠陥を judge が発見した」（canon-progressive/corr-grounded）
  // と「judge が正典の表現能力を超えた要求をした」（sec-scoped-bash）の両方の実例であり、
  // quality-checklist / eval-* の改訂根拠として残す（L016 の実例）。
  const targets = [
    ['canon', 'canon-progressive'],
    ['correctness', 'corr-grounded'],
    ['security', 'sec-scoped-bash'],
  ];
  for (const [axis, id] of targets) {
    const cases = loadCorpus(path.join(CORPUS_ROOT, axis));
    assert.ok(cases.some((c) => c.caseId === id), `${axis}/${id} が消えている`);
  }
});
