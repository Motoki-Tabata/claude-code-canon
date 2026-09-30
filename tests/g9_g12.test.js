/**
 * G9（スナップショット完全性）・G12（per-file 権威再検証）の回帰テスト。
 * 一意な <ts> で実 output/ を使い、各テストで掃除する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkG9 } from '../gates/g9_snapshot_completeness.js';
import { checkG12, findToolCallFragments } from '../gates/g12_output_perfile.js';
import { ROOT, outputDir, genDir } from './helpers/paths.js';
import { cleanupTs } from './helpers/fixtures.js';
import { writeSkill, writeAgent, writeManifest } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const out = outputDir;
const gen = genDir;
const skill = (ts, name, extra = '') => writeSkill(gen(ts), name, { extra });

// ---- G12 ----
test('G12: output ツリー不在は違反（vacuous pass 防止）', (t) => {
  const ts = tsFor(import.meta.url, 1);
  cleanupTs(t, ts);
  assert.equal(checkG12({ ts }).ok, false, 'generated/ 不在を合格にしてはならない');
});

test('G12: 生成物の旧称ツール（Task）を G5 再検査で捕まえる', (t) => {
  const ts = tsFor(import.meta.url, 2);
  cleanupTs(t, ts);
  const d = path.join(gen(ts), '.claude', 'agents', 'w');
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'w.md'), '---\nname: w\ndescription: x\ntools: Read Task\n---\n本文\n');
  const r = checkG12({ ts });
  assert.equal(r.ok, false, '旧称 Task を含む生成物は違反');
  assert.equal(r.scanned, 1);
});

test('G12: 正常な生成物は通過', (t) => {
  const ts = tsFor(import.meta.url, 3);
  cleanupTs(t, ts);
  skill(ts, 's');
  assert.equal(checkG12({ ts }).ok, true);
});

test('G9: managed-paths.list の集合外パス混入は違反（§10.1 破壊防止）', (t) => {
  const ts = tsFor(import.meta.url, 6);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(
    path.join(dep, 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.github/workflows/ci.yml\n'
  );
  const r = checkG9({ ts });
  assert.equal(r.ok, false, '集合外パスは不可侵領域を破壊しうる');
  assert.ok(r.violations.some((v) => v.includes('.github/workflows/ci.yml')));
});

test('G9: generated/ の集合外ファイル型（.yml）を検出する', (t) => {
  const ts = tsFor(import.meta.url, 7);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  mkdirSync(path.join(gen(ts), '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(gen(ts), '.github', 'workflows', 'ci.yml'), 'x\n');
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  const r = checkG9({ ts });
  assert.equal(r.ok, false, '型で絞ると .yml が逃げる。全型を見ること');
  assert.ok(r.violations.some((v) => v.includes('ci.yml')));
});

test('G9: 集合内のみ・MANIFEST 有・managed-paths 有 → 通過', (t) => {
  const ts = tsFor(import.meta.url, 8);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  assert.equal(checkG9({ ts }).ok, true);
});

test('G9: managed-paths.list の glob 行は違反（deploy が展開せず rolled-back になる・S1-1）', (t) => {
  // 実測（ライブ run 20260909_003820）: glob 行は isManaged のパターンに `**` が `.+` として
  // マッチするため集合内包検査を素通りし、配置の --confirm で初めて
  // 「output に配置対象が無い: .claude/rules/**」で rolled-back になった。
  const ts = tsFor(import.meta.url, 18);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/**\n');
  const r = checkG9({ ts });
  assert.equal(r.ok, false, 'glob 行を生成段階で止めないと配置まで持ち越される');
  assert.ok(r.violations.some((v) => v.includes('glob 記法')));
});

test('G9: managed-paths.list に列挙したのに generated/ に無いパスは違反', (t) => {
  const ts = tsFor(import.meta.url, 19);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(
    path.join(dep, 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.claude/agents/ghost/ghost.md\n'
  );
  const r = checkG9({ ts });
  assert.equal(r.ok, false, '列挙したのに生成していないパスは配置時に必ず落ちる');
  assert.ok(r.violations.some((v) => v.includes('ghost.md') && v.includes('実在しない')));
});

test('G9: retired.list の glob 行は違反（G8・pre-deploy が完全一致で参照するため）', (t) => {
  const ts = tsFor(import.meta.url, 20);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  writeFileSync(path.join(dep, 'retired.list'), '.claude/skills/old/**\n');
  const r = checkG9({ ts });
  assert.equal(r.ok, false, 'glob の廃止宣言は完全一致に当たらず黙って無効になる');
  assert.ok(r.violations.some((v) => v.includes('retired.list')));
});

test('G9: 実ファイル1行1件の list は通過する（緩めすぎていないことの対）', (t) => {
  const ts = tsFor(import.meta.url, 21);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeManifest(ts);
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  writeFileSync(path.join(dep, 'retired.list'), '.claude/skills/old/SKILL.md\n');
  assert.equal(checkG9({ ts }).ok, true, '正しい形式まで落とすと生成が回らない');
});

// ---- 構造 e2e: 完全な生成物一式（CLAUDE.md・Rules・Skill・Agent・README・MANIFEST）----
test('構造 e2e: 完全な生成物は G7/G9/G12 を全通過する', async (t) => {
  const ts = tsFor(import.meta.url, 9);
  cleanupTs(t, ts);
  const G = gen(ts);
  mkdirSync(path.join(G, '.claude', 'skills', 'todo-helper'), { recursive: true });
  mkdirSync(path.join(G, '.claude', 'agents', 'reviewer'), { recursive: true });
  mkdirSync(path.join(G, '.claude', 'rules'), { recursive: true });
  mkdirSync(path.join(out(ts), '.deploy'), { recursive: true });

  writeFileSync(path.join(G, 'CLAUDE.md'), '# c\nESM。\n');
  writeFileSync(path.join(G, '.claude', 'rules', 'esm.md'), '---\npaths: src/**/*.js\n---\nESM。\n');
  writeFileSync(
    path.join(G, '.claude', 'skills', 'todo-helper', 'SKILL.md'),
    '---\nname: todo-helper\ndescription: Scaffold a todo endpoint.\n---\n本文\n'
  );
  writeFileSync(
    path.join(G, '.claude', 'agents', 'reviewer', 'reviewer.md'),
    '---\nname: reviewer\ndescription: Review changes. Delegate on PR.\ntools: Read Grep Glob\nmodel: sonnet\n---\n本文\n'
  );
  writeFileSync(
    path.join(G, '.claude', 'README.md'),
    // §12.4: listed な Skill は `/名前` を書く。Subagent（reviewer）・Rule（esm）には書かない。
    '# 使い方\n`/todo-helper` で起動。reviewer エージェント・esm ルールは自動。\n'
  );
  writeManifest(ts, { extra: '新規4件\n' });
  writeFileSync(
    path.join(out(ts), '.deploy', 'managed-paths.list'),
    'CLAUDE.md\n.claude/rules/esm.md\n.claude/skills/todo-helper/SKILL.md\n.claude/agents/reviewer/reviewer.md\n.claude/README.md\n'
  );

  const { checkG7 } = await import('../gates/g7_ref_integrity.js');
  assert.equal(checkG7({ ts }).ok, true, 'G7');
  assert.equal(checkG9({ ts }).ok, true, 'G9');
  assert.equal(checkG12({ ts }).ok, true, 'G12');
});

