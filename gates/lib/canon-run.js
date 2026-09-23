/**
 * 機能X（正典更新）run ライフサイクルの共有処理。詳細設計書 §13.1・§11.3「ガードの2系統」。
 *
 * `/canon` の run（gates/lib/run.js・`work/.session-ts`）とは別名前空間の
 * `work/.canon-update-ts` を扱う。<ts> に紐づくパス解決・承認・マーカー・ラッチ・
 * .requests/ の消費規約は run.js の実装がそのまま使える（ts を引数に取るだけで
 * どちらの session-ts ファイルが指したかに依存しない）ため、ここでは
 * 「どの ts が in-flight か」を判定する部分のみを機能X 用に新設する。
 * 二重実装を避けるため、パス解決系（outputDir/workDir/gateDir/...）・
 * マーカー/ラッチ（mintMarker/mintBlockLatch/...）・
 * .requests/ 消費（processStageRequests）は run.js からそのまま re-export せず、
 * 呼び出し側が run.js から直接 import する（SSoT・L005 の同期漏れを避ける）。
 */

import { existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from './canon.js';
import { WORK_ROOT, ensureDir, isValidTs, hasMarker, workDir } from './run.js';
import { sha256File } from './managed-paths.js';

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

// ---------------------------------------------------------------------------
// docs/ スナップショット（承認サイドカーの代替・§13.1 安全制約の機械担保）
// ---------------------------------------------------------------------------
//
// 旧設計は「更新ゲート承認まで docs/ への書込を deny」で、提案フェーズ（調査・差分提案）が
// docs/ を書き換えないことを事前に強制していた。承認サイドカーの廃止（承認は対話で取り
// state.md に記録する）に伴い、事前 deny を「提案フェーズ完了時に docs/ が採番時点から
// 無変更であることの事後照合」へ置き換える。docs/ は git 管理下なので、逸脱は復旧できる。

export const DOCS_DIR = path.join(CANON_ROOT, 'docs');

export function docsSnapshotPath(ts) {
  return path.join(workDir(ts), '.docs-snapshot.json');
}

/** docs/ 直下ファイル（正典9本＋SOURCES 等・平坦）の {ファイル名: sha256}。 */
export function snapshotDocs(docsDir = DOCS_DIR) {
  const out = {};
  if (!existsSync(docsDir)) return out;
  for (const entry of readdirSync(docsDir, { withFileTypes: true })) {
    if (entry.isFile()) out[entry.name] = sha256File(path.join(docsDir, entry.name));
  }
  return out;
}

export function writeDocsSnapshot(ts, docsDir = DOCS_DIR) {
  ensureDir(workDir(ts));
  writeFileSync(docsSnapshotPath(ts), JSON.stringify(snapshotDocs(docsDir), null, 2) + '\n', 'utf8');
}

/**
 * 採番時点のスナップショットと現在の docs/ を比べる。スナップショットが無ければ null
 * （比較不能を「差分なし」と読ませない——呼び出し側は違反として扱う）。
 */
export function diffDocsAgainstSnapshot(ts, docsDir = DOCS_DIR) {
  const p = docsSnapshotPath(ts);
  if (!existsSync(p)) return null;
  const before = JSON.parse(readFileSync(p, 'utf8'));
  const after = snapshotDocs(docsDir);
  const changed = [];
  const added = [];
  const removed = [];
  for (const [name, hash] of Object.entries(after)) {
    if (!(name in before)) added.push(name);
    else if (before[name] !== hash) changed.push(name);
  }
  for (const name of Object.keys(before)) if (!(name in after)) removed.push(name);
  return { changed, added, removed, clean: changed.length + added.length + removed.length === 0 };
}
