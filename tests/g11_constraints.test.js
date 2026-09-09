/**
 * G11 制約遵守（stage=generation・§11.2「G11 実装契約」）の回帰テスト。
 *
 * 方針（L002）: 「違反0件で通った」を成功の証拠にしない。**故意の違反注入**で検出器が
 * 生きていることを示す。特に「代表例1経路だけ塞いで他が素通り」を防ぐため、同一能力の
 * **別経路**（settings.json 以外の hooks・AGENT_TEAMS 以外の experimental 環境変数）を
 * 個別に注入して検出を確認する（L005）。
 *
 * vacuous pass（§11.5）: requirements.md 不在・constraints 不在・キー0件・allowed 非真偽値・
 * generated 空を「制約なし＝合格」と読まないことを固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo } from './helpers/fixtures.js';
import { tsSeq } from './helpers/ts.js';
import { checkG11 } from '../gates/g11_constraints.js';
import { checkG1 } from '../gates/g1_stage_order.js';
import { parseRequirementsDoc } from '../gates/lib/requirements.js';

const nextTs = tsSeq(import.meta.url);

/** requirements.md を書き換えるヘルパ（fixture 本体は触らない。実 work/<ts> のコピーを編集する）。 */
function patchRequirements(c, replacer) {
  writeFileSync(c.req, replacer(readFileSync(c.req, 'utf8')));
}

function write(c, rel, text) {
  const abs = path.join(c.gen, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  return abs;
}

// ---------------------------------------------------------------------------
// 基準線（fixture そのままは通る）
// ---------------------------------------------------------------------------

test('G11: 制約強め fixture（hooks/mcp/plugins/experimental 全禁止）は違反0で通過する', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
  // 「0件で通った」だけを根拠にしない: 4能力すべてを実際に照合したことを確認する。
  assert.deepEqual(r.prohibited.sort(), ['experimental', 'hooks', 'mcp', 'plugins']);
  assert.ok(r.scanned >= 4, `生成物を実際に走査していること（scanned=${r.scanned}）`);
  assert.ok(
    r.notes.some((n) => n.includes('organization_policy')),
    '自由文制約は「機械判定していない」ことを明示する（黙って無いことにしない）'
  );
});

// ---------------------------------------------------------------------------
// A4（実昇格準備2）: allowed:false の絶対不在解釈と「既存維持・新規追加なし」の書き分け
// ---------------------------------------------------------------------------

test('A4 G11: hooks allowed:true + reason「既存維持・新規追加なし」× 既存 hooks 実体 → 通過', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) =>
    text
      .replace(
        'hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }',
        'hooks:        { allowed: true, reason: "既存維持・新規追加なし" }'
      )
      // hooks が許可されたので fixture の conflicts（R1×hooks禁止・deterministic の縮退記録）は
      // 前提を失う。本テストは hooks 検出器の allowed:true 分岐のみを見るため、無関係化した
      // conflicts の整合違反（(2)）を避けて節ごと除去する（登録漏れ検査(1)も hooks が
      // 非禁止になった時点で R1 を対象外にするため、除去しても vacuous にはならない）。
      .replace(/## 制約と要件の衝突[\s\S]*$/, '')
  );
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
});

test('A4 G11: 同じ生成物で hooks allowed:false のままなら違反（対比・requirement-elicitation SKILL.md の書き分けが実ゲートと一致する根拠）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('hooks 宣言')));
});

// ---------------------------------------------------------------------------
// hooks: 同一能力の複数経路（L005）
// ---------------------------------------------------------------------------

test('G11: hooks 禁止 × generated の settings.json に hook（経路①）を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('hooks 宣言')));
  assert.ok(
    r.violations.some((v) => v.includes('PostToolUse')),
    'イベント名は正典 hooks.json の全集合と照合して具体的に指摘する'
  );
});

test('G11: hooks 禁止 × plugin 同梱 hooks（settings.json 以外の経路③）を検出', (t) => {
  // L005 の核心: 「hooks 禁止」を settings.json だけで見る実装はこのケースを素通りさせる。
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(c, 'plugin/hooks/on-write.js', '// hook script\n');
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.includes('plugin/hooks/on-write.js') && v.includes('hooks')),
    '実体配置の経路で検出されること'
  );
});

test('G11: hooks 禁止 × plugin.json 内の hooks 宣言（経路①の別ファイル）を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(c, 'plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'p', hooks: './hooks/hooks.json' }));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('plugin.json') && v.includes('hooks 宣言')));
});

