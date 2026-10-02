/**
 * emit-manifest.js（npm run manifest・artifacts.md §7）の回帰テスト。
 *
 * - MANIFEST の区分（新規・改修・維持・廃止）と `## 全ファイル`、配置リストを design-map と generated/ から導く。
 * - README は規則の適用で書く。起動方式の導出（§7.3）を、一覧の位置で判定する判定器
 *   （tests/helpers/readme-listing.js）で確かめる。
 * - 生成した MANIFEST・README・配置リストは、そのまま verify の V8 を通る。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo, cleanupTs, writeHandoff } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { genDir, outputDir, workDir } from './helpers/paths.js';
import { tsSeq } from './helpers/ts.js';
import { collectListingEntries, analyzeReadmeMentions } from './helpers/readme-listing.js';
import { emitManifest, checkOutsideChanges } from '../.claude/skills/canon-c/scripts/emit-manifest.js';
import { parseManifestFiles } from '../lib/manifest.js';
import { readList } from '../lib/managed-paths.js';

const nextTs = tsSeq(import.meta.url);
const manifestCli = (args) => runScript('canon-c', 'emit-manifest.js', args);
const read = (p) => readFileSync(p, 'utf8');

function write(root, rel, text) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

/** サンプルの MANIFEST・README・配置リストを消して、emit-manifest に作らせる。 */
function stripEmitted(c) {
  rmSync(path.join(c.out, 'MANIFEST.md'), { force: true });
  rmSync(path.join(c.gen, '.claude', 'README.md'), { force: true });
  rmSync(path.join(c.out, 'deploy'), { recursive: true, force: true });
}

// ---- MANIFEST・配置リスト ----

test('emit-manifest CLI: 制約強めのサンプルから MANIFEST・README・配置リストを作り、そのまま verify を通る', (t) => {
  const c = setupSampleRepo(t, 'constrained', nextTs());
  stripEmitted(c);
  const r = manifestCli([c.ts]);
  assert.equal(r.code, 0, r.stderr);

  const files = parseManifestFiles(read(path.join(c.out, 'MANIFEST.md')));
  assert.equal(files.found, true);
  assert.deepEqual(files.files, ['.claude/README.md', '.claude/rules/schema-review.md', '.claude/skills/style-guide/SKILL.md', 'CLAUDE.md']);
  assert.deepEqual(readList(path.join(c.out, 'deploy', 'managed-paths.list')), files.files, 'managed-paths.list は generated/ の全件');
  assert.deepEqual(readList(path.join(c.out, 'deploy', 'retired.list')), ['.claude/settings.json', '.claude/skills/fork-runner/SKILL.md']);

  const v = runScript('canon-c', 'verify.js', [c.ts]);
  assert.equal(v.code, 0, read(path.join(c.out, 'verify-report.md')));
});

test('emit-manifest: 区分は design-map の disposition から導き、廃止には manifest_note と統合先を添える', (t) => {
  const c = setupSampleRepo(t, 'existing', nextTs());
  stripEmitted(c);
  emitManifest(c.ts);
  const m = read(path.join(c.out, 'MANIFEST.md'));
  const section = (h) => m.split(`## ${h}\n`)[1].split('\n## ')[0];
  assert.match(section('新規'), /`\.claude\/skills\/merged\/SKILL\.md`/);
  assert.match(section('新規'), /`\.claude\/skills\/new-skill\/SKILL\.md`/);
  assert.match(section('新規'), /`\.claude\/README\.md`/, 'README 自身も新規として載る');
  assert.equal(section('改修').trim(), '- `CLAUDE.md`');
  assert.equal(section('維持').trim(), '- `.claude/skills/kept-skill/SKILL.md`');
  assert.match(section('廃止'), /`\.claude\/skills\/merge-a\/SKILL\.md`（merge → `\.claude\/skills\/merged\/SKILL\.md`）: merge-a は merged へ統合/);
  assert.match(section('廃止'), /legacy-skill は廃止し new-skill へ移行/);
  assert.match(m, /\| 廃止 \| 3 \|/);
  assert.equal(section('配置時の追加手順').trim(), 'なし', 'design-map に節が無ければ「なし」');
  assert.deepEqual(readList(path.join(c.out, 'deploy', 'retired.list')).length, 3);
});

