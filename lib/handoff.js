/**
 * lib/handoff.js — `work/<ts>/handoff.md`（architecture.md §6）の frontmatter の読み書き。
 *
 * handoff.md は run の状態を持つ唯一のファイルで、本文はオーケストレーターが直接編集する。
 * スクリプトが読むのは frontmatter（ts・target・mode・phase・status・canon_commit）だけで、本文は解釈しない。
 */

import { parseFrontmatter } from './artifact.js';

export const HANDOFF_FILE = 'handoff.md';
export const HANDOFF_KEYS = ['ts', 'target', 'mode', 'phase', 'status', 'canon_commit'];
export const MODES = ['new', 'refactor'];

/**
 * handoff.md の本文から frontmatter の値を取り出す。frontmatter が無ければ null。
 * @returns {{ts?:string, target?:string, mode?:string, phase?:string, status?:string, canon_commit?:string}|null}
 */
export function parseHandoff(text) {
  const fm = parseFrontmatter(text);
  if (!fm.present) return null;
  const out = {};
  for (const k of HANDOFF_KEYS) {
    const v = fm.frontmatter[k]?.value;
    if (v !== undefined && v !== '') out[k] = String(v);
  }
  return out;
}

/** new-run.js が書く handoff.md の雛形（architecture.md §6.2 の frontmatter と4節）。 */
export function renderHandoff({ ts, target, mode, canonCommit }) {
  return [
    '---',
    `ts: ${ts}`,
    `target: ${target}`,
    `mode: ${mode}`,
    'phase: A',
    'status: in_progress',
    ...(canonCommit ? [`canon_commit: ${canonCommit}`] : []),
    '---',
    '',
    '## 進捗',
    '',
    '- [ ] 工程1 調査①（existing・profile）',
    '- [ ] 工程2 要件ヒアリング → P1',
    '- [ ] 工程3 調査②（focused）',
    '- [ ] 工程4 spec → P2',
    '',
    '## 承認',
    '',
    '| ゲート | 日時 | 対象ファイル | sha256(先頭12) | 要旨 |',
    '|---|---|---|---|---|',
    '',
    '## 差し戻し',
    '',
    '## 申し送り',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 承認（architecture.md §6.2・§6.3）
// ---------------------------------------------------------------------------

/**
 * ゲートごとの承認対象（canon のルートからの相対パス）。`dir: true` はディレクトリのハッシュ
 * （lib/tree-hash.js）で、それ以外はファイルの sha256。
 */
export const GATE_TARGETS = {
  P1: { rel: (ts) => `work/${ts}/requirements.md`, dir: false },
  P2: { rel: (ts) => `output/${ts}/spec.md`, dir: false },
  P3: { rel: (ts) => `output/${ts}/design-map.md`, dir: false },
  P4: { rel: (ts) => `output/${ts}/generated`, dir: true },
  P5: { rel: (ts) => `output/${ts}/deploy/pre-deploy-report.txt`, dir: false },
};

/** 承認行に残すハッシュの桁数。 */
export const APPROVAL_HASH_LEN = 12;

/** 表の1行をセルに分ける（`\|` はセル内の縦棒として扱う）。 */
function splitRow(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/);
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** `## 承認` 節の範囲（行番号）。無ければ null。 */
function approvalSection(lines) {
  const start = lines.findIndex((l) => /^##\s+承認\s*$/.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * handoff.md の `## 承認` 表を読む。
 * @returns {{gate:string, at:string, target:string, hash:string, summary:string}[]} 記載順
 */
export function parseApprovals(text) {
  const lines = text.split('\n');
  const sec = approvalSection(lines);
  if (!sec) return [];
  const rows = [];
  for (const line of lines.slice(sec.start + 1, sec.end)) {
    if (!line.trim().startsWith('|')) continue;
    const [gate, at, target, hash, ...rest] = splitRow(line);
    if (gate === 'ゲート' || /^-+$/.test(gate ?? '')) continue; // 見出し行・区切り行
    rows.push({ gate, at: at ?? '', target: target ?? '', hash: hash ?? '', summary: rest.join(' | ') });
  }
  return rows;
}

/** ゲートごとに有効な承認行（同じゲートの行が複数あれば最後の行）。 */
export function effectiveApprovals(rows) {
  const out = new Map();
  for (const r of rows) out.set(r.gate, r);
  return out;
}

/** 承認行を `## 承認` 表の末尾に足した本文を返す。節が無ければ throw。 */
export function appendApproval(text, { gate, at, target, hash, summary }) {
  const lines = text.split('\n');
  const sec = approvalSection(lines);
  if (!sec) throw new Error('handoff.md に「## 承認」節が無い');
  let last = sec.start;
  for (let i = sec.start + 1; i < sec.end; i++) if (lines[i].trim().startsWith('|')) last = i;
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const row = `| ${gate} | ${at} | ${esc(target)} | ${hash} | ${esc(summary)} |`;
  lines.splice(last + 1, 0, row);
  return lines.join('\n');
}
