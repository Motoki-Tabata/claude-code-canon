/**
 * eval/referred.js — eval へ回付される対象の導出（report.js と round.js が共有）。
 */

import { parseExistingDisposition } from '../gates/lib/design-map.js';

/**
 * design-map から「eval へ回付される対象」を導く（G2 の回付規約と同一・§8.4）。
 * @returns {{target: string, condition: string}[]}
 */
export function referredTargets(designMapText) {
  const records = parseExistingDisposition(designMapText);
  const out = [];
  for (const r of records) {
    if (r.disposition === 'keep') {
      out.push({ target: r.path, condition: 'C2' });
      out.push({ target: r.path, condition: 'C4' });
    } else if (r.disposition === 'merge') {
      out.push({ target: r.path, condition: 'merge_target' });
    }
  }
  return out;
}
