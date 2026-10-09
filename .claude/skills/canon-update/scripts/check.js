#!/usr/bin/env node
/**
 * check.js（npm run reference-check [-- --online] [--root <canon-reference のディレクトリ>]）。
 *
 * 正典リファレンスの検査（references/build.md §8）を実行する。
 * - 既定: オフラインの検査（1・3・6・7・8・9・11）。
 * - `--online`: ネットワークの検査（2・4・5）も実行する。付けないとき 2・4・5 は「未実行」と表示する
 *   （合格に数えない）。
 * - 10（独立2回の取得の一致）と 12（`npm test`）はスクリプトにしない。
 *
 * exit code: 0 = 実行した検査に違反なし / 1 = 違反あり、または走査件数 0 の検査がある / 2 = 引数不正。
 */

import path from 'node:path';
import { REFERENCE_DIR } from '../../../../lib/reference-data.js';
import { isMainModule } from '../../../../lib/run.js';
import { OFFLINE_CHECKS, ONLINE_CHECKS } from './checks.js';

function parseArgs(argv) {
  const opts = { online: false, root: REFERENCE_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--online') opts.online = true;
    else if (argv[i] === '--root' && argv[i + 1]) opts.root = path.resolve(argv[++i]);
    else return null;
  }
  return opts;
}

export async function runChecks({ root, online }) {
  const results = [];
  for (const check of OFFLINE_CHECKS) results.push(check(root));
  if (online) {
    for (const check of ONLINE_CHECKS) {
      try {
        results.push(await check(root));
      } catch (e) {
        results.push({ id: '?', name: check.name, scanned: 0, violations: [`検査を実行できない: ${e.message}`] });
      }
    }
  }
  for (const r of results) {
    // 対象が0件の検査は合格にしない（vacuous pass）。
    if (r.scanned === 0 && r.violations.length === 0) r.violations.push('走査した対象が0件（対象が無いことを合格にしない）');
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts) {
    process.stderr.write('[reference-check] 使い方: npm run reference-check [-- --online] [--root <dir>]\n');
    process.exit(2);
  }
  const results = await runChecks(opts);
  let failed = 0;
  for (const r of results.sort((a, b) => a.id - b.id)) {
    const ok = r.violations.length === 0;
    if (!ok) failed++;
    process.stdout.write(`${ok ? 'OK  ' : 'NG  '} 検査${r.id} ${r.name}（${r.scanned} 件）\n`);
    for (const v of r.violations) process.stdout.write(`      - ${v}\n`);
  }
  if (!opts.online) process.stdout.write('未実行 検査2・4・5（ネットワーク。--online で実行）／検査10・12 はスクリプトにしない\n');
  else process.stdout.write('未実行 検査10・12（スクリプトにしない）\n');
  process.stdout.write(failed ? `違反あり: ${failed} 検査\n` : '違反なし\n');
  process.exit(failed ? 1 : 0);
}

if (isMainModule(import.meta.url)) await main();