test('G12: CLAUDE.md と README.md に agent/skill スキーマを誤適用しない', (t) => {
  const ts = tsFor(import.meta.url, 10);
  cleanupTs(t, ts);
  const G = gen(ts);
  mkdirSync(path.join(G, '.claude'), { recursive: true });
  writeFileSync(path.join(G, 'CLAUDE.md'), '# c\n本文\n'); // frontmatter なし L1
  writeFileSync(path.join(G, '.claude', 'README.md'), '# 使い方\n');
  // これらは kind=unknown だが既知の非スキーマファイルなので G12 は素通りすべき
  const r = checkG12({ ts });
  assert.equal(r.ok, true, 'CLAUDE.md/README.md を種別不明として弾いてはならない');
});

test('G12: agents/ 直下の想定外 .md（誤配置）は逆に flag する（vacuous pass 防止）', (t) => {
  const ts = tsFor(import.meta.url, 11);
  cleanupTs(t, ts);
  const d = path.join(gen(ts), '.claude', 'agents', 'reviewer');
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'reviewer.md'), '---\nname: reviewer\ndescription: x\ntools: Read\n---\n本文\n');
  writeFileSync(path.join(d, 'notes.md'), '走り書き\n'); // 誤配置の謎 .md
  const r = checkG12({ ts });
  assert.equal(r.ok, false, '定義でない .md を黙って飛ばさない');
  assert.ok(r.violations.some((v) => v.includes('notes.md')));
});

// ---------------------------------------------------------------------------
// skill supporting files（正典 docs/L2_SKILLS.md §2.1）と hook ハンドラ実体（§2.1 L4）が
// 生成物として通ること。どちらも「正典が示す形なのにゲートが弾く」内部矛盾の修正であり、
// 実測は /canon run 20260903_091044（設計者が supporting file を諦め、hook スクリプトを
// .claude/skills/<name>/scripts/ へ退避させた）。
//
// 緩和側だけを固定すると「検出しないこと」しかテストしないので、各テストで**故意の違反**を
// 併せて注入し、狭めていない側が現に発火することまで固定する（.claude/rules/gates-and-tests.md）。
// ---------------------------------------------------------------------------

