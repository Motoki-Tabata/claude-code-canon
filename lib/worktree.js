/**
 * lib/worktree.js — 対象リポジトリの作業用 worktree（ブランチ `canon/<ts>`）の作成・コミット・片付け
 * （`tools/worktree.js` の本体）。
 *
 * 置き場所は `~/.claude-canon/wt/<対象名>-<ts>/`（環境変数 `CANON_WT_ROOT` で根を上書きできる）。
 * ブランチは人間がマージする成果物なので、片付けは既定ではブランチを消さない。
 * 作者情報は埋め込まない（git の設定か `GIT_AUTHOR_*`・`GIT_COMMITTER_*` に任せる）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class WorktreeError extends Error {}

export const BRANCH_PREFIX = 'canon/';

export function wtRoot() {
  return process.env.CANON_WT_ROOT || path.join(os.homedir(), '.claude-canon', 'wt');
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    const detail = (e.stderr ?? '').toString().trim() || e.message;
    throw new WorktreeError(`git ${args.join(' ')} が失敗した: ${detail}`);
  }
}

function gitOk(cwd, args) {
  try {
    execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** 対象を git のリポジトリのルートに解決する。git でない・コミットが無いときは例外。 */
function repoTop(target) {
  if (!existsSync(target)) throw new WorktreeError(`対象が存在しない: ${target}`);
  let top;
  try {
    top = execFileSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new WorktreeError(`対象が git で管理されていない: ${target}`);
  }
  if (!gitOk(top, ['rev-parse', '--verify', '-q', 'HEAD'])) throw new WorktreeError(`対象にコミットが1つも無い: ${top}`);
  return top;
}

/** worktree を作り、`{ worktree, branch, base, target }` を返す。 */
export function createWorktree({ target, ts }) {
  if (!/^\d{8}_\d{6}$/.test(ts ?? '')) throw new WorktreeError(`<ts> は YYYYMMDD_hhmmss の形で渡す: ${ts}`);
  const top = repoTop(path.resolve(target));
  const branch = `${BRANCH_PREFIX}${ts}`;
  if (gitOk(top, ['show-ref', '--verify', '-q', `refs/heads/${branch}`])) throw new WorktreeError(`ブランチが既にある: ${branch}`);
  const name = `${path.basename(top).replace(/[^\w.-]/g, '_')}-${ts}`;
  const worktree = path.join(wtRoot(), name);
  if (existsSync(worktree)) throw new WorktreeError(`worktree の置き場所が既にある: ${worktree}`);
  const base = git(top, ['rev-parse', 'HEAD']);
  git(top, ['worktree', 'add', '-q', '-b', branch, worktree, base]);
  return { worktree, branch, base, target: top };
}

/** worktree が canon の作ったもの（`canon/` のブランチ）であることを確かめ、ブランチ名と元のリポジトリを返す。 */
function inspectWorktree(worktree) {
  if (!existsSync(worktree)) throw new WorktreeError(`worktree が存在しない: ${worktree}`);
  const branch = git(worktree, ['branch', '--show-current']);
  if (!branch.startsWith(BRANCH_PREFIX)) {
    throw new WorktreeError(`ブランチが ${BRANCH_PREFIX} で始まらない（canon の worktree ではない）: ${branch || '(detached)'}`);
  }
  const common = path.resolve(worktree, git(worktree, ['rev-parse', '--git-common-dir']));
  return { branch, mainRepo: path.dirname(common) };
}

/**
 * 追跡中のファイルを worktree から `git rm` する（change-plan の `op: delete`。ワーカーはシェルを持たないのでメインが実行する）。
 * パスは worktree 内の相対パスだけを受け付け、1つでも追跡されていない・worktree の外を指すなら何も消さずに例外にする。
 */
export function removeFromWorktree({ worktree, paths }) {
  inspectWorktree(worktree);
  if (!paths || paths.length === 0) throw new WorktreeError('消すファイルが指定されていない');
  const rels = paths.map((p) => {
    const abs = path.resolve(worktree, p);
    const rel = path.relative(worktree, abs);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new WorktreeError(`worktree の外か、worktree 自身を指している: ${p}`);
    return rel.split(path.sep).join('/');
  });
  for (const rel of rels) {
    if (!gitOk(worktree, ['ls-files', '--error-unmatch', '--', rel])) throw new WorktreeError(`追跡されていないファイルは消さない: ${rel}`);
  }
  git(worktree, ['rm', '-q', '--', ...rels]);
  return rels;
}

/** 変更をすべてコミットし、sha を返す。変更が無ければ例外（空の結果を合格にしない）。 */
export function commitWorktree({ worktree, message }) {
  inspectWorktree(worktree);
  git(worktree, ['add', '-A']);
  if (gitOk(worktree, ['diff', '--cached', '--quiet'])) throw new WorktreeError('コミットする変更が無い');
  git(worktree, ['commit', '-q', '-m', message]);
  return git(worktree, ['rev-parse', 'HEAD']);
}

/**
 * worktree を外す。ブランチは `deleteBranch` のときだけ、マージ済みなら消す。
 * `discard` は未コミットの変更とブランチを、マージの有無によらず捨てる。
 * 元のリポジトリを変える前に、拒否する条件をすべて確かめる。
 */
export function cleanupWorktree({ worktree, deleteBranch = false, discard = false }) {
  const { branch, mainRepo } = inspectWorktree(worktree);
  if (!discard && git(worktree, ['status', '--porcelain'])) {
    throw new WorktreeError(`未コミットの変更がある: ${worktree}（コミットするか、捨てるなら --discard）`);
  }
  if (deleteBranch && !discard && !gitOk(mainRepo, ['merge-base', '--is-ancestor', branch, 'HEAD'])) {
    throw new WorktreeError(`ブランチ ${branch} は ${mainRepo} の HEAD にマージされていない。何も変えていない（捨てるなら --discard）`);
  }
  git(mainRepo, ['worktree', 'remove', ...(discard ? ['--force'] : []), worktree]);
  const removed = [worktree];
  if (deleteBranch || discard) {
    git(mainRepo, ['branch', discard ? '-D' : '-d', branch]);
  }
  // 空になった置き場所だけを消す（再帰はしない）。他の run の worktree が残っていれば消えない。
  const root = path.dirname(worktree);
  for (const dir of [root, path.basename(path.dirname(root)) === '.claude-canon' ? path.dirname(root) : null]) {
    if (!dir) continue;
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmdirSync(dir);
      removed.push(dir);
    }
  }
  return { branch, mainRepo, removed, branchDeleted: deleteBranch || discard };
}
