/**
 * lib/verify/run.js — verify v3 の検査 9 本の実行と report（`tools/verify.js` の本体）。
 *
 *   V1 配置パス  V2 frontmatter  V3 ツール名  V4 secret と展開  V5 書式片  V6 参照整合
 *   V7 計画との一致  V8 constraints  V9 trust の前提（警告）
 *
 * - 対象は変えたファイル（`git diff --name-only <base>..HEAD`）だけ。V1〜V4 は種別がスキーマを持つ .md に当てる。
 * - **検査対象ゼロは違反**: 差分が空のとき、全検査を違反にする。change-plan が読めないときは V7 を違反にする。
 * - **error・warning・未判定**: warning と未判定は exit code に影響しないが、report に必ず載せる。
 * - 想定外の例外は、その検査の違反にして続行する（例外終了すると report が書かれず、違反と検査の故障を区別できない）。
 */

import path from 'node:path';
import { isNonSchemaRel } from '../non-schema.js';
import { checkV1 } from './paths.js';
import { checkV2 } from './frontmatter.js';
import { checkV3 } from './tool-names.js';
import { checkV4, checkMcpJsonText } from './security.js';
import { checkV5 } from './fragments.js';
import { checkV6 } from './ref-integrity.js';
import { checkV8, toSnapshot, CAPABILITY_DETECTORS } from './constraints.js';
import { splitBySeverity } from './format.js';

export const CHECKS = [
  ['V1', '配置パス'],
  ['V2', 'frontmatter'],
  ['V3', 'ツール名'],
  ['V4', 'secret と展開'],
  ['V5', '書式片'],
  ['V6', '参照整合'],
  ['V7', '計画との一致'],
  ['V8', 'constraints'],
  ['V9', 'trust の前提'],
];

/** スキーマ（frontmatter）を持つ種別。これだけが V1〜V4 の per-file 検査の対象。 */
const SCHEMA_KINDS = new Set(['agent', 'skill', 'rule', 'output-style']);

function emptyResult() {
  return { violations: [], warnings: [], undetermined: [], checked: 0, na: null };
}

/** V1〜V4: ファイルごとに振り分けて当てる。 */
function runPerFile(ctx, results) {
  const add = (id, objs) => {
    const { violations, warnings, undetermined } = splitBySeverity(objs);
    results[id].violations.push(...violations);
    results[id].warnings.push(...warnings);
    results[id].undetermined.push(...undetermined);
    results[id].checked++;
  };
  let mcpJson = 0;
  for (const f of ctx.files) {
    if (path.posix.basename(f.rel) === '.mcp.json') {
      add('V4', checkMcpJsonText(f.text, f.rel));
      mcpJson++;
      continue;
    }
    if (!f.artifact || isNonSchemaRel(f.rel)) continue; // CLAUDE.md・AGENTS.md・README・hooks・supporting files
    if (!SCHEMA_KINDS.has(f.artifact.kind)) {
      // 種別を判定できない .md を黙って飛ばすと vacuous pass になる（配置の誤り）。
      results.V1.violations.push(
        `V1 ${f.rel}: 種別（agent・skill・rule・output-style）を判定できず、既知の非スキーマファイルでもない。配置が誤っている可能性。`
      );
      results.V1.checked++;
      continue;
    }
    add('V1', checkV1(f.artifact));
    add('V2', checkV2(f.artifact));
    add('V3', checkV3(f.artifact));
    add('V4', checkV4(f.artifact));
  }
  const noSchema = 'スキーマを持つファイル（agent・skill・rule・output-style）が差分に無い';
  for (const id of ['V1', 'V2', 'V3']) if (results[id].checked === 0) results[id].na = noSchema;
  if (results.V4.checked === 0 && mcpJson === 0) results.V4.na = `${noSchema}。.mcp.json も無い`;
}

const EXPECTED_STATUS = { modify: 'M', new: 'A', delete: 'D' };

/** V7: 差分のファイル集合が change-plan のファイル集合と同じで、op が差分の種類と合っている。 */
export function checkV7(ctx) {
  const fail = (m) => ({ violations: [`V7: ${m}`], warnings: [], checked: 0 });
  if (ctx.changePlanText === null) return fail('work/<ts>/change-plan.md が無い。計画が無いことを「計画どおり」と読まない。');
  if (!ctx.changePlan) return fail(`change-plan.md を読めない（${ctx.changePlanError}）。`);
  const actual = new Map([...ctx.files.map((f) => [f.rel, f.status]), ...ctx.deleted.map((r) => [r, 'D'])]);
  const planned = new Map(ctx.changePlan.files.map((f) => [f.path, f.op]));
  const violations = [];
  for (const [rel, status] of actual) {
    if (!planned.has(rel)) violations.push(`V7: 差分の ${rel}（${status}）が change-plan のファイルに無い。`);
  }
  for (const [rel, op] of planned) {
    if (!actual.has(rel)) {
      violations.push(`V7: change-plan の ${rel}（${op}）が差分に無い。`);
      continue;
    }
    const want = EXPECTED_STATUS[op];
    if (want && actual.get(rel) !== want) {
      violations.push(`V7: ${rel} は change-plan で ${op} だが、差分では ${actual.get(rel)}（A=追加・M=変更・D=削除）。`);
    }
  }
  return { violations, warnings: [], checked: actual.size + planned.size };
}

