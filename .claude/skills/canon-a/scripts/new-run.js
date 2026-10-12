#!/usr/bin/env node
/**
 * new-run.js（npm run new-run -- <target> [<ts>]）— run を始める（architecture.md §6・§7）。
 *
 *   1. <ts> を採番する（YYYYMMDD_hhmmss。第2引数で明示もできる）。
 *   2. canon のルートに work/<ts>・output/<ts> の骨格と `work/<ts>/handoff.md` の雛形を作る（git では追跡しない）。
 *      handoff の `mode` は、対象の管理パス集合に既存のファイルがあれば refactor、無ければ new を初期値にする
 *      （ヒアリングで確かめて直す）。
 *   3. canon の HEAD を handoff の `canon_commit` に記録する。各 Phase は開始時にこれと現在の HEAD を比べ、
 *      run の途中で canon 本体が変わっていれば警告する（run の間、canon の版は固定されないため）。
 *   4. 対象が claude-canon 自身なら、run は作ったうえで警告し、handoff の申し送りに配置の扱いを書く。
 *      canon-d は自己指定を拒否する（artifacts.md §10.5）ので、配置は人間がブランチ・npm test・PR で行う。
 *
 * stdout には ts・mode・handoff・canon_commit を1行ずつ `key: value` で出す。対象が canon 自身のときだけ
 * `self_target: true` を足す。
 * exit 0 成功／exit 1 事前検査の失敗（対象が無い・同じ ts の run が既にある・git の失敗）／exit 2 引数不正。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../../../../lib/canon.js';
import { HANDOFF_FILE, appendNote, renderHandoff } from '../../../../lib/handoff.js';
import { walkManaged } from '../../../../lib/managed-paths.js';
import { isMainModule, isValidTs, mintTs } from '../../../../lib/run.js';
import { isCanonSelfTarget } from '../../canon-d/scripts/self-target-guard.js';

export class RunError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunError';
  }
}

/** run の骨格（canon のルートからの相対パス）。artifacts.md §1 のフォルダ構成。 */
export function skeletonDirs(ts) {
  return [
    `work/${ts}/investigation`,
    `work/${ts}/slices`,
    `work/${ts}/review-bundle`,
    `output/${ts}/review`,
    `output/${ts}/deploy`,
  ];
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** 対象が claude-canon 自身のとき、handoff の `## 申し送り` に足す1文。 */
export const SELF_TARGET_NOTE =
  '対象が claude-canon 自身: canon-d の配置は拒否される（artifacts.md §10.5）。Phase C の P4 まで通し、' +
  '人間が output/<ts>/generated/.claude を作業ブランチの canon に重ねて npm test と PR で main に入れる' +
  '（管理パス外の変更があれば output/<ts>/outside-managed/ も重ねる）。生成された README は重ねない（git restore .claude/README.md）。';

/**
 * run を作る。
 * @param {{canonRoot?: string, target: string, ts?: string}} opts
 * @returns {{ts: string, mode: 'new'|'refactor', handoff: string, canonCommit: string, selfTarget: boolean}}
 */
export function createRun({ canonRoot = CANON_ROOT, target, ts = mintTs() }) {
  if (!isValidTs(ts)) throw new RunError(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
  const targetAbs = path.resolve(target);
  if (!existsSync(targetAbs) || !statSync(targetAbs).isDirectory()) {
    throw new RunError(`対象プロジェクトのディレクトリが無い: ${targetAbs}`);
  }
  for (const d of [`work/${ts}`, `output/${ts}`]) {
    if (existsSync(path.join(canonRoot, d))) throw new RunError(`同じ ts の run が既にある: ${path.join(canonRoot, d)}`);
  }
  let canonCommit;
  try {
    canonCommit = git(canonRoot, ['log', '-1', '--format=%H']).trim();
  } catch (e) {
    throw new RunError(`canon の HEAD を取れない: ${(e.stderr ?? e.message).toString().trim()}`);
  }

  for (const d of skeletonDirs(ts)) mkdirSync(path.join(canonRoot, d), { recursive: true });
  const mode = walkManaged(targetAbs).length > 0 ? 'refactor' : 'new';
  const handoff = path.join(canonRoot, 'work', ts, HANDOFF_FILE);
  const selfTarget = isCanonSelfTarget(targetAbs, canonRoot);
  const text = renderHandoff({ ts, target: targetAbs.split(path.sep).join('/'), mode, canonCommit });
  writeFileSync(handoff, selfTarget ? appendNote(text, '申し送り', SELF_TARGET_NOTE) : text);
  return { ts, mode, handoff, canonCommit, selfTarget };
}

if (isMainModule(import.meta.url)) {
  const [target, ts] = process.argv.slice(2);
  if (!target || (ts !== undefined && !isValidTs(ts))) {
    process.stderr.write('使い方: npm run new-run -- <target> [<ts>]（<ts> は YYYYMMDD_hhmmss）\n');
    process.exit(2);
  }
  try {
    const r = createRun({ target, ts: ts ?? mintTs() });
    process.stdout.write(
      [`ts: ${r.ts}`, `mode: ${r.mode}`, `handoff: ${r.handoff}`, `canon_commit: ${r.canonCommit}`, ...(r.selfTarget ? ['self_target: true'] : [])].join('\n') + '\n'
    );
    if (r.selfTarget) process.stderr.write(`[new-run] 警告: ${SELF_TARGET_NOTE}\n`);
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    process.stderr.write(`[new-run] ${e.message}\n`);
    process.exit(1);
  }
}
