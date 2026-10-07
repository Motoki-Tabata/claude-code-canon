#!/usr/bin/env node
/**
 * check.js（npm run check -- <ts> requirements|spec|design-map）— Phase A・B の成果物の機械点検。
 *
 * 点検の中身（要件の件数・§9 が空か・mandatory の対応・K1〜K5 など）は機械で判定できる。
 * オーケストレーターが大きいファイルを何度も読み直さずに済むよう、既存のパーサ
 * （lib/requirements.js・lib/design-map.js・lib/markdown.js）だけで項目ごとに OK / NG を出す。
 * 判定の追加はここに足し、パーサは複製しない。
 *
 * exit 0 すべて OK／exit 1 NG あり（対象のファイルが無い・パースできないも NG）／exit 2 引数不正。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import {
  LAYER_SECTIONS,
  layerSection,
  listDeclaredArtifacts,
  parseExistingDisposition,
  parseOutsideChanges,
  parseReferenceCopies,
  h2Section,
  DesignMapError,
} from '../lib/design-map.js';
import { parseExisting } from '../lib/investigation.js';
import { isManaged } from '../lib/managed-paths.js';
import { computeFenceMask, findHeading, sectionSlice } from '../lib/markdown.js';
import { parseReferenceSources, parseRequirementsDoc, RequirementsError } from '../lib/requirements.js';
import { isMainModule, isValidTs } from '../lib/run.js';

export const TARGETS = ['requirements', 'spec', 'design-map'];

const ok = (name, detail = '') => ({ name, ok: true, detail });
const ng = (name, detail) => ({ name, ok: false, detail });
const cond = (name, pass, detailOk, detailNg) => (pass ? ok(name, detailOk) : ng(name, detailNg));

function tally(items) {
  const m = new Map();
  for (const v of items) m.set(v ?? '(未記入)', (m.get(v ?? '(未記入)') ?? 0) + 1);
  return [...m].map(([k, n]) => `${k} ${n}`).join('・') || 'なし';
}

function readOrNull(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// ---------------------------------------------------------------------------
// requirements
// ---------------------------------------------------------------------------

export function checkRequirements(text) {
  let doc;
  try {
    doc = parseRequirementsDoc(text);
  } catch (e) {
    if (!(e instanceof RequirementsError)) throw e;
    return [ng('requirements.md の構文', e.message)];
  }
  const items = [];
  const reqs = doc.requirements;
  items.push(ok('要件の件数', `${reqs.length}件`));
  const bad = reqs.filter((r) => !r.id || !r.want || !r.strength_needed || !r.priority);
  items.push(cond('要件の必須欄（id・want・strength_needed・priority）', bad.length === 0, '全件そろっている',
    `欠けた要件: ${bad.map((r) => r.id ?? `L${r.line}`).join('・')}`));
  const badStrength = reqs.filter((r) => !['advisory', 'deterministic', 'enforced'].includes(r.strength_needed));
  items.push(cond('strength_needed の語彙', badStrength.length === 0, `強度: ${tally(reqs.map((r) => r.strength_needed))}`,
    `語彙外: ${badStrength.map((r) => `${r.id}=${r.strength_needed}`).join('・')}`));
  const badPri = reqs.filter((r) => !['must', 'should', 'could'].includes(r.priority));
  items.push(cond('priority の語彙', badPri.length === 0, `優先度: ${tally(reqs.map((r) => r.priority))}`,
    `語彙外: ${badPri.map((r) => `${r.id}=${r.priority}`).join('・')}`));
  const ids = reqs.map((r) => r.id);
  const dup = ids.filter((v, i) => v && ids.indexOf(v) !== i);
  items.push(cond('要件 id の一意', dup.length === 0, '重複なし', `重複: ${[...new Set(dup)].join('・')}`));

  items.push(cond('constraints', doc.constraintsFound && doc.constraints.length > 0,
    doc.constraints.map((c) => `${c.key}=${c.freeform ? '自由文' : c.allowed}`).join('・'),
    'constraints ブロックが無い、または空'));
  const badC = doc.constraints.filter((c) => !c.freeform && c.allowed === null);
  items.push(cond('constraints の allowed は true / false', badC.length === 0, '', `不正: ${badC.map((c) => c.key).join('・')}`));
  items.push(cond('conflicts', doc.conflicts !== null,
    doc.conflicts?.length ? `${doc.conflicts.length}件（未解消）` : '空（[]）', 'conflicts ブロックが無い（無ければ `conflicts: []` と書く）'));
  const withOutside = reqs.filter((r) => r.outside_managed.length > 0);
  items.push(ok('outside_managed を持つ要件', withOutside.length ? withOutside.map((r) => r.id).join('・') : 'なし'));
  const refs = parseReferenceSources(text);
  if (refs.length > 0) {
    const noPath = refs.filter((r) => !r.path || !path.isAbsolute(r.path));
    items.push(cond('参照元のパス', noPath.length === 0, `${refs.length}件（絶対パス）`,
      `絶対パスの path が無い参照元: ${noPath.map((r) => `L${r.line}`).join('・')}`));
    const gone = refs.filter((r) => r.path && path.isAbsolute(r.path) && !existsSync(r.path));
    items.push(cond('参照元の実在', gone.length === 0, '全件が実在する', `実在しない: ${gone.map((r) => r.path).join('・')}`));
  } else {
    items.push(ok('参照元', 'なし（任意の節）'));
  }
  return items;
}

// ---------------------------------------------------------------------------
// spec
// ---------------------------------------------------------------------------

const EMPTY_SECTION_RE = /^[\s（(]*(なし|無し|ありません|該当なし)[\s。.）)]*$/;

export function checkSpec(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const items = [];

  const h9 = findHeading(lines, '§9', 2, mask);
  if (h9 === -1) {
    items.push(ng('§9 未決事項', '節が無い'));
  } else {
    const { start, end } = sectionSlice(lines, h9, mask);
    const body = lines.slice(start + 1, end).map((l) => l.trim()).filter(Boolean);
    // 「なし。〜」で始まる散文は、なしと言ったうえで補足を書いたものとして空扱いにする。
    const empty = body.length === 0 || /^(なし|無し)[。.]/.test(body[0]) || body.every((l) => EMPTY_SECTION_RE.test(l));
    items.push(cond('§9 未決事項が空', empty, '空（なし）', `未決の論点が残っている（${body.length}行。先頭: ${body[0]}）`));
  }

  const h8 = findHeading(lines, '§8', 2, mask);
  if (h8 === -1) {
    items.push(ng('§8 受入基準', '節が無い'));
  } else {
    const { start, end } = sectionSlice(lines, h8, mask);
    const crit = lines.slice(start + 1, end).filter((l) => /^\s*-\s+A\d+-\d+\s*[:：]/.test(l));
    const mand = crit.filter((l) => /\[mandatory\]/.test(l));
    items.push(cond('§8 受入基準の件数', crit.length > 0, `${crit.length}件`, '受入基準（`- A1-1:` の行）が0件'));
    items.push(cond('§8 に [mandatory] がある', mand.length > 0, `${mand.length}件`, '[mandatory] の基準が0件'));
  }
  return items;
}

/** spec §8 の `[mandatory]` の基準 ID（A1-1 形）。 */
export function mandatoryIds(specText) {
  const lines = specText.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const h8 = findHeading(lines, '§8', 2, mask);
  if (h8 === -1) return [];
  const { start, end } = sectionSlice(lines, h8, mask);
  const out = [];
  for (const l of lines.slice(start + 1, end)) {
    const m = l.match(/^\s*-\s+(A\d+-\d+)\s*[:：]/);
    if (m && /\[mandatory\]/.test(l)) out.push(m[1]);
  }
  return out;
}

