/**
 * ts 名前空間レジストリ（`package.json` の運用規約: 実 `work`/`output` を触る ts の
 * 日付部分をテストファイル間で重複させない）。
 *
 * 規約をコメント頼みにすると、テストファイル間で同じ日付の ts が重複使用される事故が再発する。
 * 同型の再発を機械で捕まえるため、`tests/ts_namespace.test.js`
 * がこのレジストリの一意性と、各テストファイルがここ経由で ts を発行していることを検査する。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** テストファイル名（拡張子・`.test` を除く）→ 8桁日付プレフィックス。 */
export const TS_NAMESPACES = {
  v6_ref_integrity: '29990110',
  v8_snapshot: '29990130',
  v5_fragments: '29990131',
  v7_keep: '29990202',
  v9_constraints: '29990303',
  verify_cli: '29990304',
  review_bundle: '29990305',
  emit_manifest: '29990306',
  slice: '29991204',
  copy_keep: '29991402',
};

function nameFromUrl(importMetaUrl) {
  return path.basename(fileURLToPath(importMetaUrl)).replace(/\.test\.js$/, '');
}

/** 呼び出し元テストファイルに割り当てられた8桁日付プレフィックスを返す（未登録は throw）。 */
export function tsNamespace(importMetaUrl) {
  const name = nameFromUrl(importMetaUrl);
  const ns = TS_NAMESPACES[name];
  if (!ns) {
    throw new Error(
      `tests/helpers/ts.js: TS_NAMESPACES に '${name}' が未登録。新規テストファイルは他と重複しない` +
        `8桁日付を割り当てて TS_NAMESPACES へ登録すること（tests/ts_namespace.test.js が重複を検査する）。`
    );
  }
  return ns;
}

/** `<namespace>_<suffix6桁ゼロ埋め>` 形式の ts を返す。 */
export function tsFor(importMetaUrl, suffix) {
  const s = String(suffix).padStart(6, '0');
  return `${tsNamespace(importMetaUrl)}_${s}`;
}

/** 呼ぶたびに連番の ts を発行する関数を返す。 */
export function tsSeq(importMetaUrl) {
  let seq = 0;
  return () => tsFor(importMetaUrl, ++seq);
}
