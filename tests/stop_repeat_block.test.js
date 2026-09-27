/**
 * Stop/SubagentStop の同一違反による再ブロック抑止（gen-guard・stage-guard）の回帰テスト。
 *
 * 失敗したリクエストは再判定の契機として残るため、ターンが終わるたびに同じ違反で exit 2 が返り、
 * ハーネスの上限まで注入が続いた（run 20260927_003229・S3 メインで44回）。1回目は必ずブロックし、
 * 同じ違反の2回目以降と `stop_hook_active` の継続中は通知だけにする（ラッチは残す）ことを、
 * hook を実プロセスで叩いて固定する。違反が変われば再びブロックすること（対照）も示す。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { ROOT, blocksDir, requestsDir } from './helpers/paths.js';
import { spawnSync } from 'node:child_process';
import { withRun } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';
import { mintBlockLatch, isRepeatBlock } from '../gates/lib/run.js';

const GEN_GUARD = path.join(ROOT, 'gates', 'gen-guard.js');
// 成功時（exit 0）の stderr も見るため spawnSync で叩く（helpers の runNodeScript は成功時の stderr を捨てる）。
const stop = (input = {}) => {
  const r = spawnSync(process.execPath, [GEN_GUARD], { input: JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
};
const latch = (ts) => path.join(blocksDir(ts), 'generation.blocked');

/** generated/ が空のまま generation の完了リクエストを置く（G9 等が必ず落ちる入力）。 */
function failingRequest(t, n) {
  const ts = tsFor(import.meta.url, n);
  withRun(t, ts, { dirs: ['markers'] });
  writeFileSync(path.join(requestsDir(ts), 'generation'), 'x\n');
  return ts;
}

test('1回目はブロックし、同じ違反の2回目は通知だけ（exit 0）にする。ラッチは残る', (t) => {
  const ts = failingRequest(t, 1);
  const first = stop();
  assert.equal(first.code, 2, '初回の違反はブロックしなければならない');
  assert.ok(existsSync(latch(ts)));

  const second = stop();
  assert.equal(second.code, 0, `同じ違反の再判定はブロックを繰り返さない: ${second.stderr}`);
  assert.match(second.stderr, /前回と同じ違反/);
  assert.ok(existsSync(latch(ts)), 'ラッチは残す（resume・advance-guard が検知できるように）');
});

test('対照: ラッチの違反と今回の違反が違えば、再びブロックする（抑止が恒真でない証拠）', (t) => {
  const ts = failingRequest(t, 2);
  mintBlockLatch(ts, 'generation', '以前の別の違反');
  const r = stop();
  assert.equal(r.code, 2, `違反が変わったのに通知だけにしてはならない: ${r.stderr}`);
});

test('stop_hook_active が true（Stop hook による継続中）ならブロックを繰り返さない', (t) => {
  failingRequest(t, 3);
  const r = stop({ stop_hook_active: true });
  assert.equal(r.code, 0, r.stderr);
});

test('isRepeatBlock: 失敗した全ステージが同一違反のときだけ true', () => {
  const prevReasons = { a: 'x / y', b: 'z' };
  assert.equal(isRepeatBlock({ prevReasons, failed: [{ key: 'a', violations: ['x', 'y'] }] }), true);
  assert.equal(isRepeatBlock({ prevReasons, failed: [{ key: 'a', violations: ['x', 'y'] }, { key: 'b', violations: ['w'] }] }), false);
  assert.equal(isRepeatBlock({ prevReasons: {}, failed: [{ key: 'a', violations: ['x'] }] }), false);
  assert.equal(isRepeatBlock({ prevReasons: {}, failed: [] }), false);
});
