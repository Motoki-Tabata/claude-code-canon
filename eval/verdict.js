/**
 * eval/verdict.js — judge（LLM）が書いた verdict のパース＋スキーマ検証（詳細設計書 §16.4）。
 *
 * ## なぜ決定論の検証層が要るか
 *
 * eval は非決定論（LLM）だが、その**出力の形式**は決定論的に検査できる。ここを検査しないと
 * 「judge が何も書かなかった」「フェンスを忘れた」「JSON が壊れた」を **「違反なし」と読んで
 * しまう**。決定論ゲートの vacuous pass（§11.5）と同型の失敗を eval 側で犯すことになる。
 * ゆえに本モジュールは **パース不能・スキーマ違反を「eval の失敗」として明示的に返す**。
 * 「findings が空 ＝ 合格」と読んでよいのは、スキーマ検証を通過し `coverage` が期待対象を
 * 網羅していると `eval/report.js` が確認した場合だけである。
 *
 * 依存ゼロ。フェンス抽出は gates/lib/markdown.js を再利用する（§14）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { firstFencedBlock } from '../gates/lib/markdown.js';

export const AXES = ['correctness', 'security', 'canon', 'context', 'keep-review'];
export const VERDICTS = ['violation', 'clean'];
export const CONDITIONS = ['C2', 'C4', 'merge_target'];
export const CONFIDENCES = ['high', 'medium', 'low'];

const TOP_KEYS = new Set(['axis', 'ts', 'coverage', 'findings']);
const FINDING_KEYS = new Set(['target', 'condition', 'verdict', 'confidence', 'rationale', 'evidence']);
const FINDING_REQUIRED = ['target', 'verdict', 'confidence', 'rationale'];

function norm(p) {
  return String(p).trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * 本文（Markdown）から json フェンス1個を取り出して検証する。
 * @param {string} text
 * @param {string} label 出典表示用（相対パス等）
 * @returns {{ok: boolean, verdict: object|null, violations: string[]}}
 */
export function parseVerdictText(text, label = '<text>') {
  const violations = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, verdict: null, violations: [`${label}: verdict が空（判定結果が書かれていない）。空を「違反なし」と読まない（§16.4）。`] };
  }

  const lines = text.split(/\r?\n/);
  const block = firstFencedBlock(lines, 0, lines.length, 'json');
  if (!block) {
    return {
      ok: false,
      verdict: null,
      violations: [`${label}: json フェンスが無い。judge は本文＋\`\`\`json フェンス1個を書く契約（§16.4）。フェンス不在を「違反なし」と読まない。`],
    };
  }

  let data;
  try {
    data = JSON.parse(block.body.join('\n'));
  } catch (err) {
    return { ok: false, verdict: null, violations: [`${label}: json フェンスがパースできない - ${err.message}`] };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, verdict: null, violations: [`${label}: verdict の最上位がオブジェクトでない。`] };
  }

  // --- 最上位 ---
  for (const k of Object.keys(data)) {
    if (!TOP_KEYS.has(k)) violations.push(`${label}: 未知のキー "${k}"（許可: ${[...TOP_KEYS].join(', ')}）。`);
  }
  if (!AXES.includes(data.axis)) {
    violations.push(`${label}: axis が不正（実際: ${JSON.stringify(data.axis)}・許可: ${AXES.join('|')}）。`);
  }
  if (typeof data.ts !== 'string' || data.ts.trim() === '') {
    violations.push(`${label}: ts が無い、または文字列でない。`);
  }
  // coverage は「見なかった」と「見て問題なし」を区別する唯一の材料。欠落は致命。
  if (!Array.isArray(data.coverage)) {
    violations.push(`${label}: coverage が無い（判定した対象の全列挙は必須・§16.4）。無いと「見なかった」と「見て問題なし」を区別できない。`);
  } else if (data.coverage.some((c) => typeof c !== 'string' || c.trim() === '')) {
    violations.push(`${label}: coverage に空・非文字列の要素がある。`);
  }
  if (!Array.isArray(data.findings)) {
    violations.push(`${label}: findings が配列でない（違反0件でも空配列を明示すること）。`);
  }

  // --- findings ---
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const coverage = Array.isArray(data.coverage) ? data.coverage.map(norm) : [];
  findings.forEach((f, i) => {
    const at = `${label}: findings[${i}]`;
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      violations.push(`${at} がオブジェクトでない。`);
      return;
    }
    for (const k of Object.keys(f)) {
      if (!FINDING_KEYS.has(k)) violations.push(`${at}: 未知のキー "${k}"。`);
    }
    for (const k of FINDING_REQUIRED) {
      if (f[k] === undefined || f[k] === null || String(f[k]).trim() === '') {
        violations.push(`${at}: 必須キー "${k}" が無い。`);
      }
    }
    if (f.verdict !== undefined && !VERDICTS.includes(f.verdict)) {
      violations.push(`${at}: verdict が不正（実際: ${JSON.stringify(f.verdict)}・許可: ${VERDICTS.join('|')}）。`);
    }
    if (f.confidence !== undefined && !CONFIDENCES.includes(f.confidence)) {
      violations.push(`${at}: confidence が不正（実際: ${JSON.stringify(f.confidence)}・許可: ${CONFIDENCES.join('|')}）。`);
    }
    if (f.condition !== undefined && f.condition !== null && !CONDITIONS.includes(f.condition)) {
      violations.push(`${at}: condition が不正（実際: ${JSON.stringify(f.condition)}・許可: ${CONDITIONS.join('|')}|null）。`);
    }
    if (f.evidence !== undefined && !Array.isArray(f.evidence)) {
      violations.push(`${at}: evidence は配列（根拠パス・節参照の列挙）でなければならない。`);
    }
    // coverage に無い対象の finding は coverage が嘘をついている（列挙の網羅性が壊れている）。
    if (typeof f.target === 'string' && coverage.length > 0 && !coverage.includes(norm(f.target))) {
      violations.push(`${at}: target "${f.target}" が coverage に含まれていない（coverage は判定対象の全列挙・§16.4）。`);
    }
  });

  if (violations.length > 0) return { ok: false, verdict: null, violations };

  return {
    ok: true,
    violations: [],
    verdict: {
      axis: data.axis,
      ts: data.ts,
      coverage,
      findings: findings.map((f) => ({
        target: norm(f.target),
        condition: f.condition ?? null,
        verdict: f.verdict,
        confidence: f.confidence,
        rationale: String(f.rationale),
        evidence: Array.isArray(f.evidence) ? f.evidence.map(String) : [],
      })),
    },
  };
}

/** ファイルから読む。不在は「違反なし」でなく eval の失敗（§16.4）。 */
export function loadVerdict(absPath, label = absPath) {
  if (!existsSync(absPath)) {
    return {
      ok: false,
      verdict: null,
      violations: [`${label}: verdict ファイルが存在しない。軸ファイルの欠落を「違反なし」と読まない（§16.5）。`],
    };
  }
  return parseVerdictText(readFileSync(absPath, 'utf8'), label);
}

/** verdict から違反 finding のみを取り出す（P5/P7 の強制表示リストの素・§8.4）。 */
export function violationFindings(verdict) {
  return verdict.findings.filter((f) => f.verdict === 'violation');
}
