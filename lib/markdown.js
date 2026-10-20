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

/** 太字/バッククォートなどの装飾を剥がす。 */
export function plain(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

// ---------------------------------------------------------------------------
// 章立て Markdown 内の入れ子リスト（requirements.md の書式）
//
// 正典の frontmatter ではないため artifact.js の parseFrontmatter は使えない。
// check と verify が同じ書式を読む。列挙・パース規則が2箇所に分かれると片方だけが仕様に追従する
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
// 識別子境界の照合（部分文字列一致による偽陽性の回避）
//
// 素の `text.includes(token)` は `R1` が `R11` に、内部専用 Skill 名が公開コンポーネント名の
// 部分文字列であるときに公開側の正しい記載へ一致する（`.claude/rules/checks-and-tests.md`
// 「判定対象の識別子自身への自己一致を疑う」）。check と verify で共有する。
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
