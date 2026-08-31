/**
 * 収録済みライブ verdict に対するメタ評価の回帰テスト（§16.6）。
 *
 * `fixtures/eval-corpus/keep-review/recorded/` は、実 `eval-keep-review`（LLM）を
 * ラベル付きコーパスに1周かけて得た**実測の判定**である。ここで固定するのは
 * 「judge が賢いこと」ではなく——それは非決定論なので固定できない——
 * **収録時点の実測値が閾値を満たしていたこと**と、**その判定が契約どおりの形式で
 * 残っていること**である。将来 judge のプロンプトを改訂したら収録し直す。
 *
 * 合成 judge によるスコアラ自身の検証は tests/eval_meta.test.js（測定器の測定器）が担う。
 * 本ファイルはコーパスと収録物の腐りを検出する側。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadCorpus, loadVerdicts, score, formatScore } from '../eval/meta-eval.js';
import { ROOT } from './helpers/paths.js';

const AXIS_DIR = path.join(ROOT, 'fixtures', 'eval-corpus', 'keep-review');
const RECORDED = path.join(AXIS_DIR, 'recorded');

test('収録済み verdict が全ケース分そろい、スキーマ違反0件', () => {
  assert.ok(existsSync(RECORDED), 'recorded/ が無い（ライブ収録の成果物が失われている）');
  const cases = loadCorpus(AXIS_DIR);
  const { verdicts, problems } = loadVerdicts(RECORDED, cases);
  assert.deepEqual(problems, [], `収録 verdict のスキーマ違反:\n${problems.join('\n')}`);
  assert.equal(verdicts.size, cases.length, '収録されていないケースがある');
});

test('収録済み verdict でメタ評価が閾値を満たす（2026-08-12 実測: TP=9 FP=0 FN=0 TN=16・judge 改訂後）', () => {
  const cases = loadCorpus(AXIS_DIR);
  const { verdicts } = loadVerdicts(RECORDED, cases);
  const s = score({ cases, verdicts });
  assert.equal(s.pass, true, formatScore(s));
  assert.equal(s.recall, 1, '違反例の見逃しが発生している');
});

test('コーパスが判定境界を試す規模と構成を保っている（甘いコーパスへの退化を防ぐ）', () => {
  const cases = loadCorpus(AXIS_DIR);
  // B（2026-08-12）で 8→14 ケースへ拡張。境界探索でコーパスを甘くしない規律を数で固定する。
  assert.ok(cases.length >= 14, `ケース数が減っている（実際: ${cases.length}）`);

  const pairs = cases.flatMap((c) => c.expected);
  const violations = pairs.filter((p) => p.verdict === 'violation').length;
  const cleans = pairs.filter((p) => p.verdict === 'clean').length;
  // 違反例が痩せると recall は自動的に楽になり、正例が痩せると precision が測れなくなる。
  assert.ok(violations >= 8, `違反ラベルが少なすぎる（実際: ${violations}）`);
  assert.ok(cleans >= 14, `正例ラベルが少なすぎる（実際: ${cleans}）`);

  // 判定境界を探る難ケースが消えていないこと。
  // - c2-subtle-violation / c4-constraint-conflict: 本文を読まないと見えない重複・constraints 衝突を突く追加ケース
  // - merge-partial-absorb: B で発見した境界。旧 judge プロンプトが「部分吸収」を別軸へ誤振り分けして
  //   見逃した唯一の実バグ。quality-checklist / eval-keep-review の merge_target を内容吸収へ明確化して修正。
  // - c2-semantic-overlap / c2-overlap-new-artifact: 語彙非一致の重複・生成物との重複（recall 境界）
  const ids = cases.map((c) => c.caseId);
  for (const hard of [
    'c2-subtle-violation',
    'c4-constraint-conflict',
    'merge-partial-absorb',
    'c2-semantic-overlap',
    'c2-overlap-new-artifact',
  ]) {
    assert.ok(ids.includes(hard), `難ケース ${hard} が消えている`);
  }
});
