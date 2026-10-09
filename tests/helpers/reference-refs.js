/**
 * 工程側（agents・rules・Skill・設計書・ガイド・lib・tools）から正典 canon-reference への参照を抜き出し、
 * canon-reference の実体（ファイル・節の見出し・V-/Q- ID・data の要素）で解決する。
 *
 * canon-reference は `/canon-update` で全ファイルを作り直すので、節番号や ID が変わっても工程側の参照は
 * 黙って切れる。`npm run reference-check` は canon-reference の内側しか見ないため、この照合で補う。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** 機能ファイルの名前（`references/features/<name>.md`）。 */
function featureNames(referenceDir) {
  return readdirSync(path.join(referenceDir, 'references', 'features'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

/** 解決に使う索引: references/ 配下の各ファイルの見出し・V-/Q- ID の集合・data の読み口。 */
export function buildReferenceIndex(referenceDir) {
  const headings = new Map(); // キーは references/ からの相対パス（例: `features/skills.md`）
  const ids = new Set();
  const refsRoot = path.join(referenceDir, 'references');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.name.endsWith('.md')) {
        const text = readFileSync(abs, 'utf8');
        headings.set(path.relative(refsRoot, abs).split(path.sep).join('/'), text.split('\n').filter((l) => /^#{1,6} /.test(l)));
        for (const m of text.matchAll(/\*\*([VQ]-[a-z0-9-]+-\d+)\*\*/g)) ids.add(m[1]);
      }
    }
  };
  walk(refsRoot);
  const dataCache = new Map();
  const data = (id) => {
    if (!dataCache.has(id)) {
      const abs = path.join(referenceDir, 'data', `${id}.json`);
      dataCache.set(id, existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : null);
    }
    return dataCache.get(id);
  };
  return { referenceDir, headings, ids, data, features: featureNames(referenceDir) };
}

/**
 * 1行から参照を抜き出す。返り値の要素:
 * - `{ type: 'section', file, section }`（`features/x.md §4`・`selection.md §1` など。file は references/ からの相対）
 * - `{ type: 'file', file }`（`canon-reference/references/...md`・`features/x.md`）
 * - `{ type: 'id', id }`（`V-skills-18` など）
 * - `{ type: 'data', file, collection, item }`（`` `paths:files/<id>` ``。data/ に無いファイル id は参照とみなさない）
 */
export function extractReferenceRefs(line, index) {
  const refs = [];
  const names = [...index.features, 'selection', 'patterns', 'quality'].join('|');
  // 節の参照。前置きは canon-reference の中のパスに限る（generation/references/skills.md などを拾わない）。
  const sectionRe = new RegExp(
    `(?<![\\w/-])(?:canon-reference/)?(?:references/)?(features/)?(${names})\\.md\`?\\s*(?:の\\s*)?§\\s*(\\d+(?:\\.\\d+)*)`,
    'g'
  );
  for (const m of line.matchAll(sectionRe)) {
    const isCross = ['selection', 'patterns', 'quality'].includes(m[2]);
    refs.push({ type: 'section', file: isCross ? `${m[2]}.md` : `features/${m[2]}.md`, section: m[3] });
  }
  for (const m of line.matchAll(/canon-reference\/references\/([\w/-]+\.md)/g)) refs.push({ type: 'file', file: m[1] });
  for (const m of line.matchAll(/(?<![\w/-])features\/([\w-]+)\.md/g)) refs.push({ type: 'file', file: `features/${m[1]}.md` });
  for (const m of line.matchAll(/\b([VQ]-[a-z0-9-]+-\d+)\b/g)) refs.push({ type: 'id', id: m[1] });
  for (const m of line.matchAll(/`([a-z][a-z-]*):([a-z][a-z0-9-]*)(?:\/([^`]+))?`/g)) {
    if (m[0].includes('${')) continue;
    if (index.data(m[1]) === null) continue;
    refs.push({ type: 'data', file: m[1], collection: m[2], item: m[3] ?? null });
  }
  return refs;
}

/** 参照が解決すれば null、しなければ理由の文字列。 */
export function resolveReferenceRef(ref, index) {
  if (ref.type === 'file') return index.headings.has(ref.file) ? null : `ファイル ${ref.file} が無い`;
  if (ref.type === 'section') {
    const hs = index.headings.get(ref.file);
    if (!hs) return `ファイル ${ref.file} が無い`;
    const re = new RegExp(`^#{2,6} ${ref.section.replace(/\./g, '\\.')}[.\\s]`);
    return hs.some((h) => re.test(h)) ? null : `${ref.file} に §${ref.section} の見出しが無い`;
  }
  if (ref.type === 'id') return index.ids.has(ref.id) ? null : `ID ${ref.id} が無い`;
  const coll = index.data(ref.file)?.collections?.[ref.collection];
  if (!coll) return `data ${ref.file}:${ref.collection} が無い`;
  if (ref.item !== null && !(coll.items ?? []).some((it) => it.id === ref.item)) {
    return `data ${ref.file}:${ref.collection} に要素 ${ref.item} が無い`;
  }
  return null;
}
