/**
 * lib/impact.js — 変えるファイルと語・コマンドに触れている、触らないファイルの列挙（`tools/impact.js` の本体）。
 *
 * 走査の範囲はカスタマイズに限らない。追跡されているテキストファイルのすべてを見る（README の節など、
 * カスタマイズ以外の文書も対象）。触らないファイル（`scope: 'untouched'`）は、変えるファイルのパス・
 * 相対リンク・語を照合する。変える・削除するファイル自身（`scope: 'changed'`）は、語だけを照合する。
 * instruct の外の行に、変える語が古い意味のまま残るのを計画の段で表に出すためである。変えるファイル
 * 同士のパスの参照は verify の V6 が見るので、ここでは照合しない。
 * 該当には安定した ID `<path>:<line>:<term>` を付ける。change-plan の「影響を受ける参照元の扱い」と
 * 照合するための鍵である。
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { mentionsIdentifier, mentionsSlashCommand } from './markdown.js';
import { extractRefs, classifyRef, basenameIndex } from './refs.js';
import { trackedFiles } from './inventory.js';

const MAX_TEXT_BYTES = 1024 * 1024;

function readTextOrNull(root, rel) {
  const abs = path.join(root, rel);
  const st = statSync(abs, { throwIfNoEntry: false });
  if (!st || !st.isFile() || st.size > MAX_TEXT_BYTES) return null;
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString('utf8');
}

/** 語がその行に出現するか。`/name` はスラッシュコマンドの起動表記、それ以外は識別子の境界、パスは部分文字列。 */
function lineMentions(line, term) {
  if (term.startsWith('/')) return mentionsSlashCommand(line, term.slice(1));
  if (term.includes('/') || term.includes('.')) return line.includes(term);
  return mentionsIdentifier(line, term);
}

/**
 * @param {string} root worktree の絶対パス
 * @param {{files: string[], terms: string[]}} input files は root からの相対パス（変える・削除する）
 * @returns {{scanned:number, untracked_files:string[], hits:Array<{id:string,path:string,line:number,term:string,via:string,scope:'untouched'|'changed',text:string}>}}
 */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // ロケールに依らない順序（ID の並びを固定する）

export function computeImpact(root, { files, terms }) {
  const changed = new Set(files.map((f) => path.posix.normalize(f)));
  const allTerms = [...new Set([...changed, ...terms])];
  const hits = new Map();
  let scanned = 0;
  const tracked = trackedFiles(root);
  const trackedSet = new Set(tracked);
  const untracked = [...changed].filter((f) => !trackedSet.has(f)).sort(cmp);
  const basenames = basenameIndex(tracked);
  const wordTerms = [...new Set(terms)];
  for (const rel of tracked) {
    const scope = changed.has(rel) ? 'changed' : 'untouched';
    if (scope === 'changed' && wordTerms.length === 0) continue;
    const text = readTextOrNull(root, rel);
    if (text === null) continue;
    if (scope === 'untouched') scanned++;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const term of scope === 'changed' ? wordTerms : allTerms) {
        if (!lineMentions(line, term)) continue;
        const id = `${rel}:${i + 1}:${term}`;
        if (!hits.has(id)) hits.set(id, { id, path: rel, line: i + 1, term, via: 'text', scope, text: line.trim().slice(0, 200) });
      }
    });
    if (scope === 'changed') continue;
    // 相対リンク・import など、文字列としては現れない参照（`../a/b.md`）を、解決した先で照合する。
    for (const r of extractRefs(rel, text)) {
      const c = classifyRef(r, rel, root, basenames);
      if (c.target && changed.has(c.target)) {
        const id = `${rel}:${r.line}:${c.target}`;
        if (!hits.has(id)) hits.set(id, { id, path: rel, line: r.line, term: c.target, via: r.kind, scope, text: lines[r.line - 1]?.trim().slice(0, 200) ?? '' });
      }
    }
  }
  return { scanned, untracked_files: untracked, hits: [...hits.values()].sort((a, b) => cmp(a.path, b.path) || a.line - b.line || cmp(a.term, b.term)) };
}

export function renderImpactSummary(root, input, result, outDir) {
  const byFile = new Map();
  for (const h of result.hits) if (h.scope !== 'changed') byFile.set(h.path, (byFile.get(h.path) ?? 0) + 1);
  const inChanged = result.hits.filter((h) => h.scope === 'changed');
  const untouchedCount = result.hits.length - inChanged.length;
  const lines = [
    `impact: ${root}`,
    `変える・削除するファイル ${input.files.length} 件・語 ${input.terms.length} 件。触らない追跡テキスト ${result.scanned} 件を走査 → 該当 ${untouchedCount} 件（${byFile.size} ファイル）`,
    `変えるファイルの中の語の該当 ${inChanged.length} 件（${new Set(inChanged.map((h) => h.path)).size} ファイル。instruct が直す行か、変えない理由を答える）`,
  ];
  for (const h of inChanged.slice(0, 40)) lines.push(`  ${h.id}`);
  if (inChanged.length > 40) lines.push(`  …ほか ${inChanged.length - 40} 件（詳細はファイル）`);
  if (result.untracked_files.length > 0) {
    lines.push(`追跡されていない（新規で足すファイルか、綴りの誤り。語としては照合した）: ${result.untracked_files.join('・')}`);
  }
  for (const [p, n] of [...byFile].slice(0, 30)) lines.push(`  ${p}（${n} 件）`);
  if (byFile.size > 30) lines.push(`  …ほか ${byFile.size - 30} ファイル（詳細はファイル）`);
  if (outDir) lines.push(`詳細: ${path.join(outDir, 'impact.json')}`);
  return lines.join('\n');
}
