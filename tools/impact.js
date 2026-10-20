#!/usr/bin/env node
/**
 * impact.js（npm run impact -- --root <worktree> --out <dir> --files <a,b,...> [--terms <語,...>]）
 *            （npm run impact -- --root <worktree> --out <dir> --from-plan <change-plan.md>）
 *
 * 変える・削除するファイルと語・コマンド（`/name` はスラッシュコマンド）に触れている、触らない
 * ファイルと、変えるファイルの中で語に触れている行を、行番号付きで `<dir>/impact.json` に書き、
 * 要約だけを標準出力に返す。
 * 該当の ID は `<path>:<line>:<term>`。判定の本体は lib/impact.js。
 * `--from-plan` は、ファイルを change-plan.md の `## ファイル`、語を `## 影響の語` から読む（`--files`・`--terms` とは併用しない）。
 * `<dir>/impact-ids.txt` に、1行1件の `<ID><TAB><行の抜粋>` も書く。
 *
 * exit 0 走査して書いた（該当 0 件でも書く）／exit 1 root が無い・git でない・走査したファイルが 0 件／
 * exit 2 引数不正（--files と --terms がどちらも空を含む・--from-plan と併用・change-plan.md が読めない／構造が不正）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { computeImpact, renderImpactIds, renderImpactSummary } from '../lib/impact.js';
import { ChangePlanError, parseChangePlan } from '../lib/change-plan.js';
import { isMainModule } from '../lib/run.js';

const USAGE = '使い方: npm run impact -- --root <worktree> --out <dir> --files <a,b,...> [--terms <語,...>]（files・terms はカンマ区切り。どちらか一方は空でない）\n       npm run impact -- --root <worktree> --out <dir> --from-plan <change-plan.md>';

const split = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { root: { type: 'string' }, out: { type: 'string' }, files: { type: 'string' }, terms: { type: 'string' }, 'from-plan': { type: 'string' } }, strict: true }));
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  let input = { files: split(values.files), terms: split(values.terms) };
  if (values['from-plan'] !== undefined) {
    if (values.files !== undefined || values.terms !== undefined) {
      process.stderr.write(`--from-plan は --files・--terms と併用しない\n${USAGE}\n`);
      return 2;
    }
    try {
      const plan = parseChangePlan(readFileSync(path.resolve(values['from-plan']), 'utf8'));
      input = { files: [...new Set(plan.files.map((f) => f.path).filter(Boolean))], terms: [...new Set(plan.terms)] };
    } catch (e) {
      if (!(e instanceof ChangePlanError) && e.code !== 'ENOENT' && e.code !== 'EISDIR') throw e;
      process.stderr.write(`impact: change-plan を読めない: ${e.message}\n`);
      return 2;
    }
  }
  if (!values.root || !values.out || input.files.length + input.terms.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const root = path.resolve(values.root);
  let result;
  try {
    result = computeImpact(root, input);
  } catch (e) {
    process.stderr.write(`impact: 走査できない（root が無い・git でない可能性）: ${(e.stderr ?? e.message).toString().trim()}\n`);
    return 1;
  }
  if (result.scanned === 0) {
    process.stderr.write('impact: 走査したファイルが 0 件（root を確かめる。空の結果を合格にしない）\n');
    return 1;
  }
  const out = path.resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'impact.json'), `${JSON.stringify({ root, input, ...result }, null, 2)}\n`);
  writeFileSync(path.join(out, 'impact-ids.txt'), renderImpactIds(result));
  process.stdout.write(`${renderImpactSummary(root, input, result, out)}\n`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
