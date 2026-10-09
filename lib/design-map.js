/**
 * lib/design-map.js — design-map.md のパーサ（artifacts.md §5）。
 *
 * `## 既存判定` の existing_disposition は V7・copy-keep・review-bundle・emit-manifest が、
 * 機能の節（`## <機能>`・lib/features.js）の宣言は V8・slice・emit-manifest が共有する。existing_disposition は
 * リスト＋ネストの半構造 YAML であり、artifact.js の frontmatter パーサ（単一行値のみ・
 * ネスト非対応）では読めない。ゆえに markdown.js の見出し/フェンス抽出＋行正規表現で自前
 * パースする（依存ゼロ）。「見つからない／0件」は黙って通さず throw する。
 */

import { FEATURES } from './features.js';
import { findHeading, sectionSlice, firstFencedBlock, matchPathHeading, computeFenceMask } from './markdown.js';

export class DesignMapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DesignMapError';
  }
}

/**
 * `disposition` の正式な値語彙（artifacts.md §6.2）。`keep`/`modify`/`merge`/`retire` の4値のいずれにも
 * 当てはまらない実体（canon の管理集合外だが設計判断としては言及したいもの。例: `tasks/` 配下）
 * を表す第5の値として `out_of_scope` を正式採用する——`retire` にすると配置時に削除され、
 * `keep`/`modify` にすると V8 が管理集合外として弾くという板挟みを、designer が独自の値
 * （契約に無い値）を発明して切り抜けた実例がある。
 */
export const DISPOSITION_VALUES = ['keep', 'modify', 'merge', 'retire', 'out_of_scope'];

/**
 * 配置のたびに emit-manifest.js が作り直す生成物 README（artifacts.md §7.3）。どの builder も書かないので、
 * どの機能にも属さず、宣言された生成物（listDeclaredArtifacts・targets-*.txt）にも入れない。
 * 既存の README を design-map が modify と宣言した場合のレコードは disposition-other.md に入る。
 */
export const GENERATED_README_REL = '.claude/README.md';

