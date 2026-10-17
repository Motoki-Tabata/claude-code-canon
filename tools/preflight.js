#!/usr/bin/env node
/**
 * preflight.js（npm run preflight -- <ts> --stage <plan|design|build>）— 段の開始時の照合を1回で行う
 * （design/architecture.md §5）。
 *
 *   handoff   work/<ts>/handoff.md があり、frontmatter に worktree・branch・base・canon_commit がある
 *   canon     canon の HEAD が handoff の canon_commit と同じ（違えば WARN。変わったファイルの要約と未コミットの有無を出す。続けるかは人間が決める）
 *   worktree  worktree があり、ブランチが handoff の branch で、base がそのブランチの祖先である（未コミットの変更の件数は情報として出す）
 *   route     design・build は route が決まっている。design は大の経路だけ
 *   inputs    その段の入力が実在する（design: requirements.md・inventory.json／build: requirements.md・change-plan.md・inventory.json・impact.json）
 *   approvals その段の前のゲートの承認が有効（design: G1／build: 差分のゲートより前のすべて）。承認行が無い・承認後に対象が変わったら NG
 *
 * 標準出力は `OK|WARN|NG  項目: 詳細` の行。exit 0 NG なし（WARN は許す）／exit 1 NG あり／exit 2 引数不正。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import { HANDOFF_FILE, ROUTES, STAGES, diffGate, gateNames, parseHandoff } from '../lib/handoff.js';
import { isMainModule, isValidTs } from '../lib/run.js';
import { ApprovalError, checkApprovals } from './approvals.js';

const ok = (name, detail = '') => ({ level: 'OK', name, detail });
const warn = (name, detail) => ({ level: 'WARN', name, detail });
const ng = (name, detail) => ({ level: 'NG', name, detail });

/** 段ごとに要るもの。 */
export const STAGE_INPUTS = {
  plan: [],
  design: ['requirements.md', 'inventory.json'],
  build: ['requirements.md', 'change-plan.md', 'inventory.json', 'impact.json'],
};

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOk(cwd, args) {
  try {
    execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const errText = (e) => (e.stderr ?? e.message).toString().trim();

function canonItem(root, canonCommit) {
  let head;
  try {
    head = git(root, ['log', '-1', '--format=%H']);
  } catch (e) {
    return ng('canon', `canon の HEAD を取れない: ${errText(e)}`);
  }
  const paths = ['.claude', 'lib', 'tools', 'design', 'guide'];
  const dirty = git(root, ['status', '--short', '--', ...paths]);
  if (head === canonCommit && !dirty) return ok('canon', `HEAD ${head.slice(0, 12)} は run の開始時と同じ`);
  const parts = [];
  if (head !== canonCommit) {
    let stat;
    try {
      stat = git(root, ['diff', '--shortstat', canonCommit, 'HEAD', '--', ...paths]) || '差分なし（対象の範囲外のコミット）';
    } catch (e) {
      stat = `比べられない（${errText(e)}）`;
    }
    parts.push(`HEAD が開始時（${canonCommit.slice(0, 12)}）から ${head.slice(0, 12)} に変わった: ${stat}`);
  }
  if (dirty) parts.push(`未コミットの改修が ${dirty.split('\n').length} 件ある`);
  return warn('canon', `run の途中で canon 本体が変わった。${parts.join('。')}。続けてよいか人間に尋ねる`);
}

function worktreeItems(h) {
  if (!existsSync(h.worktree)) return [ng('worktree', `worktree が無い: ${h.worktree}`)];
  let current;
  try {
    current = git(h.worktree, ['branch', '--show-current']);
  } catch (e) {
    return [ng('worktree', `git の状態を読めない: ${errText(e)}`)];
  }
  if (current !== h.branch) return [ng('worktree', `ブランチ（${current || 'detached'}）が handoff の branch（${h.branch}）と違う`)];
  if (!gitOk(h.worktree, ['merge-base', '--is-ancestor', h.base, 'HEAD'])) {
    return [ng('worktree', `base ${h.base.slice(0, 12)} がブランチ ${h.branch} の祖先でない（履歴が書き換わった可能性）`)];
  }
  const changes = git(h.worktree, ['status', '--porcelain']);
  const head = git(h.worktree, ['rev-parse', 'HEAD']);
  return [ok('worktree', `${h.branch} HEAD ${head.slice(0, 12)}（base ${h.base.slice(0, 12)}）未コミットの変更 ${changes ? changes.split('\n').length : 0} 件`)];
}

/**
 * 照合する。
 * @returns {{level:'OK'|'WARN'|'NG', name:string, detail:string}[]}
 */
export function runPreflight(root, ts, stage) {
  const hp = path.join(root, 'work', ts, HANDOFF_FILE);
  if (!existsSync(hp)) return [ng('handoff', `work/${ts}/handoff.md が無い（ts の誤りか、new-run を実行していない）`)];
  const h = parseHandoff(readFileSync(hp, 'utf8')) ?? {};
  const missing = ['worktree', 'branch', 'base', 'canon_commit'].filter((k) => !h[k]);
  if (missing.length) return [ng('handoff', `frontmatter に ${missing.join('・')} が無い`)];
  const items = [ok('handoff', `${ts} stage=${h.stage ?? '-'} status=${h.status ?? '-'} route=${h.route ?? '未決'}`)];
  items.push(canonItem(root, h.canon_commit));
  items.push(...worktreeItems(h));

  if (stage !== 'plan') {
    if (!ROUTES.includes(h.route)) items.push(ng('route', `handoff の route が small か large でない（${h.route ?? '未記入'}）。/canon-plan で決める`));
    else if (stage === 'design' && h.route !== 'large') items.push(ng('route', '設計の段は大の経路だけ（小の経路は /canon-plan の次が /canon-build）'));
    else items.push(ok('route', h.route));
  }

  const absent = STAGE_INPUTS[stage].filter((f) => !existsSync(path.join(root, 'work', ts, f)));
  if (STAGE_INPUTS[stage].length > 0) {
    items.push(absent.length ? ng('inputs', `work/${ts}/ に無い: ${absent.join('・')}`) : ok('inputs', STAGE_INPUTS[stage].join('・')));
  }

  if (stage !== 'plan' && ROUTES.includes(h.route)) {
    const names = gateNames(h.route);
    const expect = stage === 'design' ? ['G1'] : names.slice(0, names.indexOf(diffGate(h.route)));
    try {
      const c = checkApprovals(root, ts, expect);
      for (const r of c.results) if (r.status !== 'ok') items.push(ng('approvals', `${r.gate} が無効（${r.status}）。そのゲートで承認を取り直す`));
      for (const g of c.missing) items.push(ng('approvals', `${g} の承認行が無い`));
      if (c.ok) items.push(ok('approvals', `${expect.join('・')} は有効`));
    } catch (e) {
      if (!(e instanceof ApprovalError)) throw e;
      items.push(ng('approvals', e.message));
    }
  }
  return items;
}

export const formatItems = (items) => items.map((i) => `${i.level.padEnd(4)}  ${i.name}${i.detail ? `: ${i.detail}` : ''}`).join('\n');

if (isMainModule(import.meta.url)) {
  const [ts, flag, stage, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || flag !== '--stage' || !STAGES.includes(stage) || rest.length) {
    process.stderr.write(`使い方: npm run preflight -- <ts> --stage <${STAGES.join('|')}>\n`);
    process.exit(2);
  }
  const items = runPreflight(CANON_ROOT, ts, stage);
  process.stdout.write(`${formatItems(items)}\n`);
  const bad = items.filter((i) => i.level === 'NG').length;
  const warns = items.filter((i) => i.level === 'WARN').length;
  process.stdout.write(bad ? `照合: NG ${bad}件\n` : warns ? `照合: 合格（WARN ${warns}件。内容を人間に示す）\n` : '照合: 合格\n');
  process.exit(bad ? 1 : 0);
}
