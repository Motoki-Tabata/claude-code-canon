#!/usr/bin/env node
/**
 * check.js（npm run check -- <ts> requirements|change-plan）— 中間文書の機械点検（design/architecture.md §4）。
 *
 * 要件の欄・根拠の確度・サイズの上限・要件と計画の対応・`impact` の該当への回答・小の経路の条件を、
 * 既存のパーサ（lib/requirements.js・lib/change-plan.js）だけで項目ごとに OK / NG にする。
 * 入力は work/<ts>/ の requirements.md・change-plan.md・handoff.md（route）・inventory.json・impact.json。
 *
 * exit 0 すべて OK／exit 1 NG あり（対象のファイルが無い・パースできないも NG）／exit 2 引数不正。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT } from '../lib/canon.js';
import { ChangePlanError, OPS, parseChangePlan } from '../lib/change-plan.js';
import { featureOfPath } from '../lib/features.js';
import { parseHandoff, ROUTES } from '../lib/handoff.js';
import { parseConfirmedAt, parseRequirementsDoc, RequirementsError } from '../lib/requirements.js';
import { skillPathRole } from '../lib/artifact.js';
import { isMainModule, isValidTs } from '../lib/run.js';

export const TARGETS = ['requirements', 'change-plan'];

/** サイズの上限（UTF-8 バイト）。design/architecture.md §4.1。段階6の実測で見直す。 */
export const LIMITS = {
  requirement: 1.5 * 1024,
  constraints: 2 * 1024,
  requirementsTotal: 20 * 1024,
  changeFile: 2.5 * 1024,
  answerLine: 300,
  features: 8 * 1024,
  models: 3 * 1024,
  planTotal: { small: 48 * 1024, large: 64 * 1024 },
};

export const CONFIDENCES = ['実物で確認', '公式で確認', '文言のみ'];

const ok = (name, detail = '') => ({ name, ok: true, detail });
const ng = (name, detail) => ({ name, ok: false, detail });
const cond = (name, pass, detailOk, detailNg) => (pass ? ok(name, detailOk) : ng(name, detailNg));
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const readOrNull = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

function tally(items) {
  const m = new Map();
  for (const v of items) m.set(v ?? '(未記入)', (m.get(v ?? '(未記入)') ?? 0) + 1);
  return [...m].map(([k, n]) => `${k} ${n}`).join('・') || 'なし';
}

// ---------------------------------------------------------------------------
// requirements
// ---------------------------------------------------------------------------

export function checkRequirements(text, now = new Date()) {
  let doc;
  try {
    doc = parseRequirementsDoc(text);
  } catch (e) {
    if (!(e instanceof RequirementsError)) throw e;
    return [ng('requirements.md の構文', e.message)];
  }
  const items = [];
  const reqs = doc.requirements;
  items.push(ok('確定要件の件数', `${reqs.length}件`));

  const bad = reqs.filter((r) => !r.id || !r.want || !r.confidence || !r.evidence || r.files.length === 0 || !r.accept);
  items.push(cond('要件の必須欄（id・want・confidence・evidence・files・accept）', bad.length === 0, '全件そろっている',
    `欠けた要件: ${bad.map((r) => r.id ?? `L${r.line}`).join('・')}`));
  const ids = [...reqs, ...doc.pending].map((r) => r.id);
  const dup = ids.filter((v, i) => v && ids.indexOf(v) !== i);
  items.push(cond('要件 id の一意', dup.length === 0, '重複なし', `重複: ${[...new Set(dup)].join('・')}`));

  // 根拠の確度。「文言のみ」は確定させない（実物や公式で確かめる前に確定して取り直すのを防ぐ）。
  const badConf = reqs.filter((r) => r.confidence && !CONFIDENCES.includes(r.confidence));
  items.push(cond('confidence の語彙', badConf.length === 0, `確度: ${tally(reqs.map((r) => r.confidence))}`,
    `語彙外（${CONFIDENCES.join('・')}）: ${badConf.map((r) => `${r.id}=${r.confidence}`).join('・')}`));
  const wording = reqs.filter((r) => r.confidence === '文言のみ');
  items.push(cond('確定要件に「文言のみ」が無い', wording.length === 0, '無い',
    `「文言のみ」の要件は確定させない（実物か公式で確かめてから確定する。確かめるまでは「## 未確定」に置く）: ${wording.map((r) => r.id).join('・')}`));
  const badStrength = reqs.filter((r) => r.strength_needed && !['advisory', 'deterministic', 'enforced'].includes(r.strength_needed));
  items.push(cond('strength_needed の語彙（任意の欄）', badStrength.length === 0, '', `語彙外: ${badStrength.map((r) => `${r.id}=${r.strength_needed}`).join('・')}`));

  items.push(cond('constraints', doc.constraintsFound && doc.constraints.length > 0,
    doc.constraints.map((c) => `${c.key}=${c.freeform ? '自由文' : c.allowed}`).join('・'), 'constraints ブロックが無い、または空'));
  const badC = doc.constraints.filter((c) => !c.freeform && c.allowed === null);
  items.push(cond('constraints の allowed は true / false', badC.length === 0, '', `不正: ${badC.map((c) => c.key).join('・')}`));
  items.push(cond('conflicts', doc.conflicts !== null,
    doc.conflicts?.length ? `${doc.conflicts.length}件` : '空（[]）', 'conflicts ブロックが無い（無ければ `conflicts: []` と書く）'));

  const ca = parseConfirmedAt(text);
  if (ca) {
    items.push(cond('confirmed_at', ca.at && ca.at.getTime() <= now.getTime(), ca.raw,
      !ca.at ? `形が YYYY-MM-DD hh:mm でない: ${ca.raw}` : `現在より後の時刻: ${ca.raw}（date で取り直す）`));
  }

  // サイズの上限
  const big = reqs.filter((r) => r.bytes > LIMITS.requirement);
  items.push(cond('サイズ: 要件1件', big.length === 0, `最大 ${reqs.reduce((m, r) => Math.max(m, r.bytes), 0)} バイト（上限 ${kb(LIMITS.requirement)}）`,
    `上限 ${kb(LIMITS.requirement)} 超: ${big.map((r) => `${r.id}=${r.bytes}バイト`).join('・')}（前の段の再掲をしていないか）`));
  items.push(cond('サイズ: constraints', doc.constraintsBytes <= LIMITS.constraints, `${doc.constraintsBytes} バイト（上限 ${kb(LIMITS.constraints)}）`,
    `${doc.constraintsBytes} バイトで上限 ${kb(LIMITS.constraints)} 超`));
  items.push(cond('サイズ: requirements 全体', doc.bytes <= LIMITS.requirementsTotal, `${kb(doc.bytes)}（上限 ${kb(LIMITS.requirementsTotal)}）`,
    `${kb(doc.bytes)} で上限 ${kb(LIMITS.requirementsTotal)} 超`));
  return items;
}

