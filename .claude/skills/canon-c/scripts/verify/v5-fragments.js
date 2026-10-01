/**
 * V5 書式片（artifacts.md §8.2・§8.3 本書由来の規則）。
 *
 * 生成物の `.md` で、ツール呼び出しの書式片（`</content>`・`</parameter>`・`<parameter name=`）が
 * コードフェンスの外に行として現れたら違反にする。builder が Write の引数の閉じタグまで本文に
 * 書き込んだ残骸で、スキーマの検査（V1〜V4）は本文の中身を見ないため素通りする。
 * 説明のためのコード例（フェンスの中）は許す。スキーマの有無に関わらず全 `.md` を見る
 * （CLAUDE.md・rules・README にも混入しうる）。
 */

import { computeFenceMask } from '../../../../../lib/markdown.js';

const CHECK = 'V5';
const FRAGMENT_RE = /<\/content>|<\/parameter>|<parameter\s+name=/;

/** 書式片がコードフェンスの外に現れる行番号（1始まり）。 */
export function findToolCallFragments(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    if (FRAGMENT_RE.test(lines[i])) out.push(i + 1);
  }
  return out;
}

/** generated/ の全 `.md` に V5 を当てる。 */
export function checkV5(ctx) {
  const violations = [];
  const mds = ctx.files.filter((f) => f.rel.endsWith('.md'));
  for (const f of mds) {
    const lines = findToolCallFragments(f.text);
    if (lines.length > 0) {
      violations.push(
        `${CHECK}: ${f.rel} の ${lines.join('・')} 行目に、ツール呼び出しの書式片` +
          '（`</content>`・`</parameter>`・`<parameter name=`）がコードフェンスの外で残っている（書込の閉じタグの残骸）。'
      );
    }
  }
  return { violations, warnings: [], checked: mds.length };
}
