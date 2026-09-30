/**
 * design-map のスライス切り出し（lib/design-slices.js・canon-c/scripts/slice.js・artifacts.md §5.4）の回帰テスト。
 *
 * design-map の全文を各ワーカーが読むと読み込みが積み上がるため、ワーカーごとに必要な節だけへ切り出す。
 * 中心的な関心は「切り出しで内容を黙って落とさない」こと（未知の節・レコードの取りこぼし）と、
 * 「宣言した成果物の一覧が V8 の照合源と一致する」こと。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { outputDir, workDir } from './helpers/paths.js';
import { runScript } from './helpers/run-cli.js';
import { cleanupTs } from './helpers/fixtures.js';
import { SAMPLE_REPOS } from './helpers/sample-repos.js';
import { tsFor } from './helpers/ts.js';
import { buildSlices } from '../lib/design-slices.js';
import { listDeclaredArtifacts, DesignMapError } from '../lib/design-map.js';

const fixtureMap = (name) => SAMPLE_REPOS[name]['expected-output/design-map.md'];

const SYNTH = `# dm — テスト

## メタ
meta

## Used Features
- Skills

## レイヤー構成
### Responsibility Map
- s: 責務1文

## Write Scopes
scopes

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: CLAUDE.md
    disposition: modify
    interface_change: none
    rationale: "x"
  - path: .claude/skills/s/SKILL.md
    disposition: modify
    interface_change: none
  - path: .claude/skills/kept/SKILL.md
    disposition: keep
  - path: .claude/agents/old/old.md
    disposition: retire
\`\`\`

## L1
### \`CLAUDE.md\`（modify）

## L2
### \`.claude/skills/s/SKILL.md\`（modify）
### \`.claude/skills/kept/SKILL.md\`（keep）

## L3
### \`fresh\`

## Model Assignments
mm

## 設計者が足した未知の節
これは builder 向けの制約かもしれない
`;

test('層ごとのスライスにはその層の節と modify レコードだけが入り、keep・retire は disposition-other へ', () => {
  const { files } = buildSlices(SYNTH);
  assert.match(files['l1.md'], /### `CLAUDE\.md`/);
  assert.match(files['l1.md'], /path: CLAUDE\.md/);
  assert.doesNotMatch(files['l1.md'], /skills\/s\/SKILL\.md/, '別の層のレコードが混ざっている');
  assert.match(files['skills.md'], /path: \.claude\/skills\/s\/SKILL\.md/);
  assert.doesNotMatch(files['skills.md'], /path: \.claude\/skills\/kept/, 'keep は builder が生成しないのでレイヤースライスに入れない');
  assert.match(files['disposition-other.md'], /kept\/SKILL\.md/);
  assert.match(files['disposition-other.md'], /agents\/old\/old\.md/);
  assert.match(files['agents.md'], /### `fresh`/);
});

test('未知の節は other-sections.md へ入り、黙って落ちない（違反注入: 設計者が足した節）', () => {
  const { files } = buildSlices(SYNTH);
  assert.match(files['other-sections.md'], /設計者が足した未知の節/);
  assert.match(files['other-sections.md'], /builder 向けの制約かもしれない/);
});

test('宣言された成果物の一覧（targets-*）は layer ごとに分かれ、retire は含まない', () => {
  const { files, counts } = buildSlices(SYNTH);
  assert.equal(files['targets-l1.txt'], 'CLAUDE.md\n');
  assert.equal(files['targets-l2.txt'], '.claude/skills/kept/SKILL.md\n.claude/skills/s/SKILL.md\n');
  assert.equal(files['targets-l3.txt'], '.claude/agents/fresh/fresh.md\n');
  assert.equal(counts.all, 4);
  assert.doesNotMatch(files['targets-all.txt'], /old/);
});

test('必須の節が無い design-map は throw する（空のスライスを黙って作らない）', () => {
  assert.throws(() => buildSlices('# dm\n## メタ\nx\n'), DesignMapError);
  assert.throws(() => buildSlices('# dm\n## メタ\nx\n'), /Used Features/);
  assert.match(buildSlices('# dm\n## Used Features\ny\n').files['write-scopes.md'], /Write Scopes 節は無い/, '役割分担の無い設計では Write Scopes が無くても切り出せる');
});

test('実 fixture（constrained）: 全 H2 節がいずれかのスライスに現れ、宣言件数が V8 の照合源と一致する', () => {
  for (const name of ['constrained']) {
    const text = fixtureMap(name);
    const { files, counts } = buildSlices(text);
    const all = Object.values(files).join('\n');
    for (const m of text.matchAll(/^##\s+(.+?)\s*$/gm)) {
      const title = m[1];
      if (title.startsWith('既存判定')) continue; // レコードに分割される
      assert.ok(all.includes(title), `${name}: 節「${title}」がどのスライスにも入っていない（黙って落ちた）`);
    }
    assert.equal(counts.all, listDeclaredArtifacts(text).length, `${name}: 宣言件数が V8 と同じ関数の結果と食い違う`);
    assert.ok(counts.all > 0, `${name}: 宣言が0件（vacuous）`);
  }
});

test('括弧書き付きの層見出し（## L1（builder））でも targets に宣言が入る（V8 と同じ照合）', () => {
  const text = SYNTH.replace('## L1\n', '## L1（builder）\n').replace('## L2\n', '## L2（builder）\n').replace('## L3\n', '## L3（builder）\n');
  const { files, counts } = buildSlices(text);
  assert.equal(files['targets-l3.txt'], '.claude/agents/fresh/fresh.md\n', '新規（disposition に無い）の宣言が落ちている');
  assert.equal(counts.all, 4);
  assert.match(files['l1.md'], /### `CLAUDE\.md`/);
});

// ---- CLI ----

test('CLI: design-map が無ければ拒否し、有れば slices/ を書く。古いファイルは掃除される', (t) => {
  const ts = tsFor(import.meta.url, 1);
  cleanupTs(t, ts);
  mkdirSync(outputDir(ts), { recursive: true });
  mkdirSync(path.join(workDir(ts), 'slices'), { recursive: true });
  writeFileSync(path.join(workDir(ts), 'slices', 'stale.md'), '前回の残骸');

  const refused = runScript('canon-c', 'slice.js', [ts]);
  assert.notEqual(refused.code, 0, 'design-map が無いのに切り出した');
  assert.match(refused.stderr, /design-map\.md が無い/);
  assert.ok(existsSync(path.join(workDir(ts), 'slices', 'stale.md')), '拒否したなら何も変えてはならない');

  writeFileSync(path.join(outputDir(ts), 'design-map.md'), SYNTH);
  const ok = runScript('canon-c', 'slice.js', [ts]);
  assert.equal(ok.code, 0, ok.stderr);
  const names = readdirSync(path.join(workDir(ts), 'slices'));
  assert.ok(names.includes('common.md') && names.includes('skills.md') && names.includes('targets-all.txt'));
  assert.ok(!names.includes('stale.md'), '前回の残骸が残っている');
  assert.equal(JSON.parse(ok.stdout).declared.all, 4);
});
