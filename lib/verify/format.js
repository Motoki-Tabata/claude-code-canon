/**
 * verify の検査結果の共通形（V1〜V4・V6 が返す違反オブジェクトを report 用の文字列へ落とす）。
 *
 * severity は3つ。
 * - `error`（既定）: 違反。1件でもあれば verify は不合格。
 * - `warning`・`info`: 報告のみ。
 * - `undetermined`: 未判定。`complete: false` のコレクションと照合して一致しなかった名前
 *   （canon-reference/references/quality.md の V-common-01）。存在しないとは断定できないので
 *   違反にしないが、黙って捨てずに報告する。exit code には影響しない。
 */

/** 違反オブジェクト1件を1行の文字列にする。 */
export function formatViolation(v) {
  return `${v.check} ${v.path}: ${v.message} [出典: ${v.source}]`;
}

/**
 * 違反オブジェクトの配列を error（違反）・未判定・それ以外（warning・info。報告のみ）に分ける。
 * warning も黙って捨てない（artifacts.md §8.1「error と warning」）。
 */
export function splitBySeverity(objs) {
  const violations = [];
  const warnings = [];
  const undetermined = [];
  for (const v of objs) {
    const severity = v.severity ?? 'error';
    if (severity === 'error') violations.push(formatViolation(v));
    else if (severity === 'undetermined') undetermined.push(formatViolation(v));
    else warnings.push(`${formatViolation(v)}（${severity}）`);
  }
  return { violations, warnings, undetermined };
}