// ---------------------------------------------------------------------------
// experimental
// ---------------------------------------------------------------------------

test('G11: experimental 禁止 × frontmatter context: fork を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(
    c,
    '.claude/skills/forked/SKILL.md',
    '---\nname: forked\ndescription: x\ncontext: fork\n---\n本文\n'
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('context: fork')));
});

test('G11: experimental 禁止 × AGENT_TEAMS 以外の CLAUDE_CODE_EXPERIMENTAL_* を検出（接頭辞導出）', (t) => {
  // G6 は AGENT_TEAMS の1変数しか見ない。G11 は接頭辞で導出するため未知の実験フラグも捕まえる。
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(
    c,
    '.claude/rules/flags.md',
    '---\npaths: src/**/*.js\n---\n環境変数 CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW=1 を設定して使う。\n'
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW')));
});

test('G11: experimental 禁止 × design-map の Experimental Dependencies 箇条書き宣言を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(
      /## Experimental Dependencies\n[^\n]*/,
      '## Experimental Dependencies\n- context:fork に依存（fork-runner の後継）'
    )
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('Experimental Dependencies')));
});

test('G11: 「なし」と書かれた Experimental Dependencies 節を違反にしない（偽陽性の封鎖）', (t) => {
  // 機能名を並べた否定の散文（「context:fork / Agent Teams とも不使用」）で落ちてはならない。
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// mcp / plugins
// ---------------------------------------------------------------------------

test('G11: mcp 禁止 × .mcp.json の実在を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(c, '.mcp.json', JSON.stringify({ mcpServers: { fs: { command: 'npx', args: [] } } }));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('.mcp.json')));
  assert.ok(r.violations.some((v) => v.includes('mcpServers')));
});

test('G11: mcp 禁止 × frontmatter tools の mcp__ ツール名を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(
    c,
    '.claude/agents/fetcher/fetcher.md',
    '---\nname: fetcher\ndescription: 外部から取得する。Delegate when 取得が要るとき。\ntools: Read mcp__github__list_issues\n---\n本文\n'
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('mcp__')));
});

test('G11: plugins 禁止 × plugin/ 配下の生成物を検出（管理パス集合の L5 パターン）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  write(c, 'plugin/skills/packaged/SKILL.md', '---\nname: packaged\ndescription: x\n---\n本文\n');
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('L5 plugin 配布物')));
});

// ---------------------------------------------------------------------------
// 未知キー（ユーザー裁定: 検査不能は違反）
// ---------------------------------------------------------------------------

test('G11: 未知の constraints キーが allowed:false なら「検査不能」で違反', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) =>
    text.replace('  organization_policy:', '  agent_teams:  { allowed: false, reason: "禁止" }\n  organization_policy:')
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.includes('agent_teams') && v.includes('検出器')),
    '検出器不在を明示してブロックすること'
  );
});

test('G11: 未知キーでも allowed:true なら違反にしない（禁止していない制約は検査不要）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) =>
    text.replace('  organization_policy:', '  agent_teams:  { allowed: true }\n  organization_policy:')
  );
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// 縮退設計（conflicts の登録漏れ＋整合）
// ---------------------------------------------------------------------------

test('G11: deterministic 要件 × hooks 禁止 で conflicts 未登録なら違反（縮退の記録漏れ）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace(/conflicts:[\s\S]*$/, 'conflicts:\n  (なし)\n'));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('R1') && v.includes('conflicts')));
});

test('G11: conflicts ブロック自体が無い場合も登録漏れとして違反', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace(/## 制約と要件の衝突[\s\S]*$/, ''));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('R1')));
});

// conflicts の【整合】検査は G11（generation）から G1（requirements）へ移設した（S2-1）。
// ライブ run 20260909_003820 で、生成物には一切問題が無いのに生成完了後の gen-guard が
// 承認済みの requirements.md を落とし、承認済み成果物を後から書き換える羽目になったため。
// 判定ロジックは gates/lib/requirements.js の checkConflictsIntegrity が SSoT。
test('G1(移設): 実在しない要件 id を指す conflicts を虚偽として検出（記録直後＝承認前に落ちる）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace('- requirement: R1（deterministic 希望）', '- requirement: R9（存在しない）'));
  const r = checkG1({ ts: c.ts, stage: 'requirements' });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.message.includes('実在 id を指していない')));
});

