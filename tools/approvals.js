#!/usr/bin/env node
/**
 * approvals.js（npm run approvals -- <ts> <hash|record|check> …）— 人間ゲートの承認行の記録と照合
 * （architecture.md §6.2・§6.3）。
 *
 *   hash <gate>                 承認対象の現在のハッシュ（先頭12桁）と対象パスを出す
 *   record <gate> "<要旨>"      実時刻・対象・ハッシュで承認行を handoff.md の「## 承認」表に追記する
 *   check [--expect P1,P2,…]    全ゲートの有効な承認行（同じゲートは最後の行）を再計算して照合する
 *
 * 承認の後で対象を作り直すと、古い承認は無効になる。照合をオーケストレーターの手計算に任せると、
 * 写し違いと複合シェルコマンドの許可確認が入り込むので、記録と照合を同じ計算の CLI にまとめる。
 * `--expect` に挙げたゲートの行が無いのも違反にする（承認0件の照合が素通りしないように）。
 *
 * 対象のパスは canon のルートからの相対パス。P4 の generated/ は
 * ディレクトリのハッシュ（lib/tree-hash.js。verify-report が記録する値と同じ）。
 *
 * exit 0 成功・照合一致／exit 1 対象が無い・不一致・期待した承認行が無い／exit 2 引数不正。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import {
  APPROVAL_HASH_LEN,
  GATE_TARGETS,
  HANDOFF_FILE,
  appendApproval,
  effectiveApprovals,
  parseApprovals,
} from '../lib/handoff.js';
import { hashTree } from '../lib/tree-hash.js';
import { isMainModule, isValidTs } from '../lib/run.js';

export class ApprovalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApprovalError';
  }
}

function handoffPath(root, ts) {
  return path.join(root, 'work', ts, HANDOFF_FILE);
}

/**
 * ゲートの承認対象の現在のハッシュ。
 * @returns {{gate:string, target:string, hash:string}} target は root 相対、hash は先頭12桁
 */
export function gateHash(root, ts, gate) {
  const spec = GATE_TARGETS[gate];
  if (!spec) throw new ApprovalError(`未知のゲート: ${gate}（P1〜P5）`);
  const target = spec.rel(ts);
  const abs = path.join(root, target);
  if (!existsSync(abs)) throw new ApprovalError(`${gate} の承認対象が無い: ${target}`);
  let hex;
  if (spec.dir) {
    if (!statSync(abs).isDirectory()) throw new ApprovalError(`${gate} の承認対象がディレクトリでない: ${target}`);
    const t = hashTree(abs);
    if (t.files === 0) throw new ApprovalError(`${gate} の承認対象が空: ${target}`);
    hex = t.hash;
  } else {
    hex = createHash('sha256').update(readFileSync(abs)).digest('hex');
  }
  return { gate, target, hash: hex.slice(0, APPROVAL_HASH_LEN) };
}

/** 現在時刻（ローカル・`YYYY-MM-DD hh:mm`）。 */
function nowStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** 承認行を handoff.md に追記し、追記した行の値を返す。 */
export function recordApproval(root, ts, gate, summary, now = new Date()) {
  if (!summary || !summary.trim()) throw new ApprovalError('要旨が空');
  const hp = handoffPath(root, ts);
  if (!existsSync(hp)) throw new ApprovalError(`handoff.md が無い: ${path.relative(root, hp)}`);
  const h = gateHash(root, ts, gate);
  const row = { ...h, at: nowStamp(now), summary: summary.trim() };
  writeFileSync(hp, appendApproval(readFileSync(hp, 'utf8'), row));
  return row;
}

/**
 * 有効な承認行をすべて照合する。
 * @returns {{ok:boolean, results:{gate:string, target:string, recorded:string, current:string|null, status:'ok'|'mismatch'|'missing-target'|'target-changed'}[], missing:string[]}}
 */
export function checkApprovals(root, ts, expect = []) {
  const hp = handoffPath(root, ts);
  if (!existsSync(hp)) throw new ApprovalError(`handoff.md が無い: ${path.relative(root, hp)}`);
  const eff = effectiveApprovals(parseApprovals(readFileSync(hp, 'utf8')));
  const results = [];
  for (const [gate, row] of eff) {
    const spec = GATE_TARGETS[gate];
    if (!spec) throw new ApprovalError(`承認表に未知のゲート: ${gate}`);
    const r = { gate, target: row.target, recorded: row.hash, current: null, status: 'ok' };
    if (row.target !== spec.rel(ts)) {
      r.status = 'target-changed';
    } else {
      try {
        r.current = gateHash(root, ts, gate).hash;
        if (r.current !== row.hash) r.status = 'mismatch';
      } catch (e) {
        if (!(e instanceof ApprovalError)) throw e;
        r.status = 'missing-target';
      }
    }
    results.push(r);
  }
  const missing = expect.filter((g) => !eff.has(g));
  return { ok: missing.length === 0 && results.every((r) => r.status === 'ok'), results, missing };
}

const USAGE =
  '使い方: npm run approvals -- <ts> hash <P1〜P5> | <ts> record <P1〜P5> "<要旨>" | <ts> check [--expect P1,P2,…]';

function usage() {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

if (isMainModule(import.meta.url)) {
  const [ts, cmd, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || !cmd) usage();
  try {
    if (cmd === 'hash') {
      if (rest.length !== 1) usage();
      const h = gateHash(CANON_ROOT, ts, rest[0]);
      process.stdout.write(`${h.gate}  ${h.hash}  ${h.target}\n`);
    } else if (cmd === 'record') {
      if (rest.length !== 2) usage();
      const r = recordApproval(CANON_ROOT, ts, rest[0], rest[1]);
      process.stdout.write(`記録した: | ${r.gate} | ${r.at} | ${r.target} | ${r.hash} | ${r.summary} |\n`);
    } else if (cmd === 'check') {
      let expect = [];
      if (rest.length === 2 && rest[0] === '--expect') expect = rest[1].split(',').map((s) => s.trim()).filter(Boolean);
      else if (rest.length !== 0) usage();
      if (expect.some((g) => !GATE_TARGETS[g])) usage();
      const c = checkApprovals(CANON_ROOT, ts, expect);
      const label = { ok: '一致', mismatch: '不一致（承認後に変わった）', 'missing-target': '対象が無い', 'target-changed': '記録した対象のパスが違う' };
      for (const r of c.results) {
        process.stdout.write(`${r.gate}  ${label[r.status]}  記録 ${r.recorded}  現在 ${r.current ?? '-'}  ${r.target}\n`);
      }
      for (const g of c.missing) process.stdout.write(`${g}  承認行が無い\n`);
      if (c.results.length === 0 && expect.length === 0) process.stdout.write('承認行 0件\n');
      process.stdout.write(c.ok ? '照合: すべて有効\n' : '照合: 無効な承認がある（そのゲートで承認を取り直す）\n');
      process.exit(c.ok ? 0 : 1);
    } else {
      usage();
    }
  } catch (e) {
    if (!(e instanceof ApprovalError)) throw e;
    process.stderr.write(`[approvals] ${e.message}\n`);
    process.exit(1);
  }
}
