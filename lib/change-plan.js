/**
 * lib/change-plan.js — `work/<ts>/change-plan.md` の決定論パーサ（書式は design/architecture.md §4）。
 *
 * 節（`## ` 見出しは完全一致）:
 *   ファイル        `- path:` で始まるレコード（op: modify|new|delete、reqs: [R1, R2]、instruct: 何を・なぜ）
 *   影響の語        `impact` に渡した語・コマンドを、バッククォートで囲んだ箇条書きで並べる（無ければ箇条書きなし）。
                   語の後ろに対応する要件を `（R1,R3）` で添える。語を置けない要件は `- R5: 影響の語なし（理由）` と書く
 *   参照元の扱い    `impact` の該当への回答。1件1行（300バイト以内）。2つの形がある:
 *                     - <path>:<line>:<term>: 変える | 変えない（理由）   … 該当1件への回答
 *                     - <path>: 変える | 変えない（理由）                … そのファイルの全該当への回答
 *   検証コマンド    worktree で実行する対象の検証コマンド（バッククォートで囲んだ箇条書き）
 *   機能と責務・モデル割当   大の経路だけ。本文のバイト数だけを数える
 *
 * 判定はしない（構文分解のみ）。「節が無い・ファイルが0件」は黙って空を返さず throw する。
 */

import { findHeading, sectionSlice, parseBulletRecords, computeFenceMask } from './markdown.js';
import { parseListValue } from './requirements.js';

export class ChangePlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChangePlanError';
  }
}

export const OPS = ['modify', 'new', 'delete'];
export const VERDICTS = ['変える', '変えない'];

const bytes = (lines) => Buffer.byteLength(lines.join('\n'), 'utf8');

/** `## <name>` の節の本文（見出しを含まない）の範囲。無ければ null。 */
function sectionRange(lines, name, mask) {
  const h = findHeading(lines, name, 2, mask);
  if (h === -1) return null;
  const { end } = sectionSlice(lines, h, mask);
  return { start: h + 1, end, heading: h };
}

/** 箇条書き `- ` の行ごとの { line, text }（コードフェンスの外）。 */
function bulletLines(lines, range, mask) {
  const out = [];
  for (let i = range.start; i < range.end; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^\s*-\s+(.*?)\s*$/);
    if (m) out.push({ line: i + 1, text: m[1], bytes: Buffer.byteLength(lines[i], 'utf8') });
  }
  return out;
}

const ANSWER_RE = /^(.+?):\s*(変える|変えない)(?:[（(](.*)[）)])?\s*$/;
const NO_TERM_RE = /^(R\d+):\s*影響の語なし(?:[（(](.*)[）)])?\s*$/;
const TERM_REQS_RE = /`[（(]\s*(R\d+(?:\s*[,、，]\s*R\d+)*)\s*[）)]/;
const HIT_ID_RE = /^(.+):(\d+):(.+)$/;

/**
 * change-plan.md を構造化する。
 * @returns {{files:Array, terms:string[], termReqs:Array<{term,reqs,line}>, noTermReqs:Array<{id,reason,line}>, answers:Array, malformedAnswers:Array, verifyCommands:string[], sections:Object, bytes:number}}
 * @throws {ChangePlanError} 「## ファイル」節が無い・レコードが0件のとき
 */
export function parseChangePlan(text) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);

  const fileSec = sectionRange(lines, 'ファイル', mask);
  if (!fileSec) throw new ChangePlanError('change-plan.md に「## ファイル」節が無い。空を黙って通さない。');
  const recs = parseBulletRecords(lines, fileSec.start, fileSec.end);
  if (recs.length === 0) throw new ChangePlanError('「## ファイル」に1件もレコードが無い（変更が0件の計画は不正）。');
  const files = recs.map((r, i) => {
    const endLine = i + 1 < recs.length ? recs[i + 1].line - 1 : fileSec.end;
    return {
      path: r.fields.path ?? null,
      op: r.fields.op ?? null,
      reqs: parseListValue(r.fields.reqs),
      instruct: r.fields.instruct ?? null,
      line: r.line,
      bytes: Buffer.byteLength(lines.slice(r.line - 1, endLine).join('\n').replace(/\s+$/, ''), 'utf8'),
    };
  });

  const termSec = sectionRange(lines, '影響の語', mask);
  const termBullets = termSec ? bulletLines(lines, termSec, mask) : [];
  const terms = termBullets.flatMap((b) => [...b.text.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
  const termReqs = [];
  const noTermReqs = [];
  for (const b of termBullets) {
    const none = NO_TERM_RE.exec(b.text);
    if (none) {
      noTermReqs.push({ id: none[1], reason: (none[2] ?? '').trim(), line: b.line });
      continue;
    }
    const reqs = [...(TERM_REQS_RE.exec(b.text)?.[1] ?? '').matchAll(/R\d+/g)].map((m) => m[0]);
    for (const m of b.text.matchAll(/`([^`]+)`/g)) termReqs.push({ term: m[1], reqs, line: b.line });
  }

  const ansSec = sectionRange(lines, '参照元の扱い', mask);
  const answers = [];
  const malformedAnswers = [];
  if (ansSec) {
    for (const b of bulletLines(lines, ansSec, mask)) {
      const m = ANSWER_RE.exec(b.text);
      if (!m) {
        malformedAnswers.push({ line: b.line, text: b.text });
        continue;
      }
      const key = m[1].replace(/^`|`$/g, '').trim();
      const hit = HIT_ID_RE.exec(key);
      answers.push({
        key,
        kind: hit ? 'hit' : 'file',
        path: hit ? hit[1] : key,
        verdict: m[2],
        reason: (m[3] ?? '').trim(),
        line: b.line,
        bytes: b.bytes,
      });
    }
  }

  const vSec = sectionRange(lines, '検証コマンド', mask);
  const verifyCommands = vSec ? bulletLines(lines, vSec, mask).flatMap((b) => [...b.text.matchAll(/`([^`]+)`/g)].map((m) => m[1])) : [];

  const sectionBytes = (name) => {
    const r = sectionRange(lines, name, mask);
    return r ? bytes(lines.slice(r.start, r.end)) : null;
  };
  return {
    files,
    terms,
    termReqs,
    noTermReqs,
    answers,
    malformedAnswers,
    verifyCommands,
    hasVerifySection: vSec !== null,
    hasAnswerSection: ansSec !== null,
    sections: { 機能と責務: sectionBytes('機能と責務'), モデル割当: sectionBytes('モデル割当') },
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}
