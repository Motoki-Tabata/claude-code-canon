/**
 * eval/round.js — eval の周回（round 2 以降は差分だけ再判定する）と、判定の引き継ぎ（詳細設計書 §16）。決定論。
 *
 * 【なぜ要るか】eval は5軸の judge が生成物・design-map を毎回読み直す。実測（run 20260919・20260922）で
 * eval 全体が総入力の 16〜20%（1周で約7M・それを2周）を占めた。round 2 は「指摘を受けて直した箇所」の
 * 確認が目的なので、**変更のあったファイルと round 1 の違反対象だけ**を再判定し、それ以外は round 1 の判定を
 * 引き継ぐ。引き継ぎは「新しい判定を古い判定で上書きする」危険と表裏なので、次の規律で守る:
 *
 *   - 判定は**軸ごとの「有効な verdict」**（`effective-r<N>.json`）として、eval:report が全軸判定済みと確かめた
 *     ときだけ保存する。round N+1 は round N の有効 verdict を土台にする。
 *   - 再判定する対象（rejudge_targets）の判定は新しい verdict で置き換え、それ以外は前 round のまま残す
 *     （`mergeVerdict`）。再判定すべき対象が新しい verdict の coverage に無ければ「未判定」として落とす
 *     （未判定を pass と読まない・§16.5）。
 *   - security 軸は、変更があれば常に再判定する（違反0件だった軸でも、変更ファイルが新たな違反を持ち込みうる
 *     ——最も見落としのコストが高い軸）。他の軸は、前 round に違反があったときだけ再判定する。
 *   - 再判定する軸のファイル（`output/<ts>/eval/<axis>.md`）は round 開始時に消す（古い verdict が
 *     新しい判定に見えないように。S2-2 と同型）。前 round のものは `eval/round<N-1>/` へ退避する。
 *
 * 生成物のスナップショット（`work/<ts>/eval-bundle/.snapshot-r<N>.json`・generated/ の sha256）が、
 * 「何が変わったか」の唯一の根拠になる。
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync } from 'node:fs';
import { outputDir, workDir } from '../gates/lib/run.js';
import { referredTargets } from './referred.js';
import { AXES, loadVerdict, violationFindings } from './verdict.js';

export class RoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RoundError';
  }
}

const norm = (t) => String(t).trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^generated\//, '');

// ---------------------------------------------------------------------------
// ファイル配置
// ---------------------------------------------------------------------------

export const bundleDir = (wDir) => path.join(wDir, 'eval-bundle');
export const roundPath = (wDir) => path.join(bundleDir(wDir), 'round.json');
export const snapshotPath = (wDir, n) => path.join(bundleDir(wDir), `.snapshot-r${n}.json`);
export const effectivePath = (wDir, n) => path.join(bundleDir(wDir), `effective-r${n}.json`);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------------------
// スナップショット
// ---------------------------------------------------------------------------

/** generated/ 配下の全ファイルの {相対パス: sha256}。 */
export function snapshotGenerated(generatedRoot) {
  const out = {};
  if (!existsSync(generatedRoot)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[path.relative(generatedRoot, p).replace(/\\/g, '/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
    }
  };
  walk(generatedRoot);
  return out;
}

/** @returns {{ changed: string[], removed: string[] }} changed は追加・内容変更。 */
export function diffSnapshots(prev, cur) {
  const changed = Object.keys(cur).filter((f) => prev[f] !== cur[f]).sort();
  const removed = Object.keys(prev).filter((f) => !(f in cur)).sort();
  return { changed, removed };
}

// ---------------------------------------------------------------------------
// round 1（新規開始）
// ---------------------------------------------------------------------------

/**
 * round 1 を始める: eval-bundle/ を空にし、前の試行の判定結果（eval/*.md・eval-report.md）を消し、
 * 生成物のスナップショット r1 を保存する。round 1 の再実行は「やり直し」なので、前の試行の判定が
 * 新しい判定に見えてはならない（S2-2）。
 * @returns {{ removed: string[] }} 消したパス（呼び出し側が表示する）
 */
export function startFirstRound({ ts, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const generatedRoot = roots.generatedRoot ?? path.join(oDir, 'generated');
  const removed = [];
  rmSync(bundleDir(wDir), { recursive: true, force: true });
  const evalDir = path.join(oDir, 'eval');
  if (existsSync(evalDir)) {
    rmSync(evalDir, { recursive: true, force: true });
    removed.push(evalDir);
  }
  const report = path.join(oDir, 'eval-report.md');
  if (existsSync(report)) {
    rmSync(report);
    removed.push(report);
  }
  mkdirSync(bundleDir(wDir), { recursive: true });
  writeFileSync(snapshotPath(wDir, 1), JSON.stringify(snapshotGenerated(generatedRoot), null, 2) + '\n', 'utf8');
  return { removed };
}

// ---------------------------------------------------------------------------
// round N（N ≥ 2）
// ---------------------------------------------------------------------------

/**
 * round N の計画を立てる（副作用なし）。
 * @returns {{ round:number, prev_round:number, rejudge_axes:string[], carry_axes:string[],
 *   changed:string[], removed:string[], rejudge_targets:Record<string,string[]>, missing_referred:string[] }}
 */
export function planRound({ ts, round, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const generatedRoot = roots.generatedRoot ?? path.join(oDir, 'generated');
  const prev = round - 1;
  if (!Number.isInteger(round) || round < 2) throw new RoundError(`round は 2 以上の整数（実際: ${round}）。round 1 は npm run eval:bundle -- <ts>。`);
  if (!existsSync(snapshotPath(wDir, prev))) {
    throw new RoundError(`前 round のスナップショット（${path.basename(snapshotPath(wDir, prev))}）が無い。先に round ${prev} を npm run eval:bundle -- <ts> で開始すること。`);
  }
  if (!existsSync(effectivePath(wDir, prev))) {
    throw new RoundError(
      `round ${prev} の有効な判定（${path.basename(effectivePath(wDir, prev))}）が無い。` +
        `round ${prev} を npm run eval:report -- <ts> --write で全軸判定済みと確定してから次の round に進むこと。`
    );
  }
  const prevEff = readJson(effectivePath(wDir, prev));
  const { changed, removed } = diffSnapshots(readJson(snapshotPath(wDir, prev)), snapshotGenerated(generatedRoot));

  // 回付対象（keep/merge）。design-map が無い・パースできない場合は keep-review の判定対象を確定できない。
  const dmPath = path.join(oDir, 'design-map.md');
  const referredPaths = existsSync(dmPath) ? [...new Set(referredTargets(readFileSync(dmPath, 'utf8')).map((r) => norm(r.target)))] : [];

  const touched = new Set([...changed, ...removed].map(norm));
  const rejudge_axes = [];
  const rejudge_targets = {};
  let missing_referred = [];
  for (const axis of AXES) {
    const p = prevEff[axis];
    if (!p) throw new RoundError(`round ${prev} の有効な判定に軸 "${axis}" が無い。`);
    const violationTargets = violationFindings(p).map((f) => norm(f.target));
    const targets = new Set([...touched, ...violationTargets]);
    let rejudge = violationTargets.length > 0;
    if (axis === 'security' && touched.size > 0) rejudge = true;
    if (axis === 'keep-review') {
      const covered = new Set(p.coverage.map(norm));
      missing_referred = referredPaths.filter((t) => !covered.has(t));
      for (const t of missing_referred) targets.add(t);
      if (referredPaths.some((t) => touched.has(t)) || missing_referred.length > 0) rejudge = true;
    }
    if (rejudge) {
      rejudge_axes.push(axis);
      rejudge_targets[axis] = [...targets].sort();
    }
  }
  return {
    round,
    prev_round: prev,
    rejudge_axes,
    carry_axes: AXES.filter((a) => !rejudge_axes.includes(a)),
    changed: changed.map(norm),
    removed: removed.map(norm),
    rejudge_targets,
    missing_referred,
  };
}

/**
 * 計画を適用する: round.json とスナップショット rN を書き、前 round の軸ファイルを退避し、
 * 再判定する軸のファイルと eval-report.md を消す（古い判定が新しい判定に見えないように）。
 * @returns {{ archived: string[], removed: string[] }}
 */
export function applyRound({ ts, plan, roots = {} }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const generatedRoot = roots.generatedRoot ?? path.join(oDir, 'generated');
  const evalDir = path.join(oDir, 'eval');
  const archived = [];
  const removed = [];

  mkdirSync(bundleDir(wDir), { recursive: true });
  writeFileSync(roundPath(wDir), JSON.stringify(plan, null, 2) + '\n', 'utf8');
  writeFileSync(snapshotPath(wDir, plan.round), JSON.stringify(snapshotGenerated(generatedRoot), null, 2) + '\n', 'utf8');

  if (existsSync(evalDir)) {
    const arch = path.join(evalDir, `round${plan.prev_round}`);
    mkdirSync(arch, { recursive: true });
    for (const axis of AXES) {
      const f = path.join(evalDir, `${axis}.md`);
      if (!existsSync(f)) continue;
      copyFileSync(f, path.join(arch, `${axis}.md`));
      archived.push(path.join(arch, `${axis}.md`));
      if (plan.rejudge_axes.includes(axis)) {
        rmSync(f);
        removed.push(f);
      }
    }
  }
  const report = path.join(oDir, 'eval-report.md');
  if (existsSync(report)) {
    rmSync(report);
    removed.push(report);
  }
  return { archived, removed };
}

export function readRound(wDir) {
  return existsSync(roundPath(wDir)) ? readJson(roundPath(wDir)) : null;
}

// ---------------------------------------------------------------------------
// 判定の合成
// ---------------------------------------------------------------------------

/**
 * 前 round の有効な verdict `prior` の、再判定対象 `targets` の分を、新しい verdict `next` で置き換える。
 * 対象外の判定（coverage・findings）は前 round のまま残す。
 */
export function mergeVerdict(prior, next, targets) {
  const T = new Set(targets.map(norm));
  const coverage = [...new Set([...prior.coverage.filter((c) => !T.has(norm(c))), ...next.coverage])];
  const findings = [...prior.findings.filter((f) => !T.has(norm(f.target))), ...next.findings];
  return { axis: next.axis ?? prior.axis, ts: next.ts ?? prior.ts, coverage, findings };
}

/**
 * 全軸の「有効な verdict」を読む。round.json が無ければ（round 1）各軸ファイルをそのまま読む。
 * round N のときは、引き継ぐ軸は前 round の有効 verdict、再判定する軸は新しい verdict を前 round の
 * 判定と合成したものを返す。返り値の各要素は `loadVerdict` と同じ形（ok・verdict・violations・warnings）に
 * `carried`・`rejudged` を足したもの。
 */
export function loadEffectiveVerdicts({ ts, roots = {}, axes = AXES }) {
  const oDir = roots.outputDir ?? outputDir(ts);
  const wDir = roots.workDir ?? workDir(ts);
  const plan = readRound(wDir);
  const perAxis = {};
  if (!plan) {
    for (const axis of axes) perAxis[axis] = loadVerdict(path.join(oDir, 'eval', `${axis}.md`), `eval/${axis}.md`);
    return { perAxis, plan: null };
  }
  if (!existsSync(effectivePath(wDir, plan.prev_round))) {
    throw new RoundError(`round ${plan.prev_round} の有効な判定（${path.basename(effectivePath(wDir, plan.prev_round))}）が無い。`);
  }
  const prevEff = readJson(effectivePath(wDir, plan.prev_round));
  for (const axis of axes) {
    if (plan.carry_axes.includes(axis)) {
      perAxis[axis] = prevEff[axis]
        ? { ok: true, verdict: prevEff[axis], violations: [], warnings: [], carried: true }
        : { ok: false, verdict: null, violations: [`eval/${axis}.md: 引き継ぐ前 round の判定が無い。`], warnings: [], carried: true };
      continue;
    }
    const next = loadVerdict(path.join(oDir, 'eval', `${axis}.md`), `eval/${axis}.md`);
    if (!next.ok) {
      perAxis[axis] = { ...next, rejudged: true };
      continue;
    }
    // 再判定すべき対象（削除されたファイルを除く）が新しい verdict の coverage に無ければ未判定。
    const required = plan.rejudge_targets[axis].filter((t) => !plan.removed.includes(t));
    const covered = new Set(next.verdict.coverage.map(norm));
    const missing = required.filter((t) => !covered.has(t));
    if (missing.length > 0) {
      perAxis[axis] = {
        ok: false,
        verdict: null,
        violations: [
          `eval/${axis}.md: round ${plan.round} で再判定すべき対象が coverage に無い（未判定を pass と読まない・§16.5）: ${missing.join(', ')}`,
        ],
        warnings: next.warnings,
        rejudged: true,
      };
      continue;
    }
    perAxis[axis] = {
      ok: true,
      verdict: mergeVerdict(prevEff[axis], next.verdict, plan.rejudge_targets[axis]),
      violations: [],
      warnings: next.warnings,
      rejudged: true,
    };
  }
  return { perAxis, plan };
}

/** 全軸判定済みと確かめられた有効な verdict を保存する（次の round の土台）。 */
export function saveEffective({ ts, roots = {}, perAxis, round }) {
  const wDir = roots.workDir ?? workDir(ts);
  const eff = {};
  for (const axis of AXES) {
    if (!perAxis[axis]?.ok) throw new RoundError(`軸 "${axis}" が判定不能のため、有効な判定を保存できない。`);
    eff[axis] = perAxis[axis].verdict;
  }
  mkdirSync(bundleDir(wDir), { recursive: true });
  writeFileSync(effectivePath(wDir, round), JSON.stringify(eff, null, 2) + '\n', 'utf8');
}
