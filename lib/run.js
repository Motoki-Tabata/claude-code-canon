/**
 * run の共有処理（<ts> の形式・work/<ts>・output/<ts> のパス・対象プロジェクトの解決・
 * CLI の入出力）。
 *
 * 検査の判定ロジックそのものはここに置かない。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON_ROOT } from './canon.js';
import { HANDOFF_FILE, parseHandoff } from './handoff.js';

/** このモジュールが `node xxx.js` として直接起動されたか（import 時の副作用実行を防ぐ）。 */
export function isMainModule(importMetaUrl) {
  const modulePath = fileURLToPath(importMetaUrl);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return invoked === modulePath;
}

export const OUTPUT_ROOT = path.join(CANON_ROOT, 'output');
export const WORK_ROOT = path.join(CANON_ROOT, 'work');

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

/** `work/<ts>/handoff.md` の frontmatter（無ければ null）。 */
export function readHandoff(ts) {
  const p = path.join(workDir(ts), HANDOFF_FILE);
  if (!existsSync(p)) return null;
  return parseHandoff(readFileSync(p, 'utf8'));
}

/**
 * 対象プロジェクトのルートを `work/<ts>/handoff.md` の frontmatter `target` から解決する
 * （artifacts.md §1「対象プロジェクトのパスは handoff.md の frontmatter target が持つ」）。
 * 絶対パスならそのまま、相対なら workDir(ts) 基準。handoff.md が無い・target が空なら null。
 */
export function resolveTargetRoot(ts) {
  const h = readHandoff(ts);
  const raw = h?.target;
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(workDir(ts), raw);
}

// ---------------------------------------------------------------------------
// CLI の入出力（`node <script>.js <ts>`）
// ---------------------------------------------------------------------------

/** 第1引数の <ts> を返す。無い・形式違いなら使い方を出して exit 2。 */
export function readTsArg(usage, argv = process.argv.slice(2)) {
  const ts = argv[0];
  if (!isValidTs(ts)) {
    process.stderr.write(`使い方: ${usage}（<ts> は YYYYMMDD_hhmmss）\n`);
    process.exit(2);
  }
  return ts;
}