// ---------------------------------------------------------------------------
// change-plan
// ---------------------------------------------------------------------------

const isPluginManifest = (p) => path.posix.basename(p) === 'plugin.json' && p.includes('.claude-plugin/');

/** 小の経路の条件（design/architecture.md §2.1）。inventory が無ければ NG。 */
function smallRouteItems(plan, inventory) {
  if (!inventory) return [ng('小の経路の条件', 'work/<ts>/inventory.json が無い（npm run inventory で作る）')];
  const items = [];
  const s = inventory.summary;
  items.push(cond('小の条件1: 対象に既存のカスタマイズがある', s.items >= 1, `${s.items}件`, 'inventory のカスタマイズが0件（新規の構築は大の経路）'));
  const bad = [];
  for (const f of plan.files.filter((x) => x.op === 'new')) {
    const feature = featureOfPath(f.path);
    if (!feature) continue; // 機能に属さないファイル（README など）は機能種別を足さない
    const have = (s.by_feature?.[feature] ?? 0) + (s.unclassified_by_hint?.[feature] ?? 0);
    if (have === 0) bad.push(`${f.path}（${feature}）`);
  }
  items.push(cond('小の条件2: 新しい機能種別を足さない', bad.length === 0, '足していない（機能別の件数に分類外のヒントの件数を足して判定）',
    `inventory で0件の機能のファイルを足している: ${bad.join('・')}`));
  const struct = plan.files.filter((f) => {
    if (f.op !== 'new' && f.op !== 'delete') return false;
    return skillPathRole(f.path) === 'definition' || (featureOfPath(f.path) === 'subagents' && f.path.endsWith('.md')) || isPluginManifest(f.path);
  });
  items.push(cond('小の条件3: 構成を変えない（Skill・Subagent・Plugin の新設・廃止）', struct.length === 0, '新設・廃止なし（統合・責務の付け替えは G1 で人間が確かめる）',
    `新設・廃止がある（大の経路）: ${struct.map((f) => `${f.op} ${f.path}`).join('・')}`));
  return items;
}

