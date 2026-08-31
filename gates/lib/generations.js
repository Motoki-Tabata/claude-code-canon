/**
 * gates/lib/generations.js — 機能Y（自己最適化・世代管理）のパス解決。詳細設計書 §13.2 が権威。
 *
 * `generations/` レイアウト契約（2026-08-28 以降、配下は全て .gitignore・実行結果扱い）:
 *   generations/CURRENT                      昇格のたびに書かれる現行世代ラベル（監査用・判定には使わない）
 *   generations/candidate-<label>/.claude/   次世代候補
 *   generations/archive/<ts>/.claude/        昇格時の退避先
 *
 * 全関数は `root`（既定 `CANON_ROOT`）を引数に取る。`tools/promote.js` のテストが
 * 実リポジトリの `.claude/` を書き換えずにスクラッチディレクトリで検証できるようにする
 * 注入口（`gates/g13_worker_privilege.js` の `canonRoot` 注入と同じ設計方針）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from './canon.js';

export const CANDIDATE_PREFIX = 'candidate-';

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isValidLabel(label) {
  return typeof label === 'string' && LABEL_RE.test(label);
}

export function generationsRoot(root = CANON_ROOT) {
  return path.join(root, 'generations');
}
export function currentFile(root = CANON_ROOT) {
  return path.join(generationsRoot(root), 'CURRENT');
}
export function archiveRoot(root = CANON_ROOT) {
  return path.join(generationsRoot(root), 'archive');
}
export function candidateDir(label, root = CANON_ROOT) {
  return path.join(generationsRoot(root), `${CANDIDATE_PREFIX}${label}`);
}
export function candidateClaudeDir(label, root = CANON_ROOT) {
  return path.join(candidateDir(label, root), '.claude');
}
export function archiveDir(ts, root = CANON_ROOT) {
  return path.join(archiveRoot(root), ts);
}
export function liveClaudeDir(root = CANON_ROOT) {
  return path.join(root, '.claude');
}

export function readCurrent(root = CANON_ROOT) {
  const f = currentFile(root);
  if (!existsSync(f)) return null;
  const raw = readFileSync(f, 'utf8').trim();
  return raw || null;
}

export function writeCurrent(label, root = CANON_ROOT) {
  mkdirSync(generationsRoot(root), { recursive: true });
  writeFileSync(currentFile(root), label + '\n', 'utf8');
}

/** `generations/candidate-<label>/` の候補ラベル一覧（存在しなければ空配列）。 */
export function listCandidates(root = CANON_ROOT) {
  const gRoot = generationsRoot(root);
  if (!existsSync(gRoot)) return [];
  return readdirSync(gRoot)
    .filter((name) => name.startsWith(CANDIDATE_PREFIX))
    .filter((name) => statSync(path.join(gRoot, name)).isDirectory())
    .map((name) => name.slice(CANDIDATE_PREFIX.length));
}

/** `generations/archive/` の退避世代一覧（ts 文字列の配列・新しい順）。 */
export function listArchived(root = CANON_ROOT) {
  const aRoot = archiveRoot(root);
  if (!existsSync(aRoot)) return [];
  return readdirSync(aRoot)
    .filter((name) => statSync(path.join(aRoot, name)).isDirectory())
    .sort()
    .reverse();
}