/** 本文に現れる基準 ID。`A1-1〜A1-4` の範囲表記は展開する。 */
export function mentionedIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(/(A\d+)-(\d+)\s*[〜~～-]\s*(?:(A\d+)-)?(\d+)/g)) {
    if (m[3] && m[3] !== m[1]) continue;
    for (let n = Number(m[2]); n <= Number(m[4]); n++) ids.add(`${m[1]}-${n}`);
  }
  for (const m of text.matchAll(/A\d+-\d+/g)) ids.add(m[0]);
  return ids;
}

// ---------------------------------------------------------------------------
// design-map
// ---------------------------------------------------------------------------

const LAYER_LABELS = { L1: /CLAUDE\.md|Rules/i, L2: /Skills/i, L3: /Subagents/i, L4: /Hooks|settings|MCP/i, L5: /Plugins/i };

/** `## Used Features` で builder を起動すると書かれた層（`builder を起動する層: L1・L2・L3` の行）。 */
function builderLayers(featuresText) {
  const m = featuresText.match(/builder を起動する層\s*[:：]\s*(.+)/);
  if (!m) return null;
  // 「L5 は起動しない」のような否定の節は除く。
  const head = m[1].split(/[。]/)[0];
  const set = new Set([...head.matchAll(/L[1-5]/g)].map((x) => x[0]));
  return set;
}

