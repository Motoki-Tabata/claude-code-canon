/**
 * lib/handoff.js の更新関数と tools/handoff.js（npm run handoff）の回帰テスト。
 *
 * 付け違い（当たらない行・複数の行）と語彙外の値を黙って通さないことを、故意の違反で確かめる。
 * CLI は実際の起動経路（引数・exit code・handoff.md の中身）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT, outputDir, workDir } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import {
  PROGRESS_ROWS,
  appendNote,
  appendSession,
  markProgress,
  parseHandoff,
  parseSessions,
  renderHandoff,
  setFrontmatterValue,
} from '../lib/handoff.js';

const fresh = () => renderHandoff({ ts: '21000101_000001', target: '/t', mode: 'new', canonCommit: 'abc' });

test('renderHandoff: 進捗は工程1〜9の全行で、P1〜P5 はそれぞれちょうど1行が持つ', () => {
  const rows = fresh().split('\n').filter((l) => l.startsWith('- [ ] '));
  assert.equal(rows.length, PROGRESS_ROWS.length);
  assert.equal(rows.length, 9);
  for (let n = 1; n <= 5; n++) assert.equal(rows.filter((l) => l.includes(`→ P${n}`)).length, 1, `P${n}`);
});

test('markProgress: 工程N と P<N> で行を引き、--off で外せる。他の行は変わらない', () => {
  const t0 = fresh();
  const t1 = markProgress(t0, '工程2');
  assert.match(t1, /- \[x\] 工程2 要件ヒアリング → P1/);
  assert.equal(t1.split('\n').filter((l) => l.startsWith('- [x]')).length, 1);
  const t2 = markProgress(t1, 'P3');
  assert.match(t2, /- \[x\] 工程5 機能選定と設計 → P3/);
  assert.equal(markProgress(t2, '工程2', false), markProgress(t0, 'P3'));
  // 工程1 を「工程10」のような前方一致で誤って引かない
  assert.match(markProgress(t0, '工程1'), /- \[x\] 工程1 調査①/);
  assert.equal(markProgress(t0, '工程1').split('\n').filter((l) => l.startsWith('- [x]')).length, 1);
});

test('markProgress: 当たる行が無い・複数ある・キーが不正なら throw する（故意の違反）', () => {
  const t = fresh();
  assert.throws(() => markProgress(t, '工程10'), /工程1〜工程9/);
  assert.throws(() => markProgress(t, 'P6'), /P1〜P5/);
  assert.throws(() => markProgress(t.replace('工程6 生成', '工程6x 生成'), '工程6'), /0件/);
  assert.throws(() => markProgress(`${t}\n`.replace('## 承認', '- [ ] 工程3 重複\n\n## 承認'), '工程3'), /2件/);
  assert.throws(() => markProgress('## 承認\n', '工程1'), /「## 進捗」節が無い/);
});

test('setFrontmatterValue: phase・status・mode を書き換え、語彙外と変えてはいけないキーは throw する', () => {
  let t = setFrontmatterValue(fresh(), 'phase', 'B');
  t = setFrontmatterValue(t, 'status', 'waiting_approval');
  assert.deepEqual(parseHandoff(t), { ts: '21000101_000001', target: '/t', mode: 'new', phase: 'B', status: 'waiting_approval', canon_commit: 'abc' });
  assert.throws(() => setFrontmatterValue(t, 'phase', 'E'), /A\|B\|C\|D/);
  assert.throws(() => setFrontmatterValue(t, 'status', 'finished'), /status の値/);
  assert.throws(() => setFrontmatterValue(t, 'canon_commit', 'x'), /変えられない/);
  assert.throws(() => setFrontmatterValue(t, 'ts', 'x'), /変えられない/);
});

test('appendNote: 節の末尾（次の節の手前）に箇条書きを足す。節が無ければ throw', () => {
  let t = appendNote(fresh(), '申し送り', 'Phase B で X を確かめる');
  t = appendNote(t, '申し送り', 'Phase C で Y');
  assert.match(t, /## 申し送り\n\n- Phase B で X を確かめる\n- Phase C で Y\n\n## セッション/);
  assert.throws(() => appendNote(fresh(), '存在しない節', 'x'), /節が無い/);
  assert.throws(() => appendNote(fresh(), '申し送り', ' '), /空/);
});

test('appendSession・parseSessions: 表に足して読み戻せる。節の無い古い handoff には節ごと作る', () => {
  let t = appendSession(fresh(), { phase: 'A', sessionId: 'aaa', at: '2100-01-01 00:00' });
  t = appendSession(t, { phase: 'B', sessionId: 'bbb', at: '2100-01-01 01:00' });
  assert.deepEqual(parseSessions(t), [
    { phase: 'A', sessionId: 'aaa', at: '2100-01-01 00:00' },
    { phase: 'B', sessionId: 'bbb', at: '2100-01-01 01:00' },
  ]);
  const old = fresh().split('## セッション')[0].trimEnd() + '\n';
  assert.deepEqual(parseSessions(appendSession(old, { phase: 'C', sessionId: 'ccc', at: 'x' })), [{ phase: 'C', sessionId: 'ccc', at: 'x' }]);
  assert.throws(() => appendSession(fresh(), { phase: 'E', sessionId: 'x', at: 'x' }), /Phase は/);
});

test('handoff CLI: 実際の起動経路で mark・set・note の更新と exit code を確かめる', (t) => {
  const ts = tsFor(import.meta.url, 1);
  const script = path.join(ROOT, 'tools', 'handoff.js');
  const hp = path.join(workDir(ts), 'handoff.md');
  t.after(() => {
    rmSync(workDir(ts), { recursive: true, force: true });
    rmSync(outputDir(ts), { recursive: true, force: true });
  });

  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, [ts, 'unknown']).code, 2);
  assert.equal(runNodeScript(script, [ts, 'mark', '工程1']).code, 1); // handoff.md が無い

  mkdirSync(workDir(ts), { recursive: true });
  writeFileSync(hp, renderHandoff({ ts, target: '/t', mode: 'new' }));

  const mark = runNodeScript(script, [ts, 'mark', '工程1']);
  assert.equal(mark.code, 0, mark.stderr);
  assert.match(readFileSync(hp, 'utf8'), /- \[x\] 工程1 /);
  assert.equal(runNodeScript(script, [ts, 'mark', '工程1', '--off']).code, 0);
  assert.match(readFileSync(hp, 'utf8'), /- \[ \] 工程1 /);
  assert.equal(runNodeScript(script, [ts, 'mark', '工程10']).code, 1);

  assert.equal(runNodeScript(script, [ts, 'set', 'phase=B', 'status=waiting_approval']).code, 0);
  assert.equal(parseHandoff(readFileSync(hp, 'utf8')).phase, 'B');
  assert.equal(runNodeScript(script, [ts, 'set', 'phase=Z']).code, 1);
  assert.equal(runNodeScript(script, [ts, 'set', 'phase']).code, 2);

  assert.equal(runNodeScript(script, [ts, 'note', '申し送り', 'Phase C でやること']).code, 0);
  assert.match(readFileSync(hp, 'utf8'), /## 申し送り\n\n- Phase C でやること\n/);
  assert.equal(runNodeScript(script, [ts, 'note', '無い節', 'x']).code, 1);
});
