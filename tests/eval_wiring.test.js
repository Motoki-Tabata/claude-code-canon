/**
 * 工程9（eval）の配線テスト（§16.7・§2 工程9・§4.5）。
 *
 * 設計上の約束は「**eval は G バッチを再発火させない**」である。eval-* が完了すると
 * SubagentStop は発火する（フックは主体を選ばない）ので、`.requests/` に残留があれば
 * stage-guard / gen-guard が引く。§4.5 ① の冪等演算（マーカー有 → 判定を再実行せず削除のみ）
 * が効いていなければ、eval の完了だけでブロックラッチが立つ——一方向ラチェットなので
 * 人手の unblock まで復帰不能になる（§11.3）。
 *
 * ロジックの正しさ（npm test）と hooks の実発火（カナリア／smoke）は別物である（L006）。
 * ここで固定するのは前者＝「発火してもバッチが再判定しないこと」。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { KNOWN_STAGES } from '../gates/lib/run.js';
import { ROOT, outputDir, workDir, markersDir, blocksDir, requestsDir } from './helpers/paths.js';
import { hookRun } from './helpers/hook.js';
import { withRun } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

function runGuard(name) {
  return hookRun(path.join(ROOT, 'gates', name), {});
}

const listBlocks = (ts) => (existsSync(blocksDir(ts)) ? readdirSync(blocksDir(ts)) : []);
const listMarkers = (ts) => (existsSync(markersDir(ts)) ? readdirSync(markersDir(ts)) : []);

test('eval は完了リクエストの種別に無い（工程9 はマーカーを鋳造しない・§2）', () => {
  assert.ok(!KNOWN_STAGES.includes('eval'), 'eval が KNOWN_STAGES に入ると G バッチの対象になってしまう');
});

test('generation マーカー有＋リクエスト残留で eval-* が停止しても、再判定されず削除のみ（§4.5 ①）', (t) => {
  const ts = tsFor(import.meta.url, 1);
  withRun(t, ts, { dirs: ['markers'] });
  // 工程7 は通過済み（マーカー有）。output/generated は意図的に置かない——
  // ここで再判定が走れば G7〜G12 は必ず落ちるので、「再判定していない」ことが
  // ブロックラッチ0件として観測できる。
  writeFileSync(path.join(markersDir(ts), 'generation.done'), '{"stage":"generation"}\n');
  writeFileSync(path.join(requestsDir(ts), 'generation'), 'residual\n');

  runGuard('stage-guard.js');
  runGuard('gen-guard.js');

  assert.equal(existsSync(path.join(requestsDir(ts), 'generation')), false, '残留リクエストが削除されていない');
  assert.deepEqual(listBlocks(ts), [], 'ブロックラッチが立った＝再判定が走っている（偽陽性）');
  assert.deepEqual(listMarkers(ts).sort(), ['generation.done'], 'マーカーが増減した');
});

test('対照実験: マーカーが無ければ同じ入力で gen-guard は実際に判定して落ちる（上の合格が vacuous でない証拠）', (t) => {
  const ts = tsFor(import.meta.url, 4);
  withRun(t, ts, { dirs: ['markers'] });
  // マーカーを置かない。§4.5 ② の経路に入り、G7〜G12 が空の output を判定して落ちるはず。
  // これが落ちなければ、上のテストの「ラッチ0件」は冪等性でなく「そもそも何も判定していない」
  // ことの反映でしかなく、検査として無意味になる（L002・L004 と同型の確認）。
  writeFileSync(path.join(requestsDir(ts), 'generation'), 'fresh\n');

  runGuard('gen-guard.js');

  assert.deepEqual(listBlocks(ts), ['generation.blocked'], 'マーカー無しでも判定が走っていない＝検出器が死んでいる');
  assert.ok(existsSync(path.join(requestsDir(ts), 'generation')), 'fail 時はリクエストを削除しない（§4.5）');
});

test('eval の完了リクエスト（.requests/eval）を置いても G バッチは発火せずマーカーも鋳造しない', (t) => {
  const ts = tsFor(import.meta.url, 2);
  withRun(t, ts, { dirs: ['markers'] });
  writeFileSync(path.join(markersDir(ts), 'generation.done'), '{"stage":"generation"}\n');
  writeFileSync(path.join(requestsDir(ts), 'eval'), 'eval done\n');

  runGuard('stage-guard.js');
  runGuard('gen-guard.js');

  assert.deepEqual(listMarkers(ts).sort(), ['generation.done'], 'eval.done が鋳造された（工程9 はマーカーを書かない）');
  assert.deepEqual(listBlocks(ts), [], 'eval リクエストでブロックラッチが立った');
});

test('eval 承認（P7）は approve CLI が鋳造する（.gate/** は deny-all・§4.4）', (t) => {
  const ts = tsFor(import.meta.url, 3);
  withRun(t, ts, { dirs: ['markers'] });
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'approve.js'), ts, 'eval', '--approved-by=test'], {
    encoding: 'utf8',
  });
  const p = path.join(outputDir(ts), '.gate', 'approvals', 'eval.approved');
  assert.ok(existsSync(p), 'eval.approved が鋳造されていない');
  assert.ok(readFileSync(p, 'utf8').includes('test'));
});

test('eval ハーネスは hooks 配線に現れない（gates/ とは別系統・§16.7）', () => {
  const settings = readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8');
  assert.ok(!settings.includes('eval/'), 'settings.json が eval/ を hook から呼んでいる（工程9 は非発火が設計）');
});