export function checkDesignMap(text, { spec = null, existing = null, requirements = null } = {}) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const items = [];

  // Used Features
  const feat = h2Section(lines, 'Used Features', mask);
  let layers = null;
  if (!feat) {
    items.push(ng('## Used Features', '節が無い（Phase C は builder を起動する層をこの節で決める）'));
  } else {
    const body = lines.slice(feat.start + 1, feat.end).join('\n');
    layers = builderLayers(body);
    items.push(cond('## Used Features', layers && layers.size > 0,
      `builder を起動する層: ${[...(layers ?? [])].join('・')}`, '「builder を起動する層: L1・L2…」の行が無い'));
  }

  // 層の節と宣言
  const declared = listDeclaredArtifacts(text);
  for (const sec of LAYER_SECTIONS) {
    const used = layers ? layers.has(sec.layer) : null;
    const range = layerSection(lines, sec.heading, mask);
    const n = declared.filter((d) => d.layer === sec.layer).length;
    if (used === false && !range) continue;
    if (used === true || range) {
      items.push(cond(`## ${sec.heading} の節と宣言`, !!range && n > 0, `${n}件を宣言`,
        range ? '生成物の宣言（### `パス`）が0件' : '使う層なのに節が無い'));
    }
  }

  // 既存判定
  let records = [];
  try {
    records = parseExistingDisposition(text);
  } catch (e) {
    if (!(e instanceof DesignMapError)) throw e;
    records = null;
    // 既存のカスタマイズが0件（new）なら既存判定が無くてよい。existing.md が読めない・既存があるのに節が無いのは NG。
    const hasExisting = existing === null || parseExisting(existing).size > 0;
    items.push(hasExisting ? ng('## 既存判定', e.message) : ok('## 既存判定', '節なし（existing.md の既存が0件 = new）'));
  }
  if (records) {
    items.push(ok('既存判定の件数', `${records.length}件（${tally(records.map((r) => r.disposition))}）`));
    if (existing !== null) {
      const ex = parseExisting(existing);
      const paths = new Set(records.map((r) => r.path));
      const missing = [...ex.keys()].filter((p) => !paths.has(p));
      items.push(cond('existing.md との件数照合', missing.length === 0,
        `existing ${ex.size}件・既存判定 ${records.length}件（取りこぼしなし）`,
        `既存判定に無い既存ファイル ${missing.length}件: ${missing.slice(0, 5).join('・')}${missing.length > 5 ? '…' : ''}`));
    }
    const badDisp = records.filter((r) => !['keep', 'modify', 'merge', 'retire', 'out_of_scope'].includes(r.disposition));
    items.push(cond('disposition の語彙', badDisp.length === 0, '', `語彙外: ${badDisp.map((r) => r.path).join('・')}`));
    const keeps = records.filter((r) => r.disposition === 'keep');
    const badK = keeps.filter((r) => !r.keep_conditions || ['K1', 'K2', 'K3', 'K4', 'K5'].some((k) => r.keep_conditions[k] !== true));
    items.push(cond('keep の K1〜K5', badK.length === 0, `keep ${keeps.length}件すべて K1〜K5 が true`,
      `K1〜K5 が欠ける・false: ${badK.map((r) => r.path).join('・')}`));
    const needNote = records.filter((r) => r.disposition === 'retire' || r.disposition === 'merge');
    const noNote = needNote.filter((r) => !r.manifest_note);
    items.push(cond('retire・merge の manifest_note', noNote.length === 0, `${needNote.length}件に記載あり`,
      `無い: ${noNote.map((r) => r.path).join('・')}`));
  }

  // 参照元からのコピー（任意の節）
  const copies = parseReferenceCopies(text);
  if (copies.length > 0) {
    const declaredSet = new Set(declared.map((d) => d.path));
    const bad = copies.filter((c) => !c.to || !path.isAbsolute(c.from ?? '') || !isManaged(c.to));
    items.push(cond('## 参照元からのコピーの書式', bad.length === 0, `${copies.length}件（<絶対パス> → <管理パス内の相対パス>）`,
      `書式不正・生成先が管理パス外: ${bad.map((c) => `L${c.line}`).join('・')}`));
    const undeclared = copies.filter((c) => c.to && isManaged(c.to) && !declaredSet.has(c.to));
    items.push(cond('参照元からのコピーの生成先が層の節に宣言されている', undeclared.length === 0, '全件が宣言されている',
      `未宣言（V8 が止める）: ${undeclared.map((c) => c.to).join('・')}`));
    if (requirements !== null) {
      const roots = parseReferenceSources(requirements).map((s) => s.path).filter(Boolean).map((p) => path.resolve(p));
      const outside = copies.filter((c) => c.from && path.isAbsolute(c.from) && !roots.some((r) => {
        const rel = path.relative(r, path.resolve(c.from));
        return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
      }));
      items.push(cond('コピー元が requirements.md の `## 参照元` の配下', outside.length === 0, '全件が配下にある',
        `配下でない（copy-keep が止める）: ${outside.map((c) => c.from).join('・')}`));
    }
  }

  // Write Scopes
  const ws = h2Section(lines, 'Write Scopes', mask);
  const wsBody = ws ? lines.slice(ws.start + 1, ws.end).join('').trim() : '';
  items.push(cond('## Write Scopes', !!ws && wsBody.length > 0, 'あり', ws ? '節が空' : '節が無い（見出しは完全一致）'));

  // mandatory の対応
  if (spec !== null) {
    const ids = mandatoryIds(spec);
    const mapH = h2Section(lines, '要件→生成物の対応', mask);
    if (!mapH) {
      items.push(ng('mandatory の対応', '## 要件→生成物の対応 が無い'));
    } else {
      const seen = mentionedIds(lines.slice(mapH.start + 1, mapH.end).join('\n'));
      const miss = ids.filter((id) => !seen.has(id));
      items.push(cond('spec §8 の [mandatory] の対応', miss.length === 0, `${ids.length}件すべて対応表に現れる`,
        `対応表に無い: ${miss.join('・')}`));
    }
  } else {
    items.push(ng('spec §8 の [mandatory] の対応', 'output/<ts>/spec.md が無く照合できない'));
  }

  // requirements との照合
  if (requirements !== null) {
    let doc = null;
    try {
      doc = parseRequirementsDoc(requirements);
    } catch (e) {
      if (!(e instanceof RequirementsError)) throw e;
      items.push(ng('requirements.md の構文', e.message));
    }
    if (doc) {
      const denied = doc.constraints.filter((c) => c.allowed === false).map((c) => c.key);
      const hits = [];
      const decl = (re) => declared.filter((d) => re.test(d.path)).map((d) => d.path);
      if (denied.includes('hooks')) hits.push(...decl(/^\.claude\/hooks\//).map((p) => `hooks 禁止: ${p}`));
      if (denied.includes('mcp')) hits.push(...decl(/(^|\/)\.mcp\.json$/).map((p) => `mcp 禁止: ${p}`));
      if (denied.includes('plugins')) hits.push(...declared.filter((d) => d.layer === 'L5' || /^plugin\//.test(d.path)).map((d) => `plugins 禁止: ${d.path}`));
      const expSec = h2Section(lines, 'Experimental Dependencies', mask);
      if (denied.includes('experimental') && expSec) {
        const b = lines.slice(expSec.start + 1, expSec.end).join('\n').trim();
        if (b && !/^(なし|無し|N\/A)/.test(b)) hits.push('experimental 禁止: ## Experimental Dependencies に記載がある');
      }
      items.push(cond('allowed: false の機能', hits.length === 0,
        denied.length ? `禁止: ${denied.join('・')}（宣言された生成物に該当なし。内容の使用は V9 が検査）` : '禁止した機能なし',
        hits.join(' / ')));

      // outside_managed の範囲
      const changes = parseOutsideChanges(text);
      const allowedPaths = doc.requirements.flatMap((r) => r.outside_managed.map((p) => ({ id: r.id, p: p.replace(/\/$/, '') })));
      const out = [];
      for (const c of changes) {
        const reqId = (c.body.match(/^\s*-\s+要件\s*[:：]\s*(R\d+)/m) ?? [])[1];
        const range = allowedPaths.filter((a) => !reqId || a.id === reqId);
        const inRange = c.path && range.some((a) => c.path === a.p || c.path.startsWith(`${a.p}/`));
        if (!c.path) out.push(`${c.heading}: 対象パスが無い`);
        else if (isManaged(c.path)) out.push(`${c.heading}: 対象が管理パス集合の中`);
        else if (!inRange) out.push(`${c.heading}: ${c.path} が ${reqId ?? '要件'} の outside_managed の範囲外`);
        if (c.missing.length) out.push(`${c.heading}: 欄が欠けている（${c.missing.join('・')}）`);
        if (/試行待ち/.test(c.body.match(/^\s*-\s+根拠\s*[:：](.*)$/m)?.[1] ?? '')) out.push(`${c.heading}: 根拠が試行待ちのまま`);
      }
      items.push(cond('管理パス外の変更', out.length === 0, `${changes.length}件（範囲・欄・根拠とも問題なし）`, out.join(' / ')));
    }
  } else {
    items.push(ng('requirements.md との照合', 'work/<ts>/requirements.md が無い'));
  }
  return items;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** 対象ごとの入力ファイルを読んで点検する。入力が無ければ NG 1件を返す。 */
export function runCheck(root, ts, target) {
  const work = path.join(root, 'work', ts);
  const out = path.join(root, 'output', ts);
  const req = readOrNull(path.join(work, 'requirements.md'));
  const spec = readOrNull(path.join(out, 'spec.md'));
  const dm = readOrNull(path.join(out, 'design-map.md'));
  const existing = readOrNull(path.join(work, 'investigation', 'existing.md'));
  if (target === 'requirements') return req === null ? [ng('入力', `work/${ts}/requirements.md が無い`)] : checkRequirements(req);
  if (target === 'spec') return spec === null ? [ng('入力', `output/${ts}/spec.md が無い`)] : checkSpec(spec);
  if (dm === null) return [ng('入力', `output/${ts}/design-map.md が無い`)];
  return checkDesignMap(dm, { spec, existing, requirements: req });
}

export function formatItems(items) {
  return items.map((i) => `${i.ok ? 'OK' : 'NG'}  ${i.name}${i.detail ? `: ${i.detail}` : ''}`).join('\n');
}

if (isMainModule(import.meta.url)) {
  const [ts, target, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || !TARGETS.includes(target) || rest.length) {
    process.stderr.write(`使い方: npm run check -- <ts> ${TARGETS.join('|')}\n`);
    process.exit(2);
  }
  const items = runCheck(CANON_ROOT, ts, target);
  process.stdout.write(`${formatItems(items)}\n`);
  const bad = items.filter((i) => !i.ok).length;
  process.stdout.write(bad ? `点検: NG ${bad}件\n` : '点検: すべて OK\n');
  process.exit(bad ? 1 : 0);
}
