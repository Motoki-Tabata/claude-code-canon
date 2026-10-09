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
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { outputDir, workDir, scriptsDir } from './helpers/paths.js';
import { runScript } from './helpers/run-cli.js';
import { cleanupTs } from './helpers/fixtures.js';
import { SAMPLE_REPOS } from './helpers/sample-repos.js';
import { tsFor } from './helpers/ts.js';
import { buildSlices, chunkSkills, SKILLS_SLICE_SIZE } from '../lib/design-slices.js';
import { listDeclaredArtifacts, DesignMapError, parseReferenceCopies } from '../lib/design-map.js';

const fixtureMap = (name) => SAMPLE_REPOS[name]['expected-output/design-map.md'];

const SYNTH = `# dm — テスト

## メタ
meta

## Used Features
- Skills

## 構成と責務
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

## claude-md
### \`CLAUDE.md\`（modify）

## skills
### \`.claude/skills/s/SKILL.md\`（modify）
### \`.claude/skills/kept/SKILL.md\`（keep）

## subagents
### \`fresh\`

## Model Assignments
mm

## 設計者が足した未知の節
これは builder 向けの制約かもしれない
`;

test('担当ごとのスライスにはその担当の節と modify レコードだけが入り、keep・retire は disposition-other へ', () => {
  const { files } = buildSlices(SYNTH);
  assert.match(files['claude-md.md'], /### `CLAUDE\.md`/);
  assert.match(files['claude-md.md'], /path: CLAUDE\.md/);
  assert.doesNotMatch(files['claude-md.md'], /skills\/s\/SKILL\.md/, '別の担当のレコードが混ざっている');
  assert.match(files['skills.md'], /path: \.claude\/skills\/s\/SKILL\.md/);
  assert.doesNotMatch(files['skills.md'], /path: \.claude\/skills\/kept/, 'keep は builder が生成しないので担当のスライスに入れない');
  assert.match(files['disposition-other.md'], /kept\/SKILL\.md/);
  assert.match(files['disposition-other.md'], /agents\/old\/old\.md/);
  assert.match(files['subagents.md'], /### `fresh`/);
});

test('未知の節は other-sections.md へ入り、黙って落ちない（違反注入: 設計者が足した節）', () => {
  const { files } = buildSlices(SYNTH);
  assert.match(files['other-sections.md'], /設計者が足した未知の節/);
  assert.match(files['other-sections.md'], /builder 向けの制約かもしれない/);
});

test('宣言された成果物の一覧（targets-*）は担当ごとに分かれ、retire は含まない', () => {
  const { files, counts } = buildSlices(SYNTH);
  assert.equal(files['targets-claude-md.txt'], 'CLAUDE.md\n');
  assert.equal(files['targets-skills.txt'], '.claude/skills/kept/SKILL.md\n.claude/skills/s/SKILL.md\n');
  assert.equal(files['targets-subagents.txt'], '.claude/agents/fresh/fresh.md\n');
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

test('括弧書き付きの機能見出し（## claude-md（builder））でも targets に宣言が入る（V8 と同じ照合）', () => {
  const text = SYNTH.replace('## claude-md\n', '## claude-md（builder）\n').replace('## skills\n', '## skills（builder）\n').replace('## subagents\n', '## subagents（builder）\n');
  const { files, counts } = buildSlices(text);
  assert.equal(files['targets-subagents.txt'], '.claude/agents/fresh/fresh.md\n', '新規（disposition に無い）の宣言が落ちている');
  assert.equal(counts.all, 4);
  assert.match(files['claude-md.md'], /### `CLAUDE\.md`/);
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

// ---- 担当に属さないパス（A9・A10） ----

const OTHER_MAP = `# dm — 担当外

## Used Features
- plugins

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: plugin/x.json
    disposition: modify
    interface_change: none
  - path: .claude/README.md
    disposition: modify
    interface_change: none
  - path: docs/notes.md
    disposition: modify
  - path: docs/old.md
    disposition: merge
    superseded_by: docs/notes.md
\`\`\`

## claude-md
### \`CLAUDE.md\`（新規）

## plugins
### \`plugin/.claude-plugin/plugin.json\`（新規）
### \`.claude/README.md\`（modify）
`;

test('plugin/ のレコードは plugins 担当に属し、plugins.md と targets-plugins.txt に入る', () => {
  const { files } = buildSlices(OTHER_MAP);
  assert.match(files['plugins.md'], /path: plugin\/x\.json/);
  assert.match(files['targets-plugins.txt'], /^plugin\/x\.json$/m);
  assert.doesNotMatch(files['targets-other.txt'], /plugin\//);
  assert.doesNotMatch(files['disposition-other.md'], /plugin\/x\.json/);
});

test('担当に属さない modify・merge のレコードは disposition-other.md に入り、どのスライスからも落ちない', () => {
  const { files } = buildSlices(OTHER_MAP);
  assert.match(files['disposition-other.md'], /path: docs\/notes\.md/);
  assert.match(files['disposition-other.md'], /path: docs\/old\.md/);
  for (const name of ['claude-md.md', 'rules.md', 'skills.md', 'subagents.md', 'settings.md', 'mcp.md', 'plugins.md', 'output-styles.md']) {
    assert.doesNotMatch(files[name], /path: docs\//, `${name} に担当外のレコードが混ざった`);
  }
  assert.match(files['targets-other.txt'], /^docs\/notes\.md$/m, 'modify の宣言は targets-other に出る（既存どおり）');
});

test('.claude/README.md は担当に属さない: targets-*.txt に出ず、レコードは disposition-other.md に入る', () => {
  const { files } = buildSlices(OTHER_MAP);
  for (const name of Object.keys(files).filter((n) => n.startsWith('targets-'))) {
    assert.doesNotMatch(files[name], /\.claude\/README\.md/, `${name} に emit-manifest が作る README が入っている`);
  }
  assert.doesNotMatch(files['plugins.md'], /path: \.claude\/README\.md/);
  assert.match(files['disposition-other.md'], /path: \.claude\/README\.md/);
  assert.ok(!listDeclaredArtifacts(OTHER_MAP).some((d) => d.path === '.claude/README.md'), 'V8 の宣言源にも入れない（emit-manifest が必ず書く）');
});

test('slice.js は import しただけでは実行されない（main ガード。process.exit も書込も起きない）', () => {
  const url = pathToFileURL(path.join(scriptsDir('canon-c'), 'slice.js')).href;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('imported');`], {
    encoding: 'utf8',
  });
  assert.equal(out.trim(), 'imported');
});

// ---- skills の分割（SKILLS_SLICE_SIZE 件超）と参照元からのコピー ----

/** skill を n 個、1つにつき files 件（SKILL.md ＋ scripts/f<i>.sh）宣言する design-map。偶数番目の skill は modify レコードを持つ。 */
function bigSkillsMap(n, filesPer) {
  const names = Array.from({ length: n }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);
  const decl = names.flatMap((nm) => [
    `### \`.claude/skills/${nm}/SKILL.md\`（新規）`,
    ...Array.from({ length: filesPer - 1 }, (_, j) => `### \`.claude/skills/${nm}/scripts/f${j}.sh\`（新規）`),
  ]);
  const recs = names.filter((_, i) => i % 2 === 1).map((nm) => `  - path: .claude/skills/${nm}/SKILL.md\n    disposition: modify\n    interface_change: none`);
  return `# dm

## Used Features
- Skills

## 既存判定

\`\`\`yaml
existing_disposition:
${recs.join('\n')}
\`\`\`

## skills
skills の前置き（全 builder 共通）

${decl.join('\n本文\n')}
本文

## 参照元からのコピー
- /ref/a/run.mjs → .claude/skills/s01/scripts/f0.sh
- \`/ref/a/b.md\` -> \`.claude/skills/s02/b.md\`
- 矢印の無い行
`;
}

test('chunkSkills: 件数がしきい値以下なら分割しない。超えたら skill を割らずに詰める', () => {
  const mk = (n, per) => Array.from({ length: n }, (_, i) => Array.from({ length: per }, (_, j) => `.claude/skills/s${i}/f${j}.md`)).flat();
  assert.deepEqual(chunkSkills(mk(SKILLS_SLICE_SIZE, 1)), [], 'ちょうど20件は分割しない');
  assert.equal(chunkSkills(mk(SKILLS_SLICE_SIZE + 1, 1)).length, 2);
  // 1つの skill が20件を超えるときは、その skill だけで1チャンク（割らない）
  const big = [...mk(1, 25), '.claude/skills/z/SKILL.md'];
  assert.deepEqual(chunkSkills(big).map((c) => c.length), [1, 1]);
});

test('buildSlices: skills が21件以上なら skills-<k>.md・targets-skills-<k>.txt に分かれ、全宣言がちょうど1つに入る', () => {
  const small = buildSlices(bigSkillsMap(10, 2)); // 20件
  assert.equal(small.counts.skills_slices, 0);
  assert.equal(Object.keys(small.files).some((f) => /^skills-\d+\.md$/.test(f)), false, '20件ちょうどでは分割ファイルを作らない');

  const { files, counts } = buildSlices(bigSkillsMap(11, 2)); // 22件
  assert.equal(counts.skills, 22);
  assert.ok(counts.skills_slices >= 2);
  // 全体のスライスは残る
  assert.equal(files['targets-skills.txt'].trim().split('\n').length, 22);
  assert.match(files['skills.md'], /s11\/SKILL\.md/);
  // 分割後の和集合＝全体、かつ重複なし
  const seen = [];
  for (let k = 1; k <= counts.skills_slices; k++) {
    const paths = files[`targets-skills-${k}.txt`].trim().split('\n');
    assert.ok(paths.length <= SKILLS_SLICE_SIZE, `チャンク${k}が${paths.length}件`);
    seen.push(...paths);
    // 宣言の見出しは、そのチャンクの targets にあるものだけがスライスに入る
    const decls = [...files[`skills-${k}.md`].matchAll(/^### `([^`]+)`/gm)].map((m) => m[1]).sort();
    assert.deepEqual(decls, [...paths].sort(), `skills-${k}.md の宣言と targets-skills-${k}.txt が一致しない`);
    assert.match(files[`skills-${k}.md`], /skills の前置き/, '前置きが全チャンクに入る');
    // disposition レコードは、そのチャンクの skill のものだけ
    for (const m of files[`skills-${k}.md`].matchAll(/path: (\.claude\/skills\/[^\n]+)/g)) assert.ok(paths.includes(m[1]), `${m[1]} が別のチャンクのレコード`);
  }
  assert.deepEqual([...seen].sort(), files['targets-skills.txt'].trim().split('\n'));
  // modify レコード（偶数番目の5件）は全体でちょうど1回ずつ現れる
  const recs = Array.from({ length: counts.skills_slices }, (_, i) => files[`skills-${i + 1}.md`]).join('').match(/disposition: modify/g) ?? [];
  assert.equal(recs.length, 5);
});

test('parseReferenceCopies: 矢印の両形・バッククォート・矢印なし行を読み、節が無ければ []', () => {
  assert.deepEqual(parseReferenceCopies(SYNTH), []);
  const r = parseReferenceCopies(bigSkillsMap(1, 1));
  assert.deepEqual(r.map((x) => [x.from, x.to]), [
    ['/ref/a/run.mjs', '.claude/skills/s01/scripts/f0.sh'],
    ['/ref/a/b.md', '.claude/skills/s02/b.md'],
    ['矢印の無い行', null],
  ]);
});

test('参照元からのコピーの節は common.md に入り、builder に渡る（other-sections.md に落ちない）', () => {
  const { files } = buildSlices(bigSkillsMap(1, 1));
  assert.match(files['common.md'], /## 参照元からのコピー/);
  assert.doesNotMatch(files['other-sections.md'], /参照元からのコピー/);
});

// ---- 担当（--unit）と、複数の機能を受け持つ担当 ----

const MULTI_MAP = `# dm — 複数機能

## Used Features
builder を起動する機能: settings・hooks・statusline・plugins・plugin-mods・output-styles

## settings
### \`.claude/settings.json\`（新規）

## hooks
### \`.claude/hooks/block.sh\`（新規）

## statusline
### \`.claude/statusline.sh\`（新規）

## plugins
### \`plugin/.claude-plugin/plugin.json\`（新規）

## plugin-mods
### \`plugin/mods/index.js\`（新規）

## output-styles
### \`.claude/output-styles/terse.md\`（新規）
`;

test('settings 担当は settings・hooks・statusline の節を、plugins 担当は plugins・plugin-mods の節をまとめて受け取る', () => {
  const { files, counts } = buildSlices(MULTI_MAP);
  for (const h of ['## settings', '## hooks', '## statusline']) assert.ok(files['settings.md'].includes(h), `settings.md に ${h} が無い`);
  for (const h of ['## plugins', '## plugin-mods']) assert.ok(files['plugins.md'].includes(h), `plugins.md に ${h} が無い`);
  assert.doesNotMatch(files['plugins.md'], /## hooks/);
  assert.equal(files['targets-settings.txt'], '.claude/hooks/block.sh\n.claude/settings.json\n.claude/statusline.sh\n');
  assert.equal(files['targets-plugins.txt'], 'plugin/.claude-plugin/plugin.json\nplugin/mods/index.js\n');
  assert.equal(files['targets-output-styles.txt'], '.claude/output-styles/terse.md\n');
  assert.equal(counts.other, 0, '機能の節に宣言した生成物が other に落ちた');
  // 節の無い担当は「節は無い」と明示したスライスになる（空ファイルを黙って作らない）
  assert.match(files['mcp.md'], /## mcp 節は無い/);
  // どの節も、いずれかのスライスに入る（黙って落ちない）
  const all = Object.values(files).join('\n');
  for (const m of MULTI_MAP.matchAll(/^## (.+)$/gm)) assert.ok(all.includes(`## ${m[1]}`), m[1]);
});

test('CLI --unit: 指定した担当のスライスと宣言件数に絞って出力し、書き出しは全部。不正な担当は exit 2', (t) => {
  const ts = tsFor(import.meta.url, 2);
  cleanupTs(t, ts);
  mkdirSync(outputDir(ts), { recursive: true });
  writeFileSync(path.join(outputDir(ts), 'design-map.md'), MULTI_MAP);

  const r = runScript('canon-c', 'slice.js', [ts, '--unit', 'settings']);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(r.stdout);
  assert.equal(summary.unit, 'settings');
  assert.deepEqual(summary.files, ['settings.md', 'targets-settings.txt']);
  assert.equal(summary.declared, 3);
  assert.ok(existsSync(path.join(workDir(ts), 'slices', 'plugins.md')), '--unit を付けても書き出しは全部');

  // 引数の順序に依存しない
  assert.equal(runScript('canon-c', 'slice.js', ['--unit', 'plugins', ts]).code, 0);

  for (const bad of [['--unit', 'l1'], ['--unit', 'hooks'], ['--unit']]) {
    const e = runScript('canon-c', 'slice.js', [ts, ...bad]);
    assert.equal(e.code, 2, `${bad.join(' ')} が通った`);
    assert.match(e.stderr, /不正な --unit/);
  }
});
