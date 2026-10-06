/**
 * lib/claude-session.js — Claude Code のセッション履歴（`~/.claude/projects/<slug>/<session-id>.jsonl`）の場所。
 * `npm run tokens` と `npm run handoff -- <ts> session` が共有する。
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PROJECTS_ROOT = path.join(os.homedir(), '.claude', 'projects');

/**
 * Claude Code のプロジェクトディレクトリ名（`~/.claude/projects/<slug>/`）。
 * 英数字以外の文字をすべて `-` に置き換えたもの（`/` `\\` `:` `.` `_` など。Windows のパスでも同じ）。
 */
export function projectSlug(projectPath) {
  return projectPath.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * プロジェクトで最後に書かれたセッションの id（jsonl の更新時刻が最新のもの）。実行中のセッション自身を指す。
 * ディレクトリや jsonl が無ければ null。
 */
export function latestSessionId(projectPath, projectsRoot = DEFAULT_PROJECTS_ROOT) {
  const dir = path.join(projectsRoot, projectSlug(projectPath));
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || a.f.localeCompare(b.f));
  return files.length ? files[0].f.replace(/\.jsonl$/, '') : null;
}
