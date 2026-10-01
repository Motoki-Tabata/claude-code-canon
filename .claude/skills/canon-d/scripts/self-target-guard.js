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
import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CANON_ROOT } from '../../../../lib/canon.js';

/** 比較用のキー。Windows（既定で大文字小文字を区別しない FS）では小文字化する。 */
export function pathKey(p, platform = process.platform) {
  return platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * symlink・`..`・Windows の短縮名（RUNNER~1 など）を解決した実パス。
 * 存在しないパスは、実在する最も近い祖先を実パスにし、残りを連結する
 * （存在しない部分だけ短縮名のまま残ると、実在側の長い名前と比較が食い違う）。
 */
function realOrResolved(p) {
  const abs = path.resolve(p);
  let head = abs;
  const rest = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(head), ...rest.reverse());
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return abs;
      rest.push(path.basename(head));
      head = parent;
    }
  }
}

/** child が parent と同じか、その配下か。 */
function isSameOrInside(parent, child) {
  const rel = path.relative(pathKey(parent), pathKey(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * canonRoot と同じ git リポジトリの全 worktree のルート（main のチェックアウトを含む）。
 * セッション用の worktree（`.claude/worktrees/` など）で実行しているとき、main の canon を対象に指定されても自己指定になる。
 * git が無い・リポジトリでないときは判定できないので空配列（その場合に検出できる範囲は realpath と包含判定まで）。
 */
function sameRepoWorktreeRoots(canonRoot) {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: canonRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out
      .split(/\r?\n/)
      .filter((l) => l.startsWith('worktree '))
      .map((l) => realOrResolved(l.slice('worktree '.length)));
  } catch {
    return [];
  }
}

/**
 * `<target-repo-dir>` が claude-canon 自身に当たるなら true。次のどれでも true にする:
 *   - canon のルートそのもの（symlink・`..`・末尾区切り・Windows の大文字小文字違いを解決したうえで）
 *   - canon の配下（サブディレクトリ。そこにも .claude/ を置けるが、canon の一部を壊しうる）
 *   - canon を配下に含む祖先（その管理パス集合の走査・退避が canon に及ぶ）
 *   - 同じ git リポジトリの別 worktree（セッション用の worktree から main の canon を指定した場合など）
 * @param {string} targetDir
 * @param {string} [canonRoot] テストで差し替える。既定は実行中の canon のルート。
 */
export function isCanonSelfTarget(targetDir, canonRoot = CANON_ROOT) {
  const target = realOrResolved(targetDir);
  const roots = [realOrResolved(canonRoot), ...sameRepoWorktreeRoots(canonRoot)];
  return roots.some((root) => isSameOrInside(root, target) || isSameOrInside(target, root));
}

export const SELF_TARGET_MESSAGE =
  '対象に claude-canon 自身は指定できない（artifacts.md §10.5）。退避スワップ配置は検証を経由しないため、' +
  '稼働中の実行体を無検証で破壊しうる。claude-canon 自身の変更は通常の保守（ブランチ・npm test・PR）で行うこと。';
