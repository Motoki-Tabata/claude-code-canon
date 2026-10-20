/**
 * run の共有処理（<ts> の形式・work/<ts> のパス）。
 *
 * 検査の判定ロジックそのものはここに置かない。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANON_ROOT } from './canon.js';

/** このモジュールが `node xxx.js` として直接起動されたか（import 時の副作用実行を防ぐ）。 */
export function isMainModule(importMetaUrl) {
  const modulePath = fileURLToPath(importMetaUrl);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
  return invoked === modulePath;
}

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

export function workDir(ts) {
  return path.join(WORK_ROOT, ts);
}
