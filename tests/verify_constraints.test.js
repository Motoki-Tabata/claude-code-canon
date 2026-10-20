/**
 * V8 constraintsの回帰テスト。verify.js の buildContext を通して当てる。
 *
 * 方針: 「違反0件で通った」を成功の証拠にしない。**故意の違反注入**で検出器が生きていることを
 * 示す。特に「代表例1経路だけ塞いで他が素通り」を防ぐため、同一能力の**別経路**（settings.json
 * 以外の hooks・AGENT_TEAMS 以外の experimental 環境変数）を個別に注入して検出を確認する。
 *
 * vacuous pass: requirements.md 不在・constraints 不在・キー0件・allowed 非真偽値を「制約なし＝合格」と
 * 読まないことを固定する（generated/ が空のときは verify_cli.test.js が全検査について見る）。
 * requirements.md のパーサ単体は requirements.test.js にある。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setupConstrainedCase, writeFile } from './helpers/fixtures.js';
import { tsSeq } from './helpers/ts.js';
import { checkV8 } from '../lib/verify/constraints.js';
import { buildContext } from './helpers/verify-ctx.js';

const nextTs = tsSeq(import.meta.url);

function v9(ts) {
  const r = checkV8(buildContext(ts));
  return { ...r, ok: r.violations.length === 0 };
}

/** requirements.md を書き換えるヘルパ（fixture 本体は触らない。実 work/<ts> のコピーを編集する）。 */
function patchRequirements(c, replacer) {
  writeFileSync(c.req, replacer(readFileSync(c.req, 'utf8')));
}

const write = (c, rel, text) => writeFile(c.gen, rel, text);

// ---------------------------------------------------------------------------
// 基準線（fixture そのままは通る）
// ---------------------------------------------------------------------------

test('V8: 制約強め fixture（hooks/mcp/plugins/experimental 全禁止）は違反0で通過する', (t) => {
  const c = setupConstrainedCase(t, nextTs());
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

test('V8: hooks allowed:true + reason「既存維持・新規追加なし」× 既存 hooks 実体 → 通過', (t) => {
  const c = setupConstrainedCase(t, nextTs());
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

// ---------------------------------------------------------------------------
// hooks: 同一能力の複数経路
// ---------------------------------------------------------------------------

// 上の allowed:true の通過と同じ生成物。allowed:false のままなら違反になることが、既存維持の書き分けの対比になる。
test('V8: hooks 禁止 × generated の settings.json に hook（経路①）を検出', (t) => {
  const c = setupConstrainedCase(t, nextTs());
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

test('V8: hooks 禁止 × plugin 同梱 hooks（settings.json 以外の経路③）を検出', (t) => {
  // 「hooks 禁止」を settings.json だけで見る実装はこのケースを素通りさせる。
  const c = setupConstrainedCase(t, nextTs());
  write(c, 'plugin/hooks/on-write.js', '// hook script\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.includes('plugin/hooks/on-write.js') && v.includes('hooks')),
    '実体配置の経路で検出されること'
  );
});

test('V8: hooks 禁止でも、skill の supporting dir にある hooks/*.md は hook の実体とみなさない（.claude/hooks/** と plugin/hooks/** に限る）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, '.claude/skills/style-guide/hooks/overview.md', '# フックの説明資料\n');
  write(c, '.claude/skills/style-guide/references/hooks/notes.md', '# メモ\n');
  assert.equal(v9(c.ts).ok, true, JSON.stringify(v9(c.ts).violations));
  // 対比: 本物の置き場は従来どおり検出する（検出器が死んでいないことの確認）
  write(c, '.claude/hooks/block-rm.sh', '#!/bin/sh\nexit 0\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('.claude/hooks/block-rm.sh')), JSON.stringify(r.violations));
  assert.ok(!r.violations.some((v) => v.includes('overview.md') || v.includes('notes.md')), JSON.stringify(r.violations));
});

test('V8: hooks 禁止 × plugin.json 内の hooks 宣言（経路①の別ファイル）を検出', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, 'plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'p', hooks: './hooks/hooks.json' }));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('plugin.json') && v.includes('hooks 宣言')));
});

// ---------------------------------------------------------------------------
// experimental
// ---------------------------------------------------------------------------

test('V8: experimental 禁止 × frontmatter context: fork を検出', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(
    c,
    '.claude/skills/forked/SKILL.md',
    '---\nname: forked\ndescription: x\ncontext: fork\n---\n本文\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('context: fork')));
});

test('V8: isolation: subagent は experimental として数えない（値が不正なだけで、V2 の担当）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(
    c,
    '.claude/agents/isolated/isolated.md',
    '---\nname: isolated\ndescription: x\ntools: Read\nisolation: subagent\n---\n本文\n'
  );
  const r = v9(c.ts);
  assert.ok(!r.violations.some((v) => v.includes('isolation')), JSON.stringify(r.violations));
});

test('V8: experimental 禁止 × AGENT_TEAMS 以外の CLAUDE_CODE_EXPERIMENTAL_* を検出（接頭辞導出）', (t) => {
  // V4 は AGENT_TEAMS の1変数しか見ない。V8 は接頭辞で導出するため未知の実験フラグも捕まえる。
  const c = setupConstrainedCase(t, nextTs());
  write(
    c,
    '.claude/rules/flags.md',
    '---\npaths: src/**/*.js\n---\n環境変数 CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW=1 を設定して使う。\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW')));
});

test('V8: mcp 禁止 × .mcp.json の実在を検出', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, '.mcp.json', JSON.stringify({ mcpServers: { fs: { command: 'npx', args: [] } } }));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('.mcp.json')));
  assert.ok(r.violations.some((v) => v.includes('mcpServers')));
});

