/**
 * run ライフサイクルの共有処理（<ts> 解決・.gate/ パス・.requests/ 走査・冪等消費）。
 *
 * 設計書:
 *   §4.3（ステージ・ディスパッチ） §4.4（承認の鋳造経路） §4.5（.requests/ の消費規約）
 *   §11.3（PreToolUse 3ガード・ガードの有効条件） §14（ディレクトリ構成）
 *
 * このファイルは「発火配線が呼ぶ実処理」（write-scope-guard 等）と
 * 「バッチ選択・マーカー鋳造」（stage-guard/gen-guard）の両方から使われる
 * 共有ライブラリ。ゲート判定ロジック（g1〜g13）そのものはここに置かない。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON_ROOT, posix } from './canon.js';

/** このモジュールが `node xxx.js` として直接起動されたか（import 時の副作用実行を防ぐ）。 */
export function isMainModule(importMetaUrl) {
  const modulePath = fileURLToPath(importMetaUrl);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return invoked === modulePath;
}

export const OUTPUT_ROOT = path.join(CANON_ROOT, 'output');
export const WORK_ROOT = path.join(CANON_ROOT, 'work');
export const SESSION_TS_FILE = path.join(WORK_ROOT, '.session-ts');

/**
 * 「終端マーカー」＝ run 完了の判定材料（§11.3 ガードの有効条件）。
 * §4.3 の完了リクエスト種別（investigation/requirements/spec/design/generation）のうち
 * generation が最後の工程7（生成）に対応し、これ以降（工程8〜10）はゲート・人間 CLI が
 * 担う自動/手動工程でエージェントの Write/Edit は発生しない。ゆえに generation.done を
 * 「run が in-flight でなくなった」ことの権威マーカーとする。
 */
export const TERMINAL_STAGE = 'generation';

/** ステージ・ディスパッチが扱う完了リクエストの全種別（§4.3 の例示）。 */
export const KNOWN_STAGES = ['investigation', 'requirements', 'spec', 'design', 'generation'];

/** write-scope-guard が保護するシステム本体トップレベルツリー（§11.3 書込先ガード）。 */
export const PROTECTED_DIRS = ['docs', 'gates', '.claude'];

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// .session-ts
// ---------------------------------------------------------------------------

export function readSessionTs() {
  if (!existsSync(SESSION_TS_FILE)) return null;
  const raw = readFileSync(SESSION_TS_FILE, 'utf8').trim();
  return raw || null;
}

export function writeSessionTs(ts) {
  ensureDir(WORK_ROOT);
  writeFileSync(SESSION_TS_FILE, ts + '\n', 'utf8');
}

const TS_RE = /^\d{8}_\d{6}$/;
export function isValidTs(ts) {
  return typeof ts === 'string' && TS_RE.test(ts);
}

