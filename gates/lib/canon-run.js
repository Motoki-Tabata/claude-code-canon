/**
 * 機能X（正典更新）run ライフサイクルの共有処理。詳細設計書 §13.1・§11.3「ガードの2系統」。
 *
 * `/canon` の run（gates/lib/run.js・`work/.session-ts`）とは別名前空間の
 * `work/.canon-update-ts` を扱う。<ts> に紐づくパス解決・承認・マーカー・ラッチ・
 * .requests/ の消費規約は run.js の実装がそのまま使える（ts を引数に取るだけで
 * どちらの session-ts ファイルが指したかに依存しない）ため、ここでは
 * 「どの ts が in-flight か」を判定する部分のみを機能X 用に新設する。
 * 二重実装を避けるため、パス解決系（outputDir/workDir/gateDir/...）・
 * 承認/マーカー/ラッチ（hasApproval/mintMarker/mintBlockLatch/...）・
 * .requests/ 消費（processStageRequests）は run.js からそのまま re-export せず、
 * 呼び出し側が run.js から直接 import する（SSoT・L005 の同期漏れを避ける）。
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK_ROOT, ensureDir, isValidTs, hasMarker } from './run.js';

export const CANON_UPDATE_SESSION_TS_FILE = path.join(WORK_ROOT, '.canon-update-ts');

/**
 * 機能X run の終端マーカー名。G14〜G16 通過後に `output/<ts>/.gate/markers/canon-update.done`
 * が鋳造される（§13.1・§11.2 G14〜G16）。`/canon` の TERMINAL_STAGE='generation' とは
 * 別の名前空間なので、同一 <ts> を誤って共有しても衝突しない
 * （実運用では相互排他により <ts> 自体が別発番になる）。
 */
export const CANON_UPDATE_TERMINAL_STAGE = 'canon-update';

export function readCanonUpdateTs() {
  if (!existsSync(CANON_UPDATE_SESSION_TS_FILE)) return null;
  const raw = readFileSync(CANON_UPDATE_SESSION_TS_FILE, 'utf8').trim();
  return raw || null;
}

export function writeCanonUpdateTs(ts) {
  ensureDir(WORK_ROOT);
  writeFileSync(CANON_UPDATE_SESSION_TS_FILE, ts + '\n', 'utf8');
}

export function hasCanonUpdateTerminalMarker(ts) {
  return hasMarker(ts, CANON_UPDATE_TERMINAL_STAGE);
}

/**
 * 機能X run が in-flight のときだけ <ts> を返す（§13.1 の判定材料そのもの）。
 * `currentRunTs()`（run.js・/canon 用）と対称の実装。
 */
export function currentCanonUpdateRunTs() {
  const ts = readCanonUpdateTs();
  if (!ts) return null;
  if (!isValidTs(ts)) return null;
  if (hasCanonUpdateTerminalMarker(ts)) return null;
  return ts;
}

export function isCanonUpdateRunInFlight() {
  return currentCanonUpdateRunTs() !== null;
}
