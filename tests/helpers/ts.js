/**
 * ts 名前空間レジストリ（`package.json` の運用規約: 実 `work`/`output` を触る ts の
 * 日付部分をテストファイル間で重複させない）。
 *
 * 2026-08-19 に一度重複（`advance_guard.test.js`／`g2_keep.test.js` の `29990201_*`
 * 完全重複）が発見・解消された経緯があるが、規約はコメント頼みで機械検査が無かった。
 * その後 `eval_bundle.test.js` と `g11_constraints.test.js` が `29990303_000001` を
 * 再び重複使用していた（本テストスイート最適化で発見・ここで `eval_bundle` を
 * `29990305` へ移設して解消した）。同型の再発を機械で捕まえるため、`tests/ts_namespace.test.js`
 * がこのレジストリの一意性と、各テストファイルがここ経由で ts を発行していることを検査する。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** テストファイル名（拡張子・`.test` を除く）→ 8桁日付プレフィックス。 */
export const TS_NAMESPACES = {
  g7_ref_integrity: '29990110',
  g9_g12: '29990130',
  g8_non_regression: '29990202',
  g11_constraints: '29990303',
  scenario3_integration: '29990304',
  eval_bundle: '29990305',
  slice_design_map: '29991204',
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

/** 呼ぶたびに連番の ts を発行する関数を返す（`g11_constraints.test.js` の旧 `nextTs()` 相当）。 */
export function tsSeq(importMetaUrl) {
  let seq = 0;
  return () => tsFor(importMetaUrl, ++seq);
}
