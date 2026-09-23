#!/usr/bin/env node
/**
 * tools/recheck.js（npm run recheck -- <ts> <stage>）。
 *
 * ステージゲート（stage-guard / gen-guard）を **hook 経路と同じ形で**明示的に再起動する。
 *
 * 【なぜ要るか】ゲートは `SubagentStop`／`Stop` フックから起動され、`work/<ts>/.requests/<stage>`
 * を見て走る。ところがワーカーではなく**オーケストレータ自身が成果物を直した**場合
 * （`project-profiler` が Write を持たないため代筆した／生成物の逸脱を手で修正した等）、
 * 完了リクエストを書いても hook が期待どおり発火したかは外から確かめにくく、実測
 * （run `20260909_003820`）では `node gates/stage-guard.js` に SubagentStop 相当の JSON を
 * stdin で流して手動起動する必要があった。`npm run reopen` を使う巻き戻し運用では、この
 * 手動起動が常態化する。その裏技を正規の CLI として固定する。
 *
 * 【なぜ子プロセスで叩くか】検査関数を in-process で import して呼ぶと「ロジックが正しい」と
 * 「hook として発火する」の区別が消える（`.claude/rules/gates-and-tests.md`）。本 CLI は
 * 本番と同じ実行形（`node gates/<guard>.js` ＋ stdin に hook 入力）を使うので、マーカー鋳造・
 * ブロックラッチ・processed.log まで本番と同じ副作用が起きる。
 *
 * 【何をしないか】.gate/** へは自身では書かない（マーカー・ラッチの鋳造は本番と同じゲートが行う）。ブロックラッチも解除しない
 * （それは `npm run unblock` の役目・一方向ラチェットの解除経路を増やさない）。
 *
 * 前提検査:
 *   1. <ts> が現在の `work/.session-ts` と一致すること（ガードは argv でなく .session-ts を
 *      読むため、不一致のまま起動すると別 run を検査して誤ったマーカーを鋳造する）。
 *   2. <stage> が既知のステージであること。
 *   3. 完了リクエストが無ければ書く（消費済み・未作成のどちらでも再検査を成立させる）。
 *      リクエストはガードが鋳造→削除で消費する（§4.5）。
 *
 * 使い方:
 *   npm run recheck -- 20260909_003820 investigation
 *   npm run recheck -- 20260909_003820 generation
 */

import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CANON_ROOT, posix } from '../gates/lib/canon.js';
import { workDir, readSessionTs, isValidTs, investigationMarkerKey } from '../gates/lib/run.js';
import { checkStaleness } from '../gates/lib/run-status.js';

const STAGES = ['investigation', 'requirements', 'spec', 'design', 'generation'];

function fail(msg) {
  process.stderr.write(`[recheck] ${msg}\n`);
  process.exit(1);
}

const [ts, stage] = process.argv.slice(2);

if (!ts || !stage) {
  fail(`usage: npm run recheck -- <ts> <stage>\n  stage: ${STAGES.join(' | ')}`);
}
if (!isValidTs(ts)) fail(`<ts> の形式が不正: ${ts}（YYYYMMDD_hhmmss）`);
if (!STAGES.includes(stage)) fail(`未知のステージ: ${stage}（既知: ${STAGES.join(' | ')}）`);

const sessionTs = readSessionTs();
if (!sessionTs) {
  fail('work/.session-ts が無い。ガードは .session-ts を読んで対象 run を決めるため、再検査できない。');
}
if (sessionTs !== ts) {
  fail(
    `<ts>=${ts} が現在の .session-ts（${sessionTs}）と一致しない。` +
      'ガードは argv でなく .session-ts を読むため、このまま起動すると別 run を検査してしまう。'
  );
}
if (!existsSync(workDir(ts))) fail(`work/${ts}/ が無い。`);

// マーカーが既に存在するのに成果物が後から更新されているか（S2-2）。ここで検出しても
// recheck 自体は続行する（下の idempotent-cleanup 分岐が同じ状況を最終メッセージでも警告する）。
// investigation は2段（profile／focused）でマーカーキーが違う。要件確定後は focused 側で鮮度を見る（S3-1）。
const markerKey = investigationMarkerKey(ts, stage);
const staleness = checkStaleness(ts, markerKey);
if (staleness.stale) {
  process.stdout.write(
    `[recheck] 警告: ${markerKey}.done が既に存在するのに、成果物（${posix(path.relative(CANON_ROOT, staleness.artifact))}）が` +
      'マーカーより新しく更新されている。直したのに再検査していない状態の疑いがある。' +
      `npm run reopen -- ${ts} ${markerKey}（下流の工程マーカーも連鎖で消える）を先に実行してから再度 recheck すること。\n`
  );
}

// 完了リクエスト（ガードの検査対象の入口）。消費済みなら書き直す。
const requestsDir = path.join(workDir(ts), '.requests');
const requestPath = path.join(requestsDir, stage);
if (!existsSync(requestPath)) {
  mkdirSync(requestsDir, { recursive: true });
  writeFileSync(requestPath, `recheck: ${new Date().toISOString()}\n`, 'utf8');
  process.stdout.write(`[recheck] 完了リクエストを再作成した: work/${ts}/.requests/${stage}\n`);
}

// 本番の SubagentStop と同じ並び。どちらのガードも自分の担当外リクエストには何もしない
// （冪等演算なので両方叩いて無害）。canon-guard は機能X（正典更新・work/.canon-update-ts）
// 専用の別名前空間なので対象外。
const GUARDS = ['stage-guard.js', 'gen-guard.js'];
const hookInput = JSON.stringify({
  hook_event_name: 'SubagentStop',
  cwd: posix(CANON_ROOT),
  source: 'tools/recheck.js',
});

let blocked = false;
let combinedOut = '';
for (const guard of GUARDS) {
  const abs = path.join(CANON_ROOT, 'gates', guard);
  const r = spawnSync(process.execPath, [abs], { input: hookInput, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd();
  combinedOut += out + '\n';
  if (out) process.stdout.write(`--- ${guard} (exit ${r.status}) ---\n${out}\n`);
  else process.stdout.write(`--- ${guard} (exit ${r.status}) ---\n（出力なし）\n`);
  if (r.status === 2) blocked = true; // blockStop = ブロックラッチ鋳造（§4.5）
  if (r.status !== 0 && r.status !== 2) {
    process.stderr.write(`[recheck] ${guard} が異常終了した（exit ${r.status}）。\n`);
  }
}

if (blocked) {
  process.stdout.write(
    `[recheck] 違反を検出しブロックラッチを鋳造した。成果物を直して再度 npm run recheck -- ${ts} ${stage} を実行すること` +
      '（ラッチの解除は `npm run unblock` の役目で、本 CLI は解除しない）。\n'
  );
  process.exit(2);
}

// §4.5①の冪等スキップ（marker 有 & request 有 → 判定を再実行せず削除のみ）に入った場合、
// ガードは判定していない。「検査していない」を「違反なし」と言うと、直した内容がゲートを
// 通ったと誤読される（S2-2・ライブ run 20260910_220906 で実測）。
if (combinedOut.includes(`${stage}:idempotent-cleanup`)) {
  process.stdout.write(
    `[recheck] 検査していない（${stage}.done が既に存在するため冪等スキップされた・§4.5①）。` +
      `成果物を直したのなら npm run reopen -- ${ts} ${markerKey} を先に実行してから再度 recheck すること。\n`
  );
  process.exit(3);
}
process.stdout.write(`[recheck] ${stage} の再検査が完了した（違反なし）。\n`);
