/**
 * テスト共通のパス SSoT。ここでは何も再導出しない——`lib/*.js` が既に export 済みの値を
 * そのまま re-export するだけ（`.claude/rules/checks-and-tests.md` の「同じ判定ロジックを複数箇所へ
 * 複製しない」に従う）。
 */

import path from 'node:path';
import { CANON_ROOT } from '../../lib/canon.js';
import { workDir } from '../../lib/run.js';

export { CANON_ROOT as ROOT, DESIGN_DOCS } from '../../lib/canon.js';

export { workDir } from '../../lib/run.js';

/** work/<ts>/generated/（verify のテストが、変えたファイルを置く仮の worktree） */
export function genDir(ts) {
  return path.join(workDir(ts), 'generated');
}

