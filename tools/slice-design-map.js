#!/usr/bin/env node
/**
 * tools/slice-design-map.js（npm run slice -- <ts>）。
 *
 * `output/<ts>/design-map.md` を、ワーカーごとに必要な節だけのスライスへ切り出して
 * `work/<ts>/slices/` に書く（gates/lib/design-slices.js）。generator・各 builder・readme-writer・
 * eval judge は design-map 全文でなくスライスを読む（1 run で 19〜30 回・約 96KB の全文 Read を避ける）。
 *
 * 実行主体は S3 の冒頭のオーケストレータ（Bash）。design.done（設計の確定）後に実行する——
 * 確定前の design-map から切ると、書き直しのたびにスライスが古くなる。
 *
 * 出力先は毎回**掃除してから**書く（前回のスライスが残ると、消えた節・消えた成果物が古いまま
 * 読まれる。eval:bundle の残骸問題 S2-2 と同型）。
 */

import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { isValidTs, outputDir, workDir, hasMarker } from '../gates/lib/run.js';
import { buildSlices } from '../gates/lib/design-slices.js';

function fail(msg) {
  process.stderr.write(`[slice] ${msg}\n`);
  process.exit(1);
}

const [ts] = process.argv.slice(2);
if (!ts) fail('使い方: npm run slice -- <ts>');
if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
const dm = path.join(outputDir(ts), 'design-map.md');
if (!existsSync(dm)) fail(`design-map.md が無い: ${dm}`);
if (!hasMarker(ts, 'design')) fail('design.done が無い（設計が G1・G2 を通って確定してから切り出す）。');

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
