#!/usr/bin/env node
/**
 * tools/new-ts.js（npm run ts）。
 *
 * <ts> を新規採番し、output/<ts>/・work/<ts>/ を作る。
 *
 * 使い方:
 *   node tools/new-ts.js            # 現在時刻から採番
 *   node tools/new-ts.js <ts>       # 明示指定（テスト用・YYYYMMDD_hhmmss）
 *
 * 標準出力に採番した <ts> のみを1行で出す（呼び出し元がそのまま変数へ取り込める）。
 */

import { mintTs, isValidTs, outputDir, workDir, ensureDir } from '../gates/lib/run.js';

function main() {
  const argTs = process.argv[2];
  const ts = argTs ? argTs : mintTs();
  if (!isValidTs(ts)) {
    process.stderr.write(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）\n`);
    process.exit(1);
  }

  ensureDir(outputDir(ts));
  ensureDir(workDir(ts));

  process.stdout.write(ts + '\n');
}

main();
