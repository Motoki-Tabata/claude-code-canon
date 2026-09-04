/**
 * gates/lib/readme-listing.js — README の「利用者向け一覧」判定の Single Source of Truth
 * （詳細設計書 §12.4・G10）。
 *
 * ## なぜ構造判定か
 *
 * §12.4 が禁じるのは内部専用 Skill（`user-invocable: false`）の**利用者向け一覧への掲載**
 * （「**ユーザー向け一覧に載せない**。「内部で参照される知識」に留める」・肝(b)「起動一覧に
 * 出さない」）であって、README 本文からの完全排除ではない。しかし旧実装は
 * `readme.includes(name)` という**位置関係を見ない出現ベースの判定**であり、
 *
 *   - §12.4 が同じ行で推奨する「「内部で参照される知識」に留める」書き方が充足不可能になる
 *   - §12.5「Hooks 配線 → `.claude/settings.json` への配線と参照スクリプトの実行権限付与」が
 *     要求する hook 実体の在り処（`.claude/skills/<name>/scripts/<script>`）を書けなくなる
 *
 * という2つの副作用を生んだ（ライブ run `20260903_091044` で実測。生成 README が §12.4 の
 * 指示どおり書いた節でブロックされ、hook スクリプトの実パスを README から消す是正を強いられた）。
 * `gates/lib/shell-write.js` が「保護パス判定は出現でなく宛先で行う」へ改めたのと同型の是正である
 * （`.claude/rules/gates-and-tests.md`）。
 *
 * ## 判定する2軸（これ以外は見ない）
 *
 * 1. **`/名前` 表記** — 起動方法の案内そのもの。コードフェンス内の使用例も対象にする
 *    （使用例の `/名前` は起動方法の案内であって、地の文の引用ではない）。
 * 2. **一覧項目としての出現** — 見出し行・表の第1セル・箇条書きの先頭に、識別子として立つこと。
 *
 * 散文中の言及とパス表記（前後が `/` の出現）は**判定対象にしない**。
 *
 * ## 一覧項目の同定規約
 *
 * 「一覧項目」は行のどこかに名前があることではなく、その行の**識別子スロット**に名前が立つこと。
 *
 *   - **表**: 本体行の第1セル。コードスパン（`` ` `` 囲み）があればそのトークン、無ければ
 *     セル先頭の識別子トークン。第2セル以降（hook 配線表の「スクリプト」列等）は見ない。
 *   - **箇条書き・見出し**: 装飾（`` ` ``・`**`・括弧類）を剥がした**先頭**の識別子トークンのみ。
 *     散文の箇条書き（「この deny は `<name>` が配線した PreToolUse による」）を一覧と誤認しない
 *     ため、行内のコードスパンを拾いに行かない。
 *
 * 依存ゼロ（§14「不変土台」）。判定は純粋な構文解析のみで、意味判断はしない。
 */

import {
  computeFenceMask,
  parseTables,
  backtickTokens,
  mentionsSlashCommand,
} from './markdown.js';

/** 見出し行（`# ` 〜 `###### `）。 */
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** 箇条書き項目（`- ` / `* ` / `+ ` / `1. `）。 */
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s+(.+)$/;

/** 識別子トークンの先頭は英数字か `_`。`/canon`（スラッシュ表記）・`.claude/x`（パス）は除く。 */
const LEADING_IDENTIFIER_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*/;

/** 識別子の手前に付きうる装飾・引用記号。 */
const DECORATION_RE = /^[\s`*_[\]"'“”「『（(]+/;

/**
 * テキストの**先頭**に立つ識別子トークンを返す（無ければ null）。
 * `- **\`impact-scope\`** — …` → `impact-scope` ／ `- この deny は impact-scope による` → null。
 */
export function leadingIdentifier(text) {
  if (typeof text !== 'string') return null;
  const m = text.replace(DECORATION_RE, '').match(LEADING_IDENTIFIER_RE);
  return m ? m[0] : null;
}

/** 表の第1セルの識別子候補（コードスパン優先・無ければ先頭トークン）。 */
function tableCellIdentifiers(cell) {
  const spans = backtickTokens(cell).map((t) => t.trim()).filter(Boolean);
  if (spans.length > 0) return spans;
  const lead = leadingIdentifier(cell);
  return lead ? [lead] : [];
}

/**
 * README 全体から「一覧項目」を抽出する（1回だけ計算して各コンポーネント名で使い回す）。
 * コードフェンス内は構造でないため除外する（`computeFenceMask` を尊重）。
 *
 * @returns {{line:number, kind:'heading'|'table'|'list', text:string, ids:string[]}[]}
 *   `line` は 1-based。`ids` はその項目の識別子スロットに立つトークン。
 */
export function collectListingEntries(readme) {
  const lines = String(readme ?? '').split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const entries = [];

  // 表: 本体行の第1セルのみ（ヘッダ行は列見出しであって項目ではない）。
  for (const table of parseTables(lines, 0, lines.length, mask)) {
    for (const row of table.rows) {
      const cell = row.cells[0] ?? '';
      const ids = tableCellIdentifiers(cell);
      if (ids.length > 0) entries.push({ line: row.line, kind: 'table', text: cell, ids });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const line = lines[i];

    const h = line.match(HEADING_RE);
    if (h) {
      const id = leadingIdentifier(h[2]);
      if (id) entries.push({ line: i + 1, kind: 'heading', text: h[2].trim(), ids: [id] });
      continue;
    }

    const li = line.match(LIST_ITEM_RE);
    if (li) {
      const id = leadingIdentifier(li[1]);
      if (id) entries.push({ line: i + 1, kind: 'list', text: li[1].trim(), ids: [id] });
    }
  }

  return entries;
}

/** 一覧項目の種別 → 違反メッセージ用の日本語ラベル。 */
export const LISTING_KIND_LABEL = {
  heading: '見出し',
  table: '表の第1セル',
  list: '箇条書きの先頭',
};

/**
 * README 中の `name` の現れ方を、判定に使う2軸だけへ還元する。
 *
 * @param {string} readme
 * @param {string} name コンポーネント識別子
 * @param {ReturnType<typeof collectListingEntries>} [entries] 事前計算した一覧項目
 * @returns {{slash: {line:number, text:string}[], listing: {line:number, kind:string, text:string}[]}}
 */
export function analyzeReadmeMentions(readme, name, entries) {
  const lines = String(readme ?? '').split(/\r?\n/);
  const slash = [];
  // スラッシュ表記はフェンス内も対象（使用例の `/名前` は起動方法の案内である）。
  for (let i = 0; i < lines.length; i++) {
    if (mentionsSlashCommand(lines[i], name)) slash.push({ line: i + 1, text: lines[i].trim() });
  }

  const all = entries ?? collectListingEntries(readme);
  const listing = all
    .filter((e) => e.ids.includes(name))
    .map(({ line, kind, text }) => ({ line, kind, text }));

  return { slash, listing };
}
