/**
 * V8 スナップショット完全性（artifacts.md §8.2）の回帰テスト。verify.js の buildContext を通して当てる。
 * 一意な <ts> で実 output/ を使い、各テストで掃除する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkV8 } from '../.claude/skills/canon-c/scripts/verify/v8-snapshot.js';
import { buildContext } from '../.claude/skills/canon-c/scripts/verify.js';
import { outputDir, genDir } from './helpers/paths.js';
import { cleanupTs, writeSkill, writeManifest } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const out = outputDir;
const gen = genDir;
const skill = (ts, name, extra = '') => writeSkill(gen(ts), name, { extra });

function v8(ts) {
  const r = checkV8(buildContext(ts));
  return { ...r, ok: r.violations.length === 0 };
}

/** 機能の節に `.claude/skills/<name>/SKILL.md` を宣言した最小の design-map を書く。 */
function writeDesignMap(ts, names = ['s']) {
  mkdirSync(out(ts), { recursive: true });
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    ['# dm', '## skills', ...names.map((n) => `### \`.claude/skills/${n}/SKILL.md\`（新規）`), ''].join('\n')
  );
}

test('V8: managed-paths.list の集合外パス混入は違反（集合外の破壊を防ぐ）', (t) => {
  const ts = tsFor(import.meta.url, 6);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(
    path.join(dep, 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.github/workflows/ci.yml\n'
  );
  const r = v8(ts);
  assert.equal(r.ok, false, '集合外パスは不可侵領域を破壊しうる');
  assert.ok(r.violations.some((v) => v.includes('.github/workflows/ci.yml')));
});

test('V8: generated/ の集合外ファイル型（.yml）を検出する', (t) => {
  const ts = tsFor(import.meta.url, 7);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  mkdirSync(path.join(gen(ts), '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(gen(ts), '.github', 'workflows', 'ci.yml'), 'x\n');
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  const r = v8(ts);
  assert.equal(r.ok, false, '型で絞ると .yml が逃げる。全型を見ること');
  assert.ok(r.violations.some((v) => v.includes('ci.yml')));
});

test('V8: 集合内のみ・MANIFEST 有・managed-paths 有 → 通過', (t) => {
  const ts = tsFor(import.meta.url, 8);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  assert.equal(v8(ts).ok, true);
});

test('V8: managed-paths.list の glob 行は違反（deploy が展開せず rolled-back になる）', (t) => {
  // glob 行は isManaged のパターンに `**` が `.+` としてマッチするため集合内包検査を素通りし、
  // 配置の --confirm で初めて「output に配置対象が無い」で rolled-back になる。
  const ts = tsFor(import.meta.url, 18);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/**\n');
  const r = v8(ts);
  assert.equal(r.ok, false, 'glob 行を生成段階で止めないと配置まで持ち越される');
  assert.ok(r.violations.some((v) => v.includes('glob')));
});

test('V8: managed-paths.list に列挙したのに generated/ に無いパスは違反', (t) => {
  const ts = tsFor(import.meta.url, 19);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(
    path.join(dep, 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.claude/agents/ghost/ghost.md\n'
  );
  const r = v8(ts);
  assert.equal(r.ok, false, '列挙したのに生成していないパスは配置時に必ず落ちる');
  assert.ok(r.violations.some((v) => v.includes('ghost.md') && v.includes('実在しない')));
});

test('V8: retired.list の glob 行は違反（V7・pre-deploy が完全一致で参照するため）', (t) => {
  const ts = tsFor(import.meta.url, 20);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  writeFileSync(path.join(dep, 'retired.list'), '.claude/skills/old/**\n');
  const r = v8(ts);
  assert.equal(r.ok, false, 'glob の廃止宣言は完全一致に当たらず黙って無効になる');
  assert.ok(r.violations.some((v) => v.includes('retired.list')));
});

test('V8: 実ファイル1行1件の list は通過する（緩めすぎていないことの対）', (t) => {
  const ts = tsFor(import.meta.url, 21);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  const dep = path.join(out(ts), 'deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  writeFileSync(path.join(dep, 'retired.list'), '.claude/skills/old/SKILL.md\n');
  assert.equal(v8(ts).ok, true, '正しい形式まで落とすと生成が回らない');
});

// ---------------------------------------------------------------------------
// skill supporting files（canon-reference V-skills-18）と hook ハンドラ実体（features/hooks.md）が
// 生成物として通ること。どちらも「正典が示す形なのに検査が弾く」内部矛盾を防ぐためにある。
//
// 緩和側だけを固定すると「検出しないこと」しかテストしないので、各テストで**故意の違反**を
// 併せて注入し、狭めていない側が現に発火することまで固定する（.claude/rules/checks-and-tests.md）。
// ---------------------------------------------------------------------------

test('V8: skill パッケージの supporting files は管理パス集合の内側として通る', (t) => {
  const ts = tsFor(import.meta.url, 12);
  cleanupTs(t, ts);
  const G = gen(ts);
  const skillDir = path.join(G, '.claude', 'skills', 'demo');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  mkdirSync(path.join(out(ts), 'deploy'), { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo\ndescription: Demo skill.\n---\nテンプレートは [template.md](./template.md)。\n'
  );
  writeFileSync(path.join(skillDir, 'template.md'), '# テンプレート\nfrontmatter を持たない supporting file。\n');
  writeFileSync(path.join(skillDir, 'examples', 'sample.md'), '# 出力例\n');
  writeFileSync(path.join(skillDir, 'scripts', 'validate.mjs'), 'process.exit(0);\n');
  writeDesignMap(ts, ['demo']);
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'deploy', 'managed-paths.list'),
    '.claude/skills/demo/SKILL.md\n.claude/skills/demo/template.md\n' +
      '.claude/skills/demo/examples/sample.md\n.claude/skills/demo/scripts/validate.mjs\n'
  );
  const r = v8(ts);
  assert.equal(r.ok, true, `supporting files は管理パス集合の内側: ${r.violations.join(' / ')}`);
});

test('V8: .claude/hooks/ の hook ハンドラ実体は管理パス集合内、.claude 外の hooks/ は依然違反', (t) => {
  const ts = tsFor(import.meta.url, 13);
  cleanupTs(t, ts);
  const G = gen(ts);
  skill(ts, 's');
  writeDesignMap(ts);
  mkdirSync(path.join(G, '.claude', 'hooks'), { recursive: true });
  mkdirSync(path.join(out(ts), 'deploy'), { recursive: true });
  // canon-reference features/hooks.md の公式の例と同じ配置。
  writeFileSync(path.join(G, '.claude', 'hooks', 'block-rm.sh'), '#!/bin/bash\nexit 0\n');
  writeFileSync(
    path.join(G, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Bash',
              hooks: [{ type: 'command', command: '${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh', timeout: 10 }],
            },
          ],
        },
      },
      null,
      2
    )
  );
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'deploy', 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.claude/settings.json\n.claude/hooks/block-rm.sh\n'
  );

  assert.equal(v8(ts).ok, true, '正典の公式例どおりの hook 配置が集合内であること');

  // 故意の違反注入: `.claude/` の外の hooks/ は管理パス集合外のまま（集合を広げすぎていない証明）。
  mkdirSync(path.join(G, 'hooks'), { recursive: true });
  writeFileSync(path.join(G, 'hooks', 'stray.sh'), '#!/bin/bash\nexit 0\n');
  const r = v8(ts);
  assert.equal(r.ok, false, '.claude/ 外の hooks/ まで管理対象にしてはならない');
  assert.ok(r.violations.some((v) => v.includes('hooks/stray.sh')), r.violations.join(' / '));
});

test('V8: AGENTS.md・commands・output-styles は管理パス集合内、サブディレクトリの AGENTS.md は集合外', (t) => {
  const ts = tsFor(import.meta.url, 14);
  cleanupTs(t, ts);
  const G = gen(ts);
  skill(ts, 's');
  writeDesignMap(ts);
  mkdirSync(path.join(G, '.claude', 'commands'), { recursive: true });
  mkdirSync(path.join(G, '.claude', 'output-styles'), { recursive: true });
  mkdirSync(path.join(out(ts), 'deploy'), { recursive: true });
  writeFileSync(path.join(G, 'AGENTS.md'), '# agents\n');
  writeFileSync(path.join(G, '.claude', 'commands', 'deploy.md'), '---\ndescription: d\n---\nデプロイする\n');
  writeFileSync(path.join(G, '.claude', 'output-styles', 'terse.md'), '---\nname: terse\ndescription: t\n---\n短く答える\n');
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'deploy', 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\nAGENTS.md\n.claude/commands/deploy.md\n.claude/output-styles/terse.md\n'
  );
  assert.equal(v8(ts).ok, true, v8(ts).violations.join(' / '));

  // 故意の違反注入: サブディレクトリの AGENTS.md は集合外のまま
  mkdirSync(path.join(G, 'sub'), { recursive: true });
  writeFileSync(path.join(G, 'sub', 'AGENTS.md'), '# sub\n');
  const r = v8(ts);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('sub/AGENTS.md')), r.violations.join(' / '));
});

// ---- MANIFEST ⇔ generated/ と design-map ⇒ generated/ ----

/** V8 が他の項目で落ちないよう、最小の正常な出力（skill 1件・design-map・list）を用意する。 */
function baseline(t, n) {
  const ts = tsFor(import.meta.url, n);
  cleanupTs(t, ts);
  skill(ts, 's');
  writeDesignMap(ts);
  mkdirSync(path.join(out(ts), 'deploy'), { recursive: true });
  writeFileSync(path.join(out(ts), 'deploy', 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  return ts;
}
const violationsOf = (ts) => v8(ts).violations.join('\n');

test('V8 MANIFEST: 全ファイル節が無ければ違反（存在だけを見ると1行欠落が通過する）', (t) => {
  const ts = baseline(t, 40);
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n新規1件\n');
  assert.match(violationsOf(ts), /全ファイル/);
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '');
  assert.match(violationsOf(ts), /全ファイル/);
});

test('V8 MANIFEST（違反注入）: 実ファイルが1件 MANIFEST に載っていなければ検出する', (t) => {
  const ts = baseline(t, 41);
  skill(ts, 'extra'); // generated/ には2件あるが
  writeFileSync(path.join(out(ts), 'deploy', 'managed-paths.list'), '.claude/skills/s/SKILL.md\n.claude/skills/extra/SKILL.md\n');
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n'); // MANIFEST は1件だけ
  assert.match(violationsOf(ts), /skills\/extra\/SKILL\.md が MANIFEST の全ファイル節に載っていない/);
});

test('V8 MANIFEST（違反注入）: MANIFEST に実在しないファイルが載っていれば検出する', (t) => {
  const ts = baseline(t, 42);
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n- `.claude/skills/ghost/SKILL.md`\n');
  assert.match(violationsOf(ts), /ghost\/SKILL\.md" が generated\/ に実在しない/);
});

test('V8 design-map（違反注入）: 宣言した成果物が generated/ に無ければ検出し、retire 注記と実在するものは要求しない', (t) => {
  const ts = baseline(t, 43);
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    [
      '# dm',
      '## skills',
      '### `.claude/skills/s/SKILL.md`（新規）',
      '### `.claude/skills/dropped/SKILL.md`（新規）', // 脱落したファイル
      '### `.claude/skills/old/SKILL.md`（retire）', // 廃止は generated/ に無くてよい
      '## subagents',
      '### `lost-agent`', // 名前だけの見出し → .claude/agents/lost-agent/lost-agent.md
      '',
    ].join('\n')
  );
  const v = violationsOf(ts);
  assert.match(v, /skills\/dropped\/SKILL\.md/);
  assert.match(v, /agents\/lost-agent\/lost-agent\.md/);
  assert.doesNotMatch(v, /skills\/old\/SKILL\.md/, 'retire 注記の成果物は generated/ に無くてよい');
  assert.doesNotMatch(v, /skills\/s\/SKILL\.md が/, '実在するものを違反にしない');
});

test('V8 design-map: 宣言がすべて実在すれば通過（対照。上の違反が vacuous でない証拠）', (t) => {
  const ts = baseline(t, 44);
  writeManifest(ts);
  writeFileSync(path.join(out(ts), 'design-map.md'), '# dm\n## skills\n### `.claude/skills/s/SKILL.md`（新規）\n');
  assert.equal(v8(ts).ok, true, violationsOf(ts));
});

test('V8 design-map: 括弧書き付きの機能見出し（## skills（builder））からも宣言を拾い、脱落を検出する', (t) => {
  // designer は `## rules（builder）` のように括弧書きを付けて書く。完全一致だけだと宣言0件で vacuous pass する。
  const ts = baseline(t, 45);
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    ['# dm', '## skills（builder）', '### `.claude/skills/s/SKILL.md`（新規）', '### `.claude/skills/dropped/SKILL.md`（新規）', ''].join('\n')
  );
  const v = violationsOf(ts);
  assert.match(v, /skills\/dropped\/SKILL\.md（skills の見出し）/);
  assert.doesNotMatch(v, /機能の節/);
});

test('V8 design-map（違反注入）: 機能の節が無いのに新規の生成物があれば違反。disposition だけの設計は通す', (t) => {
  const ts = baseline(t, 46);
  writeManifest(ts);
  writeFileSync(path.join(out(ts), 'design-map.md'), '# dm\n## スキル群\n### `.claude/skills/s/SKILL.md`（新規）\n');
  assert.match(violationsOf(ts), /機能の節/);
  // 対照: 生成物が disposition（keep/modify）だけなら機能の節が無くてよい
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    '# dm\n## 既存判定\n```yaml\nexisting_disposition:\n  - path: .claude/skills/s/SKILL.md\n    disposition: modify\n    interface_change: none\n```\n'
  );
  assert.doesNotMatch(violationsOf(ts), /機能の節/);
});

test('V8 managed-paths.list（違反注入）: generated/ にあるのに list に無いファイルは違反（配置されない生成物）', (t) => {
  const ts = baseline(t, 47);
  skill(ts, 'unlisted'); // generated/ に置いたが managed-paths.list には載せない
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n- `.claude/skills/unlisted/SKILL.md`\n');
  assert.match(violationsOf(ts), /generated\/\.claude\/skills\/unlisted\/SKILL\.md が managed-paths\.list に載っていない/);
});
