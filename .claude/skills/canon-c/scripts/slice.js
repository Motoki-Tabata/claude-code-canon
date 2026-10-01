#!/usr/bin/env node
/**
 * slice.js（npm run slice -- <ts>）。
 *
 * `output/<ts>/design-map.md` を、ワーカーごとに必要な節だけのスライスへ切り出して
 * `work/<ts>/slices/` に書く（lib/design-slices.js・artifacts.md §5.4）。builder と reviewer は
 * design-map の全文でなくスライスを読む。
 *
 * 実行主体は Phase C のオーケストレーター。P3（design-map の承認）の後に実行する——
 * 承認前の design-map から切ると、書き直しのたびにスライスが古くなる。差し戻しで design-map を
 * 直したら切り直す。
 *
 * 出力先は毎回**掃除してから**書く（前回のスライスが残ると、消えた節・消えた成果物が古いまま
 * 読まれる）。
 */

import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { isValidTs, outputDir, workDir } from '../../../../lib/run.js';
import { buildSlices } from '../../../../lib/design-slices.js';

function fail(msg) {
  process.stderr.write(`[slice] ${msg}\n`);
  process.exit(1);
}

const [ts] = process.argv.slice(2);
if (!ts) fail('使い方: npm run slice -- <ts>');
if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
const dm = path.join(outputDir(ts), 'design-map.md');
if (!existsSync(dm)) fail(`design-map.md が無い: ${dm}`);

let result;
try {
  result = buildSlices(readFileSync(dm, 'utf8'));
} catch (err) {
  fail(err.message);
}

const outDir = path.join(workDir(ts), 'slices');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const [name, body] of Object.entries(result.files)) writeFileSync(path.join(outDir, name), body, 'utf8');

process.stdout.write(
  JSON.stringify({ slices_dir: `work/${ts}/slices`, files: Object.keys(result.files).length, declared: result.counts }, null, 2) + '\n'
);
