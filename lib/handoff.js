/**
 * lib/handoff.js — `work/<ts>/handoff.md`（architecture.md §6）の frontmatter の読み書き。
 *
 * handoff.md は run の状態を持つ唯一のファイルで、本文はオーケストレーターが直接編集する。
 * スクリプトが読むのは frontmatter（ts・target・mode・phase・status）だけで、本文は解釈しない。
 */

import { parseFrontmatter } from './artifact.js';

export const HANDOFF_FILE = 'handoff.md';
export const HANDOFF_KEYS = ['ts', 'target', 'mode', 'phase', 'status'];
export const MODES = ['new', 'refactor'];

/**
 * handoff.md の本文から frontmatter の値を取り出す。frontmatter が無ければ null。
 * @returns {{ts?:string, target?:string, mode?:string, phase?:string, status?:string}|null}
 */
export function parseHandoff(text) {
  const fm = parseFrontmatter(text);
  if (!fm.present) return null;
  const out = {};
  for (const k of HANDOFF_KEYS) {
    const v = fm.frontmatter[k]?.value;
    if (v !== undefined && v !== '') out[k] = String(v);
  }
  return out;
}

/** new-run.js が書く handoff.md の雛形（architecture.md §6.2 の frontmatter と5節）。 */
export function renderHandoff({ ts, target, mode }) {
  return [
    '---',
    `ts: ${ts}`,
    `target: ${target}`,
    `mode: ${mode}`,
    'phase: A',
    'status: in_progress',
    '---',
    '',
    '## 進捗',
    '',
    '- [ ] 工程1 調査①（existing・profile）',
    '- [ ] 工程2 要件ヒアリング → P1',
    '- [ ] 工程3 調査②（focused）',
    '- [ ] 工程4 spec → P2',
    '',
    '## 承認',
    '',
    '| ゲート | 日時 | 対象ファイル | sha256(先頭12) | 要旨 |',
    '|---|---|---|---|---|',
    '',
    '## 差し戻し',
    '',
    '## 申し送り',
    '',
    '## canon 課題候補',
    '',
  ].join('\n');
}
