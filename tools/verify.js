#!/usr/bin/env node
/**
 * verify.js（npm run verify -- <ts>）— worktree の変えたファイルの検査（design/architecture.md §7）。
 *
 * `work/<ts>/handoff.md` の `worktree`・`base`・`branch` を読み、`git diff --name-only <base>..HEAD` の
 * ファイルに V1〜V9 を当てて `work/<ts>/verify-report.md` を書く。report には検査した HEAD の sha を残す
 * （差分のゲートは、この sha が承認の時点の HEAD と一致することを前提にする）。判定の本体は lib/verify/。
 *
 * exit 0 合格／exit 1 違反がある・入力（handoff・worktree・base）が無い／exit 2 引数不正。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import { HANDOFF_FILE, parseHandoff } from '../lib/handoff.js';
import { isMainModule, isValidTs } from '../lib/run.js';
import { makeContext, readGitState } from '../lib/verify/context.js';
import { renderReport, runChecks, summaryLine } from '../lib/verify/run.js';

const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

export class VerifyInputError extends Error {}

/** <ts> の run を検査し、report を書いて結果を返す。入力が欠けているときは VerifyInputError。 */
export function verifyRun(root, ts, { now = new Date() } = {}) {
  const work = path.join(root, 'work', ts);
  const hp = path.join(work, HANDOFF_FILE);
  if (!existsSync(hp)) throw new VerifyInputError(`work/${ts}/handoff.md が無い`);
  const h = parseHandoff(readFileSync(hp, 'utf8'));
  for (const k of ['worktree', 'base', 'branch']) if (!h?.[k]) throw new VerifyInputError(`handoff.md の frontmatter に ${k} が無い`);
  if (!existsSync(h.worktree)) throw new VerifyInputError(`worktree が無い: ${h.worktree}`);
  let state;
  try {
    state = readGitState(h.worktree, h.base);
  } catch (e) {
    throw new VerifyInputError(`worktree の git の状態を読めない（base ${h.base} が無い可能性）: ${(e.stderr ?? e.message).toString().trim()}`);
  }
  const ctx = makeContext({
    root: h.worktree,
    changed: state.changed,
    tracked: state.tracked,
    requirementsText: readOrNull(path.join(work, 'requirements.md')),
    changePlanText: readOrNull(path.join(work, 'change-plan.md')),
  });
  const results = runChecks(ctx);
  const report = renderReport({
    ts,
    results,
    state: { ...state, base: h.base, branch: h.branch, changedCount: state.changed.length },
    at: now.toISOString(),
  });
  const reportPath = path.join(work, 'verify-report.md');
  writeFileSync(reportPath, report.body);
  return { ok: report.total === 0, results, reportPath, head: state.head, ...report };
}

if (isMainModule(import.meta.url)) {
  const [ts, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || rest.length) {
    process.stderr.write('使い方: npm run verify -- <ts>（<ts> は YYYYMMDD_hhmmss）\n');
    process.exit(2);
  }
  try {
    const r = verifyRun(CANON_ROOT, ts);
    process.stdout.write(
      `[verify] ${r.ok ? '合格' : '不合格'}（違反 ${r.total} 件・warning ${r.warns} 件・未判定 ${r.undetermined} 件）HEAD ${r.head.slice(0, 12)}\n` +
        `[verify] ${summaryLine(r.results)}\n[verify] report: ${path.relative(process.cwd(), r.reportPath)}\n`
    );
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    if (!(e instanceof VerifyInputError)) throw e;
    process.stderr.write(`[verify] ${e.message}\n`);
    process.exit(1);
  }
}
