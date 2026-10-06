/**
 * V9 constraints（artifacts.md §8.2）の回帰テスト。verify.js の buildContext を通して当てる。
 *
 * 方針: 「違反0件で通った」を成功の証拠にしない。**故意の違反注入**で検出器が生きていることを
 * 示す。特に「代表例1経路だけ塞いで他が素通り」を防ぐため、同一能力の**別経路**（settings.json
 * 以外の hooks・AGENT_TEAMS 以外の experimental 環境変数）を個別に注入して検出を確認する。
 *
 * vacuous pass: requirements.md 不在・constraints 不在・キー0件・allowed 非真偽値・generated 空を
 * 「制約なし＝合格」と読まないことを固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo } from './helpers/fixtures.js';
import { SAMPLE_REPOS } from './helpers/sample-repos.js';
import { tsSeq } from './helpers/ts.js';
import { checkV9 } from '../.claude/skills/canon-c/scripts/verify/v9-constraints.js';
import { buildContext, runChecks } from '../.claude/skills/canon-c/scripts/verify.js';
import { parseRequirementsDoc } from '../lib/requirements.js';

const nextTs = tsSeq(import.meta.url);

function v9(ts) {
  const r = checkV9(buildContext(ts));
  return { ...r, ok: r.violations.length === 0 };
}

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

test('V9: 制約強め fixture（hooks/mcp/plugins/experimental 全禁止）は違反0で通過する', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const r = v9(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
  // 「0件で通った」だけを根拠にしない: 4能力すべてを実際に照合したことを確認する。
  assert.deepEqual(r.prohibited.sort(), ['experimental', 'hooks', 'mcp', 'plugins']);
  assert.equal(r.checked, 5, 'constraints の5キーを走査したこと');
  assert.ok(
    r.warnings.some((n) => n.includes('organization_policy')),
    '自由文制約は「機械判定していない」ことを明示する（黙って無いことにしない）'
  );
});

// ---------------------------------------------------------------------------
// allowed:false の絶対不在解釈と「既存維持・新規追加なし」の書き分け
// ---------------------------------------------------------------------------

test('V9: hooks allowed:true + reason「既存維持・新規追加なし」× 既存 hooks 実体 → 通過', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) =>
    text
      .replace(
        'hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }',
        'hooks:        { allowed: true, reason: "既存維持・新規追加なし" }'
      )
      // hooks が許可されたので fixture の conflicts（R1×hooks禁止・deterministic の縮退記録）は
      // 前提を失う。本テストは hooks 検出器の allowed:true 分岐のみを見るため、無関係になった
      // conflicts の整合違反を避けて空にする（`conflicts: []`。ブロック自体を消すと別の違反になる）。
      // 登録漏れ検査も hooks が非禁止になった時点で R1 を対象外にするため、空でも vacuous にはならない。
      .replace(/conflicts:[\s\S]*$/, 'conflicts: []\n')
  );
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = v9(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations, null, 2));
});

test('V9: 同じ生成物で hooks allowed:false のままなら違反（対比・既存維持の書き分けが実検査と一致する根拠）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('hooks 宣言')));
});

// ---------------------------------------------------------------------------
// hooks: 同一能力の複数経路
// ---------------------------------------------------------------------------

test('V9: hooks 禁止 × generated の settings.json に hook（経路①）を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(
    c,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'x' }] }] } })
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('hooks 宣言')));
  assert.ok(
    r.violations.some((v) => v.includes('PostToolUse')),
    'イベント名は正典 hooks.json の全集合と照合して具体的に指摘する'
  );
});

test('V9: hooks 禁止 × plugin 同梱 hooks（settings.json 以外の経路③）を検出', (t) => {
  // 「hooks 禁止」を settings.json だけで見る実装はこのケースを素通りさせる。
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, 'plugin/hooks/on-write.js', '// hook script\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.includes('plugin/hooks/on-write.js') && v.includes('hooks')),
    '実体配置の経路で検出されること'
  );
});

test('V9: hooks 禁止でも、skill の supporting dir にある hooks/*.md は hook の実体とみなさない（.claude/hooks/** と plugin/hooks/** に限る）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.claude/skills/style-guide/hooks/overview.md', '# フックの説明資料\n');
  write(c, '.claude/skills/style-guide/references/hooks/notes.md', '# メモ\n');
  assert.equal(v9(c.ts).ok, true, JSON.stringify(v9(c.ts).violations));
  // 対比: 本物の置き場は従来どおり検出する（検出器が死んでいないことの確認）
  write(c, '.claude/hooks/block-rm.sh', '#!/bin/sh\nexit 0\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('.claude/hooks/block-rm.sh')), JSON.stringify(r.violations));
  assert.ok(!r.violations.some((v) => v.includes('overview.md') || v.includes('notes.md')), JSON.stringify(r.violations));
});

test('V9: hooks 禁止 × plugin.json 内の hooks 宣言（経路①の別ファイル）を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, 'plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'p', hooks: './hooks/hooks.json' }));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('plugin.json') && v.includes('hooks 宣言')));
});

// ---------------------------------------------------------------------------
// experimental
// ---------------------------------------------------------------------------

test('V9: experimental 禁止 × frontmatter context: fork を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(
    c,
    '.claude/skills/forked/SKILL.md',
    '---\nname: forked\ndescription: x\ncontext: fork\n---\n本文\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('context: fork')));
});

test('V9: experimental 禁止 × AGENT_TEAMS 以外の CLAUDE_CODE_EXPERIMENTAL_* を検出（接頭辞導出）', (t) => {
  // V4 は AGENT_TEAMS の1変数しか見ない。V9 は接頭辞で導出するため未知の実験フラグも捕まえる。
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(
    c,
    '.claude/rules/flags.md',
    '---\npaths: src/**/*.js\n---\n環境変数 CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW=1 を設定して使う。\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW')));
});

