#!/usr/bin/env node
/**
 * tools/resume.js（npm run resume -- <ts> [--force]）。
 *
 * /canon を別セッションから再開するための入口。会話履歴は引き継がれないので、現在地は
 * ディスク上の成果物・完了マーカー・ブロックラッチ・state.md から導く（gates/lib/run-status.js）。
 * オーケストレータはこの小さな JSON だけを読んで、次の一手と、自分が動くべきセッション・モデルを知る
 * （多数のファイルを Read して現在地を推測しない——トークンも節約できる）。
 *
 * やること:
 *   1. <ts> の run が実在することを確認する。
 *   2. 相互排他: 別の /canon run・機能X・機能Y が in-flight なら拒否する
 *      （別の /canon run だけは --force で work/.session-ts を切り替えられる。機能X・機能Y は不可）。
 *   3. work/.session-ts を <ts> に合わせる（採番はしない・成果物は変えない）。
 *   4. 現在地を JSON で標準出力に出す。
 *
 * 【セッション間の注意】work/.session-ts は generation.done が鋳造されるまで残り、その間ガードは
 * 武装したまま（run in-flight）。セッションの合間に claude-canon 本体（docs/・gates/・.claude/・design/）
 * を保守編集すると sanctioned ツリー外として deny される。長く中断するなら run を完走させるか放棄する。
 */

import { existsSync } from 'node:fs';
import { isValidTs, outputDir, workDir, readSessionTs, writeSessionTs } from '../gates/lib/run.js';
import { deriveRunStatus, SESSIONS } from '../gates/lib/run-status.js';
import { conflictingRuns } from '../gates/lib/run-exclusion.js';

function fail(msg) {
  process.stderr.write(`[resume] ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const [ts] = args.filter((a) => !a.startsWith('--'));

if (!ts) fail('使い方: npm run resume -- <ts> [--force]');
if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
if (!existsSync(outputDir(ts)) || !existsSync(workDir(ts))) fail(`output/${ts}/ または work/${ts}/ が無い。<ts> を確認すること。`);

const conflicts = conflictingRuns(ts);
const blocking = conflicts.filter((c) => !c.overridable || !force);
if (blocking.length > 0) {
  for (const c of blocking) process.stderr.write(`[resume] 中断: ${c.message}${c.overridable ? '（切り替えるなら --force）' : ''}\n`);
  process.exit(1);
}

const switchedFrom = readSessionTs() !== ts ? readSessionTs() : null;
if (readSessionTs() !== ts) writeSessionTs(ts);

const status = deriveRunStatus(ts);
const out = {
  ...status,
  session_stages: status.session ? SESSIONS[status.session].stages : null,
  session_switched_from: switchedFrom,
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
