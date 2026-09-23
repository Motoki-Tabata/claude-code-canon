#!/usr/bin/env node
/**
 * tools/record-state.js（npm run state:record -- <ts> <gate> "<要旨>" [--revision]）。
 *
 * 人間ゲートの**対話承認を `work/<ts>/state.md` に記録する**。承認サイドカー（旧 `npm run approve`）は
 * 廃止した——承認は対話で取り、この記録は「次のセッションで再開するとき、人間の返事待ちか」を
 * 判定する材料（gates/lib/run-status.js）にだけ使う。**ゲートの通過判定には使わない**
 * （state.md は LLM が書ける記録なので、工程順の機械担保はゲートが鋳造する完了マーカーが担う）。
 *
 * なぜ CLI か: 記録の時刻を LLM の記憶でなく実時刻で残し、書式（run-status が読む1行形式）を
 * 保証するため。承認は「承認対象の成果物の確定より後に記録されたもの」だけが有効なので、
 * 時刻が正確であることが判定の前提になる。
 *
 * 使い方:
 *   npm run state:record -- 20260924_010203 P4 "spec.md を精査して承認。受入基準12件"
 *   npm run state:record -- 20260924_010203 P5 --revision "廃止判定2件を再検討したいので差し戻し"
 *
 * 承認（既定）は、承認対象の成果物がまだ確定していない（対応するマーカー等が無い）と拒否する。
 * 差し戻し（--revision）はいつでも記録できる（記録以降、そのゲートは未承認に戻る）。
 */

import { existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { isValidTs, workDir } from '../gates/lib/run.js';
import { APPROVAL_GATES, stateFilePath, gateReferenceMtime } from '../gates/lib/run-status.js';

const HEADER =
  '# state（人間ゲートの対話承認の記録）\n\n' +
  '> このファイルは待ち状態の判定にだけ使う。ゲートの通過判定には使わない（LLM が書ける記録のため）。\n' +
  '> 書式: `- <ゲート> | <ISO 時刻> | <要旨>` / 差し戻しは `- 差し戻し <ゲート> | … | …`。`npm run state:record` で追記する。\n\n';

function fail(msg) {
  process.stderr.write(`[state:record] ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const revision = args.includes('--revision');
const [ts, gate, ...rest] = args.filter((a) => !a.startsWith('--'));
const summary = rest.join(' ').replace(/[\r\n|]+/g, ' ').trim();

if (!ts || !gate || !summary) {
  fail(`使い方: npm run state:record -- <ts> <gate> "<要旨>" [--revision]\n  gate: ${APPROVAL_GATES.join(' | ')}`);
}
if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
if (!APPROVAL_GATES.includes(gate)) fail(`未知のゲート: ${gate}（既知: ${APPROVAL_GATES.join(' | ')}。P1・P3 は報告のみで記録しない）`);
if (!existsSync(workDir(ts))) fail(`work/${ts}/ が無い。`);

if (!revision && gateReferenceMtime(ts, gate) === null) {
  fail(`${gate} の承認対象がまだ確定していない（対応するマーカー・成果物が無い）。確定してから記録すること。`);
}

const p = stateFilePath(ts);
if (!existsSync(p)) writeFileSync(p, HEADER, 'utf8');
appendFileSync(p, `- ${revision ? '差し戻し ' : ''}${gate} | ${new Date().toISOString()} | ${summary}\n`, 'utf8');
process.stdout.write(`${revision ? '差し戻しを' : '承認を'}記録: work/${ts}/state.md（${gate}）\n`);