test('V9: experimental 禁止 × design-map の Experimental Dependencies 箇条書き宣言を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(
      /## Experimental Dependencies\n[^\n]*/,
      '## Experimental Dependencies\n- context:fork に依存（fork-runner の後継）'
    )
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('Experimental Dependencies')));
});

test('V9: プレビュー段階の組込み Skill（/design）への依存は、本文の案内では検出せず、Experimental Dependencies の宣言でだけ止める', (t) => {
  // 検出の限界を固定する（requirements-template.md・artifacts.md §8.2 V9 の experimental ④）。
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.claude/skills/screen/SKILL.md', '---\nname: screen\ndescription: 画面を設計する\n---\nユーザーに `/design` を実行してもらう。\n');
  assert.equal(v9(c.ts).ok, true, '本文の起動の案内は散文として扱い、検出しない');
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(/## Experimental Dependencies\n[^\n]*/, '## Experimental Dependencies\n- screen が組込みの /design（Claude Design）に依存')
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('Experimental Dependencies')));
});

test('V9: 「なし」と書かれた Experimental Dependencies 節を違反にしない（偽陽性の封鎖）', (t) => {
  // 機能名を並べた否定の散文（「context:fork / Agent Teams とも不使用」）で落ちてはならない。
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const r = v9(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// mcp / plugins
// ---------------------------------------------------------------------------

test('V9: mcp 禁止 × .mcp.json の実在を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.mcp.json', JSON.stringify({ mcpServers: { fs: { command: 'npx', args: [] } } }));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('.mcp.json')));
  assert.ok(r.violations.some((v) => v.includes('mcpServers')));
});

test('V9: mcp 禁止 × frontmatter tools の mcp__ ツール名を検出', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(
    c,
    '.claude/agents/fetcher/fetcher.md',
    '---\nname: fetcher\ndescription: 外部から取得する。Delegate when 取得が要るとき。\ntools: Read mcp__github__list_issues\n---\n本文\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('mcp__')));
});

test('V9: plugins 禁止 × plugin/ 配下の生成物を検出（管理パス集合の L5 パターン）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, 'plugin/skills/packaged/SKILL.md', '---\nname: packaged\ndescription: x\n---\n本文\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('L5 plugin 配布物')));
});

// ---------------------------------------------------------------------------
// 未知キー（ユーザー裁定: 検査不能は違反）
// ---------------------------------------------------------------------------

test('V9: 未知の constraints キーが allowed:false なら「検査不能」で違反', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) =>
    text.replace('  organization_policy:', '  agent_teams:  { allowed: false, reason: "禁止" }\n  organization_policy:')
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.includes('agent_teams') && v.includes('検出器')),
    '検出器不在を明示してブロックすること'
  );
});

test('V9: 未知キーでも allowed:true なら違反にしない（禁止していない制約は検査不要）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) =>
    text.replace('  organization_policy:', '  agent_teams:  { allowed: true }\n  organization_policy:')
  );
  const r = v9(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// 縮退設計（conflicts の登録漏れ＋整合）
// ---------------------------------------------------------------------------

test('V9: deterministic 要件 × hooks 禁止 で conflicts 未登録なら違反（縮退の記録漏れ）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace(/conflicts:[\s\S]*$/, 'conflicts:\n  (なし)\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('R1') && v.includes('conflicts')));
});

test('V9: conflicts ブロック自体が無い場合も登録漏れとして違反', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace(/## 制約と要件の衝突[\s\S]*$/, ''));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('R1')));
});

test('V9: conflicts ブロック自体が無いのは、登録漏れが無くても違反（「無い」と空 `conflicts: []` を区別する）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  const allowHooks = (text) =>
    text.replace(
      'hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }',
      'hooks:        { allowed: true, reason: "x" }'
    );
  patchRequirements(c, (text) => allowHooks(text).replace(/conflicts:[\s\S]*$/, 'conflicts: []\n'));
  assert.equal(v9(c.ts).ok, true, '空の `conflicts: []` は通る');
  patchRequirements(c, (text) => text.replace(/## 制約と要件の衝突[\s\S]*$/, ''));
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('conflicts ブロックが無い')), JSON.stringify(r.violations));
});

