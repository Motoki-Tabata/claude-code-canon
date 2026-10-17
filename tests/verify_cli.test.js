/**
 * verify.js（npm run verify・design/architecture.md §7）の統合テスト。
 *
 * - 実際の起動経路（子プロセス）で exit code・report の出力先・中身を確かめる。使い捨ての対象リポジトリと
 *   その worktree（`canon/<ts>`）の上で、変えたファイルだけが検査されること。
 * - 検査対象ゼロ（差分が空）・未コミットの変更・入力不在を合格にしない。
 *
 * 「全部通った」だけを根拠にしない: 同じ入力へ違反を注入すると exit 1 になることを対で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { changePlan, REQUIREMENTS, setupRun } from './helpers/v3-run.js';
import { CHECKS, parseVerifyReport, renderReport } from '../lib/verify/run.js';

const nextTs = tsSeq(import.meta.url);
const VERIFY = path.join(ROOT, 'tools', 'verify.js');
const verifyCli = (...args) => runNodeScript(VERIFY, args);
const reportOf = (r) => readFileSync(path.join(r.work, 'verify-report.md'), 'utf8');

const A_MD = '---\npaths: ["**"]\n---\n# a\n新しい一文\n';
/** a.md を書き換えて b.md が a.md を参照している状態の plan（impact の該当に回答済み）。 */
const PLAN_OK = changePlan({ answers: '- .claude/rules/b.md: 変えない（a.md の存在への参照で内容は無関係）' });

function passingRun(t) {
  const r = setupRun(t, nextTs(), { plan: PLAN_OK });
  r.write('.claude/rules/a.md', A_MD);
  r.commit();
  return r;
}

// ---- CLI の実経路 ----

test('verify CLI: 変えたファイルが計画どおりなら V1〜V9 を通り exit 0、report を work/<ts>/ に書く（HEAD の sha 付き）', (t) => {
  const r = passingRun(t);
  const out = verifyCli(r.ts);
  assert.equal(out.code, 0, out.stdout + out.stderr + (existsSync(path.join(r.work, 'verify-report.md')) ? reportOf(r) : ''));
  const report = reportOf(r);
  for (const [id] of CHECKS) assert.match(report, new RegExp(`^## ${id} `, 'm'), `${id} の節が report に無い`);
  assert.match(report, /結果: 合格（違反 0 件/);
  assert.deepEqual(parseVerifyReport(report), { head: r.head(), passed: true }, '検査した HEAD の sha を残す');
  assert.match(out.stdout, /HEAD [0-9a-f]{12}/);
});

test('verify CLI（違反注入）: 計画に無いファイルを変えると exit 1、report に V7 の違反が載る', (t) => {
  const r = passingRun(t);
  r.write('CLAUDE.md', '# 計画に無い変更\n');
  r.commit('もう1つ');
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1, out.stdout);
  assert.match(out.stdout, /V7:違反/);
  assert.match(reportOf(r), /- 違反: V7: 差分の CLAUDE\.md（M）が change-plan のファイルに無い/);
});

test('verify CLI（違反注入）: 計画の op と差分の種類が違うと V7 の違反（modify の計画で、実際は新規追加）', (t) => {
  const r = setupRun(t, nextTs(), { plan: PLAN_OK });
  r.write('.claude/rules/new.md', A_MD);
  r.commit();
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1);
  const report = reportOf(r);
  assert.match(report, /V7: 差分の \.claude\/rules\/new\.md（A）が change-plan のファイルに無い/);
  assert.match(report, /V7: change-plan の \.claude\/rules\/a\.md（modify）が差分に無い/);
});

test('verify CLI: 未コミットの変更があれば不合格（検査も承認も漏れる）', (t) => {
  const r = passingRun(t);
  r.write('.claude/rules/a.md', `${A_MD}さらに未コミット\n`);
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1, out.stdout);
  assert.match(reportOf(r), /## 前提[\s\S]*未コミットの変更が 1 件/);
});

test('verify CLI: 差分が空なら全検査を違反にする（検査対象ゼロを合格にしない）', (t) => {
  const r = setupRun(t, nextTs(), { plan: PLAN_OK });
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1, out.stdout);
  const report = reportOf(r);
  for (const [id] of CHECKS) assert.match(report, new RegExp(`- 違反: ${id}: 差分が空`), id);
});

test('verify CLI: 種別を判定できない .md を黙って飛ばさず V1 の違反にする', (t) => {
  const plan = changePlan({ files: '- path: .claude/misc/x.md\n  op: new\n  reqs: [R1]\n  instruct: 足す（R1）' });
  const r = setupRun(t, nextTs(), { plan });
  r.write('.claude/misc/x.md', '# x\n');
  r.commit();
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1, out.stdout);
  assert.match(reportOf(r), /- 違反: V1 \.claude\/misc\/x\.md: 種別/);
});

