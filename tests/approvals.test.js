/**
 * tools/approvals.js（承認行の記録と照合・architecture.md §6.3）の回帰テスト。
 *
 * 照合が「一致」と言うだけの恒真にならないことを、対象を故意に改変して確かめる。純粋な関数は
 * 一時ディレクトリを run のルートに見立てて呼び、CLI は実際の起動経路（exit code）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT, outputDir, workDir } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import { renderHandoff, parseApprovals, effectiveApprovals, appendApproval } from '../lib/handoff.js';
import { hashTree } from '../lib/tree-hash.js';
import { gateHash, recordApproval, checkApprovals, ApprovalError } from '../tools/approvals.js';

const TS = '21000101_000101';

/** run のルートに見立てた一時ディレクトリに handoff.md と P1・P4 の対象を置く。 */
function setup(t) {
  const root = scratchDir(t, 'canon-approvals-');
  mkdirSync(path.join(root, 'work', TS), { recursive: true });
  mkdirSync(path.join(root, 'output', TS, 'generated', '.claude', 'rules'), { recursive: true });
  writeFileSync(path.join(root, 'work', TS, 'handoff.md'), renderHandoff({ ts: TS, target: '/t', mode: 'new' }));
  writeFileSync(path.join(root, 'work', TS, 'requirements.md'), '## 確定要件\n');
  writeFileSync(path.join(root, 'output', TS, 'generated', 'CLAUDE.md'), '# x\n');
  writeFileSync(path.join(root, 'output', TS, 'generated', '.claude', 'rules', 'a.md'), '# a\n');
  return root;
}

test('parseApprovals: 見出し行と区切り行を除き、要旨のエスケープした縦棒を戻す。同じゲートは最後の行が有効', () => {
  let text = renderHandoff({ ts: TS, target: '/t', mode: 'new' });
  text = appendApproval(text, { gate: 'P1', at: '2100-01-01 00:00', target: 'a', hash: '111111111111', summary: '初回 | 補足' });
  text = appendApproval(text, { gate: 'P1', at: '2100-01-01 00:05', target: 'a', hash: '222222222222', summary: '取り直し' });
  const rows = parseApprovals(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].summary, '初回 | 補足');
  assert.equal(effectiveApprovals(rows).get('P1').hash, '222222222222');
  // 行は「## 承認」節の表に入り、後続の節に紛れない
  const sec = text.split('## 差し戻し')[0];
  assert.ok(sec.includes('222222222222'));
});

test('gateHash: ファイルは sha256 の先頭12桁、P4 はディレクトリのハッシュ（verify-report と同じ計算）', (t) => {
  const root = setup(t);
  assert.match(gateHash(root, TS, 'P1').hash, /^[0-9a-f]{12}$/);
  const p4 = gateHash(root, TS, 'P4');
  assert.equal(p4.hash, hashTree(path.join(root, 'output', TS, 'generated')).hash.slice(0, 12));
  assert.equal(p4.target, `output/${TS}/generated`);
  assert.throws(() => gateHash(root, TS, 'P2'), /承認対象が無い/);
  assert.throws(() => gateHash(root, TS, 'P9'), ApprovalError);
});

test('record → check: 一致なら有効。承認後に対象を変えると不一致になる（故意の改変で検出を確かめる）', (t) => {
  const root = setup(t);
  recordApproval(root, TS, 'P1', '要件を承認');
  recordApproval(root, TS, 'P4', '生成物を承認');
  assert.equal(checkApprovals(root, TS, ['P1', 'P4']).ok, true);

  writeFileSync(path.join(root, 'output', TS, 'generated', '.claude', 'rules', 'a.md'), '# a 改\n');
  const c = checkApprovals(root, TS, ['P1', 'P4']);
  assert.equal(c.ok, false);
  assert.deepEqual(c.results.map((r) => [r.gate, r.status]), [['P1', 'ok'], ['P4', 'mismatch']]);

  // 取り直すと最後の行が有効になり、照合が通る
  recordApproval(root, TS, 'P4', '修正後に取り直し');
  assert.equal(checkApprovals(root, TS, ['P1', 'P4']).ok, true);
});

test('check: 期待したゲートの承認行が無ければ無効（承認0件の照合を素通りさせない）。対象が消えても無効', (t) => {
  const root = setup(t);
  const empty = checkApprovals(root, TS, ['P1', 'P2']);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.missing, ['P1', 'P2']);

  recordApproval(root, TS, 'P1', '要件を承認');
  rmSync(path.join(root, 'work', TS, 'requirements.md'));
  assert.equal(checkApprovals(root, TS, ['P1']).results[0].status, 'missing-target');
});

test('record: 要旨が空・handoff.md が無いなら拒否する', (t) => {
  const root = setup(t);
  assert.throws(() => recordApproval(root, TS, 'P1', '  '), /要旨が空/);
  rmSync(path.join(root, 'work', TS, 'handoff.md'));
  assert.throws(() => recordApproval(root, TS, 'P1', 'x'), /handoff.md が無い/);
});

test('approvals CLI: 実際の起動経路で record・check の exit code を確かめる', (t) => {
  const ts = tsFor(import.meta.url, 1);
  const script = path.join(ROOT, 'tools', 'approvals.js');
  t.after(() => {
    rmSync(workDir(ts), { recursive: true, force: true });
    rmSync(outputDir(ts), { recursive: true, force: true });
  });
  mkdirSync(workDir(ts), { recursive: true });
  writeFileSync(path.join(workDir(ts), 'handoff.md'), renderHandoff({ ts, target: '/t', mode: 'new' }));
  writeFileSync(path.join(workDir(ts), 'requirements.md'), '## 確定要件\n');

  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, [ts, 'check', '--expect', 'P7']).code, 2);
  assert.equal(runNodeScript(script, [ts, 'check', '--expect', 'P1']).code, 1);
  assert.equal(runNodeScript(script, [ts, 'record', 'P2', 'x']).code, 1);
  const rec = runNodeScript(script, [ts, 'record', 'P1', '要件を承認']);
  assert.equal(rec.code, 0, rec.stderr);
  assert.match(readFileSync(path.join(workDir(ts), 'handoff.md'), 'utf8'), /\| P1 \| .* \| work\/.*\/requirements\.md \| [0-9a-f]{12} \| 要件を承認 \|/);
  assert.equal(runNodeScript(script, [ts, 'check', '--expect', 'P1']).code, 0);
  writeFileSync(path.join(workDir(ts), 'requirements.md'), '## 確定要件\n- 追記\n');
  const bad = runNodeScript(script, [ts, 'check', '--expect', 'P1']);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /不一致/);
  assert.match(runNodeScript(script, [ts, 'hash', 'P1']).stdout, /^P1 {2}[0-9a-f]{12} {2}work\//);
});
