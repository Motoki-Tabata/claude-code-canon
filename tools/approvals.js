#!/usr/bin/env node
/**
 * approvals.js（npm run approvals -- <ts> <hash|record|check> …）— 人間ゲートの承認行の記録と照合
 * （design/architecture.md §2・§7）。
 *
 *   hash <gate>                 承認対象の現在のハッシュ（先頭12桁）と対象を出す
 *   record <gate> "<要旨>"      実時刻・対象・ハッシュで承認行を handoff.md の「## 承認」表に追記する
 *   check [--expect G1,G2,…]    全ゲートの有効な承認行（同じゲートは最後の行）を再計算して照合する
 *
 * ゲートは経路（handoff.md の route）で決まる。小: G1 計画（requirements.md＋change-plan.md）→ G2 差分。
 * 大: G1 要件 → G2 設計（change-plan.md）→ G3 差分。文書のゲートは sha256 に、差分のゲートは
 * worktree のブランチの HEAD のコミット sha に束縛する。承認の後で対象が変わる（文書の編集・新しいコミット）と、
 * 古い承認は無効になる。`--expect` に挙げたゲートの行が無いのも違反にする（承認0件の照合が素通りしないように）。
 *
 * exit 0 成功・照合一致／exit 1 対象が無い・不一致・期待した承認行が無い・前提を満たさない／exit 2 引数不正。
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import {
  ALL_GATES,
  APPROVAL_HASH_LEN,
  HANDOFF_FILE,
  ROUTES,
  appendApproval,
  diffGate,
  effectiveApprovals,
  gateNames,
  gateSpec,
  parseApprovals,
  parseHandoff,
} from '../lib/handoff.js';
import { isMainModule, isValidTs } from '../lib/run.js';
import { parseVerifyReport } from '../lib/verify/run.js';

export class ApprovalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApprovalError';
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function handoffPath(root, ts) {
  return path.join(root, 'work', ts, HANDOFF_FILE);
}

/** handoff.md の frontmatter（route・worktree・branch）を読む。route が不正なら例外。 */
function readRun(root, ts) {
  const hp = handoffPath(root, ts);
  if (!existsSync(hp)) throw new ApprovalError(`handoff.md が無い: ${path.relative(root, hp)}`);
  const h = parseHandoff(readFileSync(hp, 'utf8')) ?? {};
  if (!ROUTES.includes(h.route)) throw new ApprovalError(`handoff.md の route が small か large でない（${h.route ?? '未記入'}）`);
  return h;
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    throw new ApprovalError(`git ${args.join(' ')} が失敗した（${cwd}）: ${(e.stderr ?? e.message).toString().trim()}`);
  }
}

/** 差分のゲートの現在の HEAD（worktree のブランチが handoff の branch と違えば例外）。 */
function worktreeHead(h) {
  if (!h.worktree || !h.branch) throw new ApprovalError('handoff.md の frontmatter に worktree か branch が無い');
  if (!existsSync(h.worktree)) throw new ApprovalError(`worktree が無い: ${h.worktree}`);
  const current = git(h.worktree, ['branch', '--show-current']);
  if (current !== h.branch) throw new ApprovalError(`worktree のブランチ（${current || 'detached'}）が handoff の branch（${h.branch}）と違う`);
  return git(h.worktree, ['rev-parse', 'HEAD']);
}

/**
 * ゲートの承認対象の現在のハッシュ。
 * @returns {{gate:string, target:string, hash:string}} target は root 相対のパス（差分のゲートはブランチ名）、hash は先頭12桁
 */
export function gateHash(root, ts, gate) {
  const h = readRun(root, ts);
  const spec = gateSpec(h.route, gate);
  if (!spec) throw new ApprovalError(`ゲート ${gate} は ${h.route} の経路に無い（${gateNames(h.route).join('・')}）`);
  if (spec.commit) return { gate, target: h.branch, hash: worktreeHead(h).slice(0, APPROVAL_HASH_LEN) };
  const rels = spec.docs.map((d) => `work/${ts}/${d}`);
  const bufs = rels.map((rel) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) throw new ApprovalError(`${gate} の承認対象が無い: ${rel}`);
    return readFileSync(abs);
  });
  const hex = bufs.length === 1 ? sha256(bufs[0]) : sha256(bufs.map(sha256).join('\n'));
  return { gate, target: rels.join('+'), hash: hex.slice(0, APPROVAL_HASH_LEN) };
}

/** 現在時刻（ローカル・`YYYY-MM-DD hh:mm`）。 */
function nowStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/**
 * 承認を記録してよいかの前提を確かめる（満たさなければ ApprovalError）。
 *   どのゲートも: 前のゲートの承認が有効であること（上流が無効なまま次の承認を取らせない）。
 *   差分のゲート: worktree に未コミットの変更が無く、verify-report が現在の HEAD を検査して合格していること
 *                （最後のコミットの後に verify を回したこと）。
 */