test('G9/G12: skill パッケージの supporting files は通り、skills ルート直下の孤児 .md は依然違反', (t) => {
  const ts = tsFor(import.meta.url, 12);
  cleanupTs(t, ts);
  const G = gen(ts);
  const skillDir = path.join(G, '.claude', 'skills', 'demo');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  mkdirSync(path.join(out(ts), '.deploy'), { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo\ndescription: Demo skill.\n---\nテンプレートは [template.md](./template.md)。\n'
  );
  writeFileSync(path.join(skillDir, 'template.md'), '# テンプレート\nfrontmatter を持たない supporting file。\n');
  writeFileSync(path.join(skillDir, 'examples', 'sample.md'), '# 出力例\n');
  writeFileSync(path.join(skillDir, 'scripts', 'validate.mjs'), 'process.exit(0);\n');
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), '.deploy', 'managed-paths.list'),
    '.claude/skills/demo/SKILL.md\n.claude/skills/demo/template.md\n' +
      '.claude/skills/demo/examples/sample.md\n.claude/skills/demo/scripts/validate.mjs\n'
  );

  const before = checkG12({ ts });
  assert.equal(before.ok, true, `supporting files は per-file スキーマ検査の対象外: ${before.violations.join(' / ')}`);
  assert.equal(checkG9({ ts }).ok, true, 'supporting files は管理パス集合の内側');

  // 故意の違反注入: skills ルート直下（パッケージ無し）の .md は配置逸脱のまま。
  writeFileSync(path.join(G, '.claude', 'skills', 'orphan.md'), '---\nname: orphan\ndescription: x\n---\n本文\n');
  const after = checkG12({ ts });
  assert.equal(after.ok, false, '緩和が「skills 配下は何でも通る」に化けていないこと');
  assert.ok(
    after.violations.some((v) => v.includes('orphan.md') && v.includes('SKILL.md')),
    `孤児 .md が G3 で検出されること: ${after.violations.join(' / ')}`
  );
});

test('G9: .claude/hooks/ の hook ハンドラ実体は管理パス集合内、.claude 外の hooks/ は依然違反', (t) => {
  const ts = tsFor(import.meta.url, 13);
  cleanupTs(t, ts);
  const G = gen(ts);
  skill(ts, 's');
  mkdirSync(path.join(G, '.claude', 'hooks'), { recursive: true });
  mkdirSync(path.join(out(ts), '.deploy'), { recursive: true });
  // 正典 docs/L4_AUTOMATION.md §2.1 の公式例と同じ配置。
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
    path.join(out(ts), '.deploy', 'managed-paths.list'),
    '.claude/skills/s/SKILL.md\n.claude/settings.json\n.claude/hooks/block-rm.sh\n'
  );

  assert.equal(checkG9({ ts }).ok, true, '正典の公式例どおりの hook 配置が集合内であること');

  // 故意の違反注入: `.claude/` の外の hooks/ は管理パス集合外のまま（集合を広げすぎていない証明）。
  mkdirSync(path.join(G, 'hooks'), { recursive: true });
  writeFileSync(path.join(G, 'hooks', 'stray.sh'), '#!/bin/bash\nexit 0\n');
  const r = checkG9({ ts });
  assert.equal(r.ok, false, '.claude/ 外の hooks/ まで管理対象にしてはならない');
  assert.ok(r.violations.some((v) => v.includes('hooks/stray.sh')), r.violations.join(' / '));
});

// ---- G9: MANIFEST ⇔ generated/（S1-3）と design-map ⇒ generated/（S1-4）----