/** V9: hooks か permissions が差分に含まれるとき、対象のワークスペースの trust が前提になることを警告する。 */
export function checkV9(ctx) {
  const snap = toSnapshot(ctx);
  const reasons = [];
  for (const h of CAPABILITY_DETECTORS.hooks(snap)) reasons.push(`hooks（${h.file}: ${h.evidence}）`);
  for (const f of snap) {
    if (!f.json) continue;
    const keys = Object.keys(f.json);
    if (keys.includes('permissions')) reasons.push(`permissions（${f.rel}: JSON の "permissions"）`);
  }
  const warnings = [];
  if (reasons.length > 0) {
    warnings.push(
      'V9: 差分に hooks か permissions が含まれる。これらは、対象のワークスペースの trust を承認しないと効かない' +
        `（マージ後に対象のリポジトリで trust の確認を通す）。該当: ${reasons.join('・')}`
    );
  }
  return { violations: [], warnings, checked: snap.length };
}

/** V1〜V9 を実行する。 */
export function runChecks(ctx) {
  const results = Object.fromEntries(CHECKS.map(([id]) => [id, emptyResult()]));
  if (ctx.files.length + ctx.deleted.length === 0) {
    for (const [id] of CHECKS) results[id].violations.push(`${id}: 差分が空（検査対象ゼロを合格にしない）。`);
    return results;
  }
  const crashed = (id, err) => `${id}: 検査が例外で中断した（${err?.message ?? err}）。入力の形を確かめること。`;
  try {
    runPerFile(ctx, results);
  } catch (err) {
    for (const id of ['V1', 'V2', 'V3', 'V4']) results[id].violations.push(crashed(id, err));
  }
  for (const [id, fn] of [['V5', checkV5], ['V6', checkV6], ['V7', checkV7], ['V8', checkV8], ['V9', checkV9]]) {
    try {
      Object.assign(results[id], emptyResult(), fn(ctx));
    } catch (err) {
      results[id].violations.push(crashed(id, err));
    }
  }
  if (ctx.files.length === 0) {
    // 削除だけの差分: 本文を持つファイルが無いので、per-file の検査は対象なしになる（V7・V6 は削除を見る）。
    for (const id of ['V5', 'V8', 'V9']) if (results[id].checked === 0 && !results[id].na) results[id].na = '本文を持つ変更ファイルが無い（削除だけの差分）';
  }
  return results;
}

function statusOf(r) {
  if (r.violations.length > 0) return '違反';
  if (r.na) return '対象なし';
  if (r.undetermined.length > 0) return 'pass（未判定あり）';
  return 'pass';
}

export function summaryLine(results) {
  return CHECKS.map(([id]) => `${id}:${statusOf(results[id])}`).join(' ');
}

/**
 * report の本文。`state` は検査した worktree の状態（head・base・branch・dirty）。
 * 未コミットの変更があるときは、検査も承認も漏れるので不合格にする。
 */
export function renderReport({ ts, results, state, at }) {
  const pre = [];
  if (state.dirty.length > 0) pre.push(`worktree に未コミットの変更が ${state.dirty.length} 件ある（コミットしてから検査する。ゲートは sha に束縛するので、未コミットの変更は検査と承認の両方から漏れる）`);
  const total = CHECKS.reduce((n, [id]) => n + results[id].violations.length, 0) + pre.length;
  const warns = CHECKS.reduce((n, [id]) => n + results[id].warnings.length, 0);
  const undetermined = CHECKS.reduce((n, [id]) => n + results[id].undetermined.length, 0);
  const lines = [
    `# verify-report（${ts}）`,
    '',
    `- 実行時刻: ${at}`,
    `- 検査した HEAD: ${state.head}`,
    `- base: ${state.base}`,
    `- branch: ${state.branch}`,
    `- 差分: ${state.changedCount} ファイル`,
    `- 結果: ${total === 0 ? '合格' : '不合格'}（違反 ${total} 件・warning ${warns} 件・未判定 ${undetermined} 件）`,
    '',
    '| 検査 | 結果 | 違反 | warning | 未判定 |',
    '|---|---|---|---|---|',
    ...CHECKS.map(([id, name]) => {
      const r = results[id];
      return `| ${id} ${name} | ${statusOf(r)} | ${r.violations.length} | ${r.warnings.length} | ${r.undetermined.length} |`;
    }),
  ];
  if (pre.length > 0) lines.push('', '## 前提', '', ...pre.map((p) => `- 違反: ${p}`));
  for (const [id, name] of CHECKS) {
    const r = results[id];
    lines.push('', `## ${id} ${name}`, '');
    if (r.na && r.violations.length === 0) lines.push(`対象なし: ${r.na}`);
    else if (r.violations.length === 0) lines.push(`pass（検査した対象 ${r.checked} 件）`);
    for (const v of r.violations) lines.push(`- 違反: ${v}`);
    for (const w of r.warnings) lines.push(`- warning: ${w}`);
    for (const u of r.undetermined) lines.push(`- 未判定: ${u}`);
  }
  return { body: lines.join('\n') + '\n', total, warns, undetermined };
}

/** report から、検査した HEAD の sha と結果を読む（approvals が差分のゲートの前提に使う）。 */
export function parseVerifyReport(text) {
  const head = /^- 検査した HEAD: ([0-9a-f]{7,40})\s*$/m.exec(text)?.[1] ?? null;
  const result = /^- 結果: (合格|不合格)/m.exec(text)?.[1] ?? null;
  return { head, passed: result === '合格' };
}
