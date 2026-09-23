/**
 * tools/resume.js と tools/record-state.js の回帰テスト。
 *
 * resume: 別セッションから /canon を再開する入口。現在地の JSON を出し、work/.session-ts を合わせる。
 * 中心的な関心は相互排他（別 run を巻き込まない）と、承認記録の CLI が実時刻・書式・前提を保証すること。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SESSION_TS_FILE, CANON_UPDATE_SESSION_TS_FILE, SELF_OPTIM_FILE, outputDir, workDir } from './helpers/paths.js';
import { runToolCli } from './helpers/hook.js';
import { withRun, stashFile, cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';
import { mintMarker } from '../gates/lib/run.js';
import { gateApproved } from '../gates/lib/run-status.js';

const resume = (...a) => runToolCli('resume.js', a);
const record = (...a) => runToolCli('record-state.js', a);

test('resume: run の現在地を JSON で返し、work/.session-ts を <ts> に合わせる', (t) => {
  const ts = tsFor(import.meta.url, 1);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'investigation');
  const r = resume(ts);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.deepEqual([s.ts, s.position, s.session, s.expected_model], [ts, 'requirements', 'S1', 'opus']);
  assert.equal(readFileSync(SESSION_TS_FILE, 'utf8').trim(), ts);
  assert.equal(s.session_switched_from, null);
});

test('resume: 存在しない <ts> と不正な <ts> は拒否する', () => {
  assert.notEqual(resume(tsFor(import.meta.url, 999999)).code, 0);
  assert.notEqual(resume('not-a-ts').code, 0);
});

test('resume（違反注入）: 別の /canon run が in-flight なら --force 無しでは拒否し、.session-ts を変えない', (t) => {
  const other = tsFor(import.meta.url, 2);
  const mine = tsFor(import.meta.url, 3);
  withRun(t, other, { dirs: ['markers'] }); // .session-ts = other（終端マーカー無し＝in-flight）
  cleanupTs(t, mine);
  mkdirSync(path.join(outputDir(mine), '.gate', 'markers'), { recursive: true });
  mkdirSync(workDir(mine), { recursive: true });

  const r = resume(mine);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /in-flight/);
  assert.equal(readFileSync(SESSION_TS_FILE, 'utf8').trim(), other, '拒否したのに sentinel を書き換えてはならない');

  const forced = resume(mine, '--force');
  assert.equal(forced.code, 0, forced.stderr);
  assert.equal(readFileSync(SESSION_TS_FILE, 'utf8').trim(), mine);
  assert.equal(JSON.parse(forced.stdout).session_switched_from, other);
});

test('resume（違反注入）: 機能X・機能Y が in-flight なら --force でも拒否する（切り替え不可）', (t) => {
  const ts = tsFor(import.meta.url, 4);
  withRun(t, ts, { dirs: ['markers'] });

  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  writeFileSync(CANON_UPDATE_SESSION_TS_FILE, tsFor(import.meta.url, 5) + '\n');
  const x = resume(ts, '--force');
  assert.notEqual(x.code, 0, '機能X が in-flight の間は再開できない');
  assert.match(x.stderr, /機能X/);
  writeFileSync(CANON_UPDATE_SESSION_TS_FILE, '');

  stashFile(t, SELF_OPTIM_FILE);
  writeFileSync(SELF_OPTIM_FILE, `demo\n${tsFor(import.meta.url, 6)}\n`);
  const y = resume(ts, '--force');
  assert.notEqual(y.code, 0, '別の自己最適化 run が in-flight の間は再開できない');
  assert.match(y.stderr, /自己最適化/);
});

// ---- state:record ----

test('state:record: 承認対象が未確定（マーカー無し）なら承認の記録を拒否する', (t) => {
  const ts = tsFor(import.meta.url, 7);
  withRun(t, ts, { dirs: ['markers'] });
  const r = record(ts, 'P4', 'spec を承認');
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /確定していない/);
  assert.equal(existsSync(path.join(workDir(ts), 'state.md')), false, '拒否したなら記録を残してはならない');
});

test('state:record: 承認を記録すると有効になり、差し戻しの記録で無効に戻る', (t) => {
  const ts = tsFor(import.meta.url, 8);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'spec');
  assert.equal(gateApproved(ts, 'P4'), false, '前提: 記録前は未承認');

  const ok = record(ts, 'P4', 'spec.md を精査して承認');
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(gateApproved(ts, 'P4'), true);

  const rev = record(ts, 'P4', '--revision', '受入基準を直したいので差し戻し');
  assert.equal(rev.code, 0, rev.stderr);
  assert.equal(gateApproved(ts, 'P4'), false, '差し戻しの記録で未承認に戻る');
});

test('state:record: 未知のゲート・要旨なし・不正な ts は拒否し、要旨中の | と改行は無害化する', (t) => {
  const ts = tsFor(import.meta.url, 9);
  withRun(t, ts, { dirs: ['markers'] });
  mintMarker(ts, 'spec');
  assert.notEqual(record(ts, 'P9', 'x').code, 0);
  assert.notEqual(record(ts, 'P1', 'x').code, 0, 'P1 は報告のみで記録しない');
  assert.notEqual(record(ts, 'P4').code, 0, '要旨が無ければ拒否');
  assert.notEqual(record('bad', 'P4', 'x').code, 0);

  assert.equal(record(ts, 'P4', '承認 | 列を壊す\n改行').code, 0);
  const lines = readFileSync(path.join(workDir(ts), 'state.md'), 'utf8').split('\n').filter((l) => l.startsWith('- P4'));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].split('|').length, 3, '要旨中の | が列区切りとして残っている（run-status の書式を壊す）');
});
