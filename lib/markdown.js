/**
 * 正典 Markdown と run の成果物の決定論的パーサ（依存ゼロ）。
 *
 * 設計方針:
 * - LLM を使わない純粋な構文解析のみ（architecture.md §1.3「決定論と意味判断の分離」）。
 * - 抽出できたものには必ず出典（file:line）を添える（検査結果のトレーサビリティ）。
 * - 「見つからない」は黙って null を返さず、呼び出し側が throw できるよう明示的に表現する。
 *   silent empty は vacuous pass の温床。
 */

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
  let open = null; // { ch: '`' | '~', len: 開きフェンスの長さ }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (m) {
      if (open === null) {
        open = { ch: m[1][0], len: m[1].length };
        mask[i] = true;
        continue;
      }
      // 閉じは「同じ文字で、開き以上の長さで、後ろに文字が無い」行だけ（CommonMark）。
      if (m[1][0] === open.ch && m[1].length >= open.len && m[2].trim() === '') {
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
 * 見出し行を探す（完全一致、または先頭一致）。level は '#' の個数。コードブロック内は無視する。
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
    // 完全一致、または先頭一致で直後が語の続きでないもの（`2.1 Skills（…）` のような括弧書きの注記は許す）。
    // 部分一致（includes）だと、語を含むだけの別の見出しに先に当たる。
    const title = m[2].trim();
    if (title === text || (title.startsWith(text) && /^[^\p{L}\p{N}_]/u.test(title.slice(text.length)))) return i;
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
// 章立て Markdown 内の入れ子リスト（requirements.md・spec.md・investigation の書式）
//
// 正典の frontmatter ではないため artifact.js の parseFrontmatter は使えない。
// V9 と review-bundle が同じ書式を読む。列挙・パース規則が2箇所に分かれると片方だけが仕様に追従する
// 単一障害点になるため、共有ライブラリへ集約する。
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

// ---------------------------------------------------------------------------
// `- path: <値>` レコード見出し（investigation の existing.md・design-map.md の
// existing_disposition が共有する書式）
// ---------------------------------------------------------------------------

/**
 * `- path: <値>` 見出し行をパースする。
 *
 * 【なぜ `$` アンカーを使わないか】調査が
 * `- path: X / feature: plugins / kind: settings / strength: mandatory（…）` のような**1行形式**で
 * 書いた場合、`(.+?)\s*$` は非貪欲でも `$` アンカーのため結局行末まで取り込み、`path` の値が
 * ` / feature: … ` ごと汚染される。ここでは値をクォート文字列、または空白（` / ` の手前）までの
 * 非空白トークンとして切り出すため、1行形式でも汚染されない。`lib/investigation.js`（existing.md）と
 * `lib/design-map.js`（design-map の existing_disposition）が共有する（同じ判定ロジックを複製しない）。
 *
 * @returns {{path: string, rest: string}|null} rest は path 以降の残り文字列
 *   （1行形式の inline `key: value` 抽出に使う。無ければ空文字）。
 */
export function matchPathHeading(line) {
  const m = line.match(/^\s*-\s*path:\s*(?:"([^"]*)"|'([^']*)'|(\S+))(.*)$/);
  if (!m) return null;
  return { path: m[1] ?? m[2] ?? m[3], rest: m[4] ?? '' };
}

/**
 * `matchPathHeading` の `rest`（先頭が ` / key: value ...`）から、1行形式の inline フィールドを
 * 分解する（existing.md の `feature`/`kind`/`strength` 用）。値に `/` が含まれても、直後に
 * `識別子:` が続かない限り区切りとみなさないため、通常の散文値（かっこ書きの注記等）は壊れない。
 * @returns {Object<string,string>}
 */
export function parseInlineSlashFields(rest) {
  const out = {};
  const trimmed = String(rest ?? '').replace(/^\s*\/\s*/, '');
  if (trimmed.trim() === '') return out;
  const parts = trimmed.split(/\s*\/\s*(?=[A-Za-z_][\w]*\s*:)/);
  for (const part of parts) {
    const m = part.match(/^([A-Za-z_][\w]*)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// 識別子境界の照合（部分文字列一致による偽陽性の回避）
//
// 素の `text.includes(token)` は `R1` が `R11` に、内部専用 Skill 名が公開コンポーネント名の
// 部分文字列であるときに公開側の正しい記載へ一致する（`.claude/rules/checks-and-tests.md`
// 「判定対象の識別子自身への自己一致を疑う」）。V9 と README の判定で共有する。
// ---------------------------------------------------------------------------

/** 正規表現メタ文字を literal へ落とす。 */
function escapeRe(token) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** token が識別子境界で出現するか（`R1` が `R11` に一致しないように）。 */
export function mentionsIdentifier(text, token) {
  if (typeof text !== 'string' || !token) return false;
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(token)}([^A-Za-z0-9_]|$)`).test(text);
}

/**
 * `/名前` 形式のスラッシュコマンド表記が出現するか（起動方法の案内の機械的な代理）。
 *
 * 直前が `[A-Za-z0-9_./\\-]` のもの（`skills/impact-scope` のパス区切り）と、直後が
 * `/` のもの（`/docker/init` のような絶対パス）は起動案内でないため除外する。
 */
export function mentionsSlashCommand(text, token) {
  if (typeof text !== 'string' || !token) return false;
  return new RegExp(`(^|[^A-Za-z0-9_./\\\\-])/${escapeRe(token)}(?![A-Za-z0-9_/\\\\-])`).test(text);
}
