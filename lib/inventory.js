/**
 * lib/inventory.js — 対象リポジトリのカスタマイズの棚卸し（`tools/inventory.js` の本体）。
 *
 * 配置パスは正典の `data/paths.json`（project・local スコープ）から作る。paths.json は
 * complete:false なので、`.claude/` の下で配置パスに当たらないもの（Skill の補助ファイル・
 * hooks のスクリプトなど）は黙って捨てず「分類外」に残し、ディレクトリ由来の `feature_hint` を付ける。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { collection } from './reference-data.js';
import { featureOfPath } from './features.js';
import { parseFrontmatter } from './artifact.js';
import { extractRefs, classifyRef, basenameIndex, STATUSES } from './refs.js';

const SCOPES = new Set(['project', 'local']);
const MAX_TEXT_BYTES = 1024 * 1024;

export function gitOut(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** 追跡されているファイルの一覧（posix の相対パス）。 */
export function trackedFiles(root) {
  return gitOut(root, ['ls-files', '-z']).split('\0').filter(Boolean);
}

/** paths.json の path を正規表現に直す。`<subdir>` は任意の深さ、`<name>`・`*` は1セグメント。 */
export function patternToRegex(p) {
  const isDir = p.endsWith('/');
  let re = '';
  for (const part of p.split(/(<subdir>|<name>|<project>|\*)/)) {
    if (part === '<subdir>') re += '.+';
    else if (part === '<name>' || part === '<project>' || part === '*') re += '[^/]*';
    else re += part.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(isDir ? `^${re}.*$` : `^${re}$`);
}

/** project・local スコープの配置パターン。リテラルを先に、`<subdir>` を最後にして、具体的なものを優先する。 */
export function loadPatterns() {
  const items = collection('paths:files').items.filter((it) => SCOPES.has(it.scope));
  const rank = (p) => (p.includes('<subdir>') ? 2 : /<|\*/.test(p) ? 1 : 0);
  return items
    .map((it) => ({ id: it.id, path: it.path, feature: it.feature, scope: it.scope, kind: it.kind, re: patternToRegex(it.path) }))
    .sort((a, b) => rank(a.path) - rank(b.path));
}

export function matchPattern(patterns, rel) {
  return patterns.find((p) => p.re.test(rel)) ?? null;
}

function readText(root, rel) {
  const abs = path.join(root, rel);
  const st = statSync(abs);
  if (!st.isFile() || st.size > MAX_TEXT_BYTES) return { text: null, bytes: st.size };
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return { text: null, bytes: st.size };
  return { text: buf.toString('utf8'), bytes: st.size };
}

function simpleFrontmatter(text) {
  const fm = parseFrontmatter(text);
  if (!fm.present) return { frontmatter: null, frontmatter_errors: 0 };
  const out = {};
  for (const [k, v] of Object.entries(fm.frontmatter)) out[k] = v.nested ? '(nested)' : v.value;
  return { frontmatter: out, frontmatter_errors: fm.errors.length };
}

/**
 * root の棚卸しを返す。
 * @param {string} root worktree（または対象のリポジトリ）の絶対パス
 * @param {{origin?: string}} [opts] origin: 元の対象の作業ツリー。worktree に現れないカスタマイズの警告に使う
 */
export function buildInventory(root, { origin } = {}) {
  const patterns = loadPatterns();
  const tracked = trackedFiles(root);
  const items = [];
  const unclassified = [];
  for (const rel of tracked) {
    const pat = matchPattern(patterns, rel);
    if (!pat) {
      if (rel.startsWith('.claude/')) unclassified.push({ path: rel, feature_hint: featureOfPath(rel) });
      continue;
    }
    const { text, bytes } = readText(root, rel);
    const item = { path: rel, feature: pat.feature, scope: pat.scope, pattern: pat.id, bytes };
    if (text !== null && rel.endsWith('.md')) Object.assign(item, simpleFrontmatter(text));
    if (text !== null && rel.endsWith('.json')) {
      try {
        item.json_keys = Object.keys(JSON.parse(text));
      } catch (e) {
        item.json_error = e.message;
      }
    }
    items.push(item);
  }

  // 参照のグラフ。カスタマイズと分類外の .md・.json から出る参照を、分類して並べる。
  const refs = [];
  const basenames = basenameIndex(tracked);
  for (const rel of [...items.map((i) => i.path), ...unclassified.map((u) => u.path)]) {
    if (!/\.(md|json)$/.test(rel)) continue;
    const { text } = readText(root, rel);
    if (text === null) continue;
    for (const r of extractRefs(rel, text)) {
      const c = classifyRef(r, rel, root, basenames);
      refs.push({ from: rel, line: r.line, kind: r.kind, raw: r.raw, status: c.status, target: c.target });
    }
  }
  const refCounts = Object.fromEntries(STATUSES.map((s) => [s, refs.filter((r) => r.status === s).length]));
  const byFeature = {};
  const hintCounts = {};
  for (const u of unclassified) hintCounts[u.feature_hint ?? '(不明)'] = (hintCounts[u.feature_hint ?? '(不明)'] ?? 0) + 1;
  for (const i of items) byFeature[i.feature] = (byFeature[i.feature] ?? 0) + 1;

  const warnings = origin ? originOnlyCustomizations(origin, patterns, new Set(tracked)) : [];
  return { root, scanned_files: tracked.length, items, unclassified, refs, summary: { items: items.length, by_feature: byFeature, unclassified: unclassified.length, unclassified_by_hint: hintCounts, refs: refCounts, warnings: warnings.length }, warnings };
}

const ORIGIN_PATHSPECS = [
  '.claude', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json', '.worktreeinclude',
  ':(glob)**/CLAUDE.md', ':(glob)**/CLAUDE.local.md', ':(glob)**/AGENTS.md',
];

/**
 * 元の対象の作業ツリーにあって、worktree（HEAD の checkout）には現れないカスタマイズ。
 * 未追跡・gitignore・コミットされていない変更の3種類を挙げる。
 */
export function originOnlyCustomizations(origin, patterns, worktreeTracked) {
  const out = [];
  const seen = new Set();
  const add = (rel, reason) => {
    if (seen.has(rel + reason) || !matchPattern(patterns, rel)) return;
    seen.add(rel + reason);
    out.push({ path: rel, reason });
  };
  const list = (args) => gitOut(origin, args).split('\0').filter(Boolean);
  for (const rel of list(['ls-files', '-z', '-o', '--exclude-standard', '--', ...ORIGIN_PATHSPECS])) add(rel, 'untracked');
  for (const rel of list(['ls-files', '-z', '-o', '-i', '--exclude-standard', '--', ...ORIGIN_PATHSPECS])) add(rel, 'gitignored');
  for (const rel of list(['diff', '-z', '--name-only', 'HEAD', '--'])) {
    if (worktreeTracked.has(rel)) add(rel, 'uncommitted-change');
  }
  return out;
}

/** 分類外の内訳。feature_hint は `lib/features.js` のパスの規則から付けたヒントで、paths.json（正典）の判定ではない。 */
function hintText(by) {
  const parts = Object.entries(by).map(([k, n]) => `${k} ${n}`);
  return parts.length ? `（ヒント別: ${parts.join('・')}）` : '';
}

/** 標準出力に返す要約（詳細はファイル）。 */
export function renderSummary(inv, outDir) {
  const s = inv.summary;
  const lines = [
    `inventory: ${inv.root}`,
    `追跡ファイル ${inv.scanned_files} 件を走査 → カスタマイズ ${s.items} 件・分類外（.claude/ 配下で配置パスに当たらない）${s.unclassified} 件${hintText(s.unclassified_by_hint)}`,
    `機能別: ${Object.entries(s.by_feature).map(([k, n]) => `${k} ${n}`).join('・') || 'なし'}`,
    `参照 ${inv.refs.length} 件: ${STATUSES.map((k) => `${k} ${s.refs[k]}`).join('・')}`,
    `警告 ${s.warnings} 件（worktree に現れない元の対象のカスタマイズ）`,
  ];
  if (s.items === 0) lines.push('カスタマイズは 0 件（新規の構築なら正常。既存の改修なら root を確かめる）');
  for (const w of inv.warnings) lines.push(`  警告: ${w.path}（${w.reason}）`);
  if (outDir) lines.push(`詳細: ${path.join(outDir, 'inventory.json')}`);
  return lines.join('\n');
}
