/**
 * lib/tables.js — 正典リファレンスの data（`.claude/skills/canon-reference/data/*.json`）の読み口。
 *
 * 検査モジュールは data をここから引き、置き場所への相対パスや data の形を各自で持たない。
 * 参照は canon-reference の書式 `<ファイルのid>:<コレクション>[/<要素のid>]` で書く
 * （canon-reference/SKILL.md「data/ の参照」）。要素の id には `:` や `/` が含まれうるので、
 * 最初の `:` の後の最初の `/` までをコレクションとする。
 *
 * - **complete**: `false` のコレクションに無い名前を「存在しない」と扱わない。照合して一致しない
 *   名前は違反でなく未判定にする（canon-reference/references/quality.md の V-common-01）。
 *   その分岐の材料として `complete` を返す。
 * - **値の正規化**: 一部のコレクション（例: `frontmatter:plugin-agent`）は、フィールドの値を
 *   `{ value, source }` の形で持つ。`plain()` で中身の値だけを取り出してから使う。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from './canon.js';

export const REFERENCE_DIR = path.join(CANON_ROOT, '.claude', 'skills', 'canon-reference');
const DATA_DIR = path.join(REFERENCE_DIR, 'data');

const files = new Map();

function dataFile(id) {
  if (!files.has(id)) {
    const abs = path.join(DATA_DIR, `${id}.json`);
    files.set(id, JSON.parse(readFileSync(abs, 'utf8')));
  }
  return files.get(id);
}

/** `{ value, source }` で包まれた値の中身を返す。包まれていなければそのまま返す。 */
export function plain(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) return v.value;
  return v;
}

/**
 * コレクションを引く。返り値: `{ ref, complete, items, byId }`。
 * @param {string} ref `<ファイルのid>:<コレクション>`（例: `frontmatter:subagent`）
 */
export function collection(ref) {
  const i = ref.indexOf(':');
  if (i < 0) throw new Error(`data の参照の形が不正: ${ref}（<ファイルのid>:<コレクション> で書く）`);
  const fileId = ref.slice(0, i);
  const name = ref.slice(i + 1);
  const c = dataFile(fileId).collections?.[name];
  if (!c) throw new Error(`data にコレクションが無い: ${ref}`);
  const items = c.items ?? [];
  return { ref, complete: c.complete === true, items, byId: new Map(items.map((it) => [it.id, it])) };
}

/**
 * 出典の文字列。検証ルールの ID（`quality.md` と各機能ファイル §6）と、判定に使った data の参照を
 * 並べる。例: `canon-reference V-subagents-04（frontmatter:subagent）`。
 */
export function cite(ruleId, ref) {
  return ref ? `canon-reference ${ruleId}（${ref}）` : `canon-reference ${ruleId}`;
}
