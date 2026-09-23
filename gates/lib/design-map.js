/**
 * gates/lib/design-map.js — design-map.md の existing_disposition パーサ（§9.2）。
 *
 * G2（維持判定妥当性）と G8（非退行）が共有する。design-map の existing_disposition は
 * リスト＋ネストの半構造 YAML であり、artifact.js の frontmatter パーサ（単一行値のみ・
 * ネスト非対応）では読めない。ゆえに markdown.js の見出し/フェンス抽出＋行正規表現で自前
 * パースする（依存ゼロ・§14）。「見つからない／0件」は黙って通さず throw する（§11.5）。
 */

import { findHeading, sectionSlice, firstFencedBlock, matchPathHeading, computeFenceMask } from './markdown.js';

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

// ---------------------------------------------------------------------------
// 宣言された生成物の一覧（design-map ⇒ generated の逆方向突合・G9 と slice の共有 SSoT）
// ---------------------------------------------------------------------------

/**
 * design-map の層ごとの節。`kind` は `### \`X\`` の X が名前だけのとき、どのパスへ展開するか。
 * L1・L4・L5 の見出しは実パスで書かれる。Skills・Agents は名前だけの見出しがありうる
 * （`### \`contract-agent\`` → `.claude/agents/contract-agent/contract-agent.md`）。
 */
export const LAYER_SECTIONS = [
  { heading: 'L1', layer: 'L1', bareName: null },
  { heading: 'Skills', layer: 'L2', bareName: (n) => `.claude/skills/${n}/SKILL.md` },
  { heading: 'Agents', layer: 'L3', bareName: (n) => `.claude/agents/${n}/${n}.md` },
  { heading: 'L4', layer: 'L4', bareName: null },
  { heading: 'L5', layer: 'L5', bareName: null },
];

/** 見出しレベル2のちょうど `name` の節（コードブロック内は無視）。無ければ null。 */
export function h2Section(lines, name, mask = computeFenceMask(lines)) {
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (m && m[1] === name) {
      const { start, end } = sectionSlice(lines, i, mask);
      return { start, end };
    }
  }
  return null;
}

/**
 * design-map が「生成される」と宣言している成果物のパス一覧。次の和集合:
 *   (a) 層ごとの節（`## L1`・`## Skills`・`## Agents`・`## L4`・`## L5`）の見出し ``### `パス` ``
 *   (b) existing_disposition のうち keep／modify のレコード（keep は原本の verbatim コピーとして
 *       generated/ に置かれる。retire・merge（統合される側）・out_of_scope は generated/ に置かれない）
 * 見出しの注記に `retire`／`廃止` が含まれるものは除く。ディレクトリ・glob 表記は除く。
 *
 * @returns {{ path: string, source: 'layer-heading'|'disposition', layer: string|null, annotation: string }[]}
 *   path は重複排除済み・posix・先頭 `./` 無し。
 */
export function listDeclaredArtifacts(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const seen = new Map();
  const add = (p, source, layer, annotation) => {
    const key = norm(p);
    if (!key || key.endsWith('/') || /[*?]/.test(key)) return;
    if (!seen.has(key)) seen.set(key, { path: key, source, layer, annotation });
  };

  for (const sec of LAYER_SECTIONS) {
    const range = h2Section(lines, sec.heading, mask);
    if (!range) continue;
    for (let i = range.start + 1; i < range.end; i++) {
      if (mask[i]) continue;
      const m = lines[i].match(/^###\s+`([^`]+)`\s*(.*)$/);
      if (!m) continue;
      const annotation = m[2];
      if (/retire|廃止/.test(annotation)) continue;
      const token = m[1].trim();
      const isPathLike = token.includes('/') || /\.[A-Za-z0-9]+$/.test(token);
      if (isPathLike) add(token, 'layer-heading', sec.layer, annotation);
      else if (sec.bareName) add(sec.bareName(token), 'layer-heading', sec.layer, annotation);
    }
  }

  let records = [];
  try {
    records = parseExistingDisposition(text);
  } catch (err) {
    if (!(err instanceof DesignMapError)) throw err;
    // existing_disposition が無い design-map（新規シナリオ）は disposition 由来の宣言が無いだけ。
  }
  for (const r of records) {
    if (r.disposition === 'keep' || r.disposition === 'modify') add(r.path, 'disposition', null, r.disposition);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// design-map の節の切り出し（tools/slice-design-map.js の材料）
// ---------------------------------------------------------------------------

/**
 * existing_disposition の YAML ブロックを、レコードごとの**生テキスト**へ分割する
 * （再シリアライズしない——ビルダーが読む記述を1文字も変えないため）。
 * @returns {{ path: string, raw: string }[]} 見つからない／0件のときは空配列（呼び出し側が扱いを決める）。
 */
export function splitDispositionRecords(text) {
  const lines = text.split(/\r?\n/);
  const h = findHeading(lines, 'existing_disposition');
  if (h === -1) return [];
  const { start, end } = sectionSlice(lines, h);
  const block = firstFencedBlock(lines, start, end);
  if (!block) return [];
  const body = block.body;
  const out = [];
  let cur = null;
  for (const raw of body) {
    const head = matchPathHeading(raw.replace(/\s+$/, ''));
    if (head) {
      if (cur) out.push({ path: cur.path, raw: cur.lines.join('\n') });
      cur = { path: norm(head.path), lines: [raw] };
    } else if (cur) {
      cur.lines.push(raw);
    }
  }
  if (cur) out.push({ path: cur.path, raw: cur.lines.join('\n') });
  return out;
}

/** パスがどの層のビルダー／担当に属するか（層の節の見出しが無いパスの分類に使う）。 */
export function layerOfPath(p) {
  const q = norm(p);
  if (q === 'CLAUDE.md' || q.startsWith('.claude/rules/')) return 'L1';
  if (q.startsWith('.claude/skills/')) return 'L2';
  if (q.startsWith('.claude/agents/')) return 'L3';
  if (q === '.claude/README.md') return 'L5';
  if (q === '.claude/settings.json' || q === '.mcp.json' || q.startsWith('.claude/hooks/')) return 'L4';
  return 'other';
}

/** `## <prefix>…` で始まる（レベル2）節の全文（見出し行を含む）。無ければ null。 */
export function h2SectionText(lines, prefix, mask = computeFenceMask(lines)) {
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (m && m[1].startsWith(prefix)) {
      const { start, end } = sectionSlice(lines, i, mask);
      return lines.slice(start, end).join('\n').replace(/\s+$/, '');
    }
  }
  return null;
}
