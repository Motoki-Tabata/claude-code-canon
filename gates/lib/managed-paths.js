/**
 * gates/lib/managed-paths.js — 管理パス集合（§10.1）の Single Source of Truth。
 *
 * G9（生成時の集合内包検査・snapshot 完全性）と deploy/（pre-deploy-check・退避スワップ）が
 * 共有する。§10.1 は「列挙の網羅性が単一障害点」と述べる（漏れたパターン経由で集合外が
 * 混入すれば退避スワップが不可侵領域を破壊しうる）。ゆえにパターン定義は本ファイル1箇所に
 * 集約し、G9 と deploy が同一定義を import する（L005: 代表例で仕様を書くと列挙漏れが単一障害点）。
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

// 管理パス集合（base）。§10.1。generated/ または対象リポジトリからの相対パスがこの集合に収まること。
// 検出パス（系統A が見つけた追加 .claude/*）も許すため .claude/ 配下は広く許可する。
/**
 * L5（Plugin 配布物）のパターン。MANAGED_PATTERNS の一要素であると同時に、
 * G11（制約遵守）が「plugins 禁止なのに plugin 配布物を生成していないか」を
 * 判定するのにも使う。定義を2箇所に書くと片方だけが仕様に追従する（L005）ため
 * 名前を付けて共有する。
 */
export const L5_PLUGIN_PATTERN = /^plugin\/.+/;

export const MANAGED_PATTERNS = [
  /^CLAUDE\.md$/,
  /^\.claude\/rules\/.+/,
  /^\.claude\/skills\/.+/,
  /^\.claude\/agents\/.+/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/README\.md$/,
  /^\.claude\/[^/]+\.md$/, // 検出された .claude 直下の追加ドキュメント
  /^\.mcp\.json$/,
  L5_PLUGIN_PATTERN, // L5
];

/** 相対パス（posix 正規化済み）が管理パス集合に属するか。 */
export function isManaged(rel) {
  return MANAGED_PATTERNS.some((re) => re.test(rel));
}

/** リスト行の正規化: バックスラッシュ→スラッシュ、先頭 ./ 除去、trim。 */
export function normalizeRel(entry) {
  return entry.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * managed-paths.list / retired.list の本文をパースする。
 * # コメント行と空行を除去し、各パスを posix 正規化する（G9 の従来挙動と同一）。
 */
export function parseListText(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(normalizeRel);
}

/**
 * リストファイルを読む。存在しなければ null を返す（retired.list は任意ゆえ、
 * 「不在」と「空リスト」を呼び出し側で区別できるようにする）。
 */
export function readList(abs) {
  if (!existsSync(abs)) return null;
  return parseListText(readFileSync(abs, 'utf8'));
}

/**
 * root 配下で管理パス集合に属する実ファイルの相対パス（posix・ソート済み）を全列挙する。
 * §10.2① の「対象の【実】管理パス集合 全ファイル」の走査に使う。集合外は拾わない。
 */
export function walkManaged(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else {
        const rel = path.relative(root, abs).replace(/\\/g, '/');
        if (isManaged(rel)) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

/** ファイルの sha256（hex）。§9.3 keep（G8）・§10.2 post-check のバイト同一照合に使う。 */
export function sha256File(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}
