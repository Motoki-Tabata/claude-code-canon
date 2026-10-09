/**
 * テスト共通のパス SSoT。ここでは何も再導出しない——`lib/*.js` が既に export 済みの値を
 * そのまま re-export するだけ（`.claude/rules/checks-and-tests.md` の「同じ判定ロジックを複数箇所へ
 * 複製しない」に従う）。
 */

import path from 'node:path';
import { CANON_ROOT } from '../../lib/canon.js';
import { outputDir } from '../../lib/run.js';

export { CANON_ROOT as ROOT, posix, DESIGN_DOCS } from '../../lib/canon.js';

export { outputDir, workDir } from '../../lib/run.js';

/** output/<ts>/generated/ */
export function genDir(ts) {
  return path.join(outputDir(ts), 'generated');
}

/** Phase Skill の scripts/ ディレクトリ（`phase` は 'canon-a'・'canon-c'・'canon-d'）。 */
export function scriptsDir(phase) {
  return path.join(CANON_ROOT, '.claude', 'skills', phase, 'scripts');
}
