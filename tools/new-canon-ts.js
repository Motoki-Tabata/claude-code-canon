#!/usr/bin/env node
/**
 * tools/new-canon-ts.js（npm run canon:ts）。
 *
 * 機能X（正典更新）run 専用の <ts> を新規採番する。詳細設計書 §13.1。
 * tools/new-ts.js（/canon 用）と同型だが、書く先は `work/.canon-update-ts`
 * （`work/.session-ts` とは別名前空間）。
 *
 * **相互排他**（§13.1・§11.3「ガードの2系統」）: `/canon` の run が in-flight
 * （`work/.session-ts` が終端マーカー未鋳造の <ts> を指す）なら異常終了する。
 * 機能X の run 中に `/canon` の判定基準（docs/）が動く事故を構造的に防ぐ。
 *
 * 使い方:
 *   node tools/new-canon-ts.js            # 現在時刻から採番
 *   node tools/new-canon-ts.js <ts>       # 明示指定（テスト用・YYYYMMDD_hhmmss）
 *
 * 標準出力に採番した <ts> のみを1行で出す（呼び出し元がそのまま変数へ取り込める）。
 */

import {
  mintTs,
  isValidTs,
  currentRunTs,
  outputDir,
  workDir,
  markersDir,
  approvalsDir,
  blocksDir,
  requestsDir,
  ensureDir,
} from '../gates/lib/run.js';
import {
  readCanonUpdateTs,
  writeCanonUpdateTs,
  hasCanonUpdateTerminalMarker,
} from '../gates/lib/canon-run.js';
import { readSelfOptim } from '../gates/lib/self-optim.js';

function main() {
  // 相互排他: /canon の run が in-flight なら機能X run を開始させない（§13.1）。
  const activeCanonRunTs = currentRunTs();
  if (activeCanonRunTs) {
    process.stderr.write(
      `[new-canon-ts] 中断: /canon の run（${activeCanonRunTs}）が in-flight（終端マーカー未鋳造）。` +
        `機能X run と /canon run は相互排他のため、先に /canon run を完了させること。\n`
    );
    process.exit(1);
  }
  // 相互排他: 自己最適化 run が in-flight なら機能X run を開始させない（§13.2.1・3方向相互排他）。
  const activeSelfOptim = readSelfOptim();
  if (activeSelfOptim) {
    process.stderr.write(
      `[new-canon-ts] 中断: 自己最適化 run（label=${activeSelfOptim.label}・ts=${activeSelfOptim.ts}）が in-flight。` +
        `機能X run とは相互排他のため、先に npm run selfopt:end で終了させること（§13.2.1）。\n`
    );
    process.exit(1);
  }

  const argTs = process.argv[2];
  const ts = argTs ? argTs : mintTs();
  if (!isValidTs(ts)) {
    process.stderr.write(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）\n`);
    process.exit(1);
  }

  const prevTs = readCanonUpdateTs();
  if (prevTs && prevTs !== ts && !hasCanonUpdateTerminalMarker(prevTs)) {
    process.stderr.write(
      `[new-canon-ts] 警告: 前回の機能X run（${prevTs}）が終端マーカー未鋳造のまま新規 <ts> へ切替える。` +
        `前回 run の再開が必要な場合は work/.canon-update-ts を手動で戻すこと。\n`
    );
  }

  ensureDir(outputDir(ts));
  ensureDir(workDir(ts));
  ensureDir(markersDir(ts));
  ensureDir(approvalsDir(ts));
  ensureDir(blocksDir(ts));
  ensureDir(requestsDir(ts));
  writeCanonUpdateTs(ts);

  process.stdout.write(ts + '\n');
}

main();
