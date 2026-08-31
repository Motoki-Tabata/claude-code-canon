/**
 * run sentinel（`.session-ts`・`.canon-update-ts`・`.self-optim`）の退避・復元と
 * run 骨格（`.gate/**`・`.requests/`）の生成を `node:test` の `t.after()` に載せる。
 *
 * 継ぎ足しで4ファイル・12箇所に複製されていた手書き `try { ... } finally { 復元 }` を置換する。
 * `t` にコールバックを渡すのではなく `t.after()` へ後始末を登録する形にすることで、
 * セットアップ自体が例外を投げた場合でも登録済みの後始末は実行される（従来の
 * `try` 前の mkdir が失敗すると finally に到達しない構成より安全）。
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import {
  SESSION_TS_FILE,
  CANON_UPDATE_SESSION_TS_FILE,
  SELF_OPTIM_FILE,
  outputDir,
  workDir,
  markersDir,
  approvalsDir,
  requestsDir,
  genDir,
} from './paths.js';
import { mintMarker } from '../../gates/lib/run.js';

/** file の現在値を退避し、t.after() で復元（元々不在なら削除）を登録する。 */
export function stashFile(t, file) {
  const had = existsSync(file);
  const saved = had ? readFileSync(file, 'utf8') : null;
  t.after(() => {
    if (saved !== null) writeFileSync(file, saved, 'utf8');
    else rmSync(file, { force: true });
  });
  return saved;
}

/** 実 output/<ts>・work/<ts> の後始末を t.after() へ登録する（複数 ts をまとめて渡せる）。 */
export function cleanupTs(t, ...tsList) {
  t.after(() => {
    for (const ts of tsList) {
      rmSync(outputDir(ts), { recursive: true, force: true });
      rmSync(workDir(ts), { recursive: true, force: true });
    }
  });
}

/** sentinel を退避したうえで強制的に不在にする（「run 外」を作る）。 */
export function withoutSentinel(t, file) {
  stashFile(t, file);
  rmSync(file, { force: true });
}

/**
 * `/canon` run（`work/.session-ts`）を in-flight にする。
 * `dirs` で `.gate/` 配下に作るサブディレクトリを選ぶ（既定: 無し＝`.requests/` のみ）。
 * `'approvals'`／`'markers'`／`'generated'`（`output/<ts>/generated/`）を必要に応じて渡す。
 */
export function withRun(t, ts, { dirs = [] } = {}) {
  stashFile(t, SESSION_TS_FILE);
  cleanupTs(t, ts);
  if (dirs.includes('approvals')) mkdirSync(approvalsDir(ts), { recursive: true });
  if (dirs.includes('markers')) mkdirSync(markersDir(ts), { recursive: true });
  if (dirs.includes('generated')) mkdirSync(genDir(ts), { recursive: true });
  mkdirSync(requestsDir(ts), { recursive: true });
  writeFileSync(SESSION_TS_FILE, ts + '\n', 'utf8');
}

/** 機能X run（`work/.canon-update-ts`）を in-flight にする。極性は write-scope-guard と逆。 */
export function withCanonUpdateRun(t, ts, { dirs = ['approvals'] } = {}) {
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  cleanupTs(t, ts);
  if (dirs.includes('approvals')) mkdirSync(approvalsDir(ts), { recursive: true });
  if (dirs.includes('markers')) mkdirSync(markersDir(ts), { recursive: true });
  mkdirSync(requestsDir(ts), { recursive: true });
  writeFileSync(CANON_UPDATE_SESSION_TS_FILE, ts + '\n', 'utf8');
}

/**
 * 機能Y 自己最適化 run（`work/.self-optim`）を in-flight にする。
 * `.session-ts` の終端マーカーは見ない sentinel 基準（`gates/lib/self-optim.js`）。
 * `mintTerminalMarker: true` で工程7完了後（`generation.done` 有）を模する
 * （self-optimize-scope-guard は判定材料にしないが、他ツール経由の検証で使う）。
 */
export function withSelfOptim(t, ts, { label = 'demo-label', mintTerminalMarker = false } = {}) {
  stashFile(t, SELF_OPTIM_FILE);
  cleanupTs(t, ts);
  mkdirSync(approvalsDir(ts), { recursive: true });
  mkdirSync(markersDir(ts), { recursive: true });
  mkdirSync(requestsDir(ts), { recursive: true });
  writeFileSync(SELF_OPTIM_FILE, `${label}\n${ts}\n`, 'utf8');
  if (mintTerminalMarker) mintMarker(ts, 'generation');
}