/** existing_disposition を置く節の見出し（artifacts.md §5.2。`## 既存判定（…）` のような注記付きも拾う）。 */
export const DISPOSITION_HEADING = '既存判定';

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
 * 素通しする。`manifest_note: >` の後続行が空扱いされる footgun を防ぐ。
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
  const h = findHeading(lines, DISPOSITION_HEADING, 2);
  if (h === -1) {
    throw new DesignMapError(
      `design-map に「## ${DISPOSITION_HEADING}」節が無い（artifacts.md §5.2）。空表を黙って通さない。`
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
    // 行末インラインコメント（`# 根拠…`）を許容する。許容しないと、コメント付きの K 行が
    // 下の `^\s*\w+:` に落ちて keep_conditions ブロックを早期クローズし K1〜K5 が全滅する。
    const cM = line.match(/^\s*(K[1-5])_\w+:\s*(true|false)\s*(?:#.*)?$/);
    if (inKeep && cM) {
      cur.keep_conditions[cM[1]] = cM[2] === 'true';
      continue;
    }

    const dispM = line.match(/^\s*disposition:\s*([^\s#]+)/); // `keep-ish` を `keep` と読まない（語彙の検査は V7）
    if (dispM) {
      cur.disposition = dispM[1];
      inKeep = false;
      continue;
    }
    // interface_change: none|breaking（modify のみ有効・artifacts.md §5.3）。
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
      'existing_disposition にレコードが無い（0件を成功と誤認しない）。'
    );
  }
  return records;
}

// ---------------------------------------------------------------------------
// 宣言された生成物の一覧（design-map ⇒ generated の突合・V8 と slice の共有 SSoT）
// ---------------------------------------------------------------------------

/**
 * design-map の機能ごとの節（見出しは機能名で始める）。`bareName` は `### \`X\`` の X が名前だけのとき、
 * どのパスへ展開するか。skills・subagents は名前だけの見出しがありうる
 * （`### \`contract-agent\`` → `.claude/agents/contract-agent/contract-agent.md`）。ほかは実パスで書く。
 */
const BARE_NAMES = {
  skills: (n) => `.claude/skills/${n}/SKILL.md`,
  subagents: (n) => `.claude/agents/${n}/${n}.md`,
};
export const FEATURE_SECTIONS = FEATURES.map((f) => ({ heading: f, feature: f, bareName: BARE_NAMES[f] ?? null }));

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
 * 機能の節（`FEATURE_SECTIONS` の heading）の範囲。ちょうど `name` の見出しを優先し、無ければ `name` で
 * 始まり直後が英数字・`-` でない見出し（`## rules（builder）` 等）を採る。designer は括弧書きを付けて書くため、
 * 完全一致だけだと機能の節を1つも拾えず、宣言0件のまま V8 が vacuous pass する（artifacts.md §5.4）。
 */
export function featureSection(lines, name, mask = computeFenceMask(lines)) {
  const exact = h2Section(lines, name, mask);
  if (exact) return exact;
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^##\s+(.*?)\s*$/);
    if (m && m[1].startsWith(name) && !/^[A-Za-z0-9-]/.test(m[1].slice(name.length))) {
      const { start, end } = sectionSlice(lines, i, mask);
      return { start, end };
    }
  }
  return null;
}

/** design-map に見つかった機能の節の数（0 なら見出しの照合が効いていない＝宣言の抽出が vacuous）。 */
export function countFeatureSections(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  return FEATURE_SECTIONS.filter((sec) => featureSection(lines, sec.heading, mask) !== null).length;
}

/**
 * design-map が「生成される」と宣言している成果物のパス一覧。次の和集合:
 *   (a) 機能ごとの節（`## <機能>`。`## rules（builder）` 等も可・featureSection）の見出し ``### `パス` ``
 *   (b) existing_disposition のうち keep／modify のレコード（keep は原本の verbatim コピーとして
 *       generated/ に置かれる。retire・merge（統合される側）・out_of_scope は generated/ に置かれない）
 * 見出しの注記に `retire`／`廃止` が含まれるものは除く。ディレクトリ・glob 表記は除く。
 *
 * @returns {{ path: string, source: 'feature-heading'|'disposition', feature: string|null, annotation: string }[]}
 *   path は重複排除済み・posix・先頭 `./` 無し。
 */
export function listDeclaredArtifacts(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const seen = new Map();
  const add = (p, source, feature, annotation) => {
    const key = norm(p);
    if (!key || key.endsWith('/') || /[*?]/.test(key)) return;
    if (key === GENERATED_README_REL) return; // emit-manifest.js が書く。builder の宣言ではない
    if (!seen.has(key)) seen.set(key, { path: key, source, feature, annotation });
  };

  for (const sec of FEATURE_SECTIONS) {
    const range = featureSection(lines, sec.heading, mask);
    if (!range) continue;
    for (let i = range.start + 1; i < range.end; i++) {
      if (mask[i]) continue;
      const m = lines[i].match(/^###\s+`([^`]+)`\s*(.*)$/);
      if (!m) continue;
      const annotation = m[2];
      if (/retire|廃止/.test(annotation)) continue;
      const token = m[1].trim();
      const isPathLike = token.includes('/') || /\.[A-Za-z0-9]+$/.test(token);
      if (isPathLike) add(token, 'feature-heading', sec.feature, annotation);
      else if (sec.bareName) add(sec.bareName(token), 'feature-heading', sec.feature, annotation);
    }
  }

  let records = [];
  try {
    records = parseExistingDisposition(text);
  } catch (err) {
    if (!(err instanceof DesignMapError)) throw err;
    // 既存判定が無い design-map（new モード）は disposition 由来の宣言が無いだけ。
  }
  for (const r of records) {
    if (r.disposition === 'keep' || r.disposition === 'modify') add(r.path, 'disposition', null, r.disposition);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// design-map の節の切り出し（canon-c/scripts/slice.js の材料）
// ---------------------------------------------------------------------------

/**
 * existing_disposition の YAML ブロックを、レコードごとの**生テキスト**へ分割する
 * （再シリアライズしない——ビルダーが読む記述を1文字も変えないため）。
 * @returns {{ path: string, raw: string }[]} 見つからない／0件のときは空配列（呼び出し側が扱いを決める）。
 */
export function splitDispositionRecords(text) {
  const lines = text.split(/\r?\n/);
  const h = findHeading(lines, DISPOSITION_HEADING, 2);
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

// ---------------------------------------------------------------------------
// 管理パス外の変更（artifacts.md §5.2・§5.6）
// ---------------------------------------------------------------------------

export const OUTSIDE_CHANGES_HEADING = '管理パス外の変更';

/** 1件ごとに必ず書く欄（`- <欄>:` の箇条書き）。 */
export const OUTSIDE_CHANGE_FIELDS = ['要件', '変更内容', '根拠', '確認', '撤回条件', '撤回したら直す生成物'];

/**
 * `## 管理パス外の変更` の各項目（``### <ID> `<対象パス>` <要約>``）を読む。
 * 節が無い・本文が「なし」なら空配列。欄の値は解釈せず、欄があるかどうかだけを返す。
 * @returns {{heading: string, path: string|null, line: number, missing: string[], body: string}[]}
 */
export function parseOutsideChanges(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const sec = h2Section(lines, OUTSIDE_CHANGES_HEADING, mask);
  if (!sec) return [];
  const items = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const body = cur.lines.join('\n');
    cur.missing = OUTSIDE_CHANGE_FIELDS.filter((f) => !new RegExp(`^\\s*-\\s+${f}\\s*[:：]`, 'm').test(body));
    cur.body = body;
    delete cur.lines;
    items.push(cur);
  };
  for (let i = sec.start + 1; i < sec.end; i++) {
    const m = !mask[i] && lines[i].match(/^###\s+(.*?)\s*$/);
    if (m) {
      close();
      const p = m[1].match(/`([^`]+)`/);
      cur = { heading: m[1], path: p ? norm(p[1]) : null, line: i + 1, lines: [] };
    } else if (cur) {
      cur.lines.push(lines[i]);
    }
  }
  close();
  return items;
}

// ---------------------------------------------------------------------------
// 参照元からのコピー（artifacts.md §5.2・§6.1）
// ---------------------------------------------------------------------------

export const REFERENCE_COPIES_HEADING = '参照元からのコピー';

/**
 * `## 参照元からのコピー`（任意の節）の各行 `<参照元の絶対パス> → <生成先の相対パス>` を読む。
 * 節が無ければ []（任意の節）。矢印は `→` か `->`。パスのバッククォートは外す。矢印を持たない
 * 箇条書き行は `to: null` で返し、判定（NG にするか）は呼び出し側に任せる。
 *
 * @returns {{from:string|null, to:string|null, line:number}[]}
 */
export function parseReferenceCopies(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const range = h2Section(lines, REFERENCE_COPIES_HEADING, mask);
  if (!range) return [];
  const out = [];
  for (let i = range.start + 1; i < range.end; i++) {
    const m = lines[i].match(/^\s*[-*]\s+(.*\S)\s*$/);
    if (!m) continue;
    const parts = m[1].split(/\s*(?:→|->)\s*/);
    const strip = (v) => v.trim().replace(/^`+|`+$/g, '');
    if (parts.length === 2 && strip(parts[0]) && strip(parts[1])) {
      out.push({ from: strip(parts[0]), to: norm(strip(parts[1])), line: i + 1 });
    } else {
      out.push({ from: strip(parts[0]), to: null, line: i + 1 });
    }
  }
  return out;
}
