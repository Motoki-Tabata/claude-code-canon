#!/usr/bin/env node
/**
 * new-run.js（npm run new-run -- <target> [<ts>]）— run を始める（architecture.md §6・§7）。
 *
 *   1. <ts> を採番する（YYYYMMDD_hhmmss。第2引数で明示もできる）。
 *   2. canon のルートで `git worktree add ../canon-runs/<ts> -b run/<ts>` を実行し、run 専用の worktree を作る。
 *      以降の Phase はその worktree でセッションを起動する（run の間は canon の版が固定される）。
 *   3. worktree の中に work/<ts>・output/<ts> の骨格と `work/<ts>/handoff.md` の雛形を作る。
 *      handoff の `mode` は、対象の管理パス集合に既存のファイルがあれば refactor、無ければ new を初期値にする
 *      （ヒアリングで確かめて直す）。
 *
 * stdout には ts・worktree・branch・mode・handoff を1行ずつ `key: value` で出す。
 * exit 0 成功／exit 1 事前検査の失敗（対象が無い・worktree やブランチが既にある・git の失敗）／exit 2 引数不正。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../../../../lib/canon.js';
import { HANDOFF_FILE, renderHandoff } from '../../../../lib/handoff.js';
import { walkManaged } from '../../../../lib/managed-paths.js';
import { isMainModule, isValidTs, mintTs } from '../../../../lib/run.js';

export class RunError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunError';
  }
}

/** run の骨格（worktree からの相対パス）。artifacts.md §1 のフォルダ構成。 */
export function skeletonDirs(ts) {
  return [
    `work/${ts}/investigation`,
    `work/${ts}/slices`,
    `work/${ts}/review-bundle`,
    `output/${ts}/review`,
    `output/${ts}/deploy`,
  ];
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function branchExists(canonRoot, branch) {
  try {
    git(canonRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * run を作る。
 * @param {{canonRoot?: string, target: string, ts?: string}} opts
 * @returns {{ts: string, worktree: string, branch: string, mode: 'new'|'refactor', handoff: string}}
 */
export function createRun({ canonRoot = CANON_ROOT, target, ts = mintTs() }) {
  if (!isValidTs(ts)) throw new RunError(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
  const targetAbs = path.resolve(target);
  if (!existsSync(targetAbs) || !statSync(targetAbs).isDirectory()) {
    throw new RunError(`対象プロジェクトのディレクトリが無い: ${targetAbs}`);
  }
  const worktree = path.resolve(canonRoot, '..', 'canon-runs', ts);
  const branch = `run/${ts}`;
  if (existsSync(worktree)) throw new RunError(`worktree の置き場所が既にある: ${worktree}`);
  if (branchExists(canonRoot, branch)) throw new RunError(`ブランチ ${branch} が既にある。`);

  try {
    git(canonRoot, ['worktree', 'add', worktree, '-b', branch]);
  } catch (e) {
    throw new RunError(`git worktree add に失敗した: ${(e.stderr ?? e.message).toString().trim()}`);
  }

  for (const d of skeletonDirs(ts)) mkdirSync(path.join(worktree, d), { recursive: true });
  const mode = walkManaged(targetAbs).length > 0 ? 'refactor' : 'new';
  const handoff = path.join(worktree, 'work', ts, HANDOFF_FILE);
  writeFileSync(handoff, renderHandoff({ ts, target: targetAbs.split(path.sep).join('/'), mode }));
  return { ts, worktree, branch, mode, handoff };
}

if (isMainModule(import.meta.url)) {
  const [target, ts] = process.argv.slice(2);
  if (!target || (ts !== undefined && !isValidTs(ts))) {
    process.stderr.write('使い方: npm run new-run -- <target> [<ts>]（<ts> は YYYYMMDD_hhmmss）\n');
    process.exit(2);
  }
  try {
    const r = createRun({ target, ts: ts ?? mintTs() });
    process.stdout.write(
      [`ts: ${r.ts}`, `worktree: ${r.worktree}`, `branch: ${r.branch}`, `mode: ${r.mode}`, `handoff: ${r.handoff}`].join('\n') + '\n'
    );
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    process.stderr.write(`[new-run] ${e.message}\n`);
    process.exit(1);
  }
}
