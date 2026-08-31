/**
 * 正典 Markdown の決定論的パーサ（依存ゼロ・§14「不変土台」）。
 *
 * 設計方針:
 * - LLM を使わない純粋な構文解析のみ（§1.3「決定論と意味判断の分離」）。
 * - 抽出できたものには必ず出典（file:line）を添える（§11.4 トレーサビリティ）。
 * - 「見つからない」は黙って null を返さず、呼び出し側が throw できるよう明示的に表現する。
 *   silent empty は vacuous pass の温床（§11.5）。
 */

/** 抽出値と出典のペア。照合表の全リーフはこの形を取る。 */
export function sourced(value, file, line, note) {
  const s = { value, source: `${file}:${line}` };
  if (note) s.note = note;
  return s;
}

/**
 * フェンス済みコードブロック内の行に印を付ける。
 *
 * これが無いと、正典の yaml ブロック内にある `# === 必須 ===` が
 * 「レベル1見出し」として誤認され、節の範囲が壊れる（実際に踏んだ）。
 * 見出し・表を探す全スキャナはこのマスクを尊重しなければならない。
 * フェンス行そのものも構造ではないので印を付ける。
 */
export function computeFenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (m) {
      if (open === null) {
        open = m[1][0].repeat(3);
        mask[i] = true;
        continue;
      }
      if (m[1].startsWith(open) && m[2].trim() === '') {
        mask[i] = true;
        open = null;
        continue;
      }
    }
    if (open !== null) mask[i] = true;
  }
  return mask;
}

/**
 * 見出し行を探す。level は '#' の個数。コードブロック内は無視する。
 * @returns {number} 0-based 行番号。見つからなければ -1。
 */
export function findHeading(lines, text, level = null, mask = null) {
  const fence = mask ?? computeFenceMask(lines);
  const prefix = level ? `${'#'.repeat(level)} ` : null;
  for (let i = 0; i < lines.length; i++) {
    if (fence[i]) continue;
    const l = lines[i];
    if (!l.startsWith('#')) continue;
    const m = l.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    if (prefix && !l.startsWith(prefix)) continue;
    if (m[2].trim() === text || m[2].includes(text)) return i;
  }
  return -1;
}