test('V8: mcp 禁止 × frontmatter tools の mcp__ ツール名を検出', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(
    c,
    '.claude/agents/fetcher/fetcher.md',
    '---\nname: fetcher\ndescription: 外部から取得する。Delegate when 取得が要るとき。\ntools: Read mcp__github__list_issues\n---\n本文\n'
  );
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('mcp__')));
});

test('V8: plugins 禁止 × plugin/ 配下の生成物を検出（plugin パターン）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, 'plugin/skills/packaged/SKILL.md', '---\nname: packaged\ndescription: x\n---\n本文\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('plugin 配布物')));
});

// ---------------------------------------------------------------------------
// 未知キー（ユーザー裁定: 検査不能は違反）
// ---------------------------------------------------------------------------

test('V8: 未知の constraints キーが allowed:false なら「検査不能」で違反', (t) => {
  const c = setupConstrainedCase(t, nextTs());
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

test('V8: 未知キーでも allowed:true なら違反にしない（禁止していない制約は検査不要）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) =>
    text.replace('  organization_policy:', '  agent_teams:  { allowed: true }\n  organization_policy:')
  );
  const r = v9(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// 縮退設計（conflicts の登録漏れ＋整合）
// ---------------------------------------------------------------------------

test('V8: deterministic 要件 × hooks 禁止 で conflicts 未登録なら違反（縮退の記録漏れ）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) => text.replace(/conflicts:[\s\S]*$/, 'conflicts:\n  (なし)\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('R1') && v.includes('conflicts')));
});

test('V8: conflicts ブロック自体が無いのは、登録漏れが無くても違反（「無い」と空 `conflicts: []` を区別する）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  // hooks 禁止のままブロックを消すと、R1 の登録漏れとブロックの不在の両方が違反になる。
  const original = readFileSync(c.req, 'utf8');
  patchRequirements(c, (text) => text.replace(/## 制約と要件の衝突[\s\S]*$/, ''));
  const missing = v9(c.ts).violations;
  assert.ok(missing.some((v) => v.includes('R1')), JSON.stringify(missing));
  assert.ok(missing.some((v) => v.includes('conflicts ブロックが無い')), JSON.stringify(missing));
  writeFileSync(c.req, original);
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

// conflicts の【整合】（V8）: 無関係な conflicts を1件書けば登録漏れ検査が通る、
// という形骸化を防ぐ。
test('V8（違反注入）: conflicts が実在しない要件 id や禁止していないキーを指せば違反', (t) => {
  const c = setupConstrainedCase(t, nextTs());
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

test('V8: requirements.md 不在を「制約なし＝合格」と読まない', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  rmSync(c.req);
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('requirements.md')));
});

test('V8: constraints ブロック不在を合格と読まない', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) => text.replace(/## 使用可能なカスタマイズ機能[\s\S]*?\n\n/, '\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('constraints')));
});

test('V8: constraints キー0件を合格と読まない', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) => text.replace(/constraints:\n(?:.+\n)+/, 'constraints:\n\n'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('1件も無い')));
});

test('V8: allowed が真偽値でない制約を合格と読まない', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) => text.replace('hooks:        { allowed: false', 'hooks:        { allowed: "no"'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('真偽値でない')));
});

test('V8: allowed を持たない未知キーは機械判定不能として違反（黙って通さない）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  patchRequirements(c, (text) => text.replace('  organization_policy:', '  audit_rule: "自由文"\n  organization_policy:'));
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('audit_rule')));
});

// ---------------------------------------------------------------------------
// frontmatter 経路（hooks:・allowed-tools の mcp__・disallowedTools）
// ---------------------------------------------------------------------------

test('V8: frontmatter の hooks: 宣言も hooks 禁止の違反になる（agent・skill）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, '.claude/agents/h/h.md', '---\nname: h\ndescription: d\nhooks:\n  PreToolUse:\n    - matcher: Bash\n---\n本文\n');
  write(c, '.claude/skills/hs/SKILL.md', '---\nname: hs\ndescription: d\nhooks: {}\n---\n本文\n');
  const r = v9(c.ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('agents/h/h.md') && v.includes('hooks')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('skills/hs/SKILL.md') && v.includes('hooks')), JSON.stringify(r.violations));
});

test('V8: skill の allowed-tools に mcp__ ツールがあれば mcp 禁止の違反（複数行リストも）', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, '.claude/skills/m1/SKILL.md', '---\nname: m1\ndescription: d\nallowed-tools: Read mcp__srv__tool\n---\n本文\n');
  write(c, '.claude/skills/m2/SKILL.md', '---\nname: m2\ndescription: d\nallowed-tools:\n  - Read\n  - mcp__srv__tool\n---\n本文\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('skills/m1/SKILL.md') && v.includes('mcp')), JSON.stringify(r.violations));
  assert.ok(r.violations.some((v) => v.includes('skills/m2/SKILL.md') && v.includes('mcp')), JSON.stringify(r.violations));
});

test('V8: disallowedTools の mcp__ 指定も mcp の痕跡として検出する', (t) => {
  const c = setupConstrainedCase(t, nextTs());
  write(c, '.claude/agents/d/d.md', '---\nname: d\ndescription: d\ndisallowedTools: mcp__srv__tool\n---\n本文\n');
  const r = v9(c.ts);
  assert.ok(r.violations.some((v) => v.includes('agents/d/d.md') && v.includes('mcp')), JSON.stringify(r.violations));
});