/** `impact` の該当に change-plan の「参照元の扱い」が漏れなく答えているか。 */
function impactItems(plan, impact) {
  if (!impact) return [ng('impact', 'work/<ts>/impact.json が無い（npm run impact で作る。無いまま計画を通さない）')];
  const items = [];
  const planPaths = new Set(plan.files.map((f) => f.path));
  const inPaths = new Set(impact.input?.files ?? []);
  const inTerms = new Set(impact.input?.terms ?? []);
  const planTerms = new Set(plan.terms);
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  items.push(cond('impact の入力が change-plan と同じ（ファイル）', same(inPaths, planPaths), `${planPaths.size}件`,
    `impact を実行したときのファイル集合が change-plan と違う（古い impact への回答を通さない。再実行する）: 差 ${[...inPaths].filter((x) => !planPaths.has(x)).concat([...planPaths].filter((x) => !inPaths.has(x))).join('・')}`));
  items.push(cond('impact の入力が change-plan と同じ（語）', same(inTerms, planTerms), `${planTerms.size}件`,
    `impact の語と「## 影響の語」が違う: ${[...inTerms].filter((x) => !planTerms.has(x)).concat([...planTerms].filter((x) => !inTerms.has(x))).join('・')}`));

  // 削除するファイルの中の該当は、ファイルごと消えるので答えを求めない。
  const deleted = new Set(plan.files.filter((f) => f.op === 'delete').map((f) => f.path));
  const hits = (impact.hits ?? []).filter((h) => !(h.scope === 'changed' && deleted.has(h.path)));
  items.push(cond('参照元の扱いの書式', plan.malformedAnswers.length === 0, `${plan.answers.length}行`,
    `書式に合わない行（<path>:<line>:<term> か <path> のあとに「: 変える」か「: 変えない（理由）」）: ${plan.malformedAnswers.map((m) => `L${m.line}`).join('・')}`));
  const long = plan.answers.filter((a) => a.bytes > LIMITS.answerLine);
  items.push(cond('サイズ: 参照元の扱い 1件', long.length === 0, `上限 ${LIMITS.answerLine} バイト`,
    `${LIMITS.answerLine} バイト超: ${long.map((a) => `L${a.line}=${a.bytes}`).join('・')}`));
  const noReason = plan.answers.filter((a) => a.verdict === '変えない' && !a.reason);
  items.push(cond('「変えない」に理由がある', noReason.length === 0, '', `理由が無い: ${noReason.map((a) => a.key).join('・')}`));
  const notPlanned = plan.answers.filter((a) => a.verdict === '変える' && !planPaths.has(a.path));
  items.push(cond('「変える」のファイルが「## ファイル」にある', notPlanned.length === 0, '', `ファイルの一覧に無い: ${notPlanned.map((a) => a.path).join('・')}`));

  const hitIds = new Set(hits.map((h) => h.id));
  const hitPaths = new Set(hits.map((h) => h.path));
  // 変えるファイルの中の該当は、ファイル単位の「変える」では覆わない（builder が直す行を1件ずつ示す）。
  const covers = (a, h) => a.key === h.id || (a.kind === 'file' && a.path === h.path && (h.scope !== 'changed' || a.verdict === '変えない'));
  const unanswered = hits.filter((h) => !plan.answers.some((a) => covers(a, h)));
  const files = [...new Set(unanswered.map((h) => h.path))];
  items.push(cond(`impact の該当 ${hits.length}件 すべてに回答がある`, unanswered.length === 0,
    `${hits.length}件（${hitPaths.size}ファイル）`,
    `未回答 ${unanswered.length}件（${files.length}ファイル）: ${files.slice(0, 5).join('・')}${files.length > 5 ? '…' : ''}（件数が多い語は <path>: 変える|変えない（理由） とファイル単位で答える。変えるファイルの中の「変える」は1件ずつ）`));
  const stale = plan.answers.filter((a) => (a.kind === 'hit' ? !hitIds.has(a.key) : !hitPaths.has(a.path)));
  items.push(cond('回答が impact の該当を指している', stale.length === 0, '', `impact に無い回答（古い・綴りの誤り）: ${stale.map((a) => a.key).join('・')}`));
  return items;
}

