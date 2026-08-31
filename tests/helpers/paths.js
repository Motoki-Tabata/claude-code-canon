/**
 * テスト共通のパス SSoT。ここでは何も再導出しない——`gates/lib/*.js` が既に export
 * 済みの値をそのまま re-export するだけ（`.claude/rules/gates-and-tests.md` の
 * 「同じ判定ロジックを複数箇所へ複製しない」に従う）。
 *
 * 継ぎ足しで25ファイルが `ROOT`・`SESSION_TS`・`outputDir`/`workDir` 等を個別に
 * 手書き再導出していた（gates/lib/run.js を import していながら再実装している
 * ファイルも3つあった）。以後の新規テストはここから import する。
 */

import path from 'node:path';
import { outputDir } from '../../gates/lib/run.js';

export {
  CANON_ROOT as ROOT,
  posix,
  DESIGN_DOC_BASIC,
  DESIGN_DOC_DETAIL,
  DESIGN_DOCS,
  designDocRegExp,
} from '../../gates/lib/canon.js';

export {
  OUTPUT_ROOT,
  WORK_ROOT,
  SESSION_TS_FILE,
  outputDir,
  workDir,
  gateDir,
  markersDir,
  approvalsDir,
  blocksDir,
  requestsDir,
  resolveTargetRoot,
  markerPath,
  hasMarker,
  approvalPath,
  hasApproval,
  blockLatchPath,
  hasBlockLatch,
  requestPath,
  hasRequest,
  isValidTs,
  isRunInFlight,
} from '../../gates/lib/run.js';

export { CANON_UPDATE_SESSION_TS_FILE } from '../../gates/lib/canon-run.js';
export { SELF_OPTIM_FILE } from '../../gates/lib/self-optim.js';

/** output/<ts>/generated/ （5ファイルが手書きしていたものを1箇所に）。 */
export function genDir(ts) {
  return path.join(outputDir(ts), 'generated');
}
