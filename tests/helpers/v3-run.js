/**
 * v3 の run のテスト用の足場。使い捨ての対象リポジトリ（git）と、その worktree（`canon/<ts>` ブランチ）、
 * canon のルートの `work/<ts>/`（handoff.md・requirements.md・change-plan.md）を作る。
 *
 * - worktree の置き場所は `CANON_WT_ROOT` で一時ディレクトリに向ける（利用者の `~/.claude-canon/` を触らない）。
 * - `root` を渡すと、その下の `work/<ts>/` を使う（tools/approvals.js・check.js の root 引数）。省略すると
 *   実際の canon のルートの `work/<ts>/` を使い、t.after() で消す（CLI を子プロセスで起動するテスト向け）。
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createWorktree, commitWorktree } from '../../lib/worktree.js';
import { git, gitInit, IDENTITY } from './git.js';
import { scratchDir, writeFile } from './fixtures.js';
import { workDir as realWorkDir } from './paths.js';

export const REQUIREMENTS = `## メタ
confirmed_at: 2026-01-01 09:00

## 確定要件
- id: R1
  want: ルール a に一文を足したい
  confidence: 実物で確認
  evidence: .claude/rules/a.md を読んだ
  files: [.claude/rules/a.md]
  accept: a.md の末尾に「新しい一文」がある

## 未確定

## constraints
constraints:
  hooks:        { allowed: false, reason: "禁止" }
  mcp:          { allowed: false, reason: "禁止" }
  plugins:      { allowed: false, reason: "禁止" }
  experimental: { allowed: false, reason: "禁止" }

conflicts: []
`;

/** 変えるファイルが .claude/rules/a.md の1件だけの change-plan（参照元の扱いは impact の結果に合わせて渡す）。 */
export function changePlan({ answers = '', terms = '', files } = {}) {
  const records =
    files ??
    `- path: .claude/rules/a.md
  op: modify
  reqs: [R1]
  instruct: 末尾に一文を足す（R1）`;
  return `## ファイル
${records}

## 影響の語
${terms}

## 参照元の扱い
${answers}

## 検証コマンド
- \`npm test\`
`;
}

const TARGET_FILES = {
  'CLAUDE.md': '# target\n',
  '.claude/rules/a.md': '---\npaths: ["**"]\n---\n# a\n',
  '.claude/rules/b.md': '---\npaths: ["**"]\n---\n# b\n詳細は `.claude/rules/a.md` を参照。\n',
};

/** fn の間だけ process.env に vars を足す。 */
function withEnv(vars, fn) {
  const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * run を組み立てる。
 * @param {import('node:test').TestContext} t
 * @param {string} ts
 * @param {{route?:string, root?:string, files?:Object<string,string>, requirements?:string|null, plan?:string|null}} [opts]
 */
export function setupRun(t, ts, { route = 'small', root = null, files = TARGET_FILES, requirements = REQUIREMENTS, plan = null } = {}) {
  const tmp = scratchDir(t, 'canon-v3-');
  const target = path.join(tmp, 'target');
  for (const [rel, text] of Object.entries(files)) writeFile(target, rel, text);
  gitInit(target);
  const prev = process.env.CANON_WT_ROOT;
  process.env.CANON_WT_ROOT = path.join(tmp, 'wt');
  let wt;
  try {
    wt = createWorktree({ target, ts });
  } finally {
    if (prev === undefined) delete process.env.CANON_WT_ROOT;
    else process.env.CANON_WT_ROOT = prev;
  }
  const canonRoot = root ?? path.join(tmp, 'canon');
  const work = root ? path.join(root, 'work', ts) : realWorkDir(ts);
  if (!root) t.after(() => rmSync(work, { recursive: true, force: true }));
  mkdirSync(work, { recursive: true });
  writeFileSync(
    path.join(work, 'handoff.md'),
    [
      '---',
      `ts: ${ts}`,
      `target: ${wt.target}`,
      `route: ${route}`,
      `worktree: ${wt.worktree}`,
      `branch: ${wt.branch}`,
      `base: ${wt.base}`,
      'stage: build',
      'status: in_progress',
      '---',
      '',
      '## 進捗',
      '',
      '## 承認',
      '',
      '| ゲート | 日時 | 対象ファイル | sha256(先頭12) | 要旨 |',
      '|---|---|---|---|---|',
      '',
      '## 差し戻し',
      '',
    ].join('\n')
  );
  if (requirements !== null) writeFileSync(path.join(work, 'requirements.md'), requirements);
  if (plan !== null) writeFileSync(path.join(work, 'change-plan.md'), plan);
  return {
    ...wt,
    root: canonRoot,
    work,
    ts,
    /** worktree にファイルを書く（コミットはしない）。 */
    write: (rel, text) => writeFile(wt.worktree, rel, text),
    remove: (rel) => rmSync(path.join(wt.worktree, rel), { force: true }),
    commit: (message = 'canon: テスト') => withEnv(IDENTITY, () => commitWorktree({ worktree: wt.worktree, message })),
    head: () => git(wt.worktree, 'rev-parse', 'HEAD').trim(),
    writeWork: (name, text) => writeFileSync(path.join(work, name), text),
  };
}
