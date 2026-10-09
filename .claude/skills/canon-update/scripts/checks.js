/**
 * checks.js — 正典リファレンスの検査（references/build.md §8 の12項目のうち、スクリプトにするもの）。
 *
 * 検査はどれも `{ id, name, scanned, violations }` を返す。`scanned` は走査した件数で、0 件なら
 * 「対象が無かった」のであって合格ではない（run の側で違反に数える）。対象のリファレンスの場所は
 * 引数で受けるので、テストは一時コピーに故意の違反を入れて発火を確かめられる。
 *
 * - オフライン: 1・3・6・7・8・9・11
 * - ネットワーク（`--online`）: 2・4・5
 * - スクリプトにしない: 10（独立した2回の取得の一致。手順5の結果）・12（`npm test`）
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const FEATURE_HEADINGS = [
  '## 1. 概要',
  '## 2. 使う場面・使わない場面',
  '## 3. 仕様の要約',
  '## 4. 設計の指針',
  '## 5. 生成の規約',
  '## 6. 検証ルール',
  '## 7. 品質基準',
  '## 8. 出典',
];

const DOCS_BASE = 'https://code.claude.com/docs/en/';

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, ext));
    else if (name.endsWith(ext)) out.push(abs);
  }
  return out;
}

const read = (abs) => readFileSync(abs, 'utf8');

/** コードフェンスの中の行を除いた、(行番号, 行) の配列。 */
function proseLines(text) {
  const out = [];
  let fence = null;
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (m) {
      if (fence === null) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return;
    }
    if (fence === null) out.push([i + 1, line]);
  });
  return out;
}

/** リファレンスの構成。`root` は `canon-reference/` ディレクトリ。 */
function layout(root) {
  const dataDir = path.join(root, 'data');
  const refDir = path.join(root, 'references');
  return {
    root,
    dataFiles: existsSync(dataDir) ? walk(dataDir, '.json') : [],
    sourcesFile: path.join(root, 'sources.json'),
    skillFile: path.join(root, 'SKILL.md'),
    refFiles: existsSync(refDir) ? walk(refDir, '.md') : [],
    featureFiles: existsSync(path.join(refDir, 'features')) ? walk(path.join(refDir, 'features'), '.md') : [],
  };
}

const rel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

function loadJson(abs) {
  try {
    return { json: JSON.parse(read(abs)) };
  } catch (e) {
    return { error: e.message };
  }
}

/** data を `{ id → collections }` で読む。パースできないファイルは飛ばす（検査1が報告する）。 */
function loadData(L) {
  const data = new Map();
  for (const abs of L.dataFiles) {
    const { json } = loadJson(abs);
    if (json?.collections) data.set(json.id ?? path.basename(abs, '.json'), json.collections);
  }
  return data;
}

// ── オフライン ──────────────────────────────────────────────

/** 1. `data/*.json` と `sources.json` がすべてパースできる。 */
export function checkJson(root) {
  const L = layout(root);
  const files = [...L.dataFiles, L.sourcesFile];
  const violations = [];
  for (const abs of files) {
    if (!existsSync(abs)) { violations.push(`${rel(root, abs)}: ファイルが無い`); continue; }
    const r = loadJson(abs);
    if (r.error) violations.push(`${rel(root, abs)}: JSON としてパースできない（${r.error}）`);
  }
  return { id: 1, name: 'JSON がパースできる', scanned: files.length, violations };
}

/** 3. 全コレクションに `complete_basis`、`stated_total` があれば件数と一致。 */
export function checkCompleteness(root) {
  const L = layout(root);
  const violations = [];
  let scanned = 0;
  for (const abs of L.dataFiles) {
    const { json } = loadJson(abs);
    for (const [name, c] of Object.entries(json?.collections ?? {})) {
      scanned++;
      const where = `${rel(root, abs)} の ${name}`;
      if (typeof c.complete !== 'boolean') violations.push(`${where}: complete が真偽値でない`);
      if (typeof c.complete_basis !== 'string' || c.complete_basis.trim() === '') {
        violations.push(`${where}: complete_basis が無い（true でも false でも書く）`);
      }
      if (c.stated_total != null && c.stated_total !== (c.items ?? []).length) {
        violations.push(`${where}: stated_total ${c.stated_total} と items の件数 ${(c.items ?? []).length} が違う`);
      }
    }
  }
  return { id: 3, name: 'complete_basis と stated_total', scanned, violations };
}