/** G9 が他の検査で落ちないよう、最小の正常な出力（skill 1件・list・MANIFEST）を用意する。 */
function baseline(t, n) {
  const ts = tsFor(import.meta.url, n);
  cleanupTs(t, ts);
  skill(ts, 's');
  mkdirSync(path.join(out(ts), '.deploy'), { recursive: true });
  writeFileSync(path.join(out(ts), '.deploy', 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  return ts;
}
const violationsOf = (ts) => checkG9({ ts }).violations.join('\n');

test('G9 MANIFEST: 全ファイル節が無ければ違反（存在だけを見ると1行欠落が通過する・S1-3）', (t) => {
  const ts = baseline(t, 40);
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n新規1件\n');
  assert.match(violationsOf(ts), /全ファイル/);
});

test('G9 MANIFEST（違反注入）: 実ファイルが1件 MANIFEST に載っていなければ検出する', (t) => {
  const ts = baseline(t, 41);
  skill(ts, 'extra'); // generated/ には2件あるが
  writeFileSync(path.join(out(ts), '.deploy', 'managed-paths.list'), '.claude/skills/s/SKILL.md\n.claude/skills/extra/SKILL.md\n');
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n'); // MANIFEST は1件だけ
  assert.match(violationsOf(ts), /skills\/extra\/SKILL\.md が MANIFEST の全ファイル節に載っていない/);
});

test('G9 MANIFEST（違反注入）: MANIFEST に実在しないファイルが載っていれば検出する', (t) => {
  const ts = baseline(t, 42);
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n- `.claude/skills/ghost/SKILL.md`\n');
  assert.match(violationsOf(ts), /ghost\/SKILL\.md" が generated\/ に実在しない/);
});

test('G9 design-map（違反注入）: 宣言した成果物が generated/ に無ければ検出し、retire 注記と実在するものは要求しない', (t) => {
  const ts = baseline(t, 43);
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    [
      '# dm',
      '## Skills',
      '### `.claude/skills/s/SKILL.md`（新規）',
      '### `.claude/skills/dropped/SKILL.md`（新規）', // 脱落したファイル
      '### `.claude/skills/old/SKILL.md`（retire）', // 廃止は generated/ に無くてよい
      '## Agents',
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

test('G9 design-map: 宣言がすべて実在すれば通過（対照。上の違反が vacuous でない証拠）', (t) => {
  const ts = baseline(t, 44);
  writeManifest(ts);
  writeFileSync(path.join(out(ts), 'design-map.md'), '# dm\n## Skills\n### `.claude/skills/s/SKILL.md`（新規）\n');
  assert.equal(checkG9({ ts }).ok, true, violationsOf(ts));
});

test('G9 design-map: 括弧書き付きの層見出し（## Skills（skill-builder））からも宣言を拾い、脱落を検出する', (t) => {
  // 実 run の designer は `## L1（l1-builder）` 形式で書く。完全一致だけだと宣言0件で vacuous pass した
  // （run 20260925_004359・20260927_003229）。
  const ts = baseline(t, 45);
  writeManifest(ts);
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    ['# dm', '## Skills（skill-builder）', '### `.claude/skills/s/SKILL.md`（新規）', '### `.claude/skills/dropped/SKILL.md`（新規）', ''].join('\n')
  );
  const v = violationsOf(ts);
  assert.match(v, /skills\/dropped\/SKILL\.md（L2 の見出し）/);
  assert.doesNotMatch(v, /層の節/);
});

test('G9 design-map（違反注入）: 層の節が無いのに新規の生成物があれば違反。disposition だけの設計は通す', (t) => {
  const ts = baseline(t, 46);
  writeManifest(ts);
  writeFileSync(path.join(out(ts), 'design-map.md'), '# dm\n## スキル群\n### `.claude/skills/s/SKILL.md`（新規）\n');
  assert.match(violationsOf(ts), /層の節/);
  // 対照: 生成物が disposition（keep/modify）だけなら層の節が無くてよい
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    '# dm\n## 既存判定（existing_disposition）\n```yaml\nexisting_disposition:\n  - path: .claude/skills/s/SKILL.md\n    disposition: modify\n    interface_change: none\n```\n'
  );
  assert.doesNotMatch(violationsOf(ts), /層の節/);
});

test('G9 managed-paths.list（違反注入）: generated/ にあるのに list に無いファイルは違反（配置されない生成物・S1-3）', (t) => {
  const ts = baseline(t, 47);
  skill(ts, 'unlisted'); // generated/ に置いたが managed-paths.list には載せない
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n\n## 全ファイル\n- `.claude/skills/s/SKILL.md`\n- `.claude/skills/unlisted/SKILL.md`\n');
  assert.match(violationsOf(ts), /generated\/\.claude\/skills\/unlisted\/SKILL\.md が managed-paths\.list に列挙されていない/);
});

test('G12（違反注入）: ツール呼び出しの書式片は本文末尾・frontmatter 直後で違反、コードフェンス内は許す（旧 S1-2）', (t) => {
  assert.deepEqual(findToolCallFragments('---\nname: a\n---\n本文\n</content>\n'), [5], '本文末尾');
  assert.deepEqual(findToolCallFragments('---\nname: a\n---\n</parameter>\n本文\n'), [4], 'frontmatter 直後');
  assert.deepEqual(findToolCallFragments('本文\n```xml\n<parameter name="x">\n</content>\n```\n'), [], 'コードフェンス内は説明の例');

  const ts = tsFor(import.meta.url, 48);
  cleanupTs(t, ts);
  skill(ts, 's', '\n</content>\n');
  const v = checkG12({ ts }).violations.join('\n');
  assert.match(v, /書式片/);
});
