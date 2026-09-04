/**
 * tools/reopen.js（権威マーカー取消・基本設計書 §4.5 巻き戻し）の回帰テスト。
 *
 * 中心的な関心は「マーカー削除がガードの再武装と再検査の両方を同時に成立させるか」。
 * `generation.done` はガードの有効条件（`currentRunTs()`）と §4.5①の冪等スキップキーを
 * 兼ねているため、reopen 前後で write-scope-guard の判定が実際に反転すること、
 * および gen-guard が実際に再判定すること（対照実験つき）を固定する。
 *
 * `.claude/rules/gates-and-tests.md` の規律に従い、故意の違反注入（承認チェーン未取消・
 * 別 run への誤爆・語彙外 stage）で reopen が実際に拒否することを示してから、
 * 正規経路が通ることを確認する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  ROOT,
  outputDir,
  markersDir,
  approvalsDir,
  blocksDir,
  requestsDir,
  hasMarker,
} from './helpers/paths.js';
import { decide, runToolCli, runNodeScript } from './helpers/hook.js';
import { withRun, cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';
import { mintMarker, mintApproval, mintBlockLatch, appendProcessedLog } from '../gates/lib/run.js';

const GUARD = path.join(ROOT, 'gates', 'write-scope-guard.js');
const GEN_GUARD = path.join(ROOT, 'gates', 'gen-guard.js');

function processedLog(ts) {
  const p = path.join(outputDir(ts), '.gate', 'processed.log');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('ガード再武装: generation.done が残っている間は write-scope-guard が素通り、reopen 後は deny へ反転する', (t) => {
  const ts = tsFor(import.meta.url, 1);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'generation');

  const writeDocs = { tool_name: 'Write', tool_input: { file_path: path.join(ROOT, 'docs', 'foo.md') } };
  assert.equal(decide(GUARD, writeDocs), 'allow', '前提: 終端マーカー有ではガードが素通りする（現状の欠陥）');

  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.equal(r.code, 0, `reopen が失敗した: ${r.stderr}`);
  assert.equal(hasMarker(ts, 'generation'), false, 'generation.done が削除されていない');

  assert.equal(decide(GUARD, writeDocs), 'deny', 'reopen 後は run が再び in-flight と判定され、ガードが再武装されるべき');
});

test('再検査の実発火（違反注入）: reopen 後に空の generated/ で再生成を装うと gen-guard が実際に落ちる', (t) => {
  const ts = tsFor(import.meta.url, 2);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'generation');

  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.equal(r.code, 0, `reopen が失敗した: ${r.stderr}`);

  // output/generated は意図的に空のまま。§4.5②の経路に入り G7〜G12 が判定するはず。
  writeFileSync(path.join(requestsDir(ts), 'generation'), 'reopened\n');
  const guardResult = runNodeScript(GEN_GUARD, []);
  assert.equal(guardResult.code, 2, 'reopen 後の再生成リクエストは実際に判定され fail するはず（マーカー無しのため §4.5②）');
  assert.ok(
    existsSync(path.join(blocksDir(ts), 'generation.blocked')),
    'ブロックラッチが立っていない＝再判定が走っていない（reopen が冪等スキップを解いていない）'
  );
});

test('対照実験: reopen しなければ同じ入力で gen-guard は冪等スキップに入り判定しない（上の合格が vacuous でない証拠）', (t) => {
  const ts = tsFor(import.meta.url, 3);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'generation');
  // reopen しない。マーカーが残ったまま .requests/generation を置く。
  writeFileSync(path.join(requestsDir(ts), 'generation'), 'residual\n');

  const guardResult = runNodeScript(GEN_GUARD, []);
  assert.equal(guardResult.code, 0, '冪等スキップが効くはず（reopen していないので判定は走らない）');
  assert.equal(
    existsSync(path.join(blocksDir(ts), 'generation.blocked')),
    false,
    'マーカーが残っている限りブロックラッチは立たないはず（reopen 無しでは判定していないことの対照）'
  );
});

test('承認チェーンの強制（違反注入）: generation.approved が残っていれば reopen は拒否し、マーカーは残る', (t) => {
  const ts = tsFor(import.meta.url, 4);
  withRun(t, ts, { dirs: ['markers', 'approvals'] });
  mintMarker(ts, 'generation');
  const approveResult = runToolCli('approve.js', [ts, 'generation', '--approved-by=test']);
  assert.equal(approveResult.code, 0, `approve.js が失敗した: ${approveResult.stderr}`);

  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.notEqual(r.code, 0, 'generation.approved が残ったままの reopen は拒否されるべき');
  assert.equal(hasMarker(ts, 'generation'), true, '拒否された reopen はマーカーを削除してはならない');

  const revoke = runToolCli('approve.js', [ts, 'generation', '--revoke']);
  assert.equal(revoke.code, 0, `approve --revoke が失敗した: ${revoke.stderr}`);

  const r2 = runToolCli('reopen.js', [ts, 'generation']);
  assert.equal(r2.code, 0, `承認取消後の reopen は成功するべき: ${r2.stderr}`);
  assert.equal(hasMarker(ts, 'generation'), false);
});

test('承認チェーンの強制: generation を reopen するとき eval.approved も残っていれば拒否する', (t) => {
  const ts = tsFor(import.meta.url, 5);
  withRun(t, ts, { dirs: ['markers', 'approvals'] });
  mintMarker(ts, 'generation');
  mintApproval(ts, 'eval', { approved_by: 'test' });

  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.notEqual(r.code, 0, 'generation より後工程の eval.approved が残っていれば拒否するべき');
  assert.match(r.stderr, /eval/, 'どの承認が残っているか理由に含めるべき');
});

test('別 run への誤爆の封鎖（違反注入）: <ts> が現在の .session-ts と一致しなければ拒否する', (t) => {
  const staleTs = tsFor(import.meta.url, 6);
  const liveTs = tsFor(import.meta.url, 7);
  withRun(t, liveTs, { dirs: ['markers'] });
  cleanupTs(t, staleTs);
  // stale 側にも独立にマーカーを用意する（withRun とは別 run なので手動で骨格を作る）。
  mkdirSync(markersDir(staleTs), { recursive: true });
  mintMarker(staleTs, 'generation');

  const r = runToolCli('reopen.js', [staleTs, 'generation']);
  assert.notEqual(r.code, 0, '現在の run（liveTs）と異なる <ts> の reopen は拒否するべき');
  assert.equal(hasMarker(staleTs, 'generation'), true, '拒否時はマーカーを消してはならない');
});

test('語彙外 stage の拒否（違反注入）: eval はマーカーを持たないため reopen 対象にできない', (t) => {
  const ts = tsFor(import.meta.url, 8);
  withRun(t, ts, { dirs: ['markers'] });
  const r = runToolCli('reopen.js', [ts, 'eval']);
  assert.notEqual(r.code, 0, "'eval' は REOPENABLE_MARKER_KEYS に無いため拒否するべき");
  assert.match(r.stderr, /eval/);

  const r2 = runToolCli('reopen.js', [ts, 'not-a-real-stage']);
  assert.notEqual(r2.code, 0, '未知の stage は拒否するべき');
});

test('冪等: マーカー不在での reopen は no-op で exit 0 かつ processed.log に reopen 行を追加しない', (t) => {
  const ts = tsFor(import.meta.url, 9);
  withRun(t, ts, { dirs: ['markers'] });
  // generation マーカーは意図的に立てない。

  const before = processedLog(ts).length;
  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.equal(r.code, 0, 'no-op は exit 0 であるべき');
  assert.match(r.stdout, /no-op/);
  const after = processedLog(ts);
  assert.equal(after.length, before, 'no-op では processed.log に行を追加してはならない');
});

test('監査記録: reopen 成功時に processed.log の最終行が action:reopen・reopened_by を含む', (t) => {
  const ts = tsFor(import.meta.url, 10);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'generation');

  const r = runToolCli('reopen.js', [ts, 'generation', '--reason=eval C2 指摘の再生成']);
  assert.equal(r.code, 0, `reopen が失敗した: ${r.stderr}`);

  const log = processedLog(ts);
  assert.ok(log.length > 0, 'processed.log に行が無い');
  const last = log[log.length - 1];
  assert.equal(last.stage, 'generation');
  assert.equal(last.action, 'reopen');
  assert.equal(last.ok, true);
  assert.ok(typeof last.reopened_by === 'string' && last.reopened_by.length > 0, 'reopened_by が記録されていない');
  assert.equal(last.reason, 'eval C2 指摘の再生成');
});

test('reopen は blocks/<stage>.blocked を解除しない（unblock の代替ではない）', (t) => {
  const ts = tsFor(import.meta.url, 11);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'generation');
  mintBlockLatch(ts, 'generation', 'テスト用の既存ラッチ');

  const r = runToolCli('reopen.js', [ts, 'generation']);
  assert.equal(r.code, 0, `reopen が失敗した: ${r.stderr}`);
  assert.ok(existsSync(path.join(blocksDir(ts), 'generation.blocked')), 'reopen が勝手にラッチを解除してはならない');
  assert.match(r.stdout, /blocked/, 'ラッチが残っていることを警告するべき');
});
