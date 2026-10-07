/**
 * lib/tree-hash.js — ディレクトリのハッシュ（architecture.md §6.2）。
 *
 * 配下の全ファイルを `sha256sum` した一覧（`<hex>  ./<相対パス>` を1行1件）をパスのバイト順に並べ、
 * その一覧全体の sha256 を取る。P4 の承認行と verify-report.md が同じ値を記録し、オーケストレーターは
 * 次のシェルコマンドで同じ値を再計算できる（TREE_HASH_COMMAND）。
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** hashTree と同じ値を出すシェルコマンド（`<dir>` を置き換えて使う）。 */
export const TREE_HASH_COMMAND =
  "(cd <dir> && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) | sha256sum";

/** dir 配下の全ファイルの相対パス（`./` 付き・posix・バイト順）。 */
function listFiles(dir) {
  const out = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(dir, '.');
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

/** dir のハッシュ（hex）と、ハッシュした一覧の件数。 */
export function hashTree(dir) {
  const files = listFiles(dir);
  const listing = files
    .map((rel) => `${createHash('sha256').update(readFileSync(path.join(dir, rel))).digest('hex')}  ${rel}\n`)
    .join('');
  return { hash: createHash('sha256').update(listing).digest('hex'), files: files.length };
}

/**
 * verify-report.md の「generated/ のハッシュ」の値（hex 全桁）。行が無い・「なし」なら null。
 * verify.js が書く行（`- generated/ のハッシュ: \`<hex>\`（N ファイル）`）の読み手。
 */
export function parseVerifyReportHash(text) {
  const m = text.match(/^- generated\/ のハッシュ: `([0-9a-f]{64})`/m);
  return m ? m[1] : null;
}