/** 6. `features/*.md` が8つの見出しをこの順で持つ（コードフェンスの中は数えない）。 */
export function checkFeatureHeadings(root) {
  const L = layout(root);
  const violations = [];
  for (const abs of L.featureFiles) {
    const found = proseLines(read(abs)).map(([, l]) => l).filter((l) => /^## /.test(l)).map((l) => l.trimEnd());
    if (found.join('\n') !== FEATURE_HEADINGS.join('\n')) {
      violations.push(`${rel(root, abs)}: 見出しが想定と違う（実際: ${found.join(' / ') || 'なし'}）`);
    }
  }
  return { id: 6, name: '機能ファイルの8見出し', scanned: L.featureFiles.length, violations };
}

/** 7. 本文の data 参照 `<id>:<collection>[/<item>]` がすべて解決する。 */
export function checkDataRefs(root) {
  const L = layout(root);
  const data = loadData(L);
  const violations = [];
  let scanned = 0;
  for (const abs of [L.skillFile, ...L.refFiles].filter(existsSync)) {
    proseLines(read(abs)).forEach(([lineNo, line]) => {
      for (const m of line.matchAll(/`([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)(?:\/([^`]+))?`/g)) {
        const [, fileId, coll, item] = m;
        if (!data.has(fileId)) continue; // data のファイルでない `a:b`（スキーム名など）は参照ではない
        scanned++;
        const c = data.get(fileId)[coll];
        const where = `${rel(root, abs)}:${lineNo} ${m[0]}`;
        if (!c) violations.push(`${where}: コレクションが無い`);
        else if (item !== undefined && !(c.items ?? []).some((it) => it.id === item)) {
          violations.push(`${where}: 要素が無い`);
        }
      }
    });
  }
  return { id: 7, name: 'data 参照の解決', scanned, violations };
}

/** 8. `V-`・`Q-` の ID がファイル内で01からの連番、全体で一意。定義は `- **V-xxx-NN**:` の行。 */
export function checkRuleIds(root) {
  const L = layout(root);
  const violations = [];
  const seen = new Map();
  let scanned = 0;
  for (const abs of L.refFiles) {
    const counters = new Map();
    for (const [lineNo, line] of proseLines(read(abs))) {
      const m = line.match(/^\s*- \*\*([VQ])-([a-z][a-z0-9-]*)-(\d{2})\*\*[:：]/);
      if (!m) continue;
      scanned++;
      const [, kind, feat, nn] = m;
      const id = `${kind}-${feat}-${nn}`;
      const base = path.basename(abs, '.md');
      const expectFeat = base === 'quality' ? 'common' : base;
      const where = `${rel(root, abs)}:${lineNo} ${id}`;
      if (feat !== expectFeat) violations.push(`${where}: このファイルの ID は ${kind}-${expectFeat}-NN の形にする`);
      const key = `${kind}-${feat}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      if (Number(nn) !== next) violations.push(`${where}: 連番でない（${String(next).padStart(2, '0')} のはず）`);
      if (seen.has(id)) violations.push(`${where}: ${seen.get(id)} と重複`);
      else seen.set(id, `${rel(root, abs)}:${lineNo}`);
    }
  }
  return { id: 8, name: 'V-・Q- ID の連番と一意', scanned, violations };
}

const BANNED = [
  [/~~/, '取り消し線'],
  [/解決済/, '「解決済」'],
  [/[（(][^）)\n]*\d{4}-\d{2}-\d{2}[^）)\n]*[）)]/, '日付の注記'],
  [/(?<![A-Za-z0-9])L[1-5](?![A-Za-z0-9])/, '独自のレイヤー用語 L1〜L5'],
  [/[0-9２-９一二三四五]層構成|[0-9２-９一二三四五]層の/, '独自のレイヤー用語 N層'],
];

/** 9. 本文に日付の注記・「解決済」・取り消し線・独自のレイヤー用語が無い。 */
export function checkBannedWording(root) {
  const L = layout(root);
  const files = [L.skillFile, ...L.refFiles].filter(existsSync);
  const violations = [];
  for (const abs of files) {
    read(abs).split('\n').forEach((line, i) => {
      for (const [re, label] of BANNED) {
        if (re.test(line)) violations.push(`${rel(root, abs)}:${i + 1}: ${label}`);
      }
    });
  }
  return { id: 9, name: '禁止の語', scanned: files.length, violations };
}

