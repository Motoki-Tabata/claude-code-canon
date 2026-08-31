#!/usr/bin/env node
/**
 * eval/meta-eval.js — judge の較正（詳細設計書 §16.6）。決定論。
 *
 * ## 何のための道具か
 *
 * judge（LLM）は**測定器**であり、測定器は較正しなければ測定値を信用できない。
 * ラベル付きコーパス（正例／違反例）に対する judge の precision / recall を測り、
 * 閾値を割ったら exit 2 で落とす。「judge を実装した」ことは「judge が違反を捕まえる」ことの
 * 証拠にならない——検出0件は成功の証拠にならないのと同じ構図である。
 *
 * ## 落とし方の設計（vacuous pass の封鎖）
 *
 * - **違反例 recall = 1.0 必須**: 1件でも見逃す judge は不合格。これが検出器の生存証明。
 * - **precision >= 0.75**: 全件を violation と言えば recall は 1.0 になる。過剰検出は
 *   P5 の「注意の集中」（§8.4）を壊すので、逆方向からも締める。
 * - **退化の名指し**: 全件 clean（入力を読まず定型を返す）・全件 violation を専用メッセージで落とす。
 * - **未判定は clean と読まない**: ラベルがあるのに finding が無い対は `unjudged` として不合格。
 * - **コーパス自身の検査**: 正例・違反例が両方無いコーパスでのメタ評価は無意味（測る前から通る）。
 *   これも不合格にする。
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { CANON_ROOT } from '../gates/lib/canon.js';
import { isMainModule } from '../gates/lib/run.js';
import { loadVerdict } from './verdict.js';

export const RECALL_MIN = 1.0;
export const PRECISION_MIN = 0.75;

export const CORPUS_ROOT = path.join(CANON_ROOT, 'fixtures', 'eval-corpus');

export class MetaEvalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MetaEvalError';
  }
}

function key(target, condition) {
  return `${String(target).replace(/\\/g, '/')}::${condition}`;
}

/**
 * ラベル付きコーパスを読む。
 * @param {string} axisDir fixtures/eval-corpus/<axis>
 * @returns {{caseId: string, dir: string, expected: {target,condition,verdict}[], note?: string}[]}
 */
export function loadCorpus(axisDir) {
  const casesDir = path.join(axisDir, 'cases');
  if (!existsSync(casesDir)) {
    throw new MetaEvalError(`コーパスが無い（${casesDir}）。コーパス不在でメタ評価を「合格」にしない（§16.6）。`);
  }
  const ids = readdirSync(casesDir).filter((d) => statSync(path.join(casesDir, d)).isDirectory());
  const cases = [];
  for (const id of ids.sort()) {
    const dir = path.join(casesDir, id);
    const labelPath = path.join(dir, 'label.json');
    if (!existsSync(labelPath)) {
      throw new MetaEvalError(`${id}: label.json が無い。正解ラベルの無いケースは採点できない。`);
    }
    const label = JSON.parse(readFileSync(labelPath, 'utf8'));
    if (!Array.isArray(label.expected) || label.expected.length === 0) {
      throw new MetaEvalError(`${id}: label.expected が空。0件ラベルを採点対象にしない（§16.6）。`);
    }
    cases.push({ caseId: id, dir, expected: label.expected, note: label.note });
  }
  if (cases.length === 0) {
    throw new MetaEvalError(`コーパスにケースが1件も無い（${casesDir}）。0件を成功と誤認しない。`);
  }
  return cases;
}

/** judge の verdict 群（<dir>/<case-id>.md）を読む。 */
export function loadVerdicts(dir, cases) {
  const map = new Map();
  const problems = [];
  for (const c of cases) {
    const p = path.join(dir, `${c.caseId}.md`);
    const res = loadVerdict(p, `${c.caseId}`);
    if (!res.ok) problems.push(...res.violations);
    else map.set(c.caseId, res.verdict);
  }
  return { verdicts: map, problems };
}

/**
 * 採点（純関数）。合成 judge を食わせられるよう、入力は「ラベル」と「verdict オブジェクト」のみ。
 * @param {{cases: object[], verdicts: Map<string, object>}} args
 * @returns {{matrix, precision, recall, f1, unjudged, pass, reasons, corpus}}
 */
