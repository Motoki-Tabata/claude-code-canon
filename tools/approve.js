#!/usr/bin/env node
/**
 * tools/approve.js（npm run approve -- <ts> <kind> [--revoke] [--approved-by=<name>]）。
 *
 * 承認の唯一の鋳造経路（基本設計書 §4.4・承認鋳造経路の一本化）。
 * `.gate/**` はエージェント書込 deny-all のため、Write/Edit では承認できない。
 * このスクリプトは Claude Code のツール呼び出しパイプラインの外（人間の端末、または
 * オーケストレータの Bash 経由）で動く CLI であり、PreToolUse の監視対象にならない。
 *
 * 使い方:
 *   npm run approve -- 20260716_090000 spec
 *   npm run approve -- 20260716_090000 spec --approved-by=eito
 *   npm run approve -- 20260716_090000 spec --revoke
 *
 * G1 は承認サイドカーの存在＋approved_by を検査する（§11.2）ので、approved_by を
 * 必ず書き込む（既定は OS ユーザー名）。
 */

import os from 'node:os';
import { isValidTs, hasApproval, mintApproval, revokeApproval, outputDir } from '../gates/lib/run.js';
import { existsSync } from 'node:fs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      flags[key] = value === undefined ? true : value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [ts, kind] = positional;

  if (!ts || !kind) {
    process.stderr.write('使い方: npm run approve -- <ts> <kind> [--revoke] [--approved-by=<name>]\n');
    process.exit(1);
  }
  if (!isValidTs(ts)) {
    process.stderr.write(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）\n`);
    process.exit(1);
  }
  if (!existsSync(outputDir(ts))) {
    process.stderr.write(`output/${ts}/ が存在しない。<ts> を確認すること。\n`);
    process.exit(1);
  }

  if (flags.revoke) {
    const removed = revokeApproval(ts, kind);
    if (removed) {
      process.stdout.write(`取消: output/${ts}/.gate/approvals/${kind}.approved を削除した\n`);
    } else {
      process.stdout.write(`no-op: ${kind} は元々未承認だった（output/${ts}/）\n`);
    }
    return;
  }

  if (hasApproval(ts, kind)) {
    process.stdout.write(`no-op: ${kind} は既に承認済み（output/${ts}/.gate/approvals/${kind}.approved）\n`);
    return;
  }

  const approvedBy = typeof flags['approved-by'] === 'string' ? flags['approved-by'] : os.userInfo().username;
  mintApproval(ts, kind, { approved_by: approvedBy });
  process.stdout.write(`承認: output/${ts}/.gate/approvals/${kind}.approved を鋳造した（approved_by=${approvedBy}）\n`);
}

main();
