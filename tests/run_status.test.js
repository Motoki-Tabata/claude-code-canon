/**
 * gates/lib/run-status.js（run の現在地の判定）の回帰テスト。
 *
 * /canon は4セッションに分けて実行し、別セッションからの再開は会話履歴に頼れない。現在地を
 * ディスク上の成果物・完了マーカー・ブロックラッチ・state.md から導く判定表の各行を固定する。
 * 特に「state.md だけでは工程は進まない」（LLM が書ける記録を判定材料にしない）と、
 * 「古い承認は無効」（差し戻し後に待ちを飛ばさない）を故意の違反注入で示す。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { ROOT, workDir, outputDir, markersDir, requestsDir, markerPath } from './helpers/paths.js';
import { cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';
import { mintMarker, mintBlockLatch } from '../gates/lib/run.js';
import { deriveRunStatus, gateApproved, parseStateRecords, checkStaleness, EVAL_AXES } from '../gates/lib/run-status.js';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

/**
 * run の骨格を用意し、markers（順に鋳造）・state 記録（{gate,at?,revision?}）・追加ファイルを置く。
 * deriveRunStatus は ts を引数に取り work/.session-ts を読まないので、sentinel には触れない
 * （1テスト内で複数 run を作るため、sentinel の退避・復元を入れ子にしない）。
 */
