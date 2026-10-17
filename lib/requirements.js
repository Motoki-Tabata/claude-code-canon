/**
 * lib/requirements.js — `work/<ts>/requirements.md` の決定論パーサ（書式は design/architecture.md §4）。
 *
 * check と verify の V8（constraints）が判定入力に使う。書式は「章立て Markdown 内の入れ子リスト」であり
 * 正典 frontmatter ではないため artifact.js の parseFrontmatter は使えない（ネスト非対応）。
 * markdown.js の共有プリミティブ（findHeading / sectionSlice / parseBulletRecords）を土台に、
 * constraints / conflicts 固有の形だけを本ファイルで扱う（依存ゼロ）。判定は一切しない（構文分解のみ）。
 *
 * 「見つからない／0件」は黙って空を返さず throw する。
 * 呼び出し側が「制約が書かれていない」を「制約なし＝合格」と読む経路を作らないため。
 */

import {
  findHeading,
  sectionSlice,
  parseBulletRecords,
  stripInlineComment,
  unwrapValue,
} from './markdown.js';

export class RequirementsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequirementsError';
  }
}

/** `{ allowed: false, reason: "..." }` のインライン形から key: value を拾う。 */
function parseInlineMapping(inner) {
  const out = {};
  // 値がクォート内にカンマを含みうる（reason: "a, b"）ので、単純 split をしない。
  const re = /([A-Za-z_][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,}]*)/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    out[m[1]] = unwrapValue(m[2]) ?? '';
  }
  return out;
}

/** true / false 以外は null（＝不正。呼び出し側が違反にする）。 */
function toBool(raw) {
  if (raw === undefined || raw === null) return null;
  const t = String(raw).trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return null;
}

/**
 * `constraints:` ブロックをパースする。
 * インライン形（`hooks: { allowed: false, reason: "..." }`）と複数行形
 *   hooks:
 *     allowed: false
 *     reason: "..."
 * の双方を読む。allowed を持たないキー（organization_policy 等の自由文）は
 * `allowed: undefined` を持つ freeform エントリとして返す（違反にするかは呼び出し側の判断）。
 *
 * @returns {{key,allowed,allowedRaw,reason,freeform,line}[]}
 */
