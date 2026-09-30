/**
 * run の共有処理（<ts> の形式・work/<ts>・output/<ts> のパス・対象プロジェクトの解決・
 * 検査 CLI の入出力）。
 *
 * 検査の判定ロジック（g3〜g12）そのものはここに置かない。
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON_ROOT } from './canon.js';

/** このモジュールが `node xxx.js` として直接起動されたか（import 時の副作用実行を防ぐ）。 */
export function isMainModule(importMetaUrl) {
  const modulePath = fileURLToPath(importMetaUrl);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return invoked === modulePath;
}

export const OUTPUT_ROOT = path.join(CANON_ROOT, 'output');
export const WORK_ROOT = path.join(CANON_ROOT, 'work');

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const TS_RE = /^\d{8}_\d{6}$/;
export function isValidTs(ts) {
  return typeof ts === 'string' && TS_RE.test(ts);
}

/** <ts> 採番（形式 YYYYMMDD_hhmmss）。 */
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

/**
 * 対象プロジェクトのルートを work/<ts>/target.txt から解決する。
 * 絶対パスならそのまま、相対なら workDir(ts) 基準。不在・空なら null。
 */
export function resolveTargetRoot(ts) {
  const p = path.join(workDir(ts), 'target.txt');
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(workDir(ts), raw);
}

// ---------------------------------------------------------------------------
// 検査 CLI の入出力（`node gates/gX.js <ts>`）
// ---------------------------------------------------------------------------

/** 第1引数の <ts> を返す。無い・形式違いなら使い方を出して exit 2。 */
export function readTsArg(gateName, argv = process.argv.slice(2)) {
  const ts = argv[0];
  if (!isValidTs(ts)) {
    process.stderr.write(`使い方: node gates/${gateName}.js <ts>（YYYYMMDD_hhmmss）\n`);
    process.exit(2);
  }
  return ts;
}

/** 検査結果を stdout に出し、通過なら exit 0・違反なら exit 1 で終える。 */
export function reportCheck(ok, message) {
  process.stdout.write(message.endsWith('\n') ? message : message + '\n');
  process.exit(ok ? 0 : 1);
}
