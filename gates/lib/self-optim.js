/**
 * gates/lib/self-optim.js — 機能Y 自己再生成（§13.2.1）の run sentinel。
 *
 * `work/.self-optim` は `tools/selfopt.js`（`npm run selfopt:begin`）が書く1ファイルで、
 * label と ts の2行を持つ。`/canon` run（`work/.session-ts`）・機能X run
 * （`work/.canon-update-ts`）とは異なり、**終端マーカーの有無で in-flight を判定しない**
 * ——self-optimize-scope-guard（§11.3「ガードの3系統」）が「工程7（generation.done）通過後も
 * `.claude/` の保護を解かない」ために sentinel の存在それ自体を判定材料にするため（§13.2.1）。
 * sentinel のクリアは `tools/selfopt.js end` による明示的な削除のみ。
 *
 * ts をここで自前採番するのは、`tools/new-ts.js`（`/canon` 用）が本 sentinel の存在を見て
 * 新規採番を拒否するようにするため（3方向相互排他）。self-optimize 自身の run 開始が
 * 自分自身の sentinel に拒否される chicken-egg を避けるべく、`tools/selfopt.js begin` が
 * `.session-ts` と `.self-optim` を同時に書く（`tools/new-ts.js` を経由しない）。
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { WORK_ROOT, ensureDir } from './run.js';

export const SELF_OPTIM_FILE = path.join(WORK_ROOT, '.self-optim');

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isValidSelfOptimLabel(label) {
  return typeof label === 'string' && LABEL_RE.test(label);
}

/** sentinel の中身。存在しない／壊れていれば null（＝ in-flight ではない扱い）。 */
export function readSelfOptim() {
  if (!existsSync(SELF_OPTIM_FILE)) return null;
  const raw = readFileSync(SELF_OPTIM_FILE, 'utf8').trim();
  if (!raw) return null;
  const [label, ts] = raw.split(/\r?\n/).map((s) => s.trim());
  if (!label || !ts) return null;
  return { label, ts };
}

export function writeSelfOptim(label, ts) {
  ensureDir(WORK_ROOT);
  writeFileSync(SELF_OPTIM_FILE, `${label}\n${ts}\n`, 'utf8');
}

export function clearSelfOptim() {
  if (existsSync(SELF_OPTIM_FILE)) unlinkSync(SELF_OPTIM_FILE);
}

export function isSelfOptimInFlight() {
  return readSelfOptim() !== null;
}
