/**
 * tools/approvals.js（承認行の記録と照合・design/architecture.md §2・§7）の回帰テスト。
 *
 * 照合が「一致」と言うだけの恒真にならないことを、対象を故意に改変して確かめる。純粋な関数は
 * 一時ディレクトリを canon のルートに見立てて呼び、CLI は実際の起動経路（exit code）で確かめる。
 * 差分のゲートは、使い捨ての対象リポジトリの worktree（ブランチ `canon/<ts>`）のコミット sha に束縛される。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { scratchDir } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { changePlan, setupRun } from './helpers/v3-run.js';
import { appendApproval, diffGate, effectiveApprovals, gateNames, gateSpec, parseApprovals } from '../lib/handoff.js';
import { ApprovalError, checkApprovals, gateHash, recordApproval } from '../tools/approvals.js';
import { verifyRun } from '../tools/verify.js';

const nextTs = tsSeq(import.meta.url);
const A_MD = '---\npaths: ["**"]\n---\n# a\n新しい一文\n';

/** 計画どおりの変更をコミットし、verify を回した run。 */
function builtRun(t, route = 'small') {
  const root = scratchDir(t, 'canon-approvals-');
  const r = setupRun(t, nextTs(), { route, root, plan: changePlan({ answers: '- .claude/rules/b.md: 変えない（参照だけ）' }) });
  r.write('.claude/rules/a.md', A_MD);
  r.commit();
  return { ...r, root };
}
const verify = (r) => verifyRun(r.root, r.ts);
const handoffText = (r) => readFileSync(path.join(r.work, 'handoff.md'), 'utf8');

test('ゲートの表: 小は G1・G2、大は G1〜G3。最後のゲートが差分のゲート', () => {
  assert.deepEqual(gateNames('small'), ['G1', 'G2']);
  assert.deepEqual(gateNames('large'), ['G1', 'G2', 'G3']);
  assert.equal(diffGate('small'), 'G2');
  assert.equal(diffGate('large'), 'G3');
  assert.equal(gateSpec('small', 'G3'), undefined);
  assert.equal(gateSpec('huge', 'G1'), undefined);
});

test('parseApprovals: 見出し行と区切り行を除き、要旨のエスケープした縦棒を戻す。同じゲートは最後の行が有効', () => {
  const base = '## 承認\n\n| ゲート | 日時 | 対象ファイル | sha256(先頭12) | 要旨 |\n|---|---|---|---|---|\n';
  let text = appendApproval(base, { gate: 'G1', at: 't1', target: 'a', hash: '111111111111', summary: 'x | y' });
  text = appendApproval(text, { gate: 'G1', at: 't2', target: 'a', hash: '222222222222', summary: '取り直し' });
  const rows = parseApprovals(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].summary, 'x | y');
  assert.equal(effectiveApprovals(rows).get('G1').hash, '222222222222');
});

test('gateHash（小）: G1 は requirements.md と change-plan.md の両方に束縛し、どちらを変えても変わる。G2 は HEAD の sha', (t) => {
  const r = builtRun(t);
  const g1 = gateHash(r.root, r.ts, 'G1');
  assert.match(g1.hash, /^[0-9a-f]{12}$/);
  assert.equal(g1.target, `work/${r.ts}/requirements.md+work/${r.ts}/change-plan.md`);
  writeFileSync(path.join(r.work, 'requirements.md'), `${readFileSync(path.join(r.work, 'requirements.md'), 'utf8')}\n追記\n`);
  const afterReq = gateHash(r.root, r.ts, 'G1').hash;
  assert.notEqual(afterReq, g1.hash, 'requirements.md の変更で変わる');
  writeFileSync(path.join(r.work, 'change-plan.md'), `${readFileSync(path.join(r.work, 'change-plan.md'), 'utf8')}\n追記\n`);
  assert.notEqual(gateHash(r.root, r.ts, 'G1').hash, afterReq, 'change-plan.md の変更で変わる');

  const g2 = gateHash(r.root, r.ts, 'G2');
  assert.equal(g2.hash, r.head().slice(0, 12));
  assert.equal(g2.target, r.branch);
  assert.throws(() => gateHash(r.root, r.ts, 'G3'), /ゲート G3 は small の経路に無い/);
  assert.throws(() => gateHash(r.root, r.ts, 'P1'), ApprovalError);
});

