#!/usr/bin/env node
/**
 * inventory.js（npm run inventory -- --root <worktree> --out <dir> [--origin <元の対象>]）
 *
 * 対象のカスタマイズの一覧・frontmatter・参照のグラフを `<dir>/inventory.json` に書き、
 * 要約だけを標準出力に返す。判定の本体は lib/inventory.js。
 *
 * exit 0 棚卸しを書いた（カスタマイズが 0 件でも書く。新規の構築では正常）／
 * exit 1 root が無い・git でない／exit 2 引数不正。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildInventory, renderSummary } from '../lib/inventory.js';
import { isMainModule } from '../lib/run.js';

const USAGE = '使い方: npm run inventory -- --root <worktree> --out <dir> [--origin <元の対象>]';

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { root: { type: 'string' }, out: { type: 'string' }, origin: { type: 'string' } }, strict: true }));
  } catch (e) {
    process.stderr.write(`${e.message}\n${USAGE}\n`);
    return 2;
  }
  if (!values.root || !values.out) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const root = path.resolve(values.root);
  let inv;
  try {
    inv = buildInventory(root, { origin: values.origin ? path.resolve(values.origin) : undefined });
  } catch (e) {
    process.stderr.write(`inventory: 棚卸しできない（root が無い・git でない可能性）: ${(e.stderr ?? e.message).toString().trim()}\n`);
    return 1;
  }
  const out = path.resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'inventory.json'), `${JSON.stringify(inv, null, 2)}\n`);
  process.stdout.write(`${renderSummary(inv, out)}\n`);
  return 0;
}

if (isMainModule(import.meta.url)) process.exit(main(process.argv.slice(2)));
