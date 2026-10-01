/**
 * verify の検査結果の共通形（V1〜V4・V6 が返す違反オブジェクトを report 用の文字列へ落とす）。
 */

/** 違反オブジェクト1件を1行の文字列にする。 */
export function formatViolation(v) {
  return `${v.check} ${v.path}: ${v.message} [出典: ${v.source}]`;
}

/**
 * 違反オブジェクトの配列を error（違反）とそれ以外（warning・info。報告のみ）に分ける。
 * warning も黙って捨てない（artifacts.md §8.1「error と warning」）。
 */
export function splitBySeverity(objs) {
  const violations = [];
  const warnings = [];
  for (const v of objs) {
    if ((v.severity ?? 'error') === 'error') violations.push(formatViolation(v));
    else warnings.push(`${formatViolation(v)}（${v.severity}）`);
  }
  return { violations, warnings };
}