test('record → check（小）: 一致なら有効。承認後に文書を変える・コミットを積むと不一致（故意の改変で検出を確かめる）', (t) => {
  const r = builtRun(t);
  recordApproval(r.root, r.ts, 'G1', '計画を承認');
  assert.equal(verify(r).ok, true);
  const rec = recordApproval(r.root, r.ts, 'G2', '差分を承認');
  assert.equal(rec.hash, r.head().slice(0, 12));
  assert.equal(checkApprovals(r.root, r.ts, ['G1', 'G2']).ok, true);

  r.write('.claude/rules/a.md', `${A_MD}あとから積んだ\n`);
  r.commit('承認の後のコミット');
  const c = checkApprovals(r.root, r.ts, ['G1', 'G2']);
  assert.equal(c.ok, false);
  assert.deepEqual(c.results.map((x) => [x.gate, x.status]), [['G1', 'ok'], ['G2', 'mismatch']], '新しいコミットで差分のゲートだけ無効');

  writeFileSync(path.join(r.work, 'change-plan.md'), `${readFileSync(path.join(r.work, 'change-plan.md'), 'utf8')}\n追記\n`);
  assert.equal(checkApprovals(r.root, r.ts, ['G1']).results.find((x) => x.gate === 'G1').status, 'mismatch', '文書の改変で G1 が無効');
});

test('record G2（差分のゲート）: verify が無い・古い・不合格・未コミットの変更があるなら拒否する', (t) => {
  const r = builtRun(t);
  recordApproval(r.root, r.ts, 'G1', 'x');
  assert.throws(() => recordApproval(r.root, r.ts, 'G2', 'x'), /verify-report\.md が無い/);

  assert.equal(verify(r).ok, true);
  r.write('.claude/rules/a.md', `${A_MD}未コミット\n`);
  assert.throws(() => recordApproval(r.root, r.ts, 'G2', 'x'), /未コミットの変更がある/);
  r.commit('積んだ');
  assert.throws(() => recordApproval(r.root, r.ts, 'G2', 'x'), /検査した HEAD.*と違う/, 'verify の後にコミットが進んだ');

  // 計画に無いファイルを変えて verify を不合格にする
  r.write('CLAUDE.md', '# 計画外\n');
  r.commit('計画外');
  assert.equal(verify(r).ok, false);
  assert.throws(() => recordApproval(r.root, r.ts, 'G2', 'x'), /verify-report が不合格/);
  assert.equal(parseApprovals(handoffText(r)).filter((x) => x.gate === 'G2').length, 0, '拒否したら承認行を書かない');
});

test('record: 前のゲートが無い・無効なら拒否する（G2 は G1、大の G3 は G1・G2 が前提）', (t) => {
  const r = builtRun(t);
  assert.equal(verify(r).ok, true);
  assert.throws(() => recordApproval(r.root, r.ts, 'G2', 'x'), /G2 の前提: G1 の承認が無効か無い/);

  const big = builtRun(t, 'large');
  assert.equal(verify(big).ok, true);
  recordApproval(big.root, big.ts, 'G1', '要件');
  assert.throws(() => recordApproval(big.root, big.ts, 'G3', 'x'), /G3 の前提: G2/);
  recordApproval(big.root, big.ts, 'G2', '設計');
  assert.equal(recordApproval(big.root, big.ts, 'G3', '差分').gate, 'G3');
});

test('大の経路: G1 は requirements.md、G2 は change-plan.md に束縛する。change-plan.md の変更は G2 だけを無効にする', (t) => {
  const r = builtRun(t, 'large');
  assert.equal(gateHash(r.root, r.ts, 'G1').target, `work/${r.ts}/requirements.md`);
  assert.equal(gateHash(r.root, r.ts, 'G2').target, `work/${r.ts}/change-plan.md`);
  recordApproval(r.root, r.ts, 'G1', '要件');
  recordApproval(r.root, r.ts, 'G2', '設計');
  writeFileSync(path.join(r.work, 'change-plan.md'), `${readFileSync(path.join(r.work, 'change-plan.md'), 'utf8')}\n追記\n`);
  const c = checkApprovals(r.root, r.ts, ['G1', 'G2']);
  assert.deepEqual(c.results.map((x) => [x.gate, x.status]), [['G1', 'ok'], ['G2', 'mismatch']]);
});

