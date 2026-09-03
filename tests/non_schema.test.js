/**
 * gates/lib/non-schema.js（非スキーマ .md 判定の SSoT）の回帰テスト。
 * 詳細設計書 §11.4（実昇格準備2 フェーズ0 で確定）。
 *
 * 従来この判定は `gates/g12_output_perfile.js`（KNOWN_NON_SCHEMA）・
 * `gates/g10_readme.js`（インライン比較）・`tools/promote.js`（KNOWN_NON_SCHEMA）・
 * `tests/self_application.test.js`（walkMd/walkMdFs の2姉妹関数）に独立に複製されており、
 * 新しい生成物（README.md）が初めて実在した機能Y ライブ e2e で波及漏れを2度起こした
 * （L027: g12→promote/tests への波及漏れ／L029: 同一ファイル内の姉妹関数への波及漏れ）。
 * このテストは (a) 判定関数そのものの正しさ、(b) 呼び出し側が SSoT を import していること
 * （リテラル重複に戻っていないか）の両方を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isNonSchemaRel, NON_SCHEMA_MD } from '../gates/lib/non-schema.js';
import { ROOT } from './helpers/paths.js';

test('isNonSchemaRel: generated root 基準（.claude/README.md・CLAUDE.md・.claude/settings.json）', () => {
  assert.equal(isNonSchemaRel('.claude/README.md', 'generated'), true);
  assert.equal(isNonSchemaRel('CLAUDE.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/settings.json', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/agents/x/x.md', 'generated'), false);
  assert.equal(isNonSchemaRel('.claude/skills/y/SKILL.md', 'generated'), false);
});

test('isNonSchemaRel: claude root 基準（README.md）', () => {
  assert.equal(isNonSchemaRel('README.md', 'claude'), true);
  assert.equal(isNonSchemaRel('agents/x/x.md', 'claude'), false);
  assert.equal(isNonSchemaRel('skills/y/SKILL.md', 'claude'), false);
});

test('isNonSchemaRel: 既定 base は generated', () => {
  assert.equal(isNonSchemaRel('.claude/README.md'), true);
});

test('isNonSchemaRel: バックスラッシュ区切り（Windows パス）も判定できる', () => {
  assert.equal(isNonSchemaRel('.claude\\README.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude\\agents\\x\\x.md', 'generated'), false);
});

test('NON_SCHEMA_MD は正準3件のみ（列挙漏れ・過剰の両方を検出）', () => {
  assert.deepEqual(
    [...NON_SCHEMA_MD].sort(),
    ['.claude/README.md', '.claude/settings.json', 'CLAUDE.md'].sort()
  );
});

test('呼び出し側4ファイルが SSoT（gates/lib/non-schema.js）を import していること（リテラル重複への回帰防止）', () => {
  const sites = [
    path.join(ROOT, 'gates', 'g12_output_perfile.js'),
    path.join(ROOT, 'gates', 'g10_readme.js'),
    path.join(ROOT, 'tools', 'promote.js'),
    path.join(ROOT, 'tests', 'self_application.test.js'),
  ];
  for (const f of sites) {
    const src = readFileSync(f, 'utf8');
    assert.match(
      src,
      /from ['"](\.\.\/)?gates\/lib\/non-schema\.js['"]|from ['"]\.\/lib\/non-schema\.js['"]/,
      `${path.relative(ROOT, f)} は isNonSchemaRel を gates/lib/non-schema.js から import すること`
    );
    // 旧リテラル定義（KNOWN_NON_SCHEMA = new Set([...])）が復活していないこと。
    assert.doesNotMatch(
      src,
      /const KNOWN_NON_SCHEMA = new Set\(/,
      `${path.relative(ROOT, f)} にリテラル重複の KNOWN_NON_SCHEMA が復活していないこと`
    );
  }
});

/**
 * 固定名3件のほかに、パターンでしか書けない非スキーマ領域（2026-09-03 追加）。
 * どちらも「正典が示す形なのにゲートが弾く」内部矛盾の修正に伴う（詳細設計書 §11.2・§11.4）。
 */
test('skill パッケージの supporting files は非スキーマ（正典 L2_SKILLS.md §2.1 の明示的許可）', () => {
  assert.equal(isNonSchemaRel('.claude/skills/y/template.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/skills/y/examples/sample.md', 'generated'), true);
  assert.equal(isNonSchemaRel('skills/y/template.md', 'claude'), true);
  // 定義ファイル本体は非スキーマではない（G3/G4 の対象であり続ける）。
  assert.equal(isNonSchemaRel('.claude/skills/y/SKILL.md', 'generated'), false);
  // skills ルート直下の孤児は非スキーマではない（G3 が配置逸脱として弾く対象）。
  assert.equal(isNonSchemaRel('.claude/skills/orphan.md', 'generated'), false);
});

test('.claude/hooks/ 配下は非スキーマ（hook ハンドラ実体・docs/L4_AUTOMATION.md §2.1）', () => {
  assert.equal(isNonSchemaRel('.claude/hooks/block-rm.sh', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/hooks/notes.md', 'generated'), true);
  assert.equal(isNonSchemaRel('hooks/block-rm.sh', 'claude'), true);
  // `.claude/` の外の hooks/ は対象外（除外を広げすぎていないこと）。
  assert.equal(isNonSchemaRel('hooks/stray.sh', 'generated'), false);
});