test('G1(移設): 禁止されていない制約との「衝突」を主張する conflicts を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) =>
    text
      .replace('hooks:        { allowed: false', 'hooks:        { allowed: true')
      .replace('constraint: hooks 禁止', 'constraint: hooks 禁止（実際は許可）')
  );
  const r = checkG1({ ts: c.ts, stage: 'requirements' });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.message.includes('衝突が成立しない')));
});

test('G11(移設後の非回帰): 整合違反だけの requirements で generation はブロックされない', (t) => {
  // 移設の眼目は「生成物に問題が無いのに generation が止まる」ことの解消。
  // 登録漏れ検査(1)は G11 に残るので、そちらが引き続き効くことは上の2テストが担保する。
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace('- requirement: R1（deterministic 希望）', '- requirement: R9（存在しない）'));
  const r = checkG11({ ts: c.ts });
  assert.ok(
    !r.violations.some((v) => v.includes('実在 id を指していない')),
    'requirements の書式問題を generation で落としてはならない'
  );
});

// ---------------------------------------------------------------------------
// vacuous pass 封鎖（§11.5）
// ---------------------------------------------------------------------------

test('G11: requirements.md 不在を「制約なし＝合格」と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  rmSync(c.req);
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('requirements.md')));
});

test('G11: constraints ブロック不在を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace(/## 使用可能なカスタマイズ機能[\s\S]*?\n\n/, '\n'));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('constraints')));
});

test('G11: constraints キー0件を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace(/constraints:\n(?:.+\n)+/, 'constraints:\n\n'));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('1件も無い')));
});

test('G11: allowed が真偽値でない制約を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace('hooks:        { allowed: false', 'hooks:        { allowed: "no"'));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('真偽値でない')));
});

test('G11: generated/ が空なら「検査対象ゼロ＝合格」と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  rmSync(c.gen, { recursive: true, force: true });
  mkdirSync(c.gen, { recursive: true });
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('空')));
});

test('G11: allowed を持たない未知キーは機械判定不能として違反（黙って通さない）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs(), { approvals: ['spec', 'design'] });
  patchRequirements(c, (text) => text.replace('  organization_policy:', '  audit_rule: "自由文"\n  organization_policy:'));
  const r = checkG11({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('audit_rule')));
});

// ---------------------------------------------------------------------------
// パーサ単体（gates/lib/requirements.js）
// ---------------------------------------------------------------------------

test('requirements パーサ: インライン形の constraints と conflicts を読む', () => {
  const doc = parseRequirementsDoc(
    readFileSync(path.join('fixtures', 'sample-repos', 'constrained', 'expected-work', 'requirements.md'), 'utf8')
  );
  assert.equal(doc.requirements.length, 2);
  assert.equal(doc.requirements[0].strength_needed, 'deterministic');
  assert.equal(doc.constraintsFound, true);
  assert.equal(doc.constraints.length, 5);
  const hooks = doc.constraints.find((c) => c.key === 'hooks');
  assert.equal(hooks.allowed, false);
  assert.match(hooks.reason, /組織ポリシー/);
  const org = doc.constraints.find((c) => c.key === 'organization_policy');
  assert.equal(org.freeform, true);
  assert.equal(doc.conflicts.length, 1);
  assert.match(doc.conflicts[0].requirement, /R1/);
});

test('requirements パーサ: 複数行形の constraints も読む（書式の揺れで沈黙しない）', () => {
  const doc = parseRequirementsDoc(
    [
      '## 確定要件',
      '- id: R1',
      '  strength_needed: advisory',
      '  priority: must',
      '',
      '## 使用可能なカスタマイズ機能',
      'constraints:',
      '  hooks:',
      '    allowed: false',
      '    reason: "禁止"',
      '  mcp:',
      '    allowed: true',
      '',
    ].join('\n')
  );
  assert.equal(doc.constraints.length, 2);
  assert.equal(doc.constraints[0].allowed, false);
  assert.equal(doc.constraints[1].allowed, true);
  assert.equal(doc.conflicts, null, 'conflicts ブロック不在は null（空リストと区別する）');
});

test('requirements パーサ: 要件0件・確定要件節なしは throw（0件を黙って通さない）', () => {
  assert.throws(() => parseRequirementsDoc('# 何もない\n'), /確定要件/);
  assert.throws(() => parseRequirementsDoc('## 確定要件\n\n（なし）\n'), /1件もレコードが無い/);
});