test('route と合わないゲートは拒否する（小で G3 を期待・記録、承認表に route に無いゲート）', (t) => {
  const r = builtRun(t);
  assert.throws(() => checkApprovals(r.root, r.ts, ['G3']), /ゲート G3 は small の経路に無い/);
  assert.throws(() => recordApproval(r.root, r.ts, 'G3', 'x'), /small の経路に無い/);
  const hp = path.join(r.work, 'handoff.md');
  writeFileSync(hp, appendApproval(handoffText(r), { gate: 'G3', at: 't', target: r.branch, hash: '0'.repeat(12), summary: 'x' }));
  assert.throws(() => checkApprovals(r.root, r.ts, []), /承認表のゲート G3 は small の経路に無い/);
});

test('check: 期待したゲートの承認行が無ければ無効（承認0件の照合を素通りさせない）。対象が消えても無効', (t) => {
  const r = builtRun(t);
  const empty = checkApprovals(r.root, r.ts, ['G1', 'G2']);
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.missing, ['G1', 'G2']);
  recordApproval(r.root, r.ts, 'G1', 'x');
  rmSync(path.join(r.work, 'change-plan.md'));
  assert.equal(checkApprovals(r.root, r.ts, ['G1']).results[0].status, 'missing-target');
});

test('record / hash: 要旨が空・handoff.md が無い・route が無い・worktree のブランチが違うなら拒否する', (t) => {
  const r = builtRun(t);
  assert.throws(() => recordApproval(r.root, r.ts, 'G1', '  '), /要旨が空/);
  const hp = path.join(r.work, 'handoff.md');
  const original = handoffText(r);
  writeFileSync(hp, original.replace('route: small\n', ''));
  assert.throws(() => gateHash(r.root, r.ts, 'G1'), /route が small か large でない/);
  writeFileSync(hp, original.replace(`branch: ${r.branch}`, 'branch: canon/other'));
  assert.throws(() => gateHash(r.root, r.ts, 'G2'), /branch.*と違う/);
  rmSync(hp);
  assert.throws(() => recordApproval(r.root, r.ts, 'G1', 'x'), /handoff\.md が無い/);
});

test('approvals CLI: 実際の起動経路で record・check の exit code を確かめる', (t) => {
  const r = setupRun(t, nextTs(), { plan: changePlan() });
  r.write('.claude/rules/a.md', A_MD);
  r.commit();
  const script = path.join(ROOT, 'tools', 'approvals.js');
  const run = (...args) => runNodeScript(script, args);

  assert.equal(run().code, 2);
  assert.equal(run(r.ts, 'check', '--expect', 'G7').code, 2, 'どの経路にも無い名前は引数不正（exit 2）');
  assert.equal(run(r.ts, 'record', 'P1', 'x').code, 2);
  assert.equal(run(r.ts, 'check', '--expect', 'G3').code, 1, '小の経路に無いゲートは拒否（exit 1）');
  assert.equal(run(r.ts, 'check', '--expect', 'G1').code, 1, '承認行が無い');
  assert.equal(run(r.ts, 'record', 'G2', 'x').code, 1, '前提（G1）を満たさない');
  const rec = run(r.ts, 'record', 'G1', '計画を承認');
  assert.equal(rec.code, 0, rec.stderr);
  assert.match(handoffText(r), /\| G1 \| .* \| work\/.*\/requirements\.md\+work\/.*\/change-plan\.md \| [0-9a-f]{12} \| 計画を承認 \|/);
  assert.equal(run(r.ts, 'check', '--expect', 'G1').code, 0);
  writeFileSync(path.join(r.work, 'requirements.md'), `${readFileSync(path.join(r.work, 'requirements.md'), 'utf8')}\n追記\n`);
  const bad = run(r.ts, 'check', '--expect', 'G1');
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /不一致/);
  assert.match(run(r.ts, 'hash', 'G1').stdout, /^G1 {2}[0-9a-f]{12} {2}work\//);
  assert.match(run(r.ts, 'hash', 'G2').stdout, /^G2 {2}[0-9a-f]{12} {2}canon\//);
});