function assertRecordable(root, ts, gate) {
  const h = readRun(root, ts);
  const names = gateNames(h.route);
  if (!names.includes(gate)) throw new ApprovalError(`ゲート ${gate} は ${h.route} の経路に無い（${names.join('・')}）`);
  const earlier = names.slice(0, names.indexOf(gate));
  if (earlier.length > 0) {
    const c = checkApprovals(root, ts, earlier);
    if (!c.ok) {
      const bad = [...c.results.filter((r) => r.status !== 'ok' && earlier.includes(r.gate)).map((r) => r.gate), ...c.missing];
      throw new ApprovalError(`${gate} の前提: ${bad.join('・')} の承認が無効か無い（先に取り直す）`);
    }
  }
  if (gate === diffGate(h.route)) {
    const head = worktreeHead(h);
    if (git(h.worktree, ['status', '--porcelain'])) throw new ApprovalError(`${gate} の前提: worktree に未コミットの変更がある（コミットして verify を回す）`);
    const vr = path.join(root, 'work', ts, 'verify-report.md');
    if (!existsSync(vr)) throw new ApprovalError(`${gate} の前提: verify-report.md が無い（npm run verify -- ${ts} を回す）`);
    const rep = parseVerifyReport(readFileSync(vr, 'utf8'));
    if (!rep.head) throw new ApprovalError(`${gate} の前提: verify-report.md に検査した HEAD の sha が無い`);
    if (rep.head !== head) {
      throw new ApprovalError(`${gate} の前提: verify-report が検査した HEAD（${rep.head.slice(0, APPROVAL_HASH_LEN)}）が現在（${head.slice(0, APPROVAL_HASH_LEN)}）と違う。最後のコミットの後に npm run verify -- ${ts} を回す`);
    }
    if (!rep.passed) throw new ApprovalError(`${gate} の前提: verify-report が不合格（違反を直して verify を回し直す）`);
  }
}

/** 承認行を handoff.md に追記し、追記した行の値を返す。 */
export function recordApproval(root, ts, gate, summary, now = new Date()) {
  if (!summary || !summary.trim()) throw new ApprovalError('要旨が空');
  assertRecordable(root, ts, gate);
  const row = { ...gateHash(root, ts, gate), at: nowStamp(now), summary: summary.trim() };
  const hp = handoffPath(root, ts);
  writeFileSync(hp, appendApproval(readFileSync(hp, 'utf8'), row));
  return row;
}

/**
 * 有効な承認行をすべて照合する。
 * @returns {{ok:boolean, results:{gate:string, target:string, recorded:string, current:string|null, status:'ok'|'mismatch'|'missing-target'|'target-changed'}[], missing:string[]}}
 */
export function checkApprovals(root, ts, expect = []) {
  const h = readRun(root, ts);
  const names = gateNames(h.route);
  const bad = expect.filter((g) => !names.includes(g));
  if (bad.length > 0) throw new ApprovalError(`ゲート ${bad.join('・')} は ${h.route} の経路に無い（${names.join('・')}）`);
  const eff = effectiveApprovals(parseApprovals(readFileSync(handoffPath(root, ts), 'utf8')));
  const results = [];
  for (const [gate, row] of eff) {
    if (!names.includes(gate)) throw new ApprovalError(`承認表のゲート ${gate} は ${h.route} の経路に無い（${names.join('・')}）`);
    const r = { gate, target: row.target, recorded: row.hash, current: null, status: 'ok' };
    try {
      const now = gateHash(root, ts, gate);
      r.current = now.hash;
      if (row.target !== now.target) r.status = 'target-changed';
      else if (now.hash !== row.hash) r.status = 'mismatch';
    } catch (e) {
      if (!(e instanceof ApprovalError)) throw e;
      r.status = 'missing-target';
    }
    results.push(r);
  }
  const missing = expect.filter((g) => !eff.has(g));
  return { ok: missing.length === 0 && results.every((r) => r.status === 'ok'), results, missing };
}

const USAGE =
  '使い方: npm run approvals -- <ts> hash <G1〜G3> | <ts> record <G1〜G3> "<要旨>" | <ts> check [--expect G1,G2,…]';

function usage() {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

if (isMainModule(import.meta.url)) {
  const [ts, cmd, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || !cmd) usage();
  // 形として不正なゲート名（どの経路にも無い名前）は引数不正（exit 2）。経路に合わないゲートは下で exit 1 にする。
  const gateArgs = cmd === 'check' ? (rest[0] === '--expect' ? (rest[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean) : []) : rest.slice(0, 1);
  if (gateArgs.some((g) => !ALL_GATES.includes(g))) usage();
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
      const c = checkApprovals(CANON_ROOT, ts, expect);
      const label = { ok: '一致', mismatch: '不一致（承認後に変わった）', 'missing-target': '対象が無い', 'target-changed': '記録した対象が違う' };
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
