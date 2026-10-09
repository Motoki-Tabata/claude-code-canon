/**
 * lib/non-schema.js — 「非スキーマ .md」（ワーカー定義でないファイル）判定の
 * Single Source of Truth（artifacts.md §8.1「非スキーマのファイル」）。
 *
 * `CLAUDE.md`／`AGENTS.md`／`.claude/README.md`／`.claude/settings.json` は agent/skill/rule のような
 * frontmatter スキーマを持たず、V1 の配置種別・V2 のスキーマの対象外である。
 *
 * この除外判定を複数の検査・ツール・テストに独立に複製すると、新しい生成物が初めて実在したとき
 * 波及漏れが起きる。ここへ集約し、呼び出し側はすべてこれを import する。
 *
 * 固定名の4件に加え、**パターンで書くしかない非スキーマ領域**もここが持つ（下記
 * `NON_SCHEMA_PATTERNS` と skill supporting files）。「代表例でなく能力で書く」
 * （`.claude/rules/checks-and-tests.md`）の適用であり、除外集合を呼び出し側へ散らさない。
 */

import { skillPathRole } from './artifact.js';

// 正準形は generated root（＝ `.claude/` の親ツリー）相対のパス。
export const NON_SCHEMA_MD = new Set(['CLAUDE.md', 'AGENTS.md', '.claude/README.md', '.claude/settings.json']);

/**
 * 固定名では書けない非スキーマ領域（パターン判定）。
 *
 * **`.claude/hooks/` 配下**: hook ハンドラ実体の置き場（canon-reference `features/hooks.md` の
 * 公式の例 `.claude/hooks/block-rm.sh`）。`.claude/settings.json`
 * と同じく「配線・実行体」であってワーカー定義ではない。`.sh`/`.mjs` は元々 per-file の検査
 * （`.md`/`.mcp.json` のみ対象）に掛からないが、同ディレクトリの `.md`（手順メモ等）まで
 * V1 の「既知の配置ファミリーに属さない」で弾いてしまうと、管理パス集合へ `.claude/hooks/**`
 * を加えた意味が半分失われる。ゆえに拡張子でなくディレクトリで除外する。
 */
const NON_SCHEMA_PATTERNS = [/^\.claude\/hooks\/.+/];

/**
 * rel が非スキーマファイルかを判定する。呼び出し側の相対基準が2種類あるため、
 * `base` で明示させる（暗黙の基準統一を仮定しない）。
 *   - base: 'generated'（既定）… rel は generated root 相対（例: '.claude/README.md'・'CLAUDE.md'）
 *   - base: 'claude'            … rel は `.claude/` ディレクトリ直下相対（例: 'README.md'）
 * いずれも `\` 区切りを許容する（Windows パス対策）。
 *
 * 第3の経路は **skill パッケージの supporting files**（`.claude/skills/<name>/template.md`・
 * `examples/*.md` 等）。canon-reference（V-skills-18）が許可する
 * Progressive Disclosure の参照先であり、frontmatter スキーマを持たないためワーカー定義では
 * ない。形状判定は複製せず `skillPathRole()`（`lib/artifact.js`）へ委譲する。
 */
export function isNonSchemaRel(rel, base = 'generated') {
  const posixRel = String(rel).replace(/\\/g, '/');
  const canonical = base === 'claude' ? `.claude/${posixRel}` : posixRel;
  if (NON_SCHEMA_MD.has(canonical)) return true;
  if (NON_SCHEMA_PATTERNS.some((re) => re.test(canonical))) return true;
  return skillPathRole(canonical) === 'supporting';
}