// conflicts の【整合】（artifacts.md §8.2 V9）: 無関係な conflicts を1件書けば登録漏れ検査が通る、
// という形骸化を防ぐ。
test('V9（違反注入）: conflicts が実在しない要件 id や禁止していないキーを指せば違反', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) =>
    text.replace('- requirement: R1（deterministic 希望）', '- requirement: R9（存在しない）').replace('constraint: hooks 禁止', 'constraint: channels 禁止')
  );
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('R9') && v.includes('確定要件の id')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('channels') && v.includes('禁止')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('R1') && v.includes('conflicts')), '登録漏れも併せて検出する');
});

// ---------------------------------------------------------------------------
// vacuous pass 封鎖
// ---------------------------------------------------------------------------

test('V9: requirements.md 不在を「制約なし＝合格」と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  rmSync(c.req);
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('requirements.md')));
});

test('V9: constraints ブロック不在を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace(/## 使用可能なカスタマイズ機能[\s\S]*?\n\n/, '\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('constraints')));
});

test('V9: constraints キー0件を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace(/constraints:\n(?:.+\n)+/, 'constraints:\n\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('1件も無い')));
});

test('V9: allowed が真偽値でない制約を合格と読まない', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace('hooks:        { allowed: false', 'hooks:        { allowed: "no"'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('真偽値でない')));
});

test('V9: generated/ が空なら「検査対象ゼロ＝合格」と読まない（verify が走査の時点で違反にする）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  rmSync(c.gen, { recursive: true, force: true });
  mkdirSync(c.gen, { recursive: true });
  const r = runChecks(buildContext(c.ts)).V9;
  assert.ok(r.violations.some((v) => v.includes('空')), JSON.stringify(r.violations));
});

test('V9: allowed を持たない未知キーは機械判定不能として違反（黙って通さない）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  patchRequirements(c, (text) => text.replace('  organization_policy:', '  audit_rule: "自由文"\n  organization_policy:'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('audit_rule')));
});

// ---------------------------------------------------------------------------
// パーサ単体（lib/requirements.js）
// ---------------------------------------------------------------------------

test('requirements パーサ: インライン形の constraints と conflicts を読む', () => {
  const doc = parseRequirementsDoc(SAMPLE_REPOS.constrained['expected-work/requirements.md']);
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

test('requirements パーサ: `conflicts: []` は空（[]）で、ブロックが無いとき（null）と区別する', () => {
  const base = '## 確定要件\n- id: R1\n  strength_needed: advisory\n  priority: must\n\n## 使用可能なカスタマイズ機能\nconstraints:\n  hooks: { allowed: true, reason: "x" }\n';
  assert.deepEqual(parseRequirementsDoc(base + '\n## 制約と要件の衝突\nconflicts: []\n').conflicts, []);
  assert.deepEqual(parseRequirementsDoc(base + '\nconflicts: [ ]  # 無し\n').conflicts, []);
  assert.equal(parseRequirementsDoc(base).conflicts, null);
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

// ---------------------------------------------------------------------------
// frontmatter 経路（hooks:・allowed-tools の mcp__・disallowedTools）
// ---------------------------------------------------------------------------

test('V9: frontmatter の hooks: 宣言も hooks 禁止の違反になる（agent・skill）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.claude/agents/h/h.md', '---\nname: h\ndescription: d\nhooks:\n  PreToolUse:\n    - matcher: Bash\n---\n本文\n');
  write(c, '.claude/skills/hs/SKILL.md', '---\nname: hs\ndescription: d\nhooks: {}\n---\n本文\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('agents/h/h.md') && v.includes('hooks')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('skills/hs/SKILL.md') && v.includes('hooks')), JSON.stringify(r.violations));
});

test('V9: skill の allowed-tools に mcp__ ツールがあれば mcp 禁止の違反（複数行リストも）', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.claude/skills/m1/SKILL.md', '---\nname: m1\ndescription: d\nallowed-tools: Read mcp__srv__tool\n---\n本文\n');
  write(c, '.claude/skills/m2/SKILL.md', '---\nname: m2\ndescription: d\nallowed-tools:\n  - Read\n  - mcp__srv__tool\n---\n本文\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('skills/m1/SKILL.md') && v.includes('mcp')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('skills/m2/SKILL.md') && v.includes('mcp')), JSON.stringify(r.violations));
});

test('V9: disallowedTools の mcp__ 指定も mcp の痕跡として検出する', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  write(c, '.claude/agents/d/d.md', '---\nname: d\ndescription: d\ndisallowedTools: mcp__srv__tool\n---\n本文\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('agents/d/d.md') && v.includes('mcp')), JSON.stringify(r.violations));
});
