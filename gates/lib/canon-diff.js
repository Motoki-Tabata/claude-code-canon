/**
 * `work/<ts>/canon-diff-proposal.md` の決定論的パーサ（機能X・詳細設計書 §13.1）。
 *
 * 固定フォーマット（§13.1 が定める）:
 *   ## メタ                    — `- key: value` 形式。investigated_at・confirmed_version・
 *                                 todo_marker_count（`[要確認]` 実マーカー総数の申告）を持つ
 *   ## 差分候補                — 自由記述（採否は人間・G14〜G16 は読まない）
 *   ## 旧表現→新表現           — GFM 表（G15 が走査する「旧値」の入力）
 *   ## 一次ソースとの矛盾       — 自由記述（判定しない・明示するのみ）
 *
 * 依存ゼロ方針（§14「不変土台」）に従い gates/lib/markdown.js の共有パーサを土台にする。
 *
 * `## メタ` の値末尾に括弧書き注記（出典裏取り日等の併記、全角/半角）が付いていても、
 * 1段まで除去してから比較に使う（サブエージェントの出典併記でG14の完全一致照合が壊れた
 * 実例への対策）。
 */

import { findHeading, sectionSlice, parseTables, plain, stripTrailingAnnotation } from './markdown.js';

export class CanonDiffProposalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonDiffProposalError';
  }
}

/** `## メタ` 内の `- key: value` 行をフラットな object にする。 */
function parseMeta(lines, start, end) {
  const meta = {};
  const re = /^\s*-\s+([A-Za-z_][\w-]*):\s*(.*)$/;
  for (let i = start; i < end; i++) {
    const m = lines[i].match(re);
    if (m) meta[m[1]] = stripTrailingAnnotation(m[2].trim());
  }
  return meta;
}

/**
 * canon-diff-proposal.md をパースする。
 * @returns {{meta: Object, oldToNew: Array<{old:string,new:string,line:number}>, hasDiffCandidates: boolean, hasContradictions: boolean}}
 */
export function parseCanonDiffProposal(text) {
  const lines = text.split(/\r?\n/);

  const metaHeading = findHeading(lines, 'メタ', 2);
  if (metaHeading < 0) {
    throw new CanonDiffProposalError('`## メタ` 節が見つからない（固定フォーマット違反・§13.1）。');
  }
  const metaSlice = sectionSlice(lines, metaHeading);
  const meta = parseMeta(lines, metaSlice.start, metaSlice.end);

  const diffHeading = findHeading(lines, '差分候補', 2);
  const contradictionHeading = findHeading(lines, '一次ソースとの矛盾', 2);

  const oldNewHeading = findHeading(lines, '旧表現→新表現', 2);
  let oldToNew = [];
  if (oldNewHeading >= 0) {
    const slice = sectionSlice(lines, oldNewHeading);
    const tables = parseTables(lines, slice.start, slice.end);
    for (const t of tables) {
      for (const row of t.rows) {
        if (row.cells.length < 2) continue;
        const oldVal = plain(row.cells[0]);
        const newVal = plain(row.cells[1]);
        if (oldVal === '' ) continue;
        oldToNew.push({ old: oldVal, new: newVal, line: row.line });
      }
    }
  }

  return {
    meta,
    oldToNew,
    hasDiffCandidates: diffHeading >= 0,
    hasContradictions: contradictionHeading >= 0,
  };
}