test('emit-manifest: design-map の「配置時の追加手順」節を MANIFEST へ逐語で写す', (t) => {
  const c = setupSampleRepo(t, 'existing', nextTs());
  stripEmitted(c);
  const steps = '1. 配置前: `node x.mjs check --root <target>`。\n2. 配置後: 反映済み5件だけを削除する。';
  const dm = path.join(c.out, 'design-map.md');
  writeFileSync(dm, `${read(dm)}\n## 配置時の追加手順\n\n${steps}\n`);
  emitManifest(c.ts);
  assert.ok(read(path.join(c.out, 'MANIFEST.md')).includes(`## 配置時の追加手順\n\n${steps}\n`));
});

const OUTSIDE_ITEM = [
  '### 2-1 `frontend/vitest.config.ts` に setupFiles を足す',
  '- 要件: R18',
  '- 変更内容: `setupFiles` を足す',
  '- 根拠: 対象の一時 worktree で `pnpm test:unit` が PASS',
  '- 確認: `pnpm test:unit` が PASS',
  '- 撤回条件: テストが落ちたら外す',
  '- 撤回したら直す生成物: `.claude/rules/frontend.md`「後始末」節',
].join('\n');

test('emit-manifest: 「管理パス外の変更」を MANIFEST へ逐語で写す（無ければ「なし」）', (t) => {
  const c = setupSampleRepo(t, 'existing', nextTs());
  stripEmitted(c);
  emitManifest(c.ts);
  assert.match(read(path.join(c.out, 'MANIFEST.md')), /## 管理パス外の変更\n\nなし\n/);
  const dm = path.join(c.out, 'design-map.md');
  writeFileSync(dm, `${read(dm)}\n## 管理パス外の変更\n\n${OUTSIDE_ITEM}\n`);
  emitManifest(c.ts);
  assert.ok(read(path.join(c.out, 'MANIFEST.md')).includes(`## 管理パス外の変更\n\n${OUTSIDE_ITEM}\n`));
});

test('emit-manifest: 「管理パス外の変更」の欄の欠け・管理パス内の対象・パス無しの見出し・試行待ちの根拠は失敗する', () => {
  const dm = (body) => `# dm\n## Used Features\nL1\n## 管理パス外の変更\n\n${body}\n`;
  assert.deepEqual(checkOutsideChanges(dm(OUTSIDE_ITEM)), []);
  assert.deepEqual(checkOutsideChanges(dm('なし')), []);
  const missing = checkOutsideChanges(dm(OUTSIDE_ITEM.replace(/^- 撤回したら直す生成物:.*$/m, '')));
  assert.equal(missing.length, 1);
  assert.match(missing[0], /欄が無い: 撤回したら直す生成物/);
  assert.match(checkOutsideChanges(dm(OUTSIDE_ITEM.replace('frontend/vitest.config.ts', '.claude/rules/x.md')))[0], /管理パス集合の中/);
  assert.match(checkOutsideChanges(dm(OUTSIDE_ITEM.replace('`frontend/vitest.config.ts`', 'vitest')))[0], /対象パスがバッククォート/);
  assert.match(checkOutsideChanges(dm(OUTSIDE_ITEM.replace(/^- 根拠:.*$/m, '- 根拠: 試行待ち')))[0], /試行待ち/);
});

test('emit-manifest: 2回走らせても同じ出力になる（決定論）', (t) => {
  const c = setupSampleRepo(t, 'existing', nextTs());
  stripEmitted(c);
  emitManifest(c.ts);
  const first = [read(path.join(c.out, 'MANIFEST.md')), read(path.join(c.gen, '.claude', 'README.md'))];
  emitManifest(c.ts);
  assert.deepEqual([read(path.join(c.out, 'MANIFEST.md')), read(path.join(c.gen, '.claude', 'README.md'))], first);
});

test('emit-manifest CLI: 入力が無ければ exit 1、引数が無ければ exit 2。README を keep にした design-map は拒否する', (t) => {
  assert.equal(manifestCli([]).code, 2);

  const ts = nextTs();
  cleanupTs(t, ts);
  mkdirSync(outputDir(ts), { recursive: true });
  const noDm = manifestCli([ts]);
  assert.equal(noDm.code, 1);
  assert.match(noDm.stderr, /design-map\.md が無い/);

  writeFileSync(path.join(outputDir(ts), 'design-map.md'), '# dm\n## Used Features\nL1\n');
  const noGen = manifestCli([ts]);
  assert.equal(noGen.code, 1);
  assert.match(noGen.stderr, /generated\/ が無いか空/);

  const c = setupSampleRepo(t, 'existing', nextTs());
  const dm = path.join(c.out, 'design-map.md');
  writeFileSync(dm, read(dm).replace('existing_disposition:\n', 'existing_disposition:\n  - path: .claude/README.md\n    disposition: keep\n'));
  const kept = manifestCli([c.ts]);
  assert.equal(kept.code, 1);
  assert.match(kept.stderr, /README\.md を keep/);
});

// ---- README の規則（artifacts.md §7.3・§7.4）----

/** 起動方式の違う全種別を含む生成物一式を作る（new モード）。 */
function setupComponents(t, { experimental = false } = {}) {
  const ts = nextTs();
  cleanupTs(t, ts);
  const g = genDir(ts);
  writeFileSync(path.join(mkdirp(outputDir(ts)), 'design-map.md'), '# dm\n## Used Features\nL1 L2 L3 L4\n');
  writeHandoff(ts, { target: workDir(ts), mode: 'new' });
  write(
    workDir(ts),
    'requirements.md',
    `## 確定要件\n- id: R1\n  want: x\n  strength_needed: advisory\n  priority: must\n\n## 使用可能なカスタマイズ機能\nconstraints:\n  experimental: { allowed: ${experimental} }\n`
  );
  write(
    outputDir(ts),
    'spec.md',
    '# spec\n## §8 受入基準\n- functional（A1）[mandatory]:\n  - `/release v1.2.0` でリリースノートが下書きされる\n- non_regression（A2）: keep の非回帰\n'
  );
  write(g, 'CLAUDE.md', '# c\n');
  write(g, '.claude/skills/release/SKILL.md', '---\nname: release\ndescription: リリースノートを下書きする\ndisable-model-invocation: true\nargument-hint: <version>\n---\n本文\n');
  write(g, '.claude/skills/style/SKILL.md', '---\nname: style\ndescription: 規約に沿っているか確かめる\n---\n本文\n');
  write(g, '.claude/skills/impact-scope/SKILL.md', '---\nname: impact-scope\ndescription: 内部知識\nuser-invocable: false\n---\n本文\n');
  write(g, '.claude/skills/forked/SKILL.md', '---\nname: forked\ndescription: 別文脈で調べる\ncontext: fork\nagent: Explore\n---\n本文\n');
  write(g, '.claude/agents/reviewer/reviewer.md', '---\nname: reviewer\ndescription: 変更をレビューする。Delegate when PR を出す前。\ntools: Read, Agent\n---\n本文\n');
  write(g, '.claude/rules/backend.md', '---\npaths: ["src/**"]\n---\n本文\n');
  write(g, '.claude/rules/always.md', '# 常時\n');
  write(g, '.claude/hooks/scope-guard.sh', '#!/bin/sh\nexit 0\n');
  write(
    g,
    '.claude/settings.json',
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '.claude/hooks/scope-guard.sh' }] }] } })
  );
  write(g, '.mcp.json', JSON.stringify({ mcpServers: { tracker: { url: 'https://x', headers: { Authorization: 'Bearer ${TRACKER_TOKEN}' }, oauth: {} } } }));
  if (experimental) write(g, '.claude/rules/teams.md', '# teams\nCLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 を使う（実験機能）。\n');
  return ts;
}

