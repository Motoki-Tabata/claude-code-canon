/**
 * テスト共通のパス SSoT。ここでは何も再導出しない——`gates/lib/*.js` が既に export
 * 済みの値をそのまま re-export するだけ（`.claude/rules/gates-and-tests.md` の
 * 「同じ判定ロジックを複数箇所へ複製しない」に従う）。
 */

import path from 'node:path';
import { outputDir } from '../../gates/lib/run.js';

export { CANON_ROOT as ROOT, posix, DESIGN_DOCS } from '../../gates/lib/canon.js';

export { outputDir, workDir } from '../../gates/lib/run.js';

/** output/<ts>/generated/ */
export function genDir(ts) {
  return path.join(outputDir(ts), 'generated');
}
