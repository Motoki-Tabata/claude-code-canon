/**
 * run の相互排他（3方向: /canon・機能X /update-docs・機能Y /self-optimize は同時に in-flight にできない）。
 *
 * `tools/resume.js` が「再開しようとしている run <ts> 以外に、in-flight の run が無いか」を調べる材料。
 * new-ts / new-canon-ts / selfopt は各自の開始側の検査を持つ（開始と再開で見る向きが違う）が、
 * どの run が in-flight かの判定（currentRunTs・currentCanonUpdateRunTs・readSelfOptim）は同じ関数を使う。
 */

import { currentRunTs } from './run.js';
import { currentCanonUpdateRunTs } from './canon-run.js';
import { readSelfOptim } from './self-optim.js';

/**
 * `ts` を再開するにあたって衝突する in-flight の run を返す。
 * @returns {{ kind: 'canon'|'canon-update'|'self-optim', ts: string, message: string, overridable: boolean }[]}
 */
export function conflictingRuns(ts) {
  const out = [];
  const canon = currentRunTs();
  if (canon && canon !== ts) {
    out.push({
      kind: 'canon',
      ts: canon,
      overridable: true,
      message: `別の /canon run（${canon}）が in-flight（終端マーカー未鋳造）。work/.session-ts がそちらを指している。`,
    });
  }
  const update = currentCanonUpdateRunTs();
  if (update) {
    out.push({
      kind: 'canon-update',
      ts: update,
      overridable: false,
      message: `機能X（/update-docs）の run（${update}）が in-flight。/canon とは相互排他のため、先にその run を完了させること。`,
    });
  }
  const selfOptim = readSelfOptim();
  if (selfOptim && selfOptim.ts !== ts) {
    out.push({
      kind: 'self-optim',
      ts: selfOptim.ts,
      overridable: false,
      message: `自己最適化 run（label=${selfOptim.label}・ts=${selfOptim.ts}）が in-flight。先に npm run selfopt:end で終了させること。`,
    });
  }
  return out;
}
