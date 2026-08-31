#!/usr/bin/env node
/**
 * tools/unblock.js（npm run unblock -- <ts> [stage]）。
 *
 * ブロックラッチ（output/<ts>/.gate/blocks/<stage>.blocked）の解除。詳細設計書 §11.3。
 * ラッチはゲート再通過でも自動解除されない一方向ラチェットであり、解除は人間 CLI のみ。
 *
 * 使い方:
 *   npm run unblock -- 20260716_090000          # 全ラッチを解除
 *   npm run unblock -- 20260716_090000 gen       # gen.blocked のみ解除
 */

import { existsSync, readdirSync } from 'node:fs';
import { isValidTs, outputDir, blocksDir, unblock } from '../gates/lib/run.js';

function main() {
  const [ts, stage] = process.argv.slice(2);

  if (!ts) {
    process.stderr.write('使い方: npm run unblock -- <ts> [stage]\n');
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

  if (stage) {
    const removed = unblock(ts, stage);
    process.stdout.write(
      removed
        ? `解除: output/${ts}/.gate/blocks/${stage}.blocked を削除した\n`
        : `no-op: ${stage} は元々ブロックされていなかった\n`
    );
    return;
  }

  const dir = blocksDir(ts);
  if (!existsSync(dir)) {
    process.stdout.write(`no-op: ブロックラッチは無い（output/${ts}/）\n`);
    return;
  }
  const latches = readdirSync(dir).filter((f) => f.endsWith('.blocked'));
  if (latches.length === 0) {
    process.stdout.write(`no-op: ブロックラッチは無い（output/${ts}/）\n`);
    return;
  }
  for (const f of latches) {
    const s = f.replace(/\.blocked$/, '');
    unblock(ts, s);
    process.stdout.write(`解除: output/${ts}/.gate/blocks/${f} を削除した\n`);
  }
}

main();
