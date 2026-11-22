/**
 * lib/non-schema.js（非スキーマ .md 判定の SSoT）の回帰テスト。
 *
 * この判定を複数の検査・ツール・テストに独立に複製すると、新しい生成物（README.md）が
 * 初めて実在したとき波及漏れが起きる。
 * このテストは (a) 判定関数そのものの正しさ、(b) 呼び出し側が SSoT を import していること
 * （リテラル重複に戻っていないか）の両方を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isNonSchemaRel, NON_SCHEMA_MD } from '../lib/non-schema.js';
import { ROOT } from './helpers/paths.js';

test('isNonSchemaRel: generated root 基準（.claude/README.md・CLAUDE.md・.claude/settings.json。既定の base）', () => {
  assert.equal(isNonSchemaRel('.claude/README.md', 'generated'), true);
  assert.equal(isNonSchemaRel('CLAUDE.md', 'generated'), true);
  assert.equal(isNonSchemaRel('AGENTS.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/settings.json', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/agents/x/x.md', 'generated'), false);
  assert.equal(isNonSchemaRel('.claude/skills/y/SKILL.md', 'generated'), false);
  assert.equal(isNonSchemaRel('.claude/README.md'), true, '既定 base は generated');
});

test('isNonSchemaRel: claude root 基準（README.md）', () => {
  assert.equal(isNonSchemaRel('README.md', 'claude'), true);
  assert.equal(isNonSchemaRel('agents/x/x.md', 'claude'), false);
  assert.equal(isNonSchemaRel('skills/y/SKILL.md', 'claude'), false);
});

test('isNonSchemaRel: バックスラッシュ区切り（Windows パス）も判定できる', () => {
  assert.equal(isNonSchemaRel('.claude\\README.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude\\agents\\x\\x.md', 'generated'), false);
});

test('isNonSchemaRel: 対象のルートの README.md は generated root 基準でも非スキーマ', () => {
  assert.equal(isNonSchemaRel('README.md', 'generated'), true);
  assert.equal(isNonSchemaRel('docs/README.md', 'generated'), true, '文書の .md は非スキーマ（下の「対象プロジェクトの文書」）');
});

/**
 * 第4の経路: `.claude/` の外で、種別の慣用句ディレクトリを持たない .md は文書。
 * 文書を除外しても、配置の誤りの検出（`.claude/` の中の未知の .md・慣用句の置き違え）は残ること。
 */
test('対象プロジェクトの文書（specs・docs・tasks・入れ子の README）は非スキーマ', () => {
  for (const rel of ['specs/README.md', 'specs/feature-map.md', 'specs/001-x/spec.md', 'tasks/README.md', 'docs/decisions/0002-x.md']) {
    assert.equal(isNonSchemaRel(rel, 'generated'), true, rel);
  }
});

test('文書の除外は広げすぎない: .claude の中の未知の .md と、慣用句ディレクトリの .md は非スキーマでない（故意の違反）', () => {
  assert.equal(isNonSchemaRel('.claude/stray.md', 'generated'), false, '.claude 直下の未知の .md は V1 が弾く');
  assert.equal(isNonSchemaRel('.claude/docs/x.md', 'generated'), false);
  assert.equal(isNonSchemaRel('agents/x.md', 'generated'), false, '.claude の外の agents/ は置き違えとして V1 が弾く');
  assert.equal(isNonSchemaRel('rules/x.md', 'generated'), false);
  assert.equal(isNonSchemaRel('docs/skills/x.md', 'generated'), false, 'skills 慣用句は文書でない');
  assert.equal(isNonSchemaRel('docs/notes.txt', 'generated'), false, '.md 以外は対象外');
});

test('NON_SCHEMA_MD は正準6件のみ（列挙漏れ・過剰の両方を検出）', () => {
  assert.deepEqual(
    [...NON_SCHEMA_MD].sort(),
    ['.claude/README.md', '.claude/settings.json', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'tasks/lessons.md'].sort()
  );
});

test('呼び出し側が SSoT（lib/non-schema.js）を import していること（リテラル重複への回帰防止）', () => {
  const sites = [
    path.join(ROOT, 'lib', 'verify', 'run.js'),
    path.join(ROOT, 'tests', 'self_application.test.js'),
  ];
  for (const f of sites) {
    const src = readFileSync(f, 'utf8');
    assert.match(
      src,
      /from ['"](\.\.\/)+(lib\/)?non-schema\.js['"]/,
      `${path.relative(ROOT, f)} は isNonSchemaRel を lib/non-schema.js から import すること`
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
 * 固定名3件のほかに、パターンでしか書けない非スキーマ領域。
 * どちらも「正典が示す形なのに検査が弾く」内部矛盾を防ぐためにある（V1）。
 */
test('skill パッケージの supporting files は非スキーマ（正典 V-skills-18 が前提にする補助ファイル）', () => {
  assert.equal(isNonSchemaRel('.claude/skills/y/template.md', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/skills/y/examples/sample.md', 'generated'), true);
  assert.equal(isNonSchemaRel('skills/y/template.md', 'claude'), true);
  // 定義ファイル本体は非スキーマではない（V1・V2 の対象であり続ける）。
  assert.equal(isNonSchemaRel('.claude/skills/y/SKILL.md', 'generated'), false);
  // skills ルート直下の孤児は非スキーマではない（V1 が配置逸脱として弾く対象）。
  assert.equal(isNonSchemaRel('.claude/skills/orphan.md', 'generated'), false);
});

test('.claude/hooks/ 配下は非スキーマ（hook ハンドラ実体・canon-reference features/hooks.md）', () => {
  assert.equal(isNonSchemaRel('.claude/hooks/block-rm.sh', 'generated'), true);
  assert.equal(isNonSchemaRel('.claude/hooks/notes.md', 'generated'), true);
  assert.equal(isNonSchemaRel('hooks/block-rm.sh', 'claude'), true);
  // `.claude/` の外の hooks/ は対象外（除外を広げすぎていないこと）。
  assert.equal(isNonSchemaRel('hooks/stray.sh', 'generated'), false);
});
