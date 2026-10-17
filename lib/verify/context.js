/**
 * lib/verify/context.js — verify の判定入力（変えたファイルと、worktree の追跡ファイルの索引）。
 *
 * verify は変えたファイルだけを見る（design/architecture.md §7）。触らないファイルは base のまま変わらず、
 * それへの影響は V6 の参照整合と `impact` が受け持つ。そのため、コンテキストは次の2つを持つ。
 *   - ファイルの本文を読むのは変えたファイル（`files`）だけ。削除したファイルは `deleted` に名前だけ。
 *   - 触らないファイルは、実在の判定（`has`・`hasDir`）と preload 先の skill の定義（`skillDefinitions`）にだけ使う。
 * 組み立ては `makeContext` に集め、git からの読み出し（`readGitState`）と分ける。テストは git を使わず
 * `makeContext` に直接渡せる。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { artifactFromText, skillPathRole } from '../artifact.js';
import { parseChangePlan, ChangePlanError } from '../change-plan.js';
import { computeImpact } from '../impact.js';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * worktree の git の状態を読む。
 * @returns {{head:string, dirty:string[], changed:{rel:string,status:string}[], tracked:string[]}}
 */
export function readGitState(worktree, base) {
  const head = git(worktree, ['rev-parse', 'HEAD']).trim();
  const dirty = git(worktree, ['status', '--porcelain', '-z']).split('\0').filter(Boolean);
  const raw = git(worktree, ['diff', '--name-status', '-z', '--no-renames', `${base}..HEAD`]).split('\0').filter(Boolean);
  const changed = [];
  for (let i = 0; i + 1 < raw.length; i += 2) changed.push({ status: raw[i][0], rel: raw[i + 1] });
  const tracked = git(worktree, ['ls-files', '-z']).split('\0').filter(Boolean);
  return { head, dirty, changed, tracked };
}

/**
 * コンテキストを組み立てる。
 * @param {{root:string, changed:{rel:string,status:string}[], tracked:string[], requirementsText?:string|null, changePlanText?:string|null, deletedHits?:Array|null}} input
 * deletedHits: 削除したファイルを指す、残りのファイルの該当（省略すると root の git で `impact` と同じ走査をする。テストは差し込める）
 */
export function makeContext({ root, changed, tracked, requirementsText = null, changePlanText = null, deletedHits = null }) {
  const files = [];
  const deleted = [];
  for (const c of changed) {
    if (c.status === 'D') {
      deleted.push(c.rel);
      continue;
    }
    const abs = path.join(root, c.rel);
    const bytes = readFileSync(abs);
    const text = bytes.toString('utf8');
    files.push({ rel: c.rel, abs, bytes, text, status: c.status, artifact: c.rel.endsWith('.md') ? artifactFromText(c.rel, text) : null });
  }
  files.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
  const byRel = new Map(files.map((f) => [f.rel, f]));

  const trackedSet = new Set(tracked);
  const dirs = new Set();
  for (const r of tracked) {
    for (let d = path.posix.dirname(r); d !== '.' && d !== '/' && !dirs.has(d); d = path.posix.dirname(d)) dirs.add(d);
  }

  let changePlan = null;
  let changePlanError = null;
  if (changePlanText !== null) {
    try {
      changePlan = parseChangePlan(changePlanText);
    } catch (e) {
      if (!(e instanceof ChangePlanError)) throw e;
      changePlanError = e.message;
    }
  }
  // 「参照元の扱い」の回答。キーは該当の ID（<path>:<line>:<term>）かファイルのパス。
  const planAnswers = changePlan ? new Map(changePlan.answers.map((a) => [a.key, a])) : null;

  let skillCache = null;
  return {
    root,
    files,
    byRel,
    deleted,
    tracked,
    has: (rel) => trackedSet.has(rel),
    hasDir: (rel) => dirs.has(rel),
    requirementsText,
    changePlanText,
    changePlan,
    changePlanError,
    planAnswers,
    /** 削除したファイルを指す、残りのファイルの該当（`impact` と同じ走査）。 */
    deletedRefHits() {
      if (deleted.length === 0) return [];
      return deletedHits ?? computeImpact(root, { files: deleted, terms: [] }).hits;
    },
    /** HEAD の全 skill 定義（変えたファイルは差分の本文、触らないファイルは worktree から読む）。 */
    skillDefinitions() {
      if (skillCache) return skillCache;
      skillCache = tracked
        .filter((r) => skillPathRole(r) === 'definition')
        .map((rel) => {
          const f = byRel.get(rel);
          if (f?.artifact) return { rel, artifact: f.artifact };
          return { rel, artifact: artifactFromText(rel, readFileSync(path.join(root, rel), 'utf8')) };
        });
      return skillCache;
    },
  };
}