/** <ts> 採番（形式 YYYYMMDD_hhmmss・基本設計書 §8.1 / _old output-path-resolver 踏襲）。 */
export function mintTs(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// ---------------------------------------------------------------------------
// output/<ts>/ ・ work/<ts>/ パス
// ---------------------------------------------------------------------------

export function outputDir(ts) {
  return path.join(OUTPUT_ROOT, ts);
}
export function workDir(ts) {
  return path.join(WORK_ROOT, ts);
}
export function gateDir(ts) {
  return path.join(outputDir(ts), '.gate');
}
export function markersDir(ts) {
  return path.join(gateDir(ts), 'markers');
}
export function approvalsDir(ts) {
  return path.join(gateDir(ts), 'approvals');
}
export function blocksDir(ts) {
  return path.join(gateDir(ts), 'blocks');
}
export function requestsDir(ts) {
  return path.join(workDir(ts), '.requests');
}

/**
 * 対象プロジェクトのルートを work/<ts>/target.txt から解決する（§5.1・§6.2）。
 * 絶対パスならそのまま、相対なら workDir(ts) 基準。不在・空なら null。
 * G1（evidence_paths 実在照合）と G8（keep 原本の sha256 照合）が共有する。
 */
export function resolveTargetRoot(ts) {
  const p = path.join(workDir(ts), 'target.txt');
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(workDir(ts), raw);
}
export function processedLogPath(ts) {
  return path.join(gateDir(ts), 'processed.log');
}

export function markerPath(ts, stage) {
  return path.join(markersDir(ts), `${stage}.done`);
}
export function hasMarker(ts, stage) {
  return existsSync(markerPath(ts, stage));
}
/** 権威マーカーの鋳造。ゲート専有（§4.4）— このモジュールはゲート/tools からのみ呼ばれる想定。 */
export function mintMarker(ts, stage, meta = {}) {
  ensureDir(markersDir(ts));
  writeFileSync(
    markerPath(ts, stage),
    JSON.stringify({ stage, minted_at: new Date().toISOString(), ...meta }, null, 2) + '\n',
    'utf8'
  );
}

export function approvalPath(ts, kind) {
  return path.join(approvalsDir(ts), `${kind}.approved`);
}
export function hasApproval(ts, kind) {
  return existsSync(approvalPath(ts, kind));
}
/** 承認サイドカーの鋳造。唯一の鋳造経路は tools/approve.js（§4.4）。 */
export function mintApproval(ts, kind, meta = {}) {
  ensureDir(approvalsDir(ts));
  writeFileSync(
    approvalPath(ts, kind),
    JSON.stringify({ kind, approved_at: new Date().toISOString(), ...meta }, null, 2) + '\n',
    'utf8'
  );
}
export function revokeApproval(ts, kind) {
  const p = approvalPath(ts, kind);
  if (existsSync(p)) {
    unlinkSync(p);
    return true;
  }
  return false;
}

export function blockLatchPath(ts, stage) {
  return path.join(blocksDir(ts), `${stage}.blocked`);
}
export function hasBlockLatch(ts, stage) {
  return existsSync(blockLatchPath(ts, stage));
}
/** 一方向ラチェット。解除は人間 CLI（tools/unblock.js）のみ（§11.3）。 */
export function mintBlockLatch(ts, stage, reason, meta = {}) {
  ensureDir(blocksDir(ts));
  writeFileSync(
    blockLatchPath(ts, stage),
    JSON.stringify({ stage, reason, blocked_at: new Date().toISOString(), ...meta }, null, 2) + '\n',
    'utf8'
  );
}
export function unblock(ts, stage) {
  const p = blockLatchPath(ts, stage);
  if (existsSync(p)) {
    unlinkSync(p);
    return true;
  }
  return false;
}
/** いずれかの blocks/*.blocked が存在するか（advance-guard が run 全体のラッチとして参照）。 */
export function anyBlockLatch(ts) {
  const dir = blocksDir(ts);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith('.blocked'));
}

export function requestPath(ts, stage) {
  return path.join(requestsDir(ts), stage);
}
export function hasRequest(ts, stage) {
  return existsSync(requestPath(ts, stage));
}
/** 存在する完了リクエストのステージ名一覧（ドットファイルは除く）。 */
export function listRequests(ts) {
  const dir = requestsDir(ts);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => !f.startsWith('.'));
}
export function deleteRequest(ts, stage) {
  const p = requestPath(ts, stage);
  if (existsSync(p)) unlinkSync(p);
}

export function hasTerminalMarker(ts) {
  return hasMarker(ts, TERMINAL_STAGE);
}

/**
 * run が in-flight のときだけ <ts> を返す。ガードの有効条件の判定材料そのもの（§11.3）。
 * .session-ts が無い（run 未開始）／終端マーカーがある（run 完了）なら null（＝ガード素通り）。
 */
export function currentRunTs() {
  const ts = readSessionTs();
  if (!ts) return null;
  if (!isValidTs(ts)) return null;
  if (hasTerminalMarker(ts)) return null;
  return ts;
}

export function isRunInFlight() {
  return currentRunTs() !== null;
}

export function appendProcessedLog(ts, entry) {
  ensureDir(gateDir(ts));
  const line = JSON.stringify({ ts, at: new Date().toISOString(), ...entry });
  appendFileSync(processedLogPath(ts), line + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// パス正規化
// ---------------------------------------------------------------------------

/** CANON_ROOT からの posix 相対パスへ正規化する。cwd 基準で相対パスを解決する。 */
export function toRepoRelative(filePath, cwd) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(cwd || CANON_ROOT, filePath);
  return posix(path.relative(CANON_ROOT, abs));
}

// ---------------------------------------------------------------------------
// hook stdin/stdout 契約（L4_AUTOMATION.md §2.1）
// ---------------------------------------------------------------------------

/**
 * PreToolUse 等の hook 入力 JSON を stdin から読む。
 * fd 0 の同期読込は Windows でもパイプ入力に対して機能する（動作確認済み）。
 */
export function readHookInput() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    raw = '';
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`stdin JSON パース失敗: ${err.message}`);
  }
}

