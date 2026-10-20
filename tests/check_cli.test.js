/**
 * tools/check.js（npm run check -- <ts> requirements|change-plan）の回帰テスト。
 *
 * 点検が「OK と言うだけの恒真」にならないことを、成果物を故意に壊して NG が出ることで確かめる。
 * 判定関数は文字列とオブジェクトで呼び、CLI は実際の起動経路（引数・exit code・出力）で確かめる
 * （inventory・impact の実物の出力を、そのまま check に通す）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { changePlan, REQUIREMENTS, setupRun } from './helpers/v3-run.js';
import { LIMITS, checkChangePlan, checkRequirements } from '../tools/check.js';

const nextTs = tsSeq(import.meta.url);
const CHECK = path.join(ROOT, 'tools', 'check.js');
const checkCli = (...args) => runNodeScript(CHECK, args);

const failed = (items) => items.filter((i) => !i.ok).map((i) => i.name);

// ---------------------------------------------------------------------------
// requirements
// ---------------------------------------------------------------------------

test('check requirements: 基準の文書は全項目 OK', () => {
  assert.deepEqual(failed(checkRequirements(REQUIREMENTS, new Date('2026-06-01'))), []);
});

test('check requirements（違反注入）: 確定要件の「文言のみ」は NG。「## 未確定」に置けば通る', () => {
  const bad = REQUIREMENTS.replace('confidence: 実物で確認', 'confidence: 文言のみ');
  assert.deepEqual(failed(checkRequirements(bad, new Date('2026-06-01'))), ['確定要件に「文言のみ」が無い']);
  const moved = bad.replace('## 確定要件\n', '## 確定要件\n- id: R0\n  want: x\n  confidence: 公式で確認\n  evidence: 公式\n  files: [a]\n  accept: x\n').replace(
    '## 未確定\n',
    '## 未確定\n- id: R9\n  want: 確かめてから\n  confidence: 文言のみ\n  evidence: 台帳\n  files: [a]\n  accept: x\n'
  );
  // R1 は文言のみのまま確定要件に残るので、未確定の R9 だけでは NG が消えないことを対で見る。
  assert.deepEqual(failed(checkRequirements(moved, new Date('2026-06-01'))), ['確定要件に「文言のみ」が無い']);
  const onlyPending = REQUIREMENTS.replace('## 未確定\n', '## 未確定\n- id: R9\n  want: 確かめてから\n  confidence: 文言のみ\n  evidence: 台帳\n  files: [a]\n  accept: x\n');
  assert.deepEqual(failed(checkRequirements(onlyPending, new Date('2026-06-01'))), [], '未確定の「文言のみ」は通す');
});

test('check requirements（違反注入）: 必須欄の欠け・id 重複・確度と強度の語彙外・constraints/conflicts の欠け', () => {
  const now = new Date('2026-06-01');
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace(/  accept:.*\n/, ''), now)).includes('要件の必須欄（id・want・confidence・evidence・files・accept）'));
  const dup = REQUIREMENTS.replace('## 未確定\n', '## 未確定\n- id: R1\n  want: x\n  confidence: 文言のみ\n  evidence: e\n  files: [a]\n  accept: x\n');
  assert.ok(failed(checkRequirements(dup, now)).includes('要件 id の一意'));
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace('実物で確認', '確認済み'), now)).includes('confidence の語彙'));
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace('  accept:', '  strength_needed: must\n  accept:'), now)).includes('strength_needed の語彙（任意の欄）'));
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace(/conflicts: \[\]\n/, ''), now)).includes('conflicts'));
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace(/constraints:[\s\S]*?\n\n/, ''), now)).includes('constraints'));
  assert.ok(failed(checkRequirements(REQUIREMENTS.replace('2026-01-01 09:00', '2999-01-01 09:00'), now)).includes('confirmed_at'));
  assert.deepEqual(failed(checkRequirements('# 何もない\n')), ['requirements.md の構文']);
});

test('check requirements（違反注入）: サイズの上限（要件1件・constraints・全体）', () => {
  const now = new Date('2026-06-01');
  const fat = REQUIREMENTS.replace('  accept: a.md の末尾に「新しい一文」がある', `  accept: ${'あ'.repeat(600)}`);
  assert.deepEqual(failed(checkRequirements(fat, now)), ['サイズ: 要件1件']);
  const bigConstraints = REQUIREMENTS.replace('experimental: { allowed: false, reason: "禁止" }', `experimental: { allowed: false, reason: "${'理'.repeat(800)}" }`);
  assert.deepEqual(failed(checkRequirements(bigConstraints, now)), ['サイズ: constraints']);
  const many = Array.from({ length: 40 }, (_, i) => `- id: P${i}\n  want: x\n  confidence: 文言のみ\n  evidence: ${'e'.repeat(500)}\n  files: [a]\n  accept: x\n`).join('');
  const total = REQUIREMENTS.replace('## 未確定\n', `## 未確定\n${many}`);
  assert.deepEqual(failed(checkRequirements(total, now)), ['サイズ: requirements 全体']);
  assert.ok(LIMITS.requirement === 1536 && LIMITS.requirementsTotal === 20480, '上限は設計書 §4.1 の値');
});

// ---------------------------------------------------------------------------
// change-plan（判定関数）
// ---------------------------------------------------------------------------

const INVENTORY = { summary: { items: 3, by_feature: { rules: 2, 'claude-md': 1 }, unclassified_by_hint: {} } };
const HIT = { id: '.claude/rules/b.md:4:.claude/rules/a.md', path: '.claude/rules/b.md', line: 4, term: '.claude/rules/a.md' };
const IMPACT = { input: { files: ['.claude/rules/a.md'], terms: [] }, hits: [HIT] };
const ANSWER = '- .claude/rules/b.md:4:.claude/rules/a.md: 変えない（a.md の存在への参照）';
const ctx = (over = {}) => ({ requirements: REQUIREMENTS, route: 'small', inventory: INVENTORY, impact: IMPACT, ...over });
const plan = (over) => changePlan({ answers: ANSWER, ...over });

test('check change-plan: 基準の計画（小の経路）は全項目 OK', () => {
  assert.deepEqual(failed(checkChangePlan(plan(), ctx())), []);
});

test('check change-plan（違反注入）: 書式・要件との対応・検証コマンド', () => {
  const run = (text, c) => failed(checkChangePlan(text, ctx(c)));
  assert.deepEqual(run('# 空\n'), ['change-plan.md の構文']);
  assert.ok(run(plan().replace('op: modify', 'op: edit')).includes('ファイルの必須欄（path・op・reqs・instruct）'));
  assert.ok(run(plan().replace('reqs: [R1]', 'reqs: [R9]')).includes('reqs が確定要件の id を指している'));
  assert.ok(run(plan().replace('reqs: [R1]', 'reqs: [R9]')).includes('確定要件がすべて計画に現れる'), 'R1 がどの計画にも現れない');
  assert.ok(run(plan().replace(/- `npm test`\n/, '')).includes('検証コマンド'));
  assert.ok(run(plan(), { route: null }).includes('route'));
  assert.ok(run(plan(), { requirements: null }).includes('要件との対応'));
  const two = `- path: .claude/rules/a.md\n  op: modify\n  reqs: [R1]\n  instruct: x\n- path: .claude/rules/a.md\n  op: modify\n  reqs: [R1]\n  instruct: y`;
  assert.ok(run(plan({ files: two })).includes('path の一意'));
});

test('check change-plan（違反注入）: サイズの上限（ファイル1件・参照元の扱い 1行・全体）', () => {
  const run = (text, c) => failed(checkChangePlan(text, ctx(c)));
  const fat = plan({ files: `- path: .claude/rules/a.md\n  op: modify\n  reqs: [R1]\n  instruct: ${'あ'.repeat(900)}` });
  assert.ok(run(fat).includes('サイズ: ファイル1件の変更指示'));
  const longAnswer = plan().replace('（a.md の存在への参照）', `（${'理'.repeat(120)}）`);
  assert.ok(run(longAnswer).includes('サイズ: 参照元の扱い 1件'));
  const huge = `${plan()}\n${'x'.repeat(LIMITS.planTotal.small)}\n`;
  assert.ok(run(huge).includes('サイズ: change-plan 全体'));
});

test('check change-plan（違反注入）: impact が無い・古い・未回答・回答が impact に無い・理由が無い', () => {
  const run = (text, c) => failed(checkChangePlan(text, ctx(c)));
  assert.deepEqual(failed(checkChangePlan(plan(), ctx({ impact: null }))), ['impact'], 'impact.json が無ければ合格にしない');
  assert.ok(run(plan(), { impact: { ...IMPACT, input: { files: ['.claude/rules/x.md'], terms: [] } } }).includes('impact の入力が change-plan と同じ（ファイル）'));
  assert.ok(run(plan(), { impact: { ...IMPACT, input: { files: ['.claude/rules/a.md'], terms: ['/old'] } } }).includes('impact の入力が change-plan と同じ（語）'));
  const unanswered = run(plan({ answers: '' }));
  assert.ok(unanswered.some((n) => n.startsWith('impact の該当 1件')), unanswered.join('|'));
  assert.ok(run(plan({ answers: `${ANSWER}\n- .claude/rules/zzz.md:1:x: 変えない（古い）` })).includes('回答が impact の該当を指している'));
  assert.ok(run(plan({ answers: '- .claude/rules/b.md:4:.claude/rules/a.md: 変えない' })).includes('「変えない」に理由がある'));
  assert.ok(run(plan({ answers: '- .claude/rules/b.md: 変える' })).includes('「変える」のファイルが「## ファイル」にある'));
  assert.ok(run(plan({ answers: '- b.md は触らない' })).includes('参照元の扱いの書式'));
});

test('check change-plan: ファイル単位の回答は、そのファイルの全該当を覆う。該当の無いファイルへの回答は古い回答として NG', () => {
  const hits = [HIT, { ...HIT, id: '.claude/rules/b.md:9:.claude/rules/a.md', line: 9 }, { ...HIT, id: 'README.md:1:.claude/rules/a.md', path: 'README.md', line: 1 }];
  const c = ctx({ impact: { ...IMPACT, hits } });
  assert.deepEqual(failed(checkChangePlan(plan({ answers: '- .claude/rules/b.md: 変えない（参照だけ）\n- README.md: 変えない（履歴）' }), c)), []);
  assert.ok(failed(checkChangePlan(plan({ answers: '- .claude/rules/b.md: 変えない（参照だけ）' }), c)).some((n) => n.startsWith('impact の該当 3件')), 'README.md が未回答');
  assert.ok(failed(checkChangePlan(plan({ answers: '- .claude/rules/b.md: 変えない（参照だけ）\n- README.md: 変えない（履歴）\n- LICENSE: 変えない（なし）' }), c)).includes('回答が impact の該当を指している'));
});

test('check change-plan: 小の経路の条件（1 既存がある・2 新しい機能種別を足さない・3 構成を変えない）を故意の違反で確かめる', () => {
  const run = (text, c) => checkChangePlan(text, ctx(c));
  const bad1 = failed(run(plan(), { inventory: { summary: { items: 0, by_feature: {}, unclassified_by_hint: {} } } }));
  assert.ok(bad1.includes('小の条件1: 対象に既存のカスタマイズがある'));

  const newHook = plan({ files: '- path: .claude/hooks/x.sh\n  op: new\n  reqs: [R1]\n  instruct: フックを足す' });
  assert.ok(failed(run(newHook)).includes('小の条件2: 新しい機能種別を足さない'), 'hooks が0件なのに足す');
  // 分類外のヒントで hooks が数えられていれば、新しい機能種別ではない（段階2の判断）
  const withHint = { summary: { items: 3, by_feature: { rules: 2 }, unclassified_by_hint: { hooks: 1 } } };
  assert.ok(!failed(run(newHook, { inventory: withHint })).includes('小の条件2: 新しい機能種別を足さない'));

  const newSkill = plan({ files: '- path: .claude/skills/s/SKILL.md\n  op: new\n  reqs: [R1]\n  instruct: Skill を足す' });
  const skillInv = { summary: { items: 3, by_feature: { skills: 2 }, unclassified_by_hint: {} } };
  assert.ok(failed(run(newSkill, { inventory: skillInv })).includes('小の条件3: 構成を変えない（Skill・Subagent・Plugin の新設・廃止）'), '機能種別は既にあっても、Skill の新設は構成の変更');
  const delAgent = plan({ files: '- path: .claude/agents/w.md\n  op: delete\n  reqs: [R1]\n  instruct: 廃止' });
  assert.ok(failed(run(delAgent)).includes('小の条件3: 構成を変えない（Skill・Subagent・Plugin の新設・廃止）'));

  assert.ok(failed(run(plan(), { inventory: null })).includes('小の経路の条件'), 'inventory.json が無ければ合格にしない');
  // 大の経路では条件を見ない。代わりに「機能と責務」「モデル割当」の節を要求する。
  const large = failed(run(newSkill, { route: 'large', inventory: null }));
  assert.ok(large.includes('## 機能と責務（大の経路）') && large.includes('## モデル割当（大の経路）'));
  assert.ok(!large.some((n) => n.startsWith('小の')));
  const withSections = `${newSkill}\n\n## 機能と責務\n- skills: 足す\n\n## モデル割当\n- sonnet\n`;
  assert.ok(!failed(run(withSections, { route: 'large' })).some((n) => n.includes('大の経路')));
});


test('check change-plan: 変えるファイルの中の該当（scope: changed）にも回答を求める。削除するファイルの中の該当は求めない', () => {
  const inA = { id: '.claude/rules/a.md:3:old', path: '.claude/rules/a.md', line: 3, term: 'old', via: 'text', scope: 'changed', text: 'old' };
  const c = ctx({ impact: { ...IMPACT, input: { files: ['.claude/rules/a.md'], terms: ['old'] }, hits: [HIT, inA] } });
  const withTerm = (answers) => plan({ answers, terms: '- `old`' });
  assert.ok(failed(checkChangePlan(withTerm(ANSWER), c)).some((n) => n.startsWith('impact の該当 2件')), 'a.md の中の行が未回答');
  assert.deepEqual(failed(checkChangePlan(withTerm(`${ANSWER}\n- .claude/rules/a.md:3:old: 変える`), c)), []);
  assert.ok(failed(checkChangePlan(withTerm(`${ANSWER}\n- .claude/rules/a.md: 変える`), c)).some((n) => n.startsWith('impact の該当 2件')), 'ファイル単位の「変える」は変えるファイルの中の該当を覆わない');
  assert.deepEqual(failed(checkChangePlan(withTerm(`${ANSWER}\n- .claude/rules/a.md: 変えない（語は残す）`), c)), [], 'ファイル単位の「変えない」は覆う');
  const del = changePlan({ answers: ANSWER, terms: '- `old`', files: '- path: .claude/rules/a.md\n  op: delete\n  reqs: [R1]\n  instruct: 消す（R1）' });
  assert.deepEqual(failed(checkChangePlan(del, c)), [], '削除するファイルの中の該当は答えなくてよい');
});

// ---------------------------------------------------------------------------
// CLI（inventory・impact の実物を通す）
// ---------------------------------------------------------------------------

test('check CLI: inventory・impact の実物の出力を、そのまま change-plan の点検に通す（exit code・出力）', (t) => {
  const r = setupRun(t, nextTs(), { plan: plan() });
  const inv = runNodeScript(path.join(ROOT, 'tools', 'inventory.js'), ['--root', r.worktree, '--out', r.work]);
  assert.equal(inv.code, 0, inv.stderr);
  const imp = runNodeScript(path.join(ROOT, 'tools', 'impact.js'), ['--root', r.worktree, '--out', r.work, '--files', '.claude/rules/a.md']);
  assert.equal(imp.code, 0, imp.stderr);

  // 実物の該当は b.md:5（`.claude/rules/a.md` を参照する行）。ID を写し違えると NG になる。
  const ng = checkCli(r.ts, 'change-plan');
  assert.equal(ng.code, 1, ng.stdout);
  assert.match(ng.stdout, /NG {2}impact の該当 1件 すべてに回答がある/);

  r.writeWork('change-plan.md', plan({ answers: '- .claude/rules/b.md: 変えない（a.md の存在への参照）' }));
  const ok = checkCli(r.ts, 'change-plan');
  assert.equal(ok.code, 0, ok.stdout);
  assert.match(ok.stdout, /点検: すべて OK/);

  assert.equal(checkCli(r.ts, 'requirements').code, 0, '基準の requirements.md');
});

test('check CLI: 入力不在は NG（exit 1）、引数不正は exit 2', (t) => {
  const r = setupRun(t, nextTs(), { requirements: null });
  const noReq = checkCli(r.ts, 'requirements');
  assert.equal(noReq.code, 1);
  assert.match(noReq.stdout, /requirements\.md が無い/);
  const noPlan = checkCli(r.ts, 'change-plan');
  assert.equal(noPlan.code, 1);
  assert.match(noPlan.stdout, /change-plan\.md が無い/);
  assert.equal(checkCli(r.ts, 'spec').code, 2, 'spec は廃止した');
  assert.equal(checkCli(r.ts, 'unknown').code, 2, '未知の対象は引数不正');
  assert.equal(checkCli('not-a-ts', 'requirements').code, 2);
  assert.equal(checkCli().code, 2);
});