function parseConstraintsBlock(lines, start, end) {
  const idx = lines.findIndex(
    (l, i) => i >= start && i < end && /^\s*constraints\s*:\s*$/.test(stripInlineComment(l))
  );
  if (idx === -1) return null;

  const entries = [];
  const baseIndent = lines[idx].match(/^(\s*)/)[1].length;
  let cur = null;
  let last = idx;
  for (let i = idx + 1; i < end; i++) {
    const raw = lines[i];
    if (/^\s*$/.test(raw)) continue;
    if (/^\s*#/.test(raw)) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent) break; // ブロック終端（次のトップレベルキー・見出し等）
    last = i;

    const m = stripInlineComment(raw).match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;

    // 継続行（キーより深いインデント＝複数行形の子キー）
    if (cur && indent > cur.indent) {
      if (key === 'allowed') {
        cur.entry.allowedRaw = rest.trim();
        cur.entry.allowed = toBool(rest);
      } else if (key === 'reason') {
        cur.entry.reason = unwrapValue(rest) ?? '';
      }
      continue;
    }

    const inline = rest.trim().match(/^\{(.*)\}$/);
    const entry = {
      key,
      allowed: undefined,
      allowedRaw: undefined,
      reason: null,
      freeform: false,
      line: i + 1,
    };
    if (inline) {
      const fields = parseInlineMapping(inline[1]);
      entry.allowedRaw = fields.allowed;
      entry.allowed = toBool(fields.allowed);
      if (fields.allowed === undefined) entry.freeform = true;
      entry.reason = fields.reason ?? null;
    } else if (rest.trim() === '') {
      // 複数行形の見出し行。子キーは次のループで拾う。
    } else {
      // `organization_policy: "自由文"` のように allowed を持たない自由文キー。
      entry.freeform = true;
      entry.reason = unwrapValue(rest) ?? '';
    }
    entries.push(entry);
    cur = { entry, indent };
  }

  // 複数行形で allowed が最後まで現れなかったキーは自由文扱いにする（判断は呼び出し側）。
  for (const e of entries) {
    if (e.allowed === undefined && e.allowedRaw === undefined && !e.freeform) e.freeform = true;
  }
  entries.range = { start: idx, last };
  return entries;
}

/**
 * ブロック（`key:` に続く、より深いインデントの本体）の終端行を返す。
 * 見出し行・同レベル以下のキー行で閉じる。閉じないと後続節の bullet まで
 * 取り込んでしまい、無関係なレコードが conflicts として数えられる。
 */
function blockEnd(lines, headIdx, end) {
  const baseIndent = lines[headIdx].match(/^(\s*)/)[1].length;
  for (let i = headIdx + 1; i < end; i++) {
    const raw = lines[i];
    if (/^\s*$/.test(raw)) continue;
    if (/^#{1,6}\s/.test(raw)) return i;
    const indent = raw.match(/^(\s*)/)[1].length;
    if (indent <= baseIndent && !/^\s*-\s/.test(raw)) return i;
  }
  return end;
}

/** `conflicts:` の `- requirement: ... / constraint: ... / note: ...` を読む。 */
function parseConflictsBlock(lines, start, end) {
  const idx = lines.findIndex(
    (l, i) => i >= start && i < end && /^\s*conflicts\s*:\s*(\[\s*\])?\s*$/.test(stripInlineComment(l))
  );
  if (idx === -1) return null;
  if (/\[/.test(lines[idx])) return []; // `conflicts: []`（空と明示。ブロックが無いのとは別）
  const records = parseBulletRecords(lines, idx + 1, blockEnd(lines, idx, end));
  return records.map((r) => ({
    requirement: r.fields.requirement ?? null,
    constraint: r.fields.constraint ?? null,
    note: r.fields.note ?? null,
    line: r.line,
  }));
}

/** `[a, b]` 形の値を配列にする。無い・空は []。 */
export function parseListValue(raw) {
  if (raw === undefined || raw === null) return [];
  const inner = String(raw).trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''))
    .filter(Boolean);
}

/**
 * 節の中の要件レコード（`- id: R1` で始まる）を読む。bytes は、レコード自身の行（次のレコードの直前まで）の
 * UTF-8 バイト数で、check がサイズの上限を数える。
 */
function parseRecords(lines, range) {
  const recs = parseBulletRecords(lines, range.start + 1, range.end);
  return recs.map((r, i) => {
    const endLine = i + 1 < recs.length ? recs[i + 1].line - 1 : range.end;
    return {
      id: r.fields.id ?? null,
      want: r.fields.want ?? null,
      confidence: r.fields.confidence ?? null,
      evidence: r.fields.evidence ?? null,
      files: parseListValue(r.fields.files),
      accept: r.fields.accept ?? null,
      strength_needed: r.fields.strength_needed ?? null,
      line: r.line,
      bytes: Buffer.byteLength(lines.slice(r.line - 1, endLine).join('\n').replace(/\s+$/, ''), 'utf8'),
    };
  });
}

/**
 * requirements.md 全体を構造化する。
 * @returns {{requirements:Array, pending:Array, constraints:Array, conflicts:Array|null, constraintsFound:boolean, constraintsBytes:number, bytes:number}}
 * @throws {RequirementsError} 必須の節が無い／要件0件のとき（0件を黙って通さない）
 */
export function parseRequirementsDoc(text) {
  const lines = text.split(/\r?\n/);

  // ## 確定要件
  const hReq = findHeading(lines, '確定要件');
  if (hReq === -1) {
    throw new RequirementsError('requirements.md に「## 確定要件」節が無い。空を黙って通さない。');
  }
  const reqRange = sectionSlice(lines, hReq);
  const requirements = parseRecords(lines, reqRange);
  if (requirements.length === 0) {
    throw new RequirementsError('「## 確定要件」に1件もレコードが無い（要件0件は requirements.md として不正）。');
  }

  // constraints / conflicts は節見出しの文言が揺れうる（「## 使用可能なカスタマイズ機能」など）ため、
  // 見出しでなく**キー行**（`constraints:` / `conflicts:`）を文書全体から探す。見出し名に依存すると
  // 表記揺れで検査が沈黙する。
  const constraints = parseConstraintsBlock(lines, 0, lines.length);
  const conflicts = parseConflictsBlock(lines, 0, lines.length);

  // 確定していない要件（任意の節。「文言のみ」はここに置く）
  const hPending = findHeading(lines, '未確定', 2);
  const pending = hPending === -1 ? [] : parseRecords(lines, sectionSlice(lines, hPending));
  const bytesOf = (a, b) => Buffer.byteLength(lines.slice(a, b + 1).join('\n'), 'utf8');
  const constraintsBytes = constraints ? bytesOf(constraints.range.start, constraints.range.last) : 0;

  return {
    requirements,
    pending,
    constraintsBytes,
    bytes: Buffer.byteLength(text, 'utf8'),
    constraints: constraints ?? [],
    constraintsFound: constraints !== null,
    conflicts, // null＝conflicts ブロック自体が無い（空リストとは区別する）
  };
}

/**
 * `## メタ` の `confirmed_at`（合意した時刻・`YYYY-MM-DD hh:mm`・ローカル時刻）を読む。
 * 行が無ければ null。形が違えば `at: null` で返し、判定は呼び出し側に任せる。
 * @returns {{raw:string, at:Date|null}|null}
 */
export function parseConfirmedAt(text) {
  const m = /^confirmed_at:[ \t]*(.*?)[ \t]*$/m.exec(text);
  if (!m) return null;
  const raw = m[1];
  const d = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(raw);
  if (!d) return { raw, at: null };
  const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(d[4]), Number(d[5]));
  // 2026-02-30 のような実在しない日時は Date が繰り上げるので、組み立て直して一致しなければ不正とする
  const valid = at.getFullYear() === Number(d[1]) && at.getMonth() === Number(d[2]) - 1 && at.getDate() === Number(d[3]) &&
    at.getHours() === Number(d[4]) && at.getMinutes() === Number(d[5]);
  return { raw, at: valid ? at : null };
}

/**
 * `## 参照元`（任意の節）を読む。移植の基準にする別プロジェクトの一式の置き場所。
 * 節が無ければ []（任意の節なので、無いことは異常でない）。節があるのにパスを持たないレコードは
 * `path: null` で返し、判定は呼び出し側（tools/check.js）に任せる。
 *
 * @returns {{path:string|null, role:string|null, line:number}[]}
 */
export function parseReferenceSources(text) {
  const lines = text.split(/\r?\n/);
  const h = findHeading(lines, '参照元', 2);
  if (h === -1) return [];
  const range = sectionSlice(lines, h);
  return parseBulletRecords(lines, range.start + 1, range.end).map((r) => ({
    path: r.fields.path ?? null,
    role: r.fields.role ?? null,
    line: r.line,
  }));
}
