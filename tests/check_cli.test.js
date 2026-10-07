/**
 * tools/check.js（npm run check -- <ts> requirements|spec|design-map）の回帰テスト。
 *
 * 点検が「OK と言うだけの恒真」にならないことを、成果物を故意に壊して NG が出ることで確かめる。
 * 判定関数は文字列で呼び、CLI は実際の起動経路（引数・exit code・出力）で確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT, outputDir, workDir } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import { checkDesignMap, checkRequirements, checkSpec, mentionedIds } from '../tools/check.js';
import { parseReferenceSources } from '../lib/requirements.js';

const REQ = `## 確定要件
- id: R1
  want: 何かをしたい
  strength_needed: advisory
  priority: must
  outside_managed: [docs/]
- id: R2
  want: 守らせたい
  strength_needed: deterministic
  priority: should

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true, reason: "使う" }
  mcp:          { allowed: false, reason: "禁止" }
  plugins:      { allowed: false, reason: "禁止" }
  experimental: { allowed: true, reason: "可" }
  organization_policy: 特になし

## 制約と要件の衝突
conflicts: []
`;

const SPEC = `## §8 受入基準

- A1-1: 振る舞い  [mandatory]
- A1-2: 別の振る舞い  [mandatory]
- A2-1: 退行しない

## §9 未決事項

なし。
`;

const DM = `# design-map.md

## Used Features
- Rules（L1）: 使う。
- Skills（L2）: 使う。
- MCP（L4）: N/A
- builder を起動する層: L1・L2

## Write Scopes
N/A（役割分担なし）

## 既存判定
\`\`\`yaml
existing_disposition:
  - path: .claude/rules/a.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "x"
\`\`\`

## L1（Rules）
### \`.claude/rules/a.md\`（keep）
指示

## L2（Skills）
### \`.claude/skills/s/SKILL.md\`（新規）
指示

## 要件→生成物の対応
| 要件 | 主な生成物 | 受入基準 |
|---|---|---|
| R1 | a | A1-1〜A1-2・A2-1 |

## 管理パス外の変更
### 1-1 \`docs/x.md\` を直す
- 要件: R1
- 変更内容: 直す
- 根拠: 変えない
- 確認: cat
- 撤回条件: 戻す
- 撤回したら直す生成物: なし

## Experimental Dependencies
なし
`;

const EXISTING = `## レコード
- path: .claude/rules/a.md
  layer: L1
`;

const names = (items) => items.filter((i) => !i.ok).map((i) => i.name);

test('requirements: 正しい文書は全項目 OK で、件数・内訳を出す', () => {
  const items = checkRequirements(REQ);
  assert.deepEqual(names(items), []);
  assert.match(items.find((i) => i.name === '要件の件数').detail, /2件/);
  assert.match(items.find((i) => i.name === 'strength_needed の語彙').detail, /advisory 1・deterministic 1/);
});

test('requirements: 語彙外の強度・conflicts の欠落・確定要件の欠落を NG にする（故意の違反）', () => {
  assert.deepEqual(names(checkRequirements(REQ.replace('deterministic', 'strict'))), ['strength_needed の語彙']);
  assert.deepEqual(names(checkRequirements(REQ.replace('conflicts: []', ''))), ['conflicts']);
  const noReq = checkRequirements('## メタ\nx: y\n');
  assert.equal(noReq.length, 1);
  assert.equal(noReq[0].ok, false);
});

test('参照元: 節が無ければ [] で、あればパスと role を読む。check は実在と絶対パスを見る（故意の違反）', () => {
  assert.deepEqual(parseReferenceSources(REQ), []);
  const withRef = (p) => `${REQ}\n## 参照元\n- path: ${p}\n  role: 移植の基準\n`;
  assert.deepEqual(parseReferenceSources(withRef('/a/b')).map((r) => [r.path, r.role]), [['/a/b', '移植の基準']]);
  // 実在する絶対パス → 全項目 OK
  assert.deepEqual(names(checkRequirements(withRef(ROOT))), []);
  // 実在しない・相対パス・path 欠落 → それぞれ NG
  assert.deepEqual(names(checkRequirements(withRef('/no/such/dir-xyz'))), ['参照元の実在']);
  assert.deepEqual(names(checkRequirements(withRef('relative/dir'))), ['参照元のパス']);
  assert.deepEqual(names(checkRequirements(`${REQ}\n## 参照元\n- role: 基準だけ\n`)), ['参照元のパス']);
});

test('spec: §9 が空・mandatory あり は OK。未決の論点・mandatory 無しは NG', () => {
  assert.deepEqual(names(checkSpec(SPEC)), []);
  assert.deepEqual(names(checkSpec(SPEC.replace('なし。', '- 論点: 決めてほしい'))), ['§9 未決事項が空']);
  assert.deepEqual(names(checkSpec(SPEC.replaceAll('[mandatory]', ''))), ['§8 に [mandatory] がある']);
});

test('mentionedIds: 範囲表記を展開する', () => {
  assert.deepEqual([...mentionedIds('A1-1〜A1-3・A2-1')].sort(), ['A1-1', 'A1-2', 'A1-3', 'A2-1']);
});

test('design-map: 正しい文書は全項目 OK', () => {
  assert.deepEqual(names(checkDesignMap(DM, { spec: SPEC, existing: EXISTING, requirements: REQ })), []);
});

test('design-map: 故意の違反をそれぞれ NG にする', () => {
  const run = (text, extra = {}) => names(checkDesignMap(text, { spec: SPEC, existing: EXISTING, requirements: REQ, ...extra }));
  // K1〜K5 の1つが false
  assert.deepEqual(run(DM.replace('K3_dependency_healthy: true', 'K3_dependency_healthy: false')), ['keep の K1〜K5']);
  // mandatory が対応表から漏れる
  assert.deepEqual(run(DM.replace('A1-1〜A1-2・', '')), ['spec §8 の [mandatory] の対応']);
  // existing に有って既存判定に無いファイル
  assert.deepEqual(run(DM, { existing: `${EXISTING}- path: .claude/rules/b.md\n  layer: L1\n` }), ['existing.md との件数照合']);
  // Write Scopes が無い
  assert.deepEqual(run(DM.replace('## Write Scopes\nN/A（役割分担なし）\n', '')), ['## Write Scopes']);
  // 使う層の節に宣言が無い
  assert.deepEqual(run(DM.replace('### `.claude/skills/s/SKILL.md`（新規）', '')), ['## L2 の節と宣言']);
  // allowed: false の mcp を宣言した
  assert.deepEqual(run(DM.replace('## L2（Skills）', '## L4（settings）\n### `.mcp.json`\nx\n\n## L2（Skills）')), ['allowed: false の機能']);
  // 管理パス外の変更が outside_managed の範囲外・根拠が試行待ち
  assert.deepEqual(run(DM.replace('`docs/x.md`', '`src/x.md`')), ['管理パス外の変更']);
  assert.deepEqual(run(DM.replace('根拠: 変えない', '根拠: 試行待ち')), ['管理パス外の変更']);
});

test('design-map: 既存が0件（new）なら既存判定の節が無くてよい。既存があるのに無ければ NG', () => {
  const noDisp = DM.replace(/## 既存判定[\s\S]*?(?=## L1)/, '').replace('### `.claude/rules/a.md`（keep）', '### `.claude/rules/a.md`（新規）');
  assert.deepEqual(names(checkDesignMap(noDisp, { spec: SPEC, existing: '## サマリ\n総数 0\n', requirements: REQ })), []);
  assert.deepEqual(names(checkDesignMap(noDisp, { spec: SPEC, existing: EXISTING, requirements: REQ })), ['## 既存判定']);
});

test('check CLI: 実際の起動経路で exit code と出力を確かめる', (t) => {
  const ts = tsFor(import.meta.url, 1);
  const script = path.join(ROOT, 'tools', 'check.js');
  t.after(() => {
    rmSync(workDir(ts), { recursive: true, force: true });
    rmSync(outputDir(ts), { recursive: true, force: true });
  });
  mkdirSync(workDir(ts), { recursive: true });
  mkdirSync(outputDir(ts), { recursive: true });

  assert.equal(runNodeScript(script, []).code, 2);
  assert.equal(runNodeScript(script, [ts, 'unknown']).code, 2);
  assert.equal(runNodeScript(script, [ts, 'spec']).code, 1); // 入力が無い

  writeFileSync(path.join(outputDir(ts), 'spec.md'), SPEC);
  const ok = runNodeScript(script, [ts, 'spec']);
  assert.equal(ok.code, 0, ok.stdout);
  assert.match(ok.stdout, /OK {2}§9 未決事項が空/);
  assert.match(ok.stdout, /点検: すべて OK/);

  writeFileSync(path.join(outputDir(ts), 'spec.md'), SPEC.replace('なし。', '- 論点'));
  const bad = runNodeScript(script, [ts, 'spec']);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /NG {2}§9 未決事項が空/);

  writeFileSync(path.join(workDir(ts), 'requirements.md'), REQ);
  assert.equal(runNodeScript(script, [ts, 'requirements']).code, 0);
});
