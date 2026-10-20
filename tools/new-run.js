#!/usr/bin/env node
/**
 * new-run.js（npm run new-run -- <target> [<ts>]）— run を始める（design/architecture.md §3・§5）。
 *
 *   1. <ts> を採番する（YYYYMMDD_hhmmss。第2引数で明示もできる）。
 *   2. 対象の worktree（ブランチ canon/<ts>）を作る（`worktree create`。対象が git でなければここで止まる）。
 *   3. canon のルートに work/<ts>/ と handoff.md の雛形を作る（gitignore）。frontmatter に worktree・branch・base・
 *      canon_commit（canon の HEAD。各段は開始時に `preflight` でこれと現在の HEAD を比べる）を記録する。route は空で、
 *      /canon-plan が要件を固めたあとに `npm run handoff -- <ts> set route=<small|large>` で決める。
 *
 * stdout は ts・handoff・worktree・branch・base・target・canon_commit を1行ずつ `key: value` で出す。
 * 対象に未コミットの変更があるときは stderr に警告する（worktree は HEAD から作るので、その変更は入らない）。
 * exit 0 成功／exit 1 事前検査の失敗（対象が無い・git でない・同じ ts の run が既にある）／exit 2 引数不正。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import { HANDOFF_FILE, renderHandoff } from '../lib/handoff.js';
import { isMainModule, isValidTs, mintTs } from '../lib/run.js';
import { createWorktree, WorktreeError } from '../lib/worktree.js';

export class RunError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunError';
  }
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * run を作る。
 * @param {{canonRoot?: string, target: string, ts?: string}} opts
 * @returns {{ts: string, handoff: string, worktree: string, branch: string, base: string, target: string, canonCommit: string, dirty: boolean}}
 */
export function createRun({ canonRoot = CANON_ROOT, target, ts = mintTs() }) {
  if (!isValidTs(ts)) throw new RunError(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
  const targetAbs = path.resolve(target);
  if (!existsSync(targetAbs) || !statSync(targetAbs).isDirectory()) {
    throw new RunError(`対象プロジェクトのディレクトリが無い: ${targetAbs}`);
  }
  const work = path.join(canonRoot, 'work', ts);
  if (existsSync(work)) throw new RunError(`同じ ts の run が既にある: ${work}`);
  let canonCommit;
  try {
    canonCommit = git(canonRoot, ['log', '-1', '--format=%H']).trim();
  } catch (e) {
    throw new RunError(`canon の HEAD を取れない: ${(e.stderr ?? e.message).toString().trim()}`);
  }

  let wt;
  try {
    wt = createWorktree({ target: targetAbs, ts });
  } catch (e) {
    if (e instanceof WorktreeError) throw new RunError(e.message);
    throw e;
  }
  const dirty = git(wt.target, ['status', '--porcelain']).trim() !== '';

  mkdirSync(work, { recursive: true });
  const handoff = path.join(work, HANDOFF_FILE);
  writeFileSync(
    handoff,
    renderHandoff({ ts, target: wt.target.split(path.sep).join('/'), worktree: wt.worktree, branch: wt.branch, base: wt.base, canonCommit })
  );
  return { ts, handoff, worktree: wt.worktree, branch: wt.branch, base: wt.base, target: wt.target, canonCommit, dirty };
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
      [`ts: ${r.ts}`, `handoff: ${r.handoff}`, `worktree: ${r.worktree}`, `branch: ${r.branch}`, `base: ${r.base}`, `target: ${r.target}`, `canon_commit: ${r.canonCommit}`].join('\n') + '\n'
    );
    if (r.dirty) process.stderr.write(`[new-run] 警告: 対象に未コミットの変更がある。worktree は HEAD（${r.base.slice(0, 12)}）から作るので、その変更は入らない\n`);
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    process.stderr.write(`[new-run] ${e.message}\n`);
    process.exit(1);
  }
}
