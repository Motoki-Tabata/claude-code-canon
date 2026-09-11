/**
 * gates/lib/design-map.js — design-map.md の existing_disposition パーサ（§9.2）。
 *
 * G2（維持判定妥当性）と G8（非退行）が共有する。design-map の existing_disposition は
 * リスト＋ネストの半構造 YAML であり、artifact.js の frontmatter パーサ（単一行値のみ・
 * ネスト非対応）では読めない。ゆえに markdown.js の見出し/フェンス抽出＋行正規表現で自前
 * パースする（依存ゼロ・§14）。「見つからない／0件」は黙って通さず throw する（§11.5）。
 */

import { findHeading, sectionSlice, firstFencedBlock, matchPathHeading } from './markdown.js';

export class DesignMapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DesignMapError';
  }
}

/**
 * `disposition` の正式な値語彙（S3-2）。`keep`/`modify`/`merge`/`retire` の4値のいずれにも
 * 当てはまらない実体（canon の管理集合外だが設計判断としては言及したいもの。例: `tasks/` 配下）
 * を表す第5の値として `out_of_scope` を正式採用する——`retire` にすると配置時に削除され、
 * `keep`/`modify` にすると G9 が管理集合外として弾くという板挟みを、designer が独自の値
 * （契約に無い値）を発明して切り抜けた実例がある（ライブ run `20260910_220906`）。
 * G2（`checkG2`）が値語彙そのものを検査する（旧実装は不正値を素通りさせていた）。
 */
export const DISPOSITION_VALUES = ['keep', 'modify', 'merge', 'retire', 'out_of_scope'];

function strip(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}
function norm(s) {
  return strip(s).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** 行の先頭インデント（空白数）。 */
function indentOf(s) {
  return s.length - s.replace(/^\s+/, '').length;
}

/**
 * 値が YAML ブロックスカラー指示子（`>` / `|`・chomp 修飾 `+`/`-` 付き）だけのとき、
 * キー行より深いインデントの後続行を畳み込んで1つの値にする。通常のインライン値なら
 * 素通し（従来挙動）。F3: `manifest_note: >` の後続行が空扱いされる footgun を解消する。
 * @returns {{ value: string, nextIndex: number }} nextIndex は畳み込んだ最後の行の index
 *   （呼び出し側の for ループが i++ で次行へ進む前提）。
 */
function foldBlockScalar(rawValue, lines, keyIdx, keyIndent) {
  if (!/^[|>][+-]?$/.test(rawValue.trim())) return { value: rawValue, nextIndex: keyIdx };
  const parts = [];
  let j = keyIdx + 1;
  for (; j < lines.length; j++) {
    if (lines[j].trim() === '') continue; // 空行は区切りにしない（内容が続きうる）
    if (indentOf(lines[j]) <= keyIndent) break; // 同/浅インデント＝ブロック終端
    parts.push(lines[j].trim());
  }
  return { value: parts.join(' '), nextIndex: j - 1 };
}

/**
 * design-map.md 本文から existing_disposition レコードを抽出する。
 * @returns {{path,disposition,keep_conditions:Object|null,reason_code,superseded_by,manifest_note,interface_change:string|null}[]}
 */
export function parseExistingDisposition(text) {
  const lines = text.split(/\r?\n/);
  const h = findHeading(lines, 'existing_disposition');
  if (h === -1) {
    throw new DesignMapError(
      'design-map に「existing_disposition」見出しが無い（§9.2）。空表を黙って通さない（§11.5）。'
    );
  }
  const { start, end } = sectionSlice(lines, h);
  const block = firstFencedBlock(lines, start, end);
  const body = block ? block.body : lines.slice(start + 1, end);

  const records = [];
  let cur = null;
  let inKeep = false;
  const flush = () => {
    if (cur) records.push(cur);
  };

  for (let i = 0; i < body.length; i++) {
    const raw = body[i];
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '' || /^\s*#/.test(line) || /^\s*existing_disposition\s*:/.test(line)) continue;

    const head = matchPathHeading(line);
    if (head) {
      flush();
      cur = {
        path: norm(head.path),
        disposition: null,
        keep_conditions: null,
        reason_code: null,
        superseded_by: null,
        manifest_note: null,
        interface_change: null,
      };
      inKeep = false;
      continue;
    }
    if (!cur) continue;

    if (/^\s*keep_conditions\s*:/.test(line)) {
      cur.keep_conditions = {};
      inKeep = true;
      continue;
    }
    // 行末インラインコメント（`# 根拠…`）を許容する。許容しないと、コメント付き C 行が
    // 下の `^\s*\w+:` に落ちて keep_conditions ブロックを早期クローズし C1〜C5 が全滅する（F3）。
    const cM = line.match(/^\s*(C[1-5])_\w+:\s*(true|false)\s*(?:#.*)?$/);
    if (inKeep && cM) {
      cur.keep_conditions[cM[1]] = cM[2] === 'true';
      continue;
    }

    const dispM = line.match(/^\s*disposition:\s*(\w+)/);
    if (dispM) {
      cur.disposition = dispM[1];
      inKeep = false;
      continue;
    }
    // interface_change: none|breaking（modify のみ有効・§9.2・§11.2）。
    const icM = line.match(/^\s*interface_change:\s*(.+?)\s*(?:#.*)?$/);
    if (icM) {
      cur.interface_change = strip(icM[1]);
      inKeep = false;
      continue;
    }
    const rcM = line.match(/^\s*reason_code:\s*(.+?)\s*$/);
    if (rcM) {
      cur.reason_code = strip(rcM[1]);
      inKeep = false;
      continue;
    }
    const sbM = line.match(/^\s*superseded_by:\s*(.+?)\s*$/);
    if (sbM) {
      const f = foldBlockScalar(sbM[1], body, i, indentOf(raw));
      cur.superseded_by = norm(f.value);
      i = f.nextIndex;
      inKeep = false;
      continue;
    }
    const mnM = line.match(/^\s*manifest_note:\s*(.+?)\s*$/);
    if (mnM) {
      const f = foldBlockScalar(mnM[1], body, i, indentOf(raw));
      cur.manifest_note = strip(f.value);
      i = f.nextIndex;
      inKeep = false;
      continue;
    }
    // rationale 等の他キーは keep_conditions ブロックを閉じるだけ
    if (/^\s*\w+:/.test(line)) inKeep = false;
  }
  flush();

  if (records.length === 0) {
    throw new DesignMapError(
      'existing_disposition にレコードが無い（0件を成功と誤認しない・§11.5）。'
    );
  }
  return records;
}
