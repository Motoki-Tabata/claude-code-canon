/**
 * self-target-guard.js — canon-d の3スクリプト（pre-deploy-check・deploy・emit-run-manifest）の
 * 自己指定の拒否（artifacts.md §10.5）。
 *
 * 配置（退避スワップ）の対象に claude-canon 自身を指定すると、稼働中の実行体を検証なしに
 * 置換できてしまう。claude-canon 自身の変更は通常の保守（ブランチ・npm test・PR）で行い、
 * canon-d の CLI 入口には自己指定の経路を存在させない。
 *
 * 注意: この検査は各スクリプトの **CLI 入口（`isMain` ブロック）にのみ** 置く。
 * `computeVanishing()`/`deploy()` 等のエクスポート関数自体には入れない
 * ——テストが一時ディレクトリを対象に関数を直接呼ぶため、入口で止めれば足りる。
 */

import path from 'node:path';
import { CANON_ROOT } from '../../../../lib/canon.js';

/** `<target-repo-dir>` が claude-canon 自身なら true。 */
export function isCanonSelfTarget(targetDir) {
  return path.resolve(targetDir) === CANON_ROOT;
}

export const SELF_TARGET_MESSAGE =
  '対象に claude-canon 自身は指定できない（artifacts.md §10.5）。退避スワップ配置は検証を経由しないため、' +
  '稼働中の実行体を無検証で破壊しうる。claude-canon 自身の変更は通常の保守（ブランチ・npm test・PR）で行うこと。';