function setup(t, n, { markers = [], state = [], files = {} } = {}) {
  const ts = tsFor(import.meta.url, n);
  cleanupTs(t, ts);
  mkdirSync(markersDir(ts), { recursive: true });
  mkdirSync(workDir(ts), { recursive: true });
  for (const m of markers) mintMarker(ts, m);
  const lines = state.map((r) => `- ${r.revision ? '差し戻し ' : ''}${r.gate} | ${r.at ?? iso(5000)} | 要旨`);
  if (lines.length) writeFileSync(path.join(workDir(ts), 'state.md'), lines.join('\n') + '\n');
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(outputDir(ts), rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return ts;
}
const S1 = ['investigation', 'requirements', 'investigation.focused', 'spec'];

test('空の run は S1 の工程1（Opus・カナリア要）', (t) => {
  const s = deriveRunStatus(setup(t, 1));
  assert.equal(s.position, 'investigation-1');
  assert.deepEqual([s.session, s.expected_model, s.canary_required], ['S1', 'opus', true]);
});

test('S1 の進行: 調査1 → ヒアリング → P2 待ち → 調査2 → spec → P4 待ち', (t) => {
  assert.equal(deriveRunStatus(setup(t, 2, { markers: ['investigation'] })).position, 'requirements');
  const p2 = deriveRunStatus(setup(t, 3, { markers: ['investigation', 'requirements'] }));
  assert.equal(p2.position, 'P2');
  assert.equal(p2.waiting_gate, 'P2');
  assert.equal(deriveRunStatus(setup(t, 4, { markers: ['investigation', 'requirements'], state: [{ gate: 'P2' }] })).position, 'investigation-2');
  assert.equal(deriveRunStatus(setup(t, 5, { markers: ['investigation', 'requirements', 'investigation.focused'], state: [{ gate: 'P2' }] })).position, 'spec');
  const p4 = deriveRunStatus(setup(t, 6, { markers: S1, state: [{ gate: 'P2' }] }));
  assert.deepEqual([p4.position, p4.waiting_gate, p4.session], ['P4', 'P4', 'S1']);
});

test('P4 承認後は S2（Opus）の設計へ、P5 待ち、承認後は S3（Sonnet）の生成へ', (t) => {
  const st = [{ gate: 'P2' }, { gate: 'P4' }];
  const design = deriveRunStatus(setup(t, 7, { markers: S1, state: st }));
  assert.deepEqual([design.position, design.session, design.expected_model], ['design', 'S2', 'opus']);
  const p5 = deriveRunStatus(setup(t, 8, { markers: [...S1, 'design'], state: st }));
  assert.deepEqual([p5.position, p5.waiting_gate], ['P5', 'P5']);
  const gen = deriveRunStatus(setup(t, 9, { markers: [...S1, 'design'], state: [...st, { gate: 'P5' }] }));
  assert.deepEqual([gen.position, gen.session, gen.expected_model, gen.canary_required], ['generation', 'S3', 'sonnet', true]);
});

test('S3: 生成後は eval、5軸と eval-report が揃うまで eval、揃えば P6+7 待ち、承認後は S4（Sonnet・カナリア不要）', (t) => {
  const st = [{ gate: 'P2' }, { gate: 'P4' }, { gate: 'P5' }];
  const base = [...S1, 'design', 'generation'];
  assert.equal(deriveRunStatus(setup(t, 10, { markers: base, state: st })).position, 'eval');
  const partial = Object.fromEntries(EVAL_AXES.slice(0, 4).map((a) => [`eval/${a}.md`, '{}']));
  assert.equal(deriveRunStatus(setup(t, 11, { markers: base, state: st, files: { ...partial, 'eval-report.md': '#' } })).position, 'eval', '1軸欠けていれば eval のまま');
  const full = { ...Object.fromEntries(EVAL_AXES.map((a) => [`eval/${a}.md`, '{}'])), 'eval-report.md': '#' };
  const wait = deriveRunStatus(setup(t, 12, { markers: base, state: st, files: full }));
  assert.deepEqual([wait.position, wait.waiting_gate], ['P6+7', 'P6+7']);
  const s4 = deriveRunStatus(setup(t, 13, { markers: base, state: [...st, { gate: 'P6+7' }], files: full }));
  assert.deepEqual([s4.position, s4.session, s4.expected_model, s4.canary_required], ['predeploy-emit', 'S4', 'sonnet', false]);
});

test('S4: RUN.md → 配置前照合 → P8 待ち → 配置 → 完了', (t) => {
  const st = [{ gate: 'P2' }, { gate: 'P4' }, { gate: 'P5' }, { gate: 'P6+7' }];
  const base = [...S1, 'design', 'generation'];
  const evalFiles = { ...Object.fromEntries(EVAL_AXES.map((a) => [`eval/${a}.md`, '{}'])), 'eval-report.md': '#' };
  const run = (n, extra, more = []) => deriveRunStatus(setup(t, n, { markers: base, state: [...st, ...more], files: { ...evalFiles, ...extra } }));
  assert.equal(run(14, {}).position, 'predeploy-emit');
  assert.equal(run(15, { '.deploy/RUN.md': '#' }).position, 'predeploy-check');
  const p8 = run(16, { '.deploy/RUN.md': '#', '.deploy/pre-deploy-report.txt': 'r' });
  assert.deepEqual([p8.position, p8.waiting_gate], ['P8', 'P8']);
  const deploy = run(17, { '.deploy/RUN.md': '#', '.deploy/pre-deploy-report.txt': 'r' }, [{ gate: 'P8' }]);
  assert.equal(deploy.position, 'deploy');
  const done = run(18, { '.deploy/RUN.md': '#', '.deploy/pre-deploy-report.txt': 'r', '.deploy/deploy-result.json': '{}' }, [{ gate: 'P8' }]);
  assert.deepEqual([done.position, done.session], ['done', null]);
});

test('【違反注入】state.md に承認が並んでいても、マーカーが無ければ工程は進まない（LLM が書ける記録を判定材料にしない）', (t) => {
  const forged = ['P2', 'P4', 'P5', 'P6+7', 'P8'].map((gate) => ({ gate }));
  const s = deriveRunStatus(setup(t, 19, { state: forged }));
  assert.equal(s.position, 'investigation-1', '承認を偽造しても、ゲートが鋳造するマーカーが無い限り現在地は進まない');
});

test('【違反注入】古い承認は無効: 承認対象（spec.done）の確定より前の記録では P4 の待ちを飛ばせない', (t) => {
  const st = [{ gate: 'P2' }, { gate: 'P4', at: iso(-60_000) }]; // spec.done の1分前に記録された承認
  const s = deriveRunStatus(setup(t, 20, { markers: S1, state: st }));
  assert.equal(s.position, 'P4', '差し戻しで spec を作り直したのに、古い承認が残って待ちを飛ばす事故を防ぐ');
});

test('【違反注入】最後の記録が差し戻しなら未承認に戻る（承認後の差し戻し）', (t) => {
  const ts = setup(t, 21, { markers: S1, state: [{ gate: 'P2' }, { gate: 'P4', at: iso(4000) }, { gate: 'P4', revision: true, at: iso(6000) }] });
  assert.equal(gateApproved(ts, 'P4'), false);
  assert.equal(deriveRunStatus(ts).position, 'P4');
});

test('ブロックラッチがあれば next_action は人間判断を促す（位置は変えない）', (t) => {
  const ts = setup(t, 22, { markers: ['investigation'] });
  mintBlockLatch(ts, 'requirements', 'テスト用');
  const s = deriveRunStatus(ts);
  assert.deepEqual(s.blocked, ['requirements']);
  assert.match(s.next_action, /ブロックラッチ/);
  assert.equal(s.position, 'requirements');
});

test('未消費の完了リクエスト（マーカー無し）は recheck を促し、マーカーが在れば pending にしない', (t) => {
  const ts = setup(t, 23, { markers: ['investigation'] });
  mkdirSync(requestsDir(ts), { recursive: true });
  writeFileSync(path.join(requestsDir(ts), 'requirements'), '');
  const s = deriveRunStatus(ts);
  assert.deepEqual(s.pending_requests, ['requirements']);
  assert.match(s.next_action, /recheck/);
  mintMarker(ts, 'requirements');
  assert.deepEqual(deriveRunStatus(ts).pending_requests, [], 'マーカーが在るリクエストは冪等に消えるだけ');
});

test('parseStateRecords: 書式外の行と読めない時刻は根拠にしない', () => {
  const r = parseStateRecords('# t\n- P2 | 2026-09-24T00:00:00.000Z | ok\n- P4 | 昨日 | 時刻が読めない\n書式外の行\n- 差し戻し P5 | 2026-09-24T01:00:00.000Z | x');
  assert.deepEqual(r.map((x) => [x.gate, x.kind]), [['P2', 'approval'], ['P5', 'revision']]);
});

test('S3-1 鮮度: focused マーカーがある間、project_profile.md の追記で調査1のマーカーを「古い」と誤警告しない', (t) => {
  const ts = setup(t, 24, { markers: ['investigation'] });
  writeFileSync(path.join(workDir(ts), 'existing_customizations.md'), 'a');
  const prof = path.join(workDir(ts), 'project_profile.md');
  writeFileSync(prof, '## profile');
  const inv = markerPath(ts, 'investigation');
  const old = new Date(Date.now() - 60_000);
  utimesSync(inv, old, old);
  utimesSync(path.join(workDir(ts), 'existing_customizations.md'), old, old);
  // focused 追記（profile.md が investigation.done より新しい）。focused マーカーがまだ無ければ古い扱い。
  assert.equal(checkStaleness(ts, 'investigation').stale, true, '前提: focused マーカー前は調査1のマーカーが古い');
  mintMarker(ts, 'investigation.focused');
  assert.equal(checkStaleness(ts, 'investigation').stale, false, 'focused 鋳造後は project_profile.md は focused の管轄');
});

test('/self-optimize の run（target が claude-canon 自身）は S4 が配置でなく世代ステージングになる', (t) => {
  const st = [{ gate: 'P2' }, { gate: 'P4' }, { gate: 'P5' }, { gate: 'P6+7' }];
  const full = { ...Object.fromEntries(EVAL_AXES.map((a) => [`eval/${a}.md`, '{}'])), 'eval-report.md': '#' };
  const ts = setup(t, 25, { markers: [...S1, 'design', 'generation'], state: st, files: full });
  writeFileSync(path.join(workDir(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const s = deriveRunStatus(ts);
  assert.deepEqual([s.position, s.session], ['selfopt-stage', 'S4']);
  assert.match(s.next_action, /npm run stage/);
  // 対照: 通常の run（target が別プロジェクト）なら配置手順になる。
  const other = setup(t, 26, { markers: [...S1, 'design', 'generation'], state: st, files: full });
  writeFileSync(path.join(workDir(other), 'target.txt'), path.join(ROOT, 'fixtures', 'sample-repos', 'existing').replace(/\\/g, '/') + '\n');
  assert.equal(deriveRunStatus(other).position, 'predeploy-emit');
});
