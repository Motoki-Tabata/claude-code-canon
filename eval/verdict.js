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
 * ## 「書式違反」と「判定放棄」の区別（S2-1）
 *
 * `quality-checklist` で出力契約を明記しても、judge は同じ形で外し続けた（3 run 連続で
 * `condition` に enum 外の値・`findings[].target` の `coverage` 不記載が再発。ライブ run
 * `20260910_220906`）。judge が**判定は下しているのに書き方だけを外した**場合まで軸全体を
 * 「判定不能」に落とすと、毎 run 手作業での書式修正（オーケストレータによる機械修正）が
 * 必要になる。ここでは次の3種のみ**判定内容を変えずに自動補正し `warnings` に落とす**:
 *   - `condition` が enum 外 → `null` として読む
 *   - `findings[].target` が `coverage` に無い → `coverage` へ自動追記する
 *   - トップレベルの未知キー → 無視する
 * それ以外（フェンス不在・JSON パース失敗・`axis`/`verdict`/`confidence` の enum 外・
 * `coverage`/`findings` 自体の欠落・必須キー欠落等）は**従来どおり判定不能（`ok:false`）**に
 * 落とす。「判定不能を pass と読まない」（§16.4）の原則はここでは変えない——変えるのは
 * 「判定は下っているが書き方を外した」ケースの扱いだけである。
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
 * @returns {{ok: boolean, verdict: object|null, violations: string[], warnings: string[]}}
 */
export function parseVerdictText(text, label = '<text>') {
  const violations = [];
  const warnings = [];
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, verdict: null, violations: [`${label}: verdict が空（判定結果が書かれていない）。空を「違反なし」と読まない（§16.4）。`], warnings };
  }

  const lines = text.split(/\r?\n/);
  const block = firstFencedBlock(lines, 0, lines.length, 'json');
  if (!block) {
    return {
      ok: false,
      verdict: null,
      violations: [`${label}: json フェンスが無い。judge は本文＋\`\`\`json フェンス1個を書く契約（§16.4）。フェンス不在を「違反なし」と読まない。`],
      warnings,
    };
  }

  let data;
  try {
    data = JSON.parse(block.body.join('\n'));
  } catch (err) {
    return { ok: false, verdict: null, violations: [`${label}: json フェンスがパースできない - ${err.message}`], warnings };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, verdict: null, violations: [`${label}: verdict の最上位がオブジェクトでない。`], warnings };
  }

  // --- 最上位 ---
  // トップレベルの未知キーは判定内容を毀損しない書式逸脱なので、無視して warning に落とす
  // （S2-1: judge が同じ形で外し続けたため、軸を丸ごと判定不能にしない）。
  for (const k of Object.keys(data)) {
    if (!TOP_KEYS.has(k)) warnings.push(`${label}: 未知のキー "${k}" を無視した（許可: ${[...TOP_KEYS].join(', ')}）。`);
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

  if (violations.length > 0) return { ok: false, verdict: null, violations, warnings };

  // --- findings ---
  const findings = Array.isArray(data.findings) ? data.findings : [];
  const coverage = Array.isArray(data.coverage) ? data.coverage.map(norm) : [];
  const coverageSet = new Set(coverage);
  findings.forEach((f, i) => {
    const at = `${label}: findings[${i}]`;
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      violations.push(`${at} がオブジェクトでない。`);
      return;
    }
    // findings 内の未知キーは判定内容そのものではないので警告に留める（トップレベルと同様）。
    for (const k of Object.keys(f)) {
      if (!FINDING_KEYS.has(k)) warnings.push(`${at}: 未知のキー "${k}" を無視した。`);
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
    // condition の enum 外は判定放棄ではなく語彙の誤用（実測: security 軸が判定対象ラベル
    // "organization_policy" を condition に入れた）。判定内容（verdict/rationale/evidence）は
    // 毀損されないので null に丸めて warning に落とす（S2-1）。
    if (f.condition !== undefined && f.condition !== null && !CONDITIONS.includes(f.condition)) {
      warnings.push(`${at}: condition が不正（実際: ${JSON.stringify(f.condition)}・許可: ${CONDITIONS.join('|')}|null）。null として読んだ。`);
    }
    if (f.evidence !== undefined && !Array.isArray(f.evidence)) {
      violations.push(`${at}: evidence は配列（根拠パス・節参照の列挙）でなければならない。`);
    }
    // coverage に無い対象の finding は、判定放棄ではなく列挙漏れ（実測: 3 run 連続で発生）。
    // target 自体は判定内容の一部として温存し、coverage へ自動補完して warning に落とす。
    if (typeof f.target === 'string' && coverage.length > 0 && !coverageSet.has(norm(f.target))) {
      warnings.push(`${at}: target "${f.target}" が coverage に無かったため自動補完した（coverage は判定対象の全列挙・§16.4）。`);
      coverageSet.add(norm(f.target));
    }
  });

  if (violations.length > 0) return { ok: false, verdict: null, violations, warnings };

  return {
    ok: true,
    violations: [],
    warnings,
    verdict: {
      axis: data.axis,
      ts: data.ts,
      coverage: [...coverageSet],
      findings: findings.map((f) => ({
        target: norm(f.target),
        condition: CONDITIONS.includes(f.condition) ? f.condition : null,
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
      warnings: [],
    };
  }
  return parseVerdictText(readFileSync(absPath, 'utf8'), label);
}

/** verdict から違反 finding のみを取り出す（P5/P7 の強制表示リストの素・§8.4）。 */
export function violationFindings(verdict) {
  return verdict.findings.filter((f) => f.verdict === 'violation');
}