/** 11. `SKILL.md` の索引が `references/` の全ファイルを指し、リンクが解決する。 */
export function checkSkillIndex(root) {
  const L = layout(root);
  const violations = [];
  if (!existsSync(L.skillFile)) {
    return { id: 11, name: 'SKILL.md の索引', scanned: 0, violations: ['SKILL.md が無い'] };
  }
  const text = read(L.skillFile);
  const mentioned = new Set();
  for (const m of text.matchAll(/`(references\/[^`\s<>]+\.md)`|\]\((references\/[^)\s#]+)(?:#[^)]*)?\)/g)) {
    mentioned.add(m[1] ?? m[2]);
  }
  for (const p of mentioned) {
    if (!existsSync(path.join(root, p))) violations.push(`SKILL.md が指す ${p} が実在しない`);
  }
  for (const abs of L.refFiles) {
    const p = rel(root, abs);
    if (!mentioned.has(p)) violations.push(`SKILL.md の索引に ${p} が無い`);
  }
  return { id: 11, name: 'SKILL.md の索引', scanned: L.refFiles.length, violations };
}

export const OFFLINE_CHECKS = [
  checkJson, checkCompleteness, checkFeatureHeadings, checkDataRefs, checkRuleIds, checkBannedWording, checkSkillIndex,
];

// ── ネットワーク ────────────────────────────────────────────

async function getText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const htmlUrl = (u) => u.replace(/\.md$/, '');

/** 2. data の全 `source` が detailed のページを指し、空でない anchor が公開ページの HTML の id に実在する。 */
export async function checkAnchors(root, get = getText) {
  const L = layout(root);
  const sources = loadJson(L.sourcesFile).json;
  const detailed = new Set((sources?.pages ?? []).filter((p) => p.treatment === 'detailed').map((p) => p.url));
  const violations = [];
  const htmlCache = new Map();
  let scanned = 0;
  const visit = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x) => visit(x, where));
    if (!v || typeof v !== 'object') return;
    if (v.source && typeof v.source === 'object' && 'url' in v.source) {
      scanned++;
      pending.push({ src: v.source, where });
    }
    for (const x of Object.values(v)) visit(x, where);
  };
  const pending = [];
  for (const abs of L.dataFiles) {
    const { json } = loadJson(abs);
    for (const [name, c] of Object.entries(json?.collections ?? {})) {
      for (const it of c.items ?? []) visit(it, `${rel(root, abs)} の ${name}/${it.id}`);
    }
  }
  for (const { src, where } of pending) {
    if (!detailed.has(src.url)) { violations.push(`${where}: source.url が detailed のページでない（${src.url}）`); continue; }
    if (typeof src.anchor !== 'string') { violations.push(`${where}: source.anchor が無い`); continue; }
    if (src.anchor === '') continue;
    const page = htmlUrl(src.url);
    if (!htmlCache.has(page)) {
      try { htmlCache.set(page, await get(page)); } catch (e) { htmlCache.set(page, null); violations.push(`取得できない: ${e.message}`); }
    }
    const html = htmlCache.get(page);
    if (html === null) continue;
    const id = src.anchor.replace(/^#/, '');
    if (!html.includes(`id="${id}"`)) violations.push(`${where}: ${page} に id="${id}" が無い`);
  }
  return { id: 2, name: 'anchor が公開ページに実在', scanned, violations };
}

/** 4. `sources.json` の `pages` が `llms.txt` の `/docs/en/` 配下の URL と過不足なく一致し、重複が無い。 */
export async function checkPages(root, get = getText) {
  const L = layout(root);
  const sources = loadJson(L.sourcesFile).json;
  const pages = (sources?.pages ?? []).map((p) => p.url);
  const violations = [];
  const llms = await get(sources?.llms_txt?.url ?? 'https://code.claude.com/docs/llms.txt');
  const official = new Set(
    [...llms.matchAll(/https:\/\/code\.claude\.com\/docs\/en\/[^\s)\]"']+/g)].map((m) => m[0].replace(/[.,;]+$/, '')),
  );
  const have = new Set(pages);
  if (have.size !== pages.length) violations.push(`pages に重複がある（${pages.length} 件中 一意 ${have.size} 件）`);
  for (const u of official) if (!have.has(u)) violations.push(`llms.txt にあるが pages に無い: ${u}`);
  for (const u of have) if (!official.has(u)) violations.push(`pages にあるが llms.txt に無い: ${u}`);
  if (sources?.llms_txt?.page_count !== have.size) {
    violations.push(`llms_txt.page_count ${sources?.llms_txt?.page_count} と pages の件数 ${have.size} が違う`);
  }
  return { id: 4, name: 'pages が llms.txt と一致', scanned: official.size, violations };
}

/** 5. `placeable_files` が `claude-directory` の File reference 表の全行と一致する。 */
export async function checkPlaceableFiles(root, get = getText) {
  const L = layout(root);
  const sources = loadJson(L.sourcesFile).json;
  const md = await get(`${DOCS_BASE}claude-directory.md`);
  const start = md.search(/^#{1,4}\s*File reference\s*$/m);
  const violations = [];
  if (start < 0) {
    return { id: 5, name: 'placeable_files が File reference 表と一致', scanned: 0, violations: ['claude-directory.md に File reference の節が見つからない'] };
  }
  const section = md.slice(start).split(/\n#{1,2}\s/).at(0);
  const official = new Set();
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*\[?`([^`]+)`/);
    if (m) official.add(m[1]);
  }
  const have = new Set((sources?.placeable_files ?? []).map((f) => f.file));
  for (const f of official) if (!have.has(f)) violations.push(`File reference にあるが placeable_files に無い: ${f}`);
  for (const f of have) if (!official.has(f)) violations.push(`placeable_files にあるが File reference に無い: ${f}`);
  return { id: 5, name: 'placeable_files が File reference 表と一致', scanned: official.size, violations };
}

export const ONLINE_CHECKS = [checkAnchors, checkPages, checkPlaceableFiles];