export function checkChangePlan(text, { requirements = null, route = null, inventory = null, impact = null } = {}) {
  let plan;
  try {
    plan = parseChangePlan(text);
  } catch (e) {
    if (!(e instanceof ChangePlanError)) throw e;
    return [ng('change-plan.md の構文', e.message)];
  }
  const items = [];
  items.push(cond('route', ROUTES.includes(route), route ?? '', `handoff.md の frontmatter の route が small か large でない（${route ?? '未記入'}）`));
  items.push(ok('ファイルの件数', `${plan.files.length}件（${tally(plan.files.map((f) => f.op))}）`));
  const bad = plan.files.filter((f) => !f.path || !OPS.includes(f.op) || f.reqs.length === 0 || !f.instruct);
  items.push(cond('ファイルの必須欄（path・op・reqs・instruct）', bad.length === 0, '全件そろっている',
    `欠ける・op が語彙外（${OPS.join('・')}）: ${bad.map((f) => f.path ?? `L${f.line}`).join('・')}`));
  const paths = plan.files.map((f) => f.path);
  const dup = paths.filter((v, i) => v && paths.indexOf(v) !== i);
  items.push(cond('path の一意', dup.length === 0, '重複なし', `重複: ${[...new Set(dup)].join('・')}`));

  // 要件との対応
  if (requirements === null) {
    items.push(ng('要件との対応', 'work/<ts>/requirements.md が無い'));
  } else {
    try {
      const doc = parseRequirementsDoc(requirements);
      const ids = new Set(doc.requirements.map((r) => r.id));
      const used = new Set(plan.files.flatMap((f) => f.reqs));
      const unknown = [...used].filter((id) => !ids.has(id));
      items.push(cond('reqs が確定要件の id を指している', unknown.length === 0, '', `確定要件に無い id: ${unknown.join('・')}`));
      const uncovered = [...ids].filter((id) => !used.has(id));
      items.push(cond('確定要件がすべて計画に現れる', uncovered.length === 0, `${ids.size}件`, `どのファイルの reqs にも無い要件: ${uncovered.join('・')}`));
    } catch (e) {
      if (!(e instanceof RequirementsError)) throw e;
      items.push(ng('要件との対応', `requirements.md を読めない: ${e.message}`));
    }
  }

  items.push(cond('検証コマンド', plan.verifyCommands.length > 0, plan.verifyCommands.join(' ; '),
    '「## 検証コマンド」にバッククォートで囲んだコマンドが無い（worktree で実行する対象の検証。無ければ「なし」でなく理由を書く節を足す）'));

  // サイズの上限
  const big = plan.files.filter((f) => f.bytes > LIMITS.changeFile);
  items.push(cond('サイズ: ファイル1件の変更指示', big.length === 0, `上限 ${kb(LIMITS.changeFile)}`,
    `上限 ${kb(LIMITS.changeFile)} 超: ${big.map((f) => `${f.path}=${f.bytes}バイト`).join('・')}（新しい本文は builder が書く。計画には何を・なぜだけ）`));
  if (ROUTES.includes(route)) {
    const total = LIMITS.planTotal[route];
    items.push(cond('サイズ: change-plan 全体', plan.bytes <= total, `${kb(plan.bytes)}（上限 ${kb(total)}）`, `${kb(plan.bytes)} で上限 ${kb(total)} 超`));
  }
  if (route === 'large') {
    for (const [name, limit] of [['機能と責務', LIMITS.features], ['モデル割当', LIMITS.models]]) {
      const n = plan.sections[name];
      items.push(cond(`## ${name}（大の経路）`, n !== null && n <= limit, `${n} バイト（上限 ${kb(limit)}）`,
        n === null ? '節が無い' : `${n} バイトで上限 ${kb(limit)} 超`));
    }
  }

  if (route === 'small') items.push(...smallRouteItems(plan, inventory));
  items.push(...impactItems(plan, impact));
  return items;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

/** 対象ごとの入力ファイルを読んで点検する。入力が無ければ NG 1件を返す。 */
export function runCheck(root, ts, target, { now = new Date() } = {}) {
  const work = path.join(root, 'work', ts);
  const req = readOrNull(path.join(work, 'requirements.md'));
  if (target === 'requirements') return req === null ? [ng('入力', `work/${ts}/requirements.md が無い`)] : checkRequirements(req, now);
  const plan = readOrNull(path.join(work, 'change-plan.md'));
  if (plan === null) return [ng('入力', `work/${ts}/change-plan.md が無い`)];
  const hp = readOrNull(path.join(work, 'handoff.md'));
  return checkChangePlan(plan, {
    requirements: req,
    route: hp ? parseHandoff(hp)?.route ?? null : null,
    inventory: readJson(path.join(work, 'inventory.json')),
    impact: readJson(path.join(work, 'impact.json')),
  });
}

export function formatItems(items) {
  return items.map((i) => `${i.ok ? 'OK' : 'NG'}  ${i.name}${i.detail ? `: ${i.detail}` : ''}`).join('\n');
}

if (isMainModule(import.meta.url)) {
  const [ts, target, ...rest] = process.argv.slice(2);
  if (!isValidTs(ts) || !TARGETS.includes(target) || rest.length) {
    process.stderr.write(`使い方: npm run check -- <ts> ${TARGETS.join('|')}\n`);
    process.exit(2);
  }
  const items = runCheck(CANON_ROOT, ts, target);
  process.stdout.write(`${formatItems(items)}\n`);
  const bad = items.filter((i) => !i.ok).length;
  process.stdout.write(bad ? `点検: NG ${bad}件\n` : '点検: すべて OK\n');
  process.exit(bad ? 1 : 0);
}
