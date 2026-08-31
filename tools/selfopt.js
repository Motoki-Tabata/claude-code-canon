#!/usr/bin/env node
/**
 * tools/selfopt.js — 機能Y 自己再生成の run 開始/終了。詳細設計書 §13.2.1。
 *
 * `npm run selfopt:begin -- <label>`:
 *   1. 相互排他確認（`/canon` run・機能X run・別の自己最適化 run のいずれも in-flight でないこと）
 *   2. `<ts>` を採番し、`work/.session-ts`（工程1〜9 は `/canon` と同一のパイプラインを使うため）
 *      と `work/.self-optim`（label+ts・self-optimize-scope-guard の判定材料）を**同時に**書く。
 *      `tools/new-ts.js` を経由しないのは、new-ts.js が `.self-optim` 在中の新規採番を拒否する
 *      ようにするため——自分の起動が自分自身の sentinel に拒否される chicken-egg を避ける。
 *   3. `<ts>` を標準出力（`tools/new-ts.js` と同じ契約・呼び出し元がそのまま変数へ取り込める）
 *
 * `npm run selfopt:end`: `.self-optim` を削除する（sentinel クリア）。`.session-ts` はそのまま
 *   ＝以降は通常どおり終端マーカーの有無で `currentRunTs()` が判定する。
 *
 * `npm run selfopt:status`: 現在の in-flight 状態を表示する（run 終了忘れの確認用）。
 */

import {
  mintTs,
  isValidTs,
  writeSessionTs,
  outputDir,
  workDir,
  markersDir,
  approvalsDir,
  blocksDir,
  requestsDir,
  ensureDir,
  currentRunTs,
  isMainModule,
} from '../gates/lib/run.js';
import { currentCanonUpdateRunTs } from '../gates/lib/canon-run.js';
import { readSelfOptim, writeSelfOptim, clearSelfOptim, isValidSelfOptimLabel } from '../gates/lib/self-optim.js';

function begin(label) {
  if (!isValidSelfOptimLabel(label)) {
    process.stderr.write(`[selfopt] 不正な label: ${JSON.stringify(label)}（英数字と - _ のみ）\n`);
    process.exit(1);
  }

  const activeCanonRunTs = currentRunTs();
  if (activeCanonRunTs) {
    process.stderr.write(
      `[selfopt] 中断: /canon の run（${activeCanonRunTs}）が in-flight（終端マーカー未鋳造）。` +
        `自己最適化 run とは相互排他のため、先に完了させること。\n`
    );
    process.exit(1);
  }
  const canonUpdateTs = currentCanonUpdateRunTs();
  if (canonUpdateTs) {
    process.stderr.write(
      `[selfopt] 中断: 機能X run（${canonUpdateTs}）が in-flight。自己最適化 run とは相互排他のため、` +
        `先に完了させること。\n`
    );
    process.exit(1);
  }
  const existing = readSelfOptim();
  if (existing) {
    process.stderr.write(
      `[selfopt] 中断: 既存の自己最適化 run（label=${existing.label}・ts=${existing.ts}）が in-flight。` +
        `先に npm run selfopt:end で終了させること。\n`
    );
    process.exit(1);
  }

  const ts = mintTs();
  if (!isValidTs(ts)) {
    process.stderr.write(`[selfopt] 採番失敗: 不正な <ts> 形式: ${ts}\n`);
    process.exit(1);
  }

  ensureDir(outputDir(ts));
  ensureDir(workDir(ts));
  ensureDir(markersDir(ts));
  ensureDir(approvalsDir(ts));
  ensureDir(blocksDir(ts));
  ensureDir(requestsDir(ts));
  writeSessionTs(ts);
  writeSelfOptim(label, ts);

  process.stdout.write(ts + '\n');
}

function end() {
  const existing = readSelfOptim();
  if (!existing) {
    process.stderr.write('[selfopt] 自己最適化 run は in-flight ではない（.self-optim 不在）。\n');
    return;
  }
  clearSelfOptim();
  process.stdout.write(`[selfopt] 終了（label=${existing.label}・ts=${existing.ts}）。work/.self-optim を削除した。\n`);
}

function status() {
  const existing = readSelfOptim();
  if (!existing) {
    process.stdout.write('[selfopt] in-flight な自己最適化 run は無い。\n');
  } else {
    process.stdout.write(`[selfopt] in-flight（label=${existing.label}・ts=${existing.ts}）。\n`);
  }
}

function main() {
  const cmd = process.argv[2];
  if (cmd === 'begin') {
    begin(process.argv[3]);
  } else if (cmd === 'end') {
    end();
  } else if (cmd === 'status') {
    status();
  } else {
    process.stderr.write('usage: node tools/selfopt.js <begin <label>|end|status>\n');
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) main();
