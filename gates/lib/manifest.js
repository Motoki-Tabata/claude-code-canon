/**
 * MANIFEST.md の機械照合用節（`## 全ファイル`）のパーサ。
 *
 * MANIFEST の本文は新規/改修/維持/廃止の差分サマリ（人間が読む）だが、それだけでは生成物との
 * 一致を機械で確かめられず、1行欠落が全ゲートを通過した（S1-3・run 20260922）。そこで
 * `## 全ファイル` 節に generated/ の全ファイルを1行1件（バッククォート付きの generated/ からの
 * 相対パス）で列挙させ、G9 が generated/ の実ファイル集合と双方向に照合する。
 */

import { computeFenceMask } from './markdown.js';

export const MANIFEST_FILES_HEADING = '全ファイル';

/**
 * @returns {{ found: boolean, files: string[] }} found=false は節が無い（契約違反）。
 */
export function parseManifestFiles(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (m && m[1] === MANIFEST_FILES_HEADING) {
      start = i;
      break;
    }
  }
  if (start === -1) return { found: false, files: [] };
  const files = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i]) && !mask[i]) break;
    const m = lines[i].match(/^\s*[-*]\s+`([^`]+)`/);
    if (m) files.push(m[1].trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  }
  return { found: true, files };
}
