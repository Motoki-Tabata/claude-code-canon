/**
 * lib/handoff.js — `work/<ts>/handoff.md`（architecture.md §6）の frontmatter の読み書き。
 *
 * handoff.md は run の状態を持つ唯一のファイルで、更新は `npm run handoff`（tools/handoff.js）が行う。
 * 本文は、承認の表・進捗のチェック・セッションの表・節への追記だけを扱い、散文の中身は解釈しない。
 */

import { parseFrontmatter } from './artifact.js';

export const HANDOFF_FILE = 'handoff.md';
export const HANDOFF_KEYS = ['ts', 'target', 'route', 'worktree', 'branch', 'base', 'canon_commit', 'stage', 'status'];

/**
 * handoff.md の本文から frontmatter の値を取り出す。frontmatter が無ければ null。
 * @returns {Partial<Record<(typeof HANDOFF_KEYS)[number], string>>|null}
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
 * 進捗の行（design/architecture.md §2。段は plan・design・build）。ゲートの行き先は経路で変わるので、行の文に添えるだけにする。
 * new-run が全行を作り、各段は印を付けるだけにする（`mark` は行の先頭の語 `計画1` などで引く）。
 */
export const PROGRESS_ROWS = [
  '計画1 照合と調査（inventory・investigator）',
  '計画2 要件を固める（大は G1）',
  '計画3 変更計画と影響の照合（小は G1。大は設計へ）',
  '設計1 機能選定・構成・モデル割当（大だけ。G2）',
  '構築1 編集と削除',
  '構築2 対象の検証と verify',
  '構築3 レビュー（reviewer・prompt-auditor）',
  '構築4 差分のゲート（小は G2・大は G3）',
  '構築5 振り返り',
];

/** `mark` が受ける進捗のキー（行の先頭の語）。 */
export const PROGRESS_KEY_RE = /^(計画[1-3]|設計1|構築[1-5])$/;

/** new-run が書く handoff.md の雛形（design/architecture.md §4 の frontmatter と5節）。route は /canon-plan が決めて `set` する。 */
export function renderHandoff({ ts, target, worktree, branch, base, canonCommit }) {
  return [
    '---',
    `ts: ${ts}`,
    `target: ${target}`,
    'route:',
    ...(worktree ? [`worktree: ${worktree}`] : []),
    ...(branch ? [`branch: ${branch}`] : []),
    ...(base ? [`base: ${base}`] : []),
    ...(canonCommit ? [`canon_commit: ${canonCommit}`] : []),
    'stage: plan',
    'status: in_progress',
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
    '| 段 | session-id | 記録日時 |',
    '|---|---|---|',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 承認（architecture.md §6.2・§6.3）
// ---------------------------------------------------------------------------

export const ROUTES = ['small', 'large'];

/**
 * 経路ごとのゲート（design/architecture.md §2）。`docs` は work/<ts>/ のファイル（合わせて sha256 に束縛）、
 * `commit` は worktree のブランチの HEAD のコミット sha に束縛する。
 *   小: G1 計画（requirements.md＋change-plan.md）→ G2 差分
 *   大: G1 要件 → G2 設計（change-plan.md）→ G3 差分
 */
export const GATES = {
  small: {
    G1: { docs: ['requirements.md', 'change-plan.md'] },
    G2: { commit: true },
  },
  large: {
    G1: { docs: ['requirements.md'] },
    G2: { docs: ['change-plan.md'] },
    G3: { commit: true },
  },
};

/** どこかの経路にあるゲートの名前（CLI の引数検査用。形として不正なゲート名は引数不正）。 */
export const ALL_GATES = [...new Set(Object.values(GATES).flatMap((g) => Object.keys(g)))];

/** 経路のゲートの定義。経路が不正、またはその経路に無いゲートなら undefined。 */
export function gateSpec(route, gate) {
  return GATES[route]?.[gate];
}

/** 経路のゲートの名前（承認の順）。 */
export function gateNames(route) {
  return Object.keys(GATES[route] ?? {});
}

/** 差分のゲート（最後のゲート）の名前。 */
export function diffGate(route) {
  return gateNames(route).at(-1);
}

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

export const STAGES = ['plan', 'design', 'build'];
export const STATUSES = ['in_progress', 'waiting_approval', 'done'];
/** `set` で書き換えてよい frontmatter のキーと値の語彙（ts・target・worktree・branch・base・canon_commit は run の識別なので変えない）。 */
export const SETTABLE = { route: ROUTES, stage: STAGES, status: STATUSES };

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

/** 進捗の行のうち、キー（`計画1` などの行頭の語）に当たる行の index。 */
function progressRowIndexes(lines, sec, key) {
  const idx = [];
  for (let i = sec.start + 1; i < sec.end; i++) {
    const m = lines[i].match(/^- \[[ xX]\] (.*)$/);
    if (!m) continue;
    const body = m[1];
    if (body.startsWith(`${key} `)) idx.push(i);
  }
  return idx;
}

/**
 * 進捗の行に印を付ける（done=false なら外す）。キーは `計画1`〜`計画3`・`設計1`・`構築1`〜`構築5`。
 * 当たる行がちょうど1行でなければ throw（付け違いを黙って通さない）。
 */
export function markProgress(text, key, done = true) {
  if (!PROGRESS_KEY_RE.test(key)) throw new Error(`キーは 計画1〜計画3・設計1・構築1〜構築5 のどれか（${key}）`);
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
export function appendSession(text, { stage, sessionId, at }) {
  if (!STAGES.includes(stage)) throw new Error(`段は ${STAGES.join('|')}（${stage}）`);
  const row = `| ${stage} | ${sessionId} | ${at} |`;
  const lines = text.split('\n');
  const sec = sectionRange(lines, 'セッション');
  if (!sec) {
    const base = text.replace(/\s+$/, '');
    return `${base}\n\n## セッション\n\n| 段 | session-id | 記録日時 |\n|---|---|---|\n${row}\n`;
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
    const [stage, sessionId, at] = splitRow(line);
    if (stage === '段' || /^-+$/.test(stage ?? '')) continue;
    rows.push({ stage, sessionId, at: at ?? '' });
  }
  return rows;
}