export function score({ cases, verdicts }) {
  const matrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const unjudged = [];
  const missingVerdict = [];
  let labelViolations = 0;
  let labelCleans = 0;
  let predViolations = 0;
  let predCleans = 0;

  for (const c of cases) {
    const v = verdicts.get(c.caseId);
    if (!v) {
      missingVerdict.push(c.caseId);
    }
    const byKey = new Map();
    // 同一 (target, condition) に複数 finding があるときは violation を優先する（1つでも違反なら
    // その対は違反）。canon/context は1つの生成物に対し観点別（段階的開示・description 等）の
    // finding を condition=null で複数出すため、最後の finding で上書きすると観点間で判定が揺れる。
    // 「どれか1観点でも違反なら生成物は違反」が正しい集約であり、keep-review（1対1）には無影響。
    if (v) for (const f of v.findings) {
      const k = key(f.target, f.condition);
      byKey.set(k, byKey.get(k) === 'violation' ? 'violation' : f.verdict);
    }

    for (const e of c.expected) {
      if (e.verdict === 'violation') labelViolations++;
      else labelCleans++;

      const actual = byKey.get(key(e.target, e.condition));
      if (actual === undefined) {
        // 未判定を clean と読まない（§16.6）。カバレッジの失敗として別立てで数える。
        unjudged.push({ caseId: c.caseId, target: e.target, condition: e.condition, expected: e.verdict });
        continue;
      }
      if (actual === 'violation') predViolations++;
      else predCleans++;

      if (e.verdict === 'violation' && actual === 'violation') matrix.tp++;
      else if (e.verdict === 'violation' && actual === 'clean') matrix.fn++;
      else if (e.verdict === 'clean' && actual === 'violation') matrix.fp++;
      else matrix.tn++;
    }
  }

  const recall = matrix.tp + matrix.fn === 0 ? null : matrix.tp / (matrix.tp + matrix.fn);
  const precision = matrix.tp + matrix.fp === 0 ? null : matrix.tp / (matrix.tp + matrix.fp);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);

  const reasons = [];

  // (0) コーパス自身の健全性。正例・違反例が揃っていないメタ評価は測る前から通る。
  if (labelViolations === 0) {
    reasons.push('コーパスに違反例（expected: violation）が1件も無い。検出器の生存を示せないメタ評価は無意味（L002・§16.6）。');
  }
  if (labelCleans === 0) {
    reasons.push('コーパスに正例（expected: clean）が1件も無い。過剰検出を測れないメタ評価は無意味（§16.6）。');
  }

  // (1) 判定の欠落
  if (missingVerdict.length > 0) {
    reasons.push(`verdict が無いケース: ${missingVerdict.join(', ')}（判定していないものを合格に数えない）。`);
  }
  if (unjudged.length > 0) {
    reasons.push(
      `未判定の対がある（未判定を clean と読まない・§16.6）: ` +
        unjudged.map((u) => `${u.caseId}/${u.target}(${u.condition})`).join(', ')
    );
  }

  // (2) 退化の名指し
  if (labelViolations > 0 && predViolations === 0 && predCleans > 0) {
    reasons.push('judge が violation を1件も出していない（always-clean の退化）。入力を読まず定型を返している疑い。');
  }
  if (labelCleans > 0 && predCleans === 0 && predViolations > 0) {
    reasons.push('judge が clean を1件も出していない（always-violation の退化）。何でも違反と言えば recall は 1.0 になる。');
  }

  // (3) 閾値
  if (recall === null) {
    reasons.push('recall を計算できない（違反例の判定が0件）。');
  } else if (recall < RECALL_MIN) {
    reasons.push(`違反例の recall が ${recall.toFixed(3)} で閾値 ${RECALL_MIN} 未満（見逃し ${matrix.fn} 件）。1件でも見逃す judge は不合格。`);
  }
  if (precision === null) {
    if (labelViolations > 0) reasons.push('precision を計算できない（violation 判定が0件）。');
  } else if (precision < PRECISION_MIN) {
    reasons.push(`precision が ${precision.toFixed(3)} で閾値 ${PRECISION_MIN} 未満（誤検出 ${matrix.fp} 件）。過剰検出は P5 の注意の集中を壊す（§8.4）。`);
  }

  return {
    matrix,
    precision,
    recall,
    f1,
    unjudged,
    missingVerdict,
    corpus: { cases: cases.length, labelViolations, labelCleans },
    pass: reasons.length === 0,
    reasons,
  };
}

/** 人間が読む要約（CLI とテストの失敗表示で共有）。 */
export function formatScore(s) {
  const pct = (x) => (x === null ? 'n/a' : x.toFixed(3));
  const lines = [
    `コーパス: ${s.corpus.cases} ケース（違反ラベル ${s.corpus.labelViolations} / 正例ラベル ${s.corpus.labelCleans}）`,
    `混同行列: TP=${s.matrix.tp} FP=${s.matrix.fp} FN=${s.matrix.fn} TN=${s.matrix.tn}`,
    `precision=${pct(s.precision)} recall=${pct(s.recall)} f1=${pct(s.f1)}（閾値: recall>=${RECALL_MIN} / precision>=${PRECISION_MIN}）`,
    `判定: ${s.pass ? '合格' : '不合格'}`,
  ];
  for (const r of s.reasons) lines.push(`  - ${r}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI: npm run eval:meta -- [--axis keep-review] [--verdicts <dir>]
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { axis: 'keep-review', verdicts: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--axis') args.axis = argv[++i];
    else if (a === '--verdicts') args.verdicts = argv[++i];
    else if (a.startsWith('--axis=')) args.axis = a.slice(7);
    else if (a.startsWith('--verdicts=')) args.verdicts = a.slice(11);
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const axisDir = path.join(CORPUS_ROOT, args.axis);
  const verdictsDir = args.verdicts
    ? path.resolve(verdictsAbs(args.verdicts))
    : path.join(axisDir, 'recorded');

  const cases = loadCorpus(axisDir);
  const { verdicts, problems } = loadVerdicts(verdictsDir, cases);
  const s = score({ cases, verdicts });

  process.stdout.write(`[meta-eval] axis=${args.axis} verdicts=${path.relative(CANON_ROOT, verdictsDir)}\n`);
  if (problems.length > 0) {
    process.stdout.write('verdict のスキーマ違反:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n');
  }
  process.stdout.write(formatScore(s) + '\n');

  if (!s.pass || problems.length > 0) {
    process.exitCode = 2;
  }
}

function verdictsAbs(p) {
  return path.isAbsolute(p) ? p : path.join(CANON_ROOT, p);
}

if (isMainModule(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`meta-eval: ${err.message}\n`);
    process.exit(2);
  }
}
