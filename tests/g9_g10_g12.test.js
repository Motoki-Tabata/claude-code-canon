/**
 * G9（スナップショット完全性）・G10（README 整合）・G12（per-file 権威再検証）の回帰テスト。
 * 一意な <ts> で実 output/ を使い、各テストで掃除する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkG9 } from '../gates/g9_snapshot_completeness.js';
import { checkG10, deriveLaunchMethod } from '../gates/g10_readme.js';
import { checkG12 } from '../gates/g12_output_perfile.js';
import { ROOT, outputDir, genDir } from './helpers/paths.js';
import { cleanupTs } from './helpers/run-state.js';
import { writeSkill } from './helpers/fixtures.js';
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

// ---- G10 ----
test('G10 導出ルール: user-invocable:false は internal（非露出）', () => {
  assert.deepEqual(deriveLaunchMethod('skill', { 'user-invocable': { value: false } }), {
    method: 'internal',
    listed: false,
  });
  assert.equal(deriveLaunchMethod('skill', { 'disable-model-invocation': { value: true } }).method, 'slash-only');
  assert.equal(deriveLaunchMethod('agent', {}).method, 'delegated');
});

test('G10: 網羅性欠落は違反、内部専用の露出も違反、両立時は通過', (t) => {
  const ts = tsFor(import.meta.url, 4);
  cleanupTs(t, ts);
  skill(ts, 'pub');
  skill(ts, 'internal', 'user-invocable: false\n');
  const readme = path.join(gen(ts), '.claude', 'README.md');

  // pub 未記載 → 網羅性違反
  writeFileSync(readme, '# 使い方\n（空）\n');
  assert.equal(checkG10({ ts }).ok, false, 'pub 未記載は網羅性違反');

  // internal 露出 → 違反
  writeFileSync(readme, '# 使い方\npub と internal\n');
  const r2 = checkG10({ ts });
  assert.equal(r2.ok, false, 'internal 露出は違反');
  assert.ok(r2.violations.some((v) => v.includes('internal')));

  // pub 記載・internal 非記載 → 通過
  writeFileSync(readme, '# 使い方\npub を使えます\n');
  assert.equal(checkG10({ ts }).ok, true);
});

test('G10: README 不在は違反', (t) => {
  const ts = tsFor(import.meta.url, 5);
  cleanupTs(t, ts);
  skill(ts, 's');
  assert.equal(checkG10({ ts }).ok, false);
});

// ---- G9 ----
test('G9: managed-paths.list の集合外パス混入は違反（§10.1 破壊防止）', (t) => {
  const ts = tsFor(import.meta.url, 6);
  cleanupTs(t, ts);
  skill(ts, 's');
  const dep = path.join(out(ts), '.deploy');
  mkdirSync(dep, { recursive: true });
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n');
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
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n');
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
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n');
  writeFileSync(path.join(dep, 'managed-paths.list'), '.claude/skills/s/SKILL.md\n');
  assert.equal(checkG9({ ts }).ok, true);
});

// ---- 構造 e2e: 完全な生成物一式（CLAUDE.md・Rules・Skill・Agent・README・MANIFEST）----
test('構造 e2e: 完全な生成物は G7/G9/G10/G12 を全通過する', async (t) => {
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
    '# 使い方\ntodo-helper スキル・reviewer エージェント・esm ルール。\n'
  );
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# MANIFEST\n新規4件\n');
  writeFileSync(
    path.join(out(ts), '.deploy', 'managed-paths.list'),
    'CLAUDE.md\n.claude/rules/esm.md\n.claude/skills/todo-helper/SKILL.md\n.claude/agents/reviewer/reviewer.md\n.claude/README.md\n'
  );

  const { checkG7 } = await import('../gates/g7_ref_integrity.js');
  assert.equal(checkG7({ ts }).ok, true, 'G7');
  assert.equal(checkG9({ ts }).ok, true, 'G9');
  assert.equal(checkG10({ ts }).ok, true, 'G10');
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
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n');
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
  writeFileSync(path.join(out(ts), 'MANIFEST.md'), '# 差分\n');
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