/**
 * PreToolUse の判定を返す（exit 0 + hookSpecificOutput.permissionDecision）。
 * 根拠: docs/L4_AUTOMATION.md §2.1 公式コード例1（block-rm.sh）が exit 0 で
 * permissionDecision: deny を返す形。exit code 表は「0=成功。stdout を JSON としてパース」
 * であり、permissionDecision フィールドは PreToolUse 固有の判定チャンネル。
 */
export function emitPreToolUseDecision(decision, reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

export function allow(reason = 'sanctioned') {
  emitPreToolUseDecision('allow', reason);
}
export function deny(reason) {
  emitPreToolUseDecision('deny', reason);
}

/**
 * SubagentStop/Stop 用のブロック終了。exit code 表「2=Blockingエラー。stderr が
 * Claude へフィードバックされる」に従う（PreToolUse の permissionDecision チャンネルを
 * 持たないイベントの唯一のブロック手段）。
 */
export function blockStop(message) {
  process.stderr.write(message.endsWith('\n') ? message : message + '\n');
  process.exit(2);
}

export function passStop(message) {
  if (message) process.stderr.write(message.endsWith('\n') ? message : message + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// §4.5 .requests/ 消費規約（鋳造→削除・冪等演算）
// ---------------------------------------------------------------------------

/**
 * SubagentStop 発火 → .requests/<stage> を走査（基本設計書 §4.5 擬似コードそのもの）。
 *
 * stages: このガードが担当するステージ名の配列（stage-guard は投機/要件/仕様/設計、
 *         gen-guard は生成のみ、というように呼び分ける）。
 * runChecks(ts, stage): 判定関数。{ ok: boolean, violations: string[] } を返す。
 *         ①（marker 有 & request 有）では絶対に呼ばれない＝冪等性の核心。
 * markerKey(ts, stage): マーカー／ブロックラッチのキー名を返す（既定＝リクエスト名 stage）。
 *         同一リクエスト名で複数 phase が停止するステージ（investigation の1段目/2段目 focused）で、
 *         phase ごとに別マーカーを鋳造して①の冪等スキップを phase 別に効かせるための注入口
 *         （§4.5 の investigation phase 別マーカー）。リクエストの消費（削除）は常にリクエスト名
 *         で行う（リクエストファイルは1つ）。他ステージは既定＝ステージ名のまま。
 *
 * 戻り値: 各ステージの処理結果配列。
 */
export function processStageRequests({ ts, stages, runChecks, markerKey = (_ts, stage) => stage }) {
  const results = [];
  for (const stage of listRequests(ts)) {
    if (!stages.includes(stage)) continue; // このガードの担当外
    const key = markerKey(ts, stage); // marker/latch はこのキー・request 削除は stage 名
    const logMeta = key === stage ? {} : { markerKey: key };
    const markerExists = hasMarker(ts, key);

    if (markerExists) {
      // ① marker 有 & request 有 → 判定を再実行せず request 削除のみ（冪等・再発火の無害化）
      deleteRequest(ts, stage);
      appendProcessedLog(ts, { stage, action: 'idempotent-cleanup', ok: true, ...logMeta });
      results.push({ stage, action: 'idempotent-cleanup', ok: true });
      continue;
    }

    // ② marker 無 & request 有 → ゲートバッチ実行
    const { ok, violations } = runChecks(ts, stage);
    if (ok) {
      // pass → ❶ marker 鋳造（先） → ❷ request 削除（後）
      mintMarker(ts, key, {});
      deleteRequest(ts, stage);
      // 直前の fail が残した「このステージ自身の」ブロックラッチは marker（権威）に
      // 置き換えられるので後始末する。advance-guard 専有の blocks/gen.blocked とは
      // 別名前空間（§4.3 の <stage>.blocked と §11.3 の gen.blocked は別物）なので、
      // 前進ガードの「一方向ラチェット・人間 CLI のみ解除」原則には抵触しない。
      if (hasBlockLatch(ts, key)) unblock(ts, key);
      appendProcessedLog(ts, { stage, action: 'pass', ok: true, ...logMeta });
      results.push({ stage, action: 'pass', ok: true });
    } else {
      // fail → blocks/<key>.blocked を残す（request は削除しない＝再判定の契機を保つ）
      mintBlockLatch(ts, key, violations.join(' / '));
      appendProcessedLog(ts, { stage, action: 'fail', ok: false, violations, ...logMeta });
      results.push({ stage, action: 'fail', ok: false, violations });
    }
  }
  // ③ marker 有 & request 無 は listRequests(ts) に出てこないので自然に「何もしない」になる。
  return results;
}
