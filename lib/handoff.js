/**
 * lib/handoff.js — `work/<ts>/handoff.md`（architecture.md §6）の frontmatter の読み書き。
 *
 * handoff.md は run の状態を持つ唯一のファイルで、更新は `npm run handoff`（tools/handoff.js）が行う。
 * 本文は、承認の表・進捗のチェック・セッションの表・節への追記だけを扱い、散文の中身は解釈しない。
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

/**
 * 進捗の行（architecture.md §2.1 の工程1〜9。人間ゲート P1〜P5 は、承認を取る工程の行に `→ P<N>` で持つ）。
 * new-run が全行を作り、各 Phase は印を付けるだけにする（`mark` は `工程N` か `P<N>` で行を引く）。
 */
export const PROGRESS_ROWS = [
  '工程1 調査①（existing・profile）',
  '工程2 要件ヒアリング → P1',
  '工程3 調査②（focused）',
  '工程4 spec → P2',
  '工程5 機能選定と設計 → P3',
  '工程6 生成',
  '工程7 検証（verify）',
  '工程8 品質検査と修正ループ → P4',
  '工程9 配置前照合 → P5',
];

/** new-run.js が書く handoff.md の雛形（architecture.md §6.2 の frontmatter と5節）。 */
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
    ...PROGRESS_ROWS.map((r) => `- [ ] ${r}`),
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
    '## セッション',
    '',
    '| Phase | session-id | 記録日時 |',
    '|---|---|---|',
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

/** `## <name>` 節の範囲（行番号。end は次の `##` の行か末尾）。無ければ null。 */
export function sectionRange(lines, name) {
  const start = lines.findIndex((l) => l.replace(/\s+$/, '') === `## ${name}`);
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

const approvalSection = (lines) => sectionRange(lines, '承認');

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

// ---------------------------------------------------------------------------
// 状態の更新（npm run handoff）
// ---------------------------------------------------------------------------

export const PHASES = ['A', 'B', 'C', 'D'];
export const STATUSES = ['in_progress', 'waiting_approval', 'done'];
/** `set` で書き換えてよい frontmatter のキーと値の語彙（ts・target・canon_commit は run の識別なので変えない）。 */
export const SETTABLE = { phase: PHASES, status: STATUSES, mode: MODES };

/** frontmatter の値を書き換えた本文を返す。キーか値が語彙外・キーの行が無ければ throw。 */
export function setFrontmatterValue(text, key, value) {
  if (!SETTABLE[key]) throw new Error(`frontmatter ${key} は変えられない（変えられるのは ${Object.keys(SETTABLE).join('・')}）`);
  if (!SETTABLE[key].includes(value)) throw new Error(`${key} の値は ${SETTABLE[key].join('|')} のいずれか（${value}）`);
  const lines = text.split('\n');
  if (lines[0] !== '---') throw new Error('handoff.md に frontmatter が無い');
  const close = lines.indexOf('---', 1);
  const i = lines.findIndex((l, n) => n > 0 && n < close && l.startsWith(`${key}:`));
  if (i < 0) throw new Error(`frontmatter に ${key} の行が無い`);
  lines[i] = `${key}: ${value}`;
  return lines.join('\n');
}

/** 進捗の行のうち、キー（`工程N` か `P<N>`）に当たる行の index。 */
function progressRowIndexes(lines, sec, key) {
  const idx = [];
  for (let i = sec.start + 1; i < sec.end; i++) {
    const m = lines[i].match(/^- \[[ xX]\] (.*)$/);
    if (!m) continue;
    const body = m[1];
    if (/^工程\d+$/.test(key) ? body.startsWith(`${key} `) : new RegExp(`→ ${key}(?!\\d)`).test(body)) idx.push(i);
  }
  return idx;
}

/**
 * 進捗の行に印を付ける（done=false なら外す）。キーは `工程N`（N=1〜9）か `P<N>`（N=1〜5）。
 * 当たる行がちょうど1行でなければ throw（付け違いを黙って通さない）。
 */
export function markProgress(text, key, done = true) {
  if (!/^(工程[1-9]|P[1-5])$/.test(key)) throw new Error(`キーは 工程1〜工程9 か P1〜P5（${key}）`);
  const lines = text.split('\n');
  const sec = sectionRange(lines, '進捗');
  if (!sec) throw new Error('handoff.md に「## 進捗」節が無い');
  const idx = progressRowIndexes(lines, sec, key);
  if (idx.length !== 1) throw new Error(`進捗に ${key} の行が${idx.length}件ある（1件でなければ印を付けない）`);
  lines[idx[0]] = lines[idx[0]].replace(/^- \[[ xX]\]/, done ? '- [x]' : '- [ ]');
  return lines.join('\n');
}

/** `## <節>` の末尾に箇条書き1行を足す。節が無ければ throw。 */
export function appendNote(text, section, note) {
  if (!note || !note.trim()) throw new Error('文が空');
  const lines = text.split('\n');
  const sec = sectionRange(lines, section);
  if (!sec) throw new Error(`handoff.md に「## ${section}」節が無い`);
  let last = sec.start;
  for (let i = sec.start + 1; i < sec.end; i++) if (lines[i].trim() !== '') last = i;
  const item = `- ${note.trim().replace(/\n/g, ' ')}`;
  if (last === sec.start) {
    // 空の節: 見出しの下の空行のあとに置く（次の節との間の空行を残す）。
    const at = lines[sec.start + 1] === '' ? sec.start + 2 : sec.start + 1;
    lines.splice(at, 0, ...(at === sec.start + 1 ? ['', item] : [item]), ...(lines[at] === undefined || /^##\s/.test(lines[at]) ? [''] : []));
  } else {
    lines.splice(last + 1, 0, item);
  }
  return lines.join('\n');
}

/** `## セッション` の表に1行足す。節が無い古い handoff には末尾に節ごと作る。 */
export function appendSession(text, { phase, sessionId, at }) {
  if (!PHASES.includes(phase)) throw new Error(`Phase は ${PHASES.join('|')}（${phase}）`);
  const row = `| ${phase} | ${sessionId} | ${at} |`;
  const lines = text.split('\n');
  const sec = sectionRange(lines, 'セッション');
  if (!sec) {
    const base = text.replace(/\s+$/, '');
    return `${base}\n\n## セッション\n\n| Phase | session-id | 記録日時 |\n|---|---|---|\n${row}\n`;
  }
  let last = sec.start;
  for (let i = sec.start + 1; i < sec.end; i++) if (lines[i].trim().startsWith('|')) last = i;
  lines.splice(last + 1, 0, row);
  return lines.join('\n');
}

/** `## セッション` の表を読む（記載順）。 */
export function parseSessions(text) {
  const lines = text.split('\n');
  const sec = sectionRange(lines, 'セッション');
  if (!sec) return [];
  const rows = [];
  for (const line of lines.slice(sec.start + 1, sec.end)) {
    if (!line.trim().startsWith('|')) continue;
    const [phase, sessionId, at] = splitRow(line);
    if (phase === 'Phase' || /^-+$/.test(phase ?? '')) continue;
    rows.push({ phase, sessionId, at: at ?? '' });
  }
  return rows;
}