/** 見出し行から、同レベル以上の次の見出しの直前までを返す。コードブロック内は無視する。 */
export function sectionSlice(lines, headingIdx, mask = null) {
  const fence = mask ?? computeFenceMask(lines);
  const m = lines[headingIdx].match(/^(#{1,6})\s/);
  const level = m ? m[1].length : 6;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (fence[i]) continue;
    const mm = lines[i].match(/^(#{1,6})\s/);
    if (mm && mm[1].length <= level) {
      return { start: headingIdx, end: i };
    }
  }
  return { start: headingIdx, end: lines.length };
}

/**
 * 範囲内の最初のフェンス済みコードブロックを返す。
 * @returns {{lang:string, body:string[], start:number, end:number}|null}
 */
export function firstFencedBlock(lines, start, end, lang = null) {
  for (let i = start; i < end; i++) {
    const m = lines[i].match(/^```(\w*)\s*$/);
    if (!m) continue;
    if (lang && m[1] !== lang) continue;
    for (let j = i + 1; j < end; j++) {
      if (/^```\s*$/.test(lines[j])) {
        return { lang: m[1], body: lines.slice(i + 1, j), start: i + 1, end: j };
      }
    }
  }
  return null;
}

/**
 * 範囲内の GFM テーブルをすべて返す。
 * ヘッダ行 + 区切り行 + 本体行 を1テーブルとみなす。
 * 各行は絶対行番号 `line` を持つ（出典記録のため）。
 */
export function parseTables(lines, start, end, mask = null) {
  const fence = mask ?? computeFenceMask(lines);
  const tables = [];
  for (let i = start; i < end - 1; i++) {
    if (fence[i]) continue;
    if (!lines[i].trim().startsWith('|')) continue;
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < end; j++) {
      if (!lines[j].trim().startsWith('|')) break;
      rows.push({ cells: splitRow(lines[j]), line: j + 1 });
    }
    tables.push({ header, rows, headerLine: i + 1 });
    i = j;
  }
  return tables;
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map((c) => c.trim());
}

/** セル中のバッククォート囲みトークンを列挙する。`a`/`b` や `a`, `b` の双方に効く。 */
export function backtickTokens(s) {
  const out = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

/** 太字/バッククォートなどの装飾を剥がす。 */
export function plain(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

// ---------------------------------------------------------------------------
// 章立て Markdown 内の入れ子リスト（requirements.md・spec.md・系統A/B の書式）
//
// 正典の frontmatter ではないため artifact.js の parseFrontmatter は使えない。
// G1（工程順・状態）が最初に必要としたが、eval の判定入力バンドル生成（§16.3）も
// 同じ書式を読む。列挙・パース規則が2箇所に分かれると片方だけが仕様に追従する
// 単一障害点になる（lessons L005）ため、共有ライブラリへ集約する。
// ---------------------------------------------------------------------------

/** 値の後ろに続く ` # コメント` を落とす。 */
export function stripInlineComment(s) {
  const idx = s.search(/\s#/);
  return idx === -1 ? s : s.slice(0, idx);
}

/** `<advisory|deterministic|enforced>` のような未充填プレースホルダは null（未記入扱い）。 */
export function unwrapValue(raw) {
  let t = stripInlineComment(raw).trim();
  if (t === '') return null;
  if (/^<.*>$/.test(t)) return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  return t;
}

/**
 * `- id: R1` で始まり、より深いインデントの `key: value` が続くレコード列をパースする。
 * @returns {{fields: Object<string,string|null>, line: number}[]} line は 1-based。
 */
export function parseBulletRecords(lines, start, end) {
  const records = [];
  let current = null;
  let bulletIndent = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) continue;
    const bulletMatch = line.match(/^(\s*)-\s+([A-Za-z_][\w-]*):\s?(.*)$/);
    if (bulletMatch) {
      const [, indent, key, val] = bulletMatch;
      current = { fields: {}, line: i + 1 };
      current.fields[key] = unwrapValue(val);
      bulletIndent = indent.length;
      records.push(current);
      continue;
    }
    const fieldMatch = line.match(/^(\s*)([A-Za-z_][\w-]*):\s?(.*)$/);
    if (fieldMatch && current) {
      const [, indent, key, val] = fieldMatch;
      if (bulletIndent !== null && indent.length > bulletIndent) {
        current.fields[key] = unwrapValue(val);
      }
    }
  }
  return records;
}

/** `[a, b]` または単一値を配列化する（frontmatter の splitListValue と同型だが独立実装）。 */
export function parseListLike(raw) {
  const t = stripInlineComment(raw).trim();
  if (t === '') return [];
  if (/^\[.*\]$/.test(t)) {
    const inner = t.slice(1, -1).trim();
    if (inner === '') return [];
    return inner
      .split(',')
      .map((s) => unwrapValue(s))
      .filter((s) => s !== null && s !== '');
  }
  const v = unwrapValue(t);
  return v === null ? [] : [v];
}

const LINE_SUFFIX_RE = /:\d+(-\d+)?$/;

/**
 * `evidence_paths` 項目の末尾行番号 suffix（`:N` / `:N-M`）を剥がし、実在照合できる裸パスを返す
 * （詳細設計書 §6.2「evidence_paths の書式契約」）。suffix が無ければそのまま返す。
 * Windows のドライブレター（`C:/x/y.js`）を suffix と誤認しないよう、末尾が数値（範囲も可）の
 * コロン区切りに限定してマッチする（`^[A-Za-z]:` は `\d` にマッチしないため安全）。
 */
export function stripLineSuffix(item) {
  return item.replace(LINE_SUFFIX_RE, '');
}

/**
 * 値末尾の括弧書き注記（全角/半角、1段のみ）を除去する。
 * `confirmed_version: v2.1.251（2026-08-28。出典補記）` のように出典裏取り日等を
 * インライン併記されても、後続の完全一致照合が壊れないための緩衝（ネスト括弧は対象外）。
 */
export function stripTrailingAnnotation(value) {
  return value.replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim();
}
