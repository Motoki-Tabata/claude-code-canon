#!/usr/bin/env node
/**
 * slice.js（npm run slice -- <ts>）。
 *
 * `output/<ts>/design-map.md` を、ワーカーごとに必要な節だけのスライスへ切り出して
 * `work/<ts>/slices/` に書く（lib/design-slices.js・artifacts.md §5.4）。builder は
 * design-map の全文でなくスライスを読む（reviewer は review-bundle の design.md を読む）。
 *
 * 実行主体は Phase C のオーケストレーター。P3（design-map の承認）の後に実行する——
 * 承認前の design-map から切ると、書き直しのたびにスライスが古くなる。差し戻しで design-map を
 * 直したら切り直す。
 *
 * `--unit <担当>` を付けると、標準出力をその担当（claude-md・rules・skills・subagents・settings・mcp・
 * plugins・output-styles）のスライスのファイル名と宣言件数に絞る。書き出しは常に全部。
 *
 * 出力先は毎回**掃除してから**書く（前回のスライスが残ると、消えた節・消えた成果物が古いまま
 * 読まれる）。
 */

import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { isValidTs, outputDir, workDir, isMainModule } from '../../../../lib/run.js';
import { buildSlices } from '../../../../lib/design-slices.js';
import { UNIT_NAMES } from '../../../../lib/features.js';

function fail(msg, code = 1) {
  process.stderr.write(`[slice] ${msg}\n`);
  process.exit(code);
}

function main() {
  const args = process.argv.slice(2);
  const ui = args.indexOf('--unit');
  let unit = null;
  if (ui !== -1) {
    unit = args[ui + 1] ?? null;
    args.splice(ui, unit === null ? 1 : 2);
    if (!UNIT_NAMES.includes(unit)) fail(`不正な --unit: ${unit}（担当は ${UNIT_NAMES.join('・')}）`, 2);
  }
  const [ts] = args;
  if (!ts) fail('使い方: npm run slice -- <ts> [--unit <担当>]', 2);
  if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`, 2);
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

  const summary = { slices_dir: `work/${ts}/slices`, files: Object.keys(result.files).length, declared: result.counts };
  if (unit) {
    // この担当のスライスと宣言一覧のファイル名だけを示す
    const mine = (n) => n === `${unit}.md` || n === `targets-${unit}.txt` || (unit === 'skills' && /^(skills|targets-skills)-\d+\.(md|txt)$/.test(n));
    summary.unit = unit;
    summary.files = Object.keys(result.files).filter(mine);
    summary.declared = result.counts[unit];
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

if (isMainModule(import.meta.url)) main();
