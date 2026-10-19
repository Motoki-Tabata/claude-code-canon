#!/usr/bin/env node
/**
 * impact.js（npm run impact -- --root <worktree> --out <dir> --files <a,b,...> [--terms <語,...>]）
 *
 * 変える・削除するファイルと語・コマンド（`/name` はスラッシュコマンド）に触れている、触らない
 * ファイルと、変えるファイルの中で語に触れている行を、行番号付きで `<dir>/impact.json` に書き、
 * 要約だけを標準出力に返す。
 * 該当の ID は `<path>:<line>:<term>`。判定の本体は lib/impact.js。
 *
 * exit 0 走査して書いた（該当 0 件でも書く）／exit 1 root が無い・git でない・走査したファイルが 0 件／
 * exit 2 引数不正（--files と --terms がどちらも空を含む）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { computeImpact, renderImpactSummary } from '../lib/impact.js';
import { isMainModule } from '../lib/run.js';

const USAGE = '使い方: npm run impact -- --root <worktree> --out <dir> --files <a,b,...> [--terms <語,...>]（files・terms はカンマ区切り。どちらか一方は空でない）';

const split = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { root: { type: 'string' }, out: { type: 'string' }, files: { type: 'string' }, terms: { type: 'string' } }, strict: true }));
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  const input = { files: split(values.files), terms: split(values.terms) };
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
  process.stdout.write(`${renderImpactSummary(root, input, result, out)}\n`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
