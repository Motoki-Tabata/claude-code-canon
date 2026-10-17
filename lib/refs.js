/**
 * lib/refs.js — テキストファイルからの参照の抽出と分類（`inventory`・`impact` が共有する）。
 *
 * 参照の種類: Markdown のリンク・バッククォートのパス・CLAUDE.md 等の `@path` import・
 * Agent の `skills:`・hook の `command`。コードフェンスの中は構造ではないので読まない。
 *
 * 分類（status）:
 *   - exists       … 実在する（root の中）
 *   - missing      … 実在しない（root の中）
 *   - placeholder  … `<ts>`・`NNN`・`$VAR`・`*` など、置き換える部分を含む。実在の参照と区別する
 *   - external     … URL（`scheme:`）
 *   - outside-repo … 絶対パス・`~/`・root の外へ出る相対パス。この検査では実在を確かめない
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { computeFenceMask } from './markdown.js';
import { parseFrontmatter, splitListValue } from './artifact.js';

export const STATUSES = ['exists', 'missing', 'placeholder', 'external', 'outside-repo'];

const PLACEHOLDER_RE = /<[^>\s]*>|\$|\*|\bNNN\b|\{[^}]*\}|\.\.\./;
const PATH_CHARS_RE = /^[\w.\-/<>$*~{}@]+$/;
const EXT_RE = /\.[A-Za-z][A-Za-z0-9]{0,5}$/;

/** バッククォートの中身がパスらしいか。空白を含むもの（コマンド）は除く。 */
function isPathLike(tok) {
  if (!tok || tok.length > 200 || /\s/.test(tok)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(tok)) return /^https?:\/\//i.test(tok); // URL だけ external として拾う
  if (tok.startsWith('mcp__')) return false;
  if (!PATH_CHARS_RE.test(tok)) return false;
  return tok.includes('/') || EXT_RE.test(tok);
}

/** 1ファイルの参照を `{ line, kind, raw }` の配列で返す（分類はしない）。 */
export function extractRefs(rel, text) {
  const refs = [];
  const base = path.posix.basename(rel);
  const lines = text.split(/\r?\n/);
  const isMd = rel.endsWith('.md');
  const mask = isMd ? computeFenceMask(lines) : lines.map(() => false);
  const importable = isMd && (/^(CLAUDE|AGENTS)(\.local)?\.md$/.test(base) || rel.includes('.claude/rules/'));

  if (isMd) {
    lines.forEach((line, i) => {
      if (mask[i]) return;
      const n = i + 1;
      for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1].split('#')[0];
        if (target) refs.push({ line: n, kind: 'link', raw: target });
      }
      for (const m of line.matchAll(/`([^`\n]+)`/g)) {
        const tok = m[1].trim();
        if (isPathLike(tok)) refs.push({ line: n, kind: 'code', raw: tok });
      }
      if (importable) {
        for (const m of line.matchAll(/(?:^|\s)@([^\s`]+)/g)) {
          const tok = m[1].replace(/[.,;:)]+$/, '');
          if (/^[\w.\-/~]+$/.test(tok) && (tok.includes('/') || EXT_RE.test(tok)) && !/@/.test(tok)) {
            refs.push({ line: n, kind: 'import', raw: tok });
          }
        }
      }
    });
    const fm = parseFrontmatter(text);
    if (fm.present && fm.rawBlock !== null) {
      if (rel.includes('.claude/agents/') && fm.frontmatter.skills) {
        for (const name of splitListValue(fm.frontmatter.skills)) {
          refs.push({ line: fm.frontmatter.skills.line, kind: 'skills', raw: `.claude/skills/${name}/SKILL.md` });
        }
      }
      fm.rawBlock.split('\n').forEach((l, i) => {
        const m = l.match(/^\s*(?:-\s*)?command:\s*(.+)$/);
        if (m) pushCommandPaths(refs, i + 2, m[1]);
      });
    }
  } else if (rel.endsWith('.json')) {
    lines.forEach((l, i) => {
      const m = l.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) pushCommandPaths(refs, i + 1, m[1]);
    });
  }
  return refs;
}

/** hook の command の文字列から、パスらしいトークンを refs に積む。 */
function pushCommandPaths(refs, line, command) {
  for (const word of command.replace(/^["']|["']$/g, '').split(/\s+/)) {
    const w = word.replace(/^["']|["']$/g, '');
    const sub = w.replace(/^\$\{?CLAUDE_PROJECT_DIR\}?\/?/, '');
    if (sub !== w) refs.push({ line, kind: 'hook', raw: sub });
    else if (/^\.{1,2}\/[\w.\-/]+$/.test(w)) refs.push({ line, kind: 'hook', raw: w });
  }
}

/** basename → 追跡ファイルの索引。パスを含まないファイル名（`profile.md`）を、一意なときだけ解決するのに使う。 */
export function basenameIndex(files) {
  const m = new Map();
  for (const f of files) {
    const b = path.posix.basename(f);
    m.set(b, m.has(b) ? null : f); // 同名が複数あれば null（曖昧なので解決しない）
  }
  return m;
}

/**
 * 参照を分類する。
 * @param {{kind:string, raw:string}} ref
 * @param {string} fromRel 参照元の root からの相対パス（posix）
 * @param {string} root 対象の root（絶対パス）
 * @param {Map<string,string|null>} [basenames] `basenameIndex` の結果。無ければ basename での解決はしない
 * @returns {{status:string, target:string|null}} target は root からの相対パス（実在の判定に使った先）
 */
export function classifyRef(ref, fromRel, root, basenames) {
  const raw = ref.raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return { status: 'external', target: null };
  if (PLACEHOLDER_RE.test(raw)) return { status: 'placeholder', target: null };
  if (raw.startsWith('/') || raw.startsWith('~')) return { status: 'outside-repo', target: null };

  const fromDir = path.posix.dirname(fromRel);
  // リンクと import は参照元からの相対。バッククォートと hook のパスは、参照元の各祖先ディレクトリ
  // （Skill のディレクトリ・root）からの相対のことが多いので、近い順にすべて試す。
  let candidates;
  if (ref.kind === 'link' || ref.kind === 'import') candidates = [path.posix.join(fromDir, raw)];
  else {
    candidates = [];
    for (let d = fromDir; ; d = path.posix.dirname(d)) {
      candidates.push(path.posix.join(d, raw));
      if (d === '.' || d === '/') break;
    }
  }
  const normalized = candidates.map((c) => path.posix.normalize(c));
  const inside = normalized.filter((c) => !c.startsWith('../') && c !== '..');
  if (inside.length === 0) return { status: 'outside-repo', target: null };
  const hit = inside.find((c) => existsSync(path.join(root, c)));
  if (hit) return { status: 'exists', target: hit };
  if (ref.kind === 'code' && !raw.includes('/') && basenames?.get(raw)) return { status: 'exists', target: basenames.get(raw) };
  return { status: 'missing', target: inside[0] };
}
