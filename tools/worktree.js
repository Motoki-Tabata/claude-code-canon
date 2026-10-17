#!/usr/bin/env node
/**
 * worktree.js — 対象リポジトリの作業用 worktree（ブランチ canon/<ts>）の作成・コミット・片付け。
 *
 *   npm run worktree -- create --target <対象> --ts <YYYYMMDD_hhmmss>
 *   npm run worktree -- commit --worktree <path> --message <文>
 *   npm run worktree -- cleanup --worktree <path> [--delete-branch] [--discard]
 *
 * 置き場所は ~/.claude-canon/wt/<対象名>-<ts>/（環境変数 CANON_WT_ROOT で根を上書き）。
 * 標準出力は `key: value` の行。create は worktree・branch・base、commit は sha を返す。
 * cleanup は worktree を外し、空になった置き場所を消す。ブランチは --delete-branch でマージ済みのときだけ、
 * --discard で未コミットの変更ごと（未マージでも）消す。
 *
 * exit 0 成功／exit 1 拒否・失敗（git でない・変更なし・未コミット・未マージ・canon の worktree でない）／exit 2 引数不正。
 */

import path from 'node:path';
import { parseArgs } from 'node:util';
import { cleanupWorktree, commitWorktree, createWorktree, WorktreeError } from '../lib/worktree.js';
import { isMainModule } from '../lib/run.js';

const USAGE = [
  '使い方:',
  '  npm run worktree -- create --target <対象> --ts <YYYYMMDD_hhmmss>',
  '  npm run worktree -- commit --worktree <path> --message <文>',
  '  npm run worktree -- cleanup --worktree <path> [--delete-branch] [--discard]',
].join('\n');

const OPTIONS = {
  target: { type: 'string' },
  ts: { type: 'string' },
  worktree: { type: 'string' },
  message: { type: 'string' },
  'delete-branch': { type: 'boolean' },
  discard: { type: 'boolean' },
};

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const [cmd, ...rest] = parsed.positionals;
  const v = parsed.values;
  const bad = () => {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  };
  if (rest.length > 0) return bad();
  try {
    if (cmd === 'create') {
      if (!v.target || !v.ts) return bad();
      const r = createWorktree({ target: v.target, ts: v.ts });
      process.stdout.write(`worktree: ${r.worktree}\nbranch: ${r.branch}\nbase: ${r.base}\ntarget: ${r.target}\n`);
    } else if (cmd === 'commit') {
      if (!v.worktree || !v.message) return bad();
      process.stdout.write(`sha: ${commitWorktree({ worktree: path.resolve(v.worktree), message: v.message })}\n`);
    } else if (cmd === 'cleanup') {
      if (!v.worktree) return bad();
      const r = cleanupWorktree({ worktree: path.resolve(v.worktree), deleteBranch: v['delete-branch'], discard: v.discard });
      process.stdout.write(`removed: ${r.removed.join(', ')}\nbranch: ${r.branch}（${r.branchDeleted ? '削除した' : '残した'}）\n`);
    } else {
      return bad();
    }
  } catch (e) {
    if (!(e instanceof WorktreeError)) throw e;
    process.stderr.write(`worktree: ${e.message}\n`);
    return 1;
  }
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
