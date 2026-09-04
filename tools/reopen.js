#!/usr/bin/env node
/**
 * tools/reopen.js（npm run reopen -- <ts> <stage> [--reason=<text>]）。
 *
 * 権威マーカーの取消の唯一の経路（基本設計書 §4.5 巻き戻し・詳細設計書 §11.3 巻き戻し時の再武装）。
 *
 * eval（工程9）の指摘や P5 差し戻しで生成物・design-map を書き直すとき、対応するマーカー
 * （`generation.done`／`design.done` 等）が残っていると §4.5 ①の冪等スキップにより
 * 再検査（G1・G7〜G12 等）が走らず、`generation.done` はガードの有効条件そのもの
 * （`currentRunTs()`）でもあるため write-scope-guard／approval-guard／advance-guard も
 * 素通りしたままになる。本 CLI がマーカーを削除すると、次の SubagentStop で:
 *   - `currentRunTs()` が再び非 null を返し、3ガードが再武装される
 *   - `hasMarker` の冪等スキップが外れ、G1・G7〜G12 等が実際に再実行される
 * の両方が同時に成立する（マーカーがガードの有効条件と冪等キーを兼ねているため）。
 *
 * `.gate/**` はエージェント書込 deny-all のため、Write/Edit では取消できない
 * （tools/approve.js と同じ理由・§4.4）。実行主体もオーケストレータの Bash 経由に限る
 * （ワーカーは G13 のシェル剥奪で不可）。write-scope-guard に本 CLI へのコマンド deny は
 * 追加しない——マーカー削除は再検査とガード再武装しか起こさず、権限を与える操作では
 * ないため（`npm run approve` のコマンド検査免除と同じ扱い・§4.4）。
 *
 * 前提検査:
 *   1. <stage> が REOPENABLE_MARKER_KEYS に無ければ拒否（eval はマーカーを持たない・§16.7）。
 *   2. <ts> が現在の .session-ts と一致しなければ拒否（別 run のマーカーを消してもガード
 *      状態は何も変わらず、権威記録だけを失う片手落ちになるため）。
 *   3. マーカー不在なら no-op（processed.log には書かない＝起きていない取消を監査に残さない）。
 *   4. APPROVAL_ORDER で <stage> 以降の承認が1件でも残っていれば拒否する。マーカーは
 *      「ゲートが通った」、承認は「人間が受け入れた」の別の証明であり、前者だけ戻すと
 *      tools/stage-candidate.js が読む generation.approved 等が書き換え前の生成物のまま
 *      残り、P6 を取り直さずに工程10／世代取り込みへ到達しうる。
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
  hasApproval,
  hasBlockLatch,
  appendProcessedLog,
  REOPENABLE_MARKER_KEYS,
  APPROVAL_ORDER,
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
          `取消対象はステージのマーカーであり、eval 承認自体を戻すには npm run approve -- <ts> eval --revoke を使うこと。\n`
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

  if (!hasMarker(ts, stage)) {
    process.stdout.write(`no-op: ${stage} は元々マーカー無し（output/${ts}/.gate/markers/${stage}.done）\n`);
    return;
  }

  const startIdx = APPROVAL_ORDER.indexOf(stage);
  // investigation / investigation.focused は APPROVAL_ORDER に無い（indexOf → -1）。
  // -1 のときは全承認を「以降」とみなし、slice(0) で全件を要求する（先頭 phase の巻き戻しは
  // それ以降のすべての人間承認の前提を崩すため）。
  const downstreamKinds = APPROVAL_ORDER.slice(startIdx === -1 ? 0 : startIdx);
  const stillApproved = downstreamKinds.filter((kind) => hasApproval(ts, kind));
  if (stillApproved.length > 0) {
    const revokeCmds = stillApproved.map((kind) => `  npm run approve -- ${ts} ${kind} --revoke`).join('\n');
    process.stderr.write(
      `[reopen] 中断: ${stage} 以降の人間承認が残っている（${stillApproved.join(', ')}）。` +
        `先に取り消してから再実行すること:\n${revokeCmds}\n`
    );
    process.exit(1);
  }

  revokeMarker(ts, stage);

  const reason = typeof flags.reason === 'string' ? flags.reason : undefined;
  const reopenedBy = os.userInfo().username;
  appendProcessedLog(ts, { stage, action: 'reopen', ok: true, reopened_by: reopenedBy, ...(reason ? { reason } : {}) });

  process.stdout.write(
    `巻き戻し: output/${ts}/.gate/markers/${stage}.done を削除した（reopened_by=${reopenedBy}）。` +
      `run は再び in-flight として扱われ、write-scope-guard／approval-guard／advance-guard が再武装された。\n`
  );
  if (hasBlockLatch(ts, stage)) {
    process.stdout.write(
      `警告: output/${ts}/.gate/blocks/${stage}.blocked が残っている（reopen は解除しない。npm run unblock -- ${ts} ${stage} は別途判断すること）。\n`
    );
  }
  process.stdout.write(
    `次の一手: 成果物を書き直し、完了リクエストを再度書かせてから停止させること。` +
      `gen-guard／stage-guard が G1・G7〜G12 等を再実行する。通過後、対応する人間ゲートで再承認すること` +
      `（npm run approve -- ${ts} ${stage}）。\n`
  );
  process.stdout.write(
    `注意: この <ts> で作業を再開しないまま放置すると work/.session-ts の残置と同じ事故になる` +
      `（保守編集が sanctioned ツリー外で deny される）。作業を打ち切るなら run を完走させるか、` +
      `.session-ts の扱いを明示的に決めること。\n`
  );
}

main();
