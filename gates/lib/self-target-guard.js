/**
 * gates/lib/self-target-guard.js — deploy/ 3スクリプトの自己指定拒否（§10.2・§13.2.1）。
 *
 * 工程10（退避スワップ配置）の対象に claude-canon 自身を指定すると、稼働中の実行体を
 * 機能Y の昇格前検証（G13・G3〜G6・npm test・自動ロールバック・§13.2）を一切通さずに
 * 置換できてしまう。自己再生成の唯一の正しい経路は世代ステージング
 * （`tools/stage-candidate.js`）→ `tools/promote.js` であり、`deploy/` の CLI 入口には
 * 自己指定の経路を存在させない。
 *
 * 注意: この検査は各スクリプトの **CLI 入口（`isMain` ブロック）にのみ** 置く。
 * `computeVanishing()`/`deploy()` 等のエクスポート関数自体には入れない
 * ——`tools/stage-candidate.js` が `computeVanishing(outputDir, CANON_ROOT)` を
 * 正当に呼び出す（§13.2.1 世代ステージング）ため、関数レベルで拒否すると壊れる。
 */

import path from 'node:path';
import { CANON_ROOT } from './canon.js';

/** `<target-repo-dir>` が claude-canon 自身なら true。 */
export function isCanonSelfTarget(targetDir) {
  return path.resolve(targetDir) === CANON_ROOT;
}

export const SELF_TARGET_MESSAGE =
  '対象に claude-canon 自身は指定できない（§10.2・§13.2.1）。退避スワップ配置は機能Y の' +
  '昇格前検証（G13・G3〜G6・npm test・自動ロールバック）を経由しないため、稼働中の実行体を' +
  '無検証で破壊しうる。自己再生成は tools/stage-candidate.js → tools/promote.js を使うこと。';
