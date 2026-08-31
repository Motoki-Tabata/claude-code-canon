/**
 * gates/lib/non-schema.js — 「非スキーマ .md」（ワーカー定義でないファイル）判定の
 * Single Source of Truth（詳細設計書 §11.4・実昇格準備2 で確定）。
 *
 * `CLAUDE.md`／`.claude/README.md`／`.claude/settings.json` は agent/skill/rule のような
 * frontmatter スキーマを持たず、G3（配置ファミリー）・G4（種別スキーマ）の対象外である
 * （CLAUDE.md は L1 の行数規約、README.md は G10、settings.json は配線テストがそれぞれ
 * 別途担当する）。
 *
 * 従来この除外判定は `gates/g12_output_perfile.js` の `KNOWN_NON_SCHEMA`・
 * `gates/g10_readme.js` のインライン比較・`tools/promote.js` の `KNOWN_NON_SCHEMA`・
 * `tests/self_application.test.js` の姉妹関数2つ（`walkMd`/`walkMdFs`）に**独立に複製**
 * されていた。新しい生成物（README.md）が初めて実在した機能Y ライブ e2e で、この複製が
 * 2度波及漏れを起こした（L027: g12→promote/tests への波及漏れ／L029: 同一ファイル内の
 * 姉妹関数への波及漏れ）。ここへ集約し、上記すべてはこれを import する
 * （`gates/lib/shell-write.js` が L023 で3ガードの重複を解消した前例と同型）。
 */

// 正準形は generated root（＝ `.claude/` の親ツリー）相対のパス。
export const NON_SCHEMA_MD = new Set(['CLAUDE.md', '.claude/README.md', '.claude/settings.json']);

/**
 * rel が非スキーマファイルかを判定する。呼び出し側の相対基準が2種類あるため、
 * `base` で明示させる（暗黙の基準統一を仮定しない）。
 *   - base: 'generated'（既定）… rel は generated root 相対（例: '.claude/README.md'・'CLAUDE.md'）
 *   - base: 'claude'            … rel は `.claude/` ディレクトリ直下相対（例: 'README.md'）
 * いずれも `\` 区切りを許容する（Windows パス対策）。
 */
export function isNonSchemaRel(rel, base = 'generated') {
  const posixRel = String(rel).replace(/\\/g, '/');
  const canonical = base === 'claude' ? `.claude/${posixRel}` : posixRel;
  return NON_SCHEMA_MD.has(canonical);
}
