#!/usr/bin/env node
/**
 * handoff.js（npm run handoff -- <ts> <コマンド>）— `work/<ts>/handoff.md` の更新（architecture.md §6）。
 *
 *   mark <工程N|PN> [--off]                進捗の行に印を付ける（工程1〜9・P1〜P5。P<N> は `→ P<N>` を持つ行）
 *   set phase=<A〜D> status=<in_progress|waiting_approval|done> [mode=<new|refactor>]   frontmatter を書き換える
 *   note <節> "<文>"                       節（進捗・差し戻し・申し送り など）の末尾に箇条書きを足す
 *   session <Phase>                        canon のプロジェクトで最後に書かれたセッションの id を記録する
 *
 * sed や python での手書き換えは、印の付け違いと書式崩れを起こす。承認の表は `npm run approvals` の担当で、ここでは触らない。
 * exit 0 成功／exit 1 更新できない（handoff.md が無い・行が当たらない・語彙外・session が見つからない）／exit 2 引数不正。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import { latestSessionId } from '../lib/claude-session.js';
import { HANDOFF_FILE, appendNote, appendSession, markProgress, setFrontmatterValue } from '../lib/handoff.js';
import { isMainModule, isValidTs } from '../lib/run.js';

export class HandoffError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HandoffError';
  }
}

/** 現在時刻（ローカル・`YYYY-MM-DD hh:mm`）。 */
function nowStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** 更新関数 fn(text) を handoff.md に適用して書く。fn の throw は HandoffError にする。 */
function update(root, ts, fn) {
  const hp = path.join(root, 'work', ts, HANDOFF_FILE);
  if (!existsSync(hp)) throw new HandoffError(`handoff.md が無い: work/${ts}/${HANDOFF_FILE}`);
  let next;
  try {
    next = fn(readFileSync(hp, 'utf8'));
  } catch (e) {
    throw new HandoffError(e.message);
  }
  writeFileSync(hp, next);
}

export function markHandoff(root, ts, key, done = true) {
  update(root, ts, (t) => markProgress(t, key, done));
}

export function setHandoff(root, ts, pairs) {
  update(root, ts, (t) => pairs.reduce((acc, [k, v]) => setFrontmatterValue(acc, k, v), t));
}

export function noteHandoff(root, ts, section, note) {
  update(root, ts, (t) => appendNote(t, section, note));
}

/** canon のプロジェクトの最新セッションを `## セッション` に記録し、記録した session-id を返す。 */
export function recordSession(root, ts, phase, { projectsRoot, now = new Date() } = {}) {
  const sessionId = latestSessionId(root, projectsRoot);
  if (!sessionId) throw new HandoffError(`セッションの履歴が見つからない（~/.claude/projects/ の ${root} のディレクトリ）`);
  update(root, ts, (t) => appendSession(t, { phase, sessionId, at: nowStamp(now) }));
  return sessionId;
}

const USAGE = [
  '使い方: npm run handoff -- <ts> mark <工程N|PN> [--off]',
  '        npm run handoff -- <ts> set phase=<A〜D> status=<in_progress|waiting_approval|done> [mode=<new|refactor>]',
  '        npm run handoff -- <ts> note <節> "<文>"',
  '        npm run handoff -- <ts> session <Phase>',
].join('\n');

function usage() {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

if (isMainModule(import.meta.url)) {
  const [ts, cmd, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || !cmd) usage();
  try {
    if (cmd === 'mark') {
      const off = rest.includes('--off');
      const args = rest.filter((a) => a !== '--off');
      if (args.length !== 1) usage();
      markHandoff(CANON_ROOT, ts, args[0], !off);
      process.stdout.write(`${off ? '外した' : '付けた'}: ${args[0]}\n`);
    } else if (cmd === 'set') {
      const pairs = rest.map((a) => a.split(/=(.*)/s).slice(0, 2));
      if (pairs.length === 0 || pairs.some(([k, v]) => !k || v === undefined)) usage();
      setHandoff(CANON_ROOT, ts, pairs);
      process.stdout.write(`書き換えた: ${pairs.map(([k, v]) => `${k}=${v}`).join(' ')}\n`);
    } else if (cmd === 'note') {
      if (rest.length !== 2) usage();
      noteHandoff(CANON_ROOT, ts, rest[0], rest[1]);
      process.stdout.write(`足した: ${rest[0]}\n`);
    } else if (cmd === 'session') {
      if (rest.length !== 1) usage();
      const id = recordSession(CANON_ROOT, ts, rest[0]);
      process.stdout.write(`記録した: Phase ${rest[0]}  ${id}\n`);
    } else {
      usage();
    }
  } catch (e) {
    if (!(e instanceof HandoffError)) throw e;
    process.stderr.write(`[handoff] ${e.message}\n`);
    process.exit(1);
  }
}