test('verify CLI: 削除したファイルを指す、触らないファイルの参照は、答えが無ければ違反・「変えない（理由）」なら warning', (t) => {
  // b.md は a.md を指している。a.md を削除する。
  const del = (answers) => changePlan({ answers, files: '- path: .claude/rules/a.md\n  op: delete\n  reqs: [R1]\n  instruct: 廃止する（R1）' });
  const r = setupRun(t, nextTs(), { plan: del('') });
  r.remove('.claude/rules/a.md');
  r.commit();
  const bad = verifyCli(r.ts);
  assert.equal(bad.code, 1, bad.stdout);
  assert.match(reportOf(r), /- 違反: V6 \.claude\/rules\/b\.md: \d+ 行目が、削除したファイル/);

  r.writeWork('change-plan.md', del('- .claude/rules/b.md: 変えない（履歴の説明として残す）'));
  const ok = verifyCli(r.ts);
  assert.equal(ok.code, 0, ok.stdout + reportOf(r));
  assert.match(reportOf(r), /- warning: V6 \.claude\/rules\/b\.md/);
});

test('verify CLI: hooks か permissions を含む差分は、trust の前提を V9 の warning に載せる（合格のまま）', (t) => {
  const req = REQUIREMENTS.replace('hooks:        { allowed: false', 'hooks:        { allowed: true');
  const plan = changePlan({ files: '- path: .claude/settings.json\n  op: new\n  reqs: [R1]\n  instruct: 権限を足す（R1）' });
  const r = setupRun(t, nextTs(), { plan, requirements: req });
  r.write('.claude/settings.json', JSON.stringify({ permissions: { allow: ['Read'] } }));
  r.commit();
  const out = verifyCli(r.ts);
  assert.equal(out.code, 0, out.stdout + reportOf(r));
  assert.match(reportOf(r), /- warning: V9: .*trust.*permissions/);
});

test('verify CLI: 禁止した機能（hooks）の差分は V8 の違反', (t) => {
  const plan = changePlan({ files: '- path: .claude/settings.json\n  op: new\n  reqs: [R1]\n  instruct: フックを足す（R1）' });
  const r = setupRun(t, nextTs(), { plan });
  r.write('.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } }));
  r.commit();
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1, out.stdout);
  assert.match(reportOf(r), /- 違反: V8: constraints で "hooks" は禁止/);
});

test('verify CLI: change-plan.md が無ければ V7 の違反（計画が無いことを「計画どおり」と読まない）', (t) => {
  const r = setupRun(t, nextTs());
  r.write('.claude/rules/a.md', A_MD);
  r.commit();
  const out = verifyCli(r.ts);
  assert.equal(out.code, 1);
  assert.match(reportOf(r), /V7: work\/<ts>\/change-plan\.md が無い/);
});

test('verify CLI: 入力不在は exit 1、引数不正は exit 2', () => {
  const ghost = nextTs(); // work/<ts>/ を作らない
  const none = verifyCli(ghost);
  assert.equal(none.code, 1);
  assert.match(none.stderr, /handoff\.md が無い/);
  assert.equal(verifyCli().code, 2);
  assert.equal(verifyCli('not-a-ts').code, 2);
  assert.equal(verifyCli(ghost, 'extra').code, 2);
});

test('verify report: 未判定だけなら合格のまま、未判定を件数・表・本文に載せる（V-common-01）', () => {
  const results = Object.fromEntries(CHECKS.map(([id]) => [id, { violations: [], warnings: [], undetermined: [], checked: 1, na: null }]));
  results.V1.undetermined.push('V1 x/y.md: 未判定の例 [出典: canon-reference V-common-01]');
  const state = { head: 'a'.repeat(40), base: 'b'.repeat(40), branch: 'canon/x', dirty: [], changedCount: 1 };
  const { body, total, undetermined } = renderReport({ ts: 'x', results, state, at: 'now' });
  assert.equal(total, 0, '未判定は違反に数えない（exit 0 の条件は違反0件）');
  assert.equal(undetermined, 1);
  assert.match(body, /結果: 合格（違反 0 件・warning 0 件・未判定 1 件）/);
  assert.match(body, /\| V1 配置パス \| pass（未判定あり） \| 0 \| 0 \| 1 \|/);
  assert.match(body, /- 未判定: V1 x\/y\.md/);
});