function mkdirp(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('README: 一覧に載せる Skill は `/名前` を書き、Subagent・Rule には書かない（起動方式の導出）', (t) => {
  const ts = setupComponents(t);
  emitManifest(ts);
  const readme = read(path.join(genDir(ts), '.claude', 'README.md'));
  const entries = collectListingEntries(readme);
  for (const name of ['release', 'style', 'forked']) {
    assert.ok(analyzeReadmeMentions(readme, name, entries).slash.length > 0, `${name} の \`/名前\` が無い`);
    assert.ok(analyzeReadmeMentions(readme, name, entries).listing.length > 0, `${name} が一覧に無い`);
  }
  assert.match(readme, /`\/release <version>` で起動する（自動では動かない）/);
  assert.match(readme, /頼むと自動で使われる。`\/style` でも起動できる/);
  for (const name of ['reviewer', 'backend', 'always']) {
    assert.equal(analyzeReadmeMentions(readme, name, entries).slash.length, 0, `${name} に \`/名前\` を書いている`);
    assert.ok(analyzeReadmeMentions(readme, name, entries).listing.length > 0, `${name} が一覧に無い（網羅性）`);
  }
  assert.match(readme, /`backend` \| `src\/\*\*` を扱うときに読み込まれる/);
  assert.match(readme, /`always` \| 常に読み込まれる/);
  assert.match(readme, /次のときメインが自動で使う: 変更をレビューする/);
});

test('README: user-invocable: false の Skill は一覧にも `/名前` にも出さず、散文で触れるだけにする', (t) => {
  const ts = setupComponents(t);
  emitManifest(ts);
  const readme = read(path.join(genDir(ts), '.claude', 'README.md'));
  const m = analyzeReadmeMentions(readme, 'impact-scope');
  assert.deepEqual(m.slash, [], '内部専用の起動方法を案内している');
  assert.deepEqual(m.listing, [], '内部専用を一覧に載せている');
  assert.match(readme, /内部で参照される知識として `impact-scope`/);
});

test('README: セットアップ欄を frontmatter と設定から導く（fork・入れ子の委譲・MCP の変数と OAuth・Hook の配線と実行権限）', (t) => {
  const ts = setupComponents(t);
  emitManifest(ts);
  const readme = read(path.join(genDir(ts), '.claude', 'README.md'));
  const setup = readme.split('## 前提セットアップと配置後の手作業\n')[1].split('\n## ')[0];
  assert.match(setup, /Skill `forked` は context: fork で動く。frontmatter の agent: に指定した `Explore`/);
  assert.match(setup, /Subagent `reviewer` は別の Subagent を起動する/);
  assert.match(setup, /環境変数 `TRACKER_TOKEN` を設定する/);
  assert.match(setup, /`tracker` は OAuth を使う/);
  assert.match(setup, /chmod \+x \.claude\/hooks\/scope-guard\.sh/);
  assert.doesNotMatch(setup, /CLAUDE_CODE_EXPERIMENTAL_/, 'experimental を許可していないのにセットアップに並べた');
  assert.match(readme, /PreToolUse（matcher: `Write`） のとき Hook が自動で走る/);
});

test('README: experimental を許可したときだけ実験機能の環境変数をセットアップに並べる', (t) => {
  const ts = setupComponents(t, { experimental: true });
  emitManifest(ts);
  const setup = read(path.join(genDir(ts), '.claude', 'README.md')).split('## 前提セットアップと配置後の手作業\n')[1].split('\n## ')[0];
  assert.match(setup, /`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` を設定する/);
});

test('README: 使用例は一覧に載る Skill の起動行で、spec の受入基準を写さない', (t) => {
  const ts = setupComponents(t);
  emitManifest(ts);
  const readme = read(path.join(genDir(ts), '.claude', 'README.md'));
  const usage = readme.split('## 使用例\n')[1].split('\n## ')[0];
  assert.match(usage, /```text\n\/forked\n\/release <version>\n\/style\n```/);
  assert.doesNotMatch(usage, /impact-scope/, '内部知識の Skill を使用例に載せている');
  assert.doesNotMatch(readme, /functional|A1|non_regression/, '受入基準を写している');
});

test('README と MANIFEST: README 自身も MANIFEST の全ファイルと managed-paths.list に載る', (t) => {
  const ts = setupComponents(t);
  emitManifest(ts);
  const listed = parseManifestFiles(read(path.join(outputDir(ts), 'MANIFEST.md'))).files;
  assert.ok(listed.includes('.claude/README.md'));
  assert.ok(readList(path.join(outputDir(ts), 'deploy', 'managed-paths.list')).includes('.claude/README.md'));
  assert.ok(existsSync(path.join(outputDir(ts), 'deploy', 'retired.list')), '廃止が無くても retired.list は空で書く');
});

test('emit-manifest CLI: settings.json・.mcp.json・plugin.json のトップレベルが object でなければ、例外でなく exit 1 で拒否する', (t) => {
  for (const rel of ['.claude/settings.json', '.mcp.json', 'plugin/.claude-plugin/plugin.json']) {
    const c = setupSampleRepo(t, 'constrained', nextTs());
    stripEmitted(c);
    write(c.gen, rel, 'null');
    const r = manifestCli([c.ts]);
    assert.equal(r.code, 1, `${rel}: ${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stderr, /TypeError/, rel);
    assert.match(r.stderr, new RegExp(`${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*object`), rel);
  }
});
