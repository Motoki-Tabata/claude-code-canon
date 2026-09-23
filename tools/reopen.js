#!/usr/bin/env node
/**
 * tools/reopen.js（npm run reopen -- <ts> <stage> [--reason=<text>]）。
 *
 * 権威マーカーの取消の唯一の経路（基本設計書 §4.5 巻き戻し・詳細設計書 §11.3 巻き戻し時の再武装）。
 *
 * eval（工程9）の指摘や P5 差し戻しで生成物・design-map を書き直すとき、対応するマーカー
 * （`generation.done`／`design.done` 等）が残っていると §4.5 ①の冪等スキップにより
 * 再検査（G1・G7〜G12 等）が走らず、`generation.done` はガードの有効条件そのもの
 * （`currentRunTs()`）でもあるため write-scope-guard／advance-guard も
 * 素通りしたままになる。本 CLI がマーカーを削除すると、次の SubagentStop で:
 *   - `currentRunTs()` が再び非 null を返し、ガードが再武装される
 *   - `hasMarker` の冪等スキップが外れ、G1・G7〜G12 等が実際に再実行される
 * の両方が同時に成立する（マーカーがガードの有効条件と冪等キーを兼ねているため）。
 *
 * `.gate/**` はエージェント書込 deny-all のため、Write/Edit では取消できない
 * （§4.4）。実行主体もオーケストレータの Bash 経由に限る
 * （ワーカーは G13 のシェル剥奪で不可）。write-scope-guard に本 CLI へのコマンド deny は
 * 追加しない——マーカー削除は再検査とガード再武装しか起こさず、権限を与える操作では
 * ないため。
 *
 * 前提検査:
 *   1. <stage> が REOPENABLE_MARKER_KEYS に無ければ拒否（eval はマーカーを持たない・§16.7）。
 *   2. <ts> が現在の .session-ts と一致しなければ拒否（別 run のマーカーを消してもガード
 *      状態は何も変わらず、権威記録だけを失う片手落ちになるため）。
 *   3. <stage> 以降（MARKER_ORDER）のマーカーが1件も無ければ no-op（processed.log には書かない＝
 *      起きていない取消を監査に残さない）。
 *
 * 【連鎖削除】<stage> 以降の工程マーカーを**すべて**取り消す（reopen design なら design.done と
 * generation.done、reopen spec なら spec・design・generation）。上流を巻き戻したのに下流の
 * マーカーが残ると、下流は書き換え前の成果物に対して「ゲート通過済み」のままになり、冪等スキップで
 * 再検査が走らない。人間の承認は対話で取りチャットで確認する（承認サイドカーは持たない）ので、
 * 承認の取消手順は無い——巻き戻したら、対応する人間ゲートで再度対話承認を取ること。
 *
 * `blocks/<stage>.blocked` が残っていても解除しない（reopen は unblock ではない。
 * 一方向ラチェットの解除経路を増やさない・§11.3）。
 *
 * 使い方:
 *   npm run reopen -- 20260716_090000 generation
 *   npm run reopen -- 20260716_090000 generation --reason="eval C2 指摘の再生成"
 */

import os from 'node:os';
import {
  isValidTs,
  outputDir,
  readSessionTs,
  hasMarker,
  revokeMarker,
  hasBlockLatch,
  appendProcessedLog,
  REOPENABLE_MARKER_KEYS,
  markerKeysFrom,
} from '../gates/lib/run.js';
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
  const [ts, stage] = positional;

  if (!ts || !stage) {
    process.stderr.write('使い方: npm run reopen -- <ts> <stage> [--reason=<text>]\n');
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

  if (!REOPENABLE_MARKER_KEYS.includes(stage)) {
    if (stage === 'eval') {
      process.stderr.write(
        `[reopen] 中断: 'eval' はマーカーを持たない（工程9 は G バッチを再発火させない設計・§16.7）。` +
          `eval をやり直すには npm run eval:bundle 以降を再実行すること。\n`
      );
    } else {
      process.stderr.write(
        `[reopen] 不正な <stage>: ${JSON.stringify(stage)}（有効な値: ${REOPENABLE_MARKER_KEYS.join(', ')}）\n`
      );
    }
    process.exit(1);
  }

  const currentTs = readSessionTs();
  if (currentTs !== ts) {
    process.stderr.write(
      `[reopen] 中断: 指定された <ts>（${ts}）が現在の run（work/.session-ts=${currentTs ?? '(無し)'}）と一致しない。` +
        `別 run のマーカーを取り消してもガード判定は current run にしか作用しないため、権威記録だけを失う片手落ちになる。\n`
    );
    process.exit(1);
  }

  // <stage> 以降の工程マーカーを連鎖で取り消す（下流だけが「通過済み」で残る不整合を作らない）。
  const targets = markerKeysFrom(stage).filter((key) => hasMarker(ts, key));
  if (targets.length === 0) {
    process.stdout.write(`no-op: ${stage} 以降の工程は元々マーカー無し（output/${ts}/.gate/markers/）\n`);
    return;
  }

  const reason = typeof flags.reason === 'string' ? flags.reason : undefined;
  const reopenedBy = os.userInfo().username;
  for (const key of targets) {
    revokeMarker(ts, key);
    appendProcessedLog(ts, {
      stage: key,
      action: 'reopen',
      ok: true,
      reopened_by: reopenedBy,
      ...(key !== stage ? { cascade_from: stage } : {}),
      ...(reason ? { reason } : {}),
    });
  }

  process.stdout.write(
    `巻き戻し: ${targets.map((k) => `${k}.done`).join('・')} を削除した（output/${ts}/.gate/markers/・reopened_by=${reopenedBy}）。` +
      (targets.includes('generation')
        ? `generation.done はガードの有効条件そのものなので、write-scope-guard／advance-guard が再武装された。`
        : `generation.done は元々無く、ガードは run 中のまま（再武装の対象ではない）。`) +
      `\n`
  );
  if (hasBlockLatch(ts, stage)) {
    process.stdout.write(
      `警告: output/${ts}/.gate/blocks/${stage}.blocked が残っている（reopen は解除しない。npm run unblock -- ${ts} ${stage} は別途判断すること）。\n`
    );
  }
  process.stdout.write(
    `次の一手: 成果物を書き直し、完了リクエストを再度書かせてから停止させること。` +
      `gen-guard／stage-guard が G1・G7〜G12 等を再実行する。通過後、対応する人間ゲートで対話承認を取り直し、` +
      `work/${ts}/state.md に記録すること。\n`
  );
  process.stdout.write(
    `オーケストレータ自身が成果物を直した場合（ワーカーを再開させない場合）は、SubagentStop の` +
      `発火を待たずに npm run recheck -- ${ts} ${stage} でゲートを明示的に再起動すること` +
      `（hook 経路と同じ形で起動し、マーカー鋳造・ブロックラッチまで本番と同じ副作用が起きる）。\n`
  );
  process.stdout.write(
    `注意（run 中か否かの区別）: 終端マーカー generation.done が無いあいだは run 中で、docs/・gates/・.claude/・design/ 等の` +
      `保守編集は deny される。generation.done が鋳造された後（run の外）なら書ける。巻き戻した直後は run 中に戻っている。\n`
  );
  process.stdout.write(
    `注意: この <ts> で作業を再開しないまま放置すると work/.session-ts の残置と同じ事故になる` +
      `（保守編集が sanctioned ツリー外で deny される）。作業を打ち切るなら run を完走させるか、` +
      `.session-ts の扱いを明示的に決めること。\n`
  );
}

main();
