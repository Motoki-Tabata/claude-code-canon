#!/usr/bin/env node
/**
 * tools/new-ts.js（npm run ts）。
 *
 * <ts> を新規採番し、output/<ts>/・work/<ts>/ の骨格（.gate/{markers,approvals,blocks}・
 * .requests/）を作り、work/.session-ts を更新する。
 *
 * 実行主体はオーケストレータ（/canon・Bash を持つ Skill）。詳細設計書 §11.5 の
 * 「順序の制約」により、<ts> 採番の直後・工程1の直前にカナリアを撃つ運びになる。
 *
 * 使い方:
 *   node tools/new-ts.js            # 現在時刻から採番
 *   node tools/new-ts.js <ts>       # 明示指定（テスト用・YYYYMMDD_hhmmss）
 *
 * 標準出力に採番した <ts> のみを1行で出す（呼び出し元がそのまま変数へ取り込める）。
 */

import {
  mintTs,
  isValidTs,
  writeSessionTs,
  readSessionTs,
  hasTerminalMarker,
  outputDir,
  workDir,
  markersDir,
  approvalsDir,
  blocksDir,
  requestsDir,
  ensureDir,
} from '../gates/lib/run.js';
import { readSelfOptim } from '../gates/lib/self-optim.js';

function main() {
  // 相互排他: 自己最適化 run が in-flight なら /canon run を開始させない（§13.2.1・3方向相互排他）。
  const activeSelfOptim = readSelfOptim();
  if (activeSelfOptim) {
    process.stderr.write(
      `[new-ts] 中断: 自己最適化 run（label=${activeSelfOptim.label}・ts=${activeSelfOptim.ts}）が in-flight。` +
        `/canon run とは相互排他のため、先に npm run selfopt:end で終了させること（§13.2.1）。\n`
    );
    process.exit(1);
  }

  const argTs = process.argv[2];
  const ts = argTs ? argTs : mintTs();
  if (!isValidTs(ts)) {
    process.stderr.write(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）\n`);
    process.exit(1);
  }

  const prevTs = readSessionTs();
  if (prevTs && prevTs !== ts && !hasTerminalMarker(prevTs)) {
    process.stderr.write(
      `[new-ts] 警告: 前回の run（${prevTs}）が終端マーカー未鋳造のまま新規 <ts> へ切替える。` +
        `並行実行の排他は設けない仕様（§15.2）だが、前回 run の再開が必要な場合は ` +
        `work/.session-ts を手動で戻すこと。\n`
    );
  }

  ensureDir(outputDir(ts));
  ensureDir(workDir(ts));
  ensureDir(markersDir(ts));
  ensureDir(approvalsDir(ts));
  ensureDir(blocksDir(ts));
  ensureDir(requestsDir(ts));
  writeSessionTs(ts);

  process.stdout.write(ts + '\n');
}

main();
