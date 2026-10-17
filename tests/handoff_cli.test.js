/**
 * lib/handoff.js の更新関数と tools/handoff.js（npm run handoff）の回帰テスト。
 *
 * 付け違い（当たらない行・複数の行）と語彙外の値を黙って通さないことを、故意の違反で確かめる。
 * CLI は実際の起動経路（引数・exit code・handoff.md の中身）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cleanupTs } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT, workDir } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import {
  PROGRESS_ROWS,
  STAGES,
  appendNote,
  appendSession,
  markProgress,
  parseHandoff,
  parseSessions,
  renderHandoff,
  setFrontmatterValue,
} from '../lib/handoff.js';

const fresh = () =>
  renderHandoff({ ts: '21000101_000001', target: '/t', worktree: '/w', branch: 'canon/21000101_000001', base: 'b'.repeat(40), canonCommit: 'abc' });

test('renderHandoff: frontmatter は v3 のキーで、route は空。進捗は全9行', () => {
  const t = fresh();
  assert.deepEqual(parseHandoff(t), {
    ts: '21000101_000001',
    target: '/t',
    worktree: '/w',
    branch: 'canon/21000101_000001',
    base: 'b'.repeat(40),
    canon_commit: 'abc',
    stage: 'plan',
    status: 'in_progress',
  });
  const rows = t.split('\n').filter((l) => l.startsWith('- [ ] '));
  assert.equal(rows.length, PROGRESS_ROWS.length);
  assert.equal(rows.length, 9);
  assert.ok(!/mode:|phase:/.test(t), 'v2 のキー（mode・phase）を持たない');
});

test('markProgress: 行頭の語で行を引き、--off で外せる。他の行は変わらない', () => {
  const t0 = fresh();
  const t1 = markProgress(t0, '計画2');
  assert.match(t1, /- \[x\] 計画2 要件を固める/);
  assert.equal(t1.split('\n').filter((l) => l.startsWith('- [x]')).length, 1);
  const t2 = markProgress(t1, '構築4');
  assert.match(t2, /- \[x\] 構築4 差分のゲート/);
  assert.equal(markProgress(t2, '計画2', false), markProgress(t0, '構築4'));
});

test('markProgress: 当たる行が無い・複数ある・キーが不正なら throw する（故意の違反）', () => {
  const t = fresh();
  assert.throws(() => markProgress(t, '構築6'), /キーは/);
  assert.throws(() => markProgress(t, '工程1'), /キーは/);
  assert.throws(() => markProgress(t, 'G9'), /キーは/);
  assert.throws(() => markProgress(t.replace('構築1 編集と削除', '構築1x 編集と削除'), '構築1'), /0件/);
  assert.throws(() => markProgress(t.replace('## 承認', '- [ ] 計画3 重複\n\n## 承認'), '計画3'), /2件/);
  assert.throws(() => markProgress('## 承認\n', '計画1'), /「## 進捗」節が無い/);
});

test('setFrontmatterValue: route（空の行を埋める）・stage・status を書き換え、語彙外と変えてはいけないキーは throw する', () => {
  let t = setFrontmatterValue(fresh(), 'route', 'small');
  t = setFrontmatterValue(t, 'stage', 'build');
  t = setFrontmatterValue(t, 'status', 'waiting_approval');
  const h = parseHandoff(t);
  assert.equal(h.route, 'small');
  assert.equal(h.stage, 'build');
  assert.equal(h.status, 'waiting_approval');
  assert.throws(() => setFrontmatterValue(t, 'route', 'medium'), /small\|large/);
  assert.throws(() => setFrontmatterValue(t, 'stage', 'A'), /plan\|design\|build/);
  assert.throws(() => setFrontmatterValue(t, 'status', 'finished'), /status の値/);
  for (const k of ['canon_commit', 'ts', 'worktree', 'branch', 'base', 'phase', 'mode']) {
    assert.throws(() => setFrontmatterValue(t, k, 'x'), /変えられない/, k);
  }
});

test('appendNote: 節の末尾（次の節の手前）に箇条書きを足す。節が無ければ throw', () => {
  let t = appendNote(fresh(), '申し送り', '構築で X を確かめる');
  t = appendNote(t, '申し送り', '構築で Y');
  assert.match(t, /## 申し送り\n\n- 構築で X を確かめる\n- 構築で Y\n\n## セッション/);
  assert.throws(() => appendNote(fresh(), '存在しない節', 'x'), /節が無い/);
  assert.throws(() => appendNote(fresh(), '申し送り', ' '), /空/);
});

test('appendSession・parseSessions: 表に足して読み戻せる。節の無い古い handoff には節ごと作る', () => {
  let t = appendSession(fresh(), { stage: 'plan', sessionId: 'aaa', at: '2100-01-01 00:00' });
  t = appendSession(t, { stage: 'build', sessionId: 'bbb', at: '2100-01-01 01:00' });
  assert.deepEqual(parseSessions(t), [
    { stage: 'plan', sessionId: 'aaa', at: '2100-01-01 00:00' },
    { stage: 'build', sessionId: 'bbb', at: '2100-01-01 01:00' },
  ]);
  const old = fresh().split('## セッション')[0].trimEnd() + '\n';
  assert.deepEqual(parseSessions(appendSession(old, { stage: 'design', sessionId: 'ccc', at: 'x' })), [{ stage: 'design', sessionId: 'ccc', at: 'x' }]);
  assert.throws(() => appendSession(fresh(), { stage: 'A', sessionId: 'x', at: 'x' }), /段は/);
  assert.deepEqual(STAGES, ['plan', 'design', 'build']);
});

test('handoff CLI: 実際の起動経路で mark・set・note の更新と exit code を確かめる', (t) => {
  const ts = tsFor(import.meta.url, 1);
  const script = path.join(ROOT, 'tools', 'handoff.js');
  const hp = path.join(workDir(ts), 'handoff.md');
  cleanupTs(t, ts);

  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, [ts, 'unknown']).code, 2);
  assert.equal(runNodeScript(script, [ts, 'mark', '計画1']).code, 1); // handoff.md が無い

  mkdirSync(workDir(ts), { recursive: true });
  writeFileSync(hp, renderHandoff({ ts, target: '/t' }));

  const mark = runNodeScript(script, [ts, 'mark', '計画1']);
  assert.equal(mark.code, 0, mark.stderr);
  assert.match(readFileSync(hp, 'utf8'), /- \[x\] 計画1 /);
  assert.equal(runNodeScript(script, [ts, 'mark', '計画1', '--off']).code, 0);
  assert.match(readFileSync(hp, 'utf8'), /- \[ \] 計画1 /);
  assert.equal(runNodeScript(script, [ts, 'mark', '工程1']).code, 1);

  assert.equal(runNodeScript(script, [ts, 'set', 'route=large', 'status=waiting_approval']).code, 0);
  assert.equal(parseHandoff(readFileSync(hp, 'utf8')).route, 'large');
  assert.equal(runNodeScript(script, [ts, 'set', 'route=Z']).code, 1);
  assert.equal(runNodeScript(script, [ts, 'set', 'route']).code, 2);

  assert.equal(runNodeScript(script, [ts, 'note', '申し送り', '構築でやること']).code, 0);
  assert.match(readFileSync(hp, 'utf8'), /## 申し送り\n\n- 構築でやること\n/);
  assert.equal(runNodeScript(script, [ts, 'note', '無い節', 'x']).code, 1);
  assert.equal(runNodeScript(script, [ts, 'session', 'plan2']).code, 1, '語彙外の段は拒否する');
});
