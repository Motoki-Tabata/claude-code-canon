/**
 * gates/lib/managed-paths.js（管理パス集合 SSoT・§10.1）のユニットテスト。
 * G9 と deploy が本 lib を共有する（G9 はローカル定義を持たず import する＝構造で SSoT を担保）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  MANAGED_PATTERNS,
  isManaged,
  normalizeRel,
  parseListText,
  walkManaged,
  sha256File,
} from '../gates/lib/managed-paths.js';
import { sampleRepoDir as fixtureCase } from './helpers/fixtures.js';

test('MANAGED_PATTERNS: base 集合の10パターン（§10.1）', () => {
  // 9 → 10: `.claude/hooks/**`（hook ハンドラ実体）を追加（2026-09-03・§10.1）。
  // 件数を固定するのは、集合の拡大が「気づかれずに」起きないようにするため——集合が
  // 広がることは退避スワップが破壊しうる範囲が広がることと同義である（§10.1 の単一障害点）。
  assert.equal(MANAGED_PATTERNS.length, 10);
});

test('isManaged: 集合内は true', () => {
  for (const rel of [
    'CLAUDE.md',
    '.claude/rules/esm.md',
    '.claude/skills/s/SKILL.md',
    '.claude/agents/a/a.md',
    '.claude/settings.json',
    '.claude/README.md',
    '.claude/EXTRA.md',
    '.claude/hooks/block-rm.sh',
    '.claude/hooks/nested/format.mjs',
    '.mcp.json',
    'plugin/x.js',
  ]) {
    assert.equal(isManaged(rel), true, rel);
  }
});

test('isManaged: 集合外（不可侵）は false', () => {
  for (const rel of [
    '.github/workflows/ci.yml',
    'CODEOWNERS',
    'hooks/stray.sh', // `.claude/` の外の hooks/ は集合外のまま（拡張しすぎていないこと）
    '.claude/hooks', // ディレクトリ自身は対象外（`.+` が要る）
    'src/.claude/hooks/x.sh', // 集合パターンは先頭アンカー。サブツリーの同名は拾わない
    'src/app.js',
    'package.json',
    '.claude-canon.bak.20260722_000000/CLAUDE.md',
    'expected-output/generated/CLAUDE.md',
  ]) {
    assert.equal(isManaged(rel), false, rel);
  }
});

test('normalizeRel: バックスラッシュ→スラッシュ・先頭 ./ 除去・trim', () => {
  assert.equal(normalizeRel('  .claude\\skills\\s\\SKILL.md '), '.claude/skills/s/SKILL.md');
  assert.equal(normalizeRel('./CLAUDE.md'), 'CLAUDE.md');
});

test('parseListText: # コメント・空行を除去し正規化する（G9 従来挙動と同一）', () => {
  const text = '# コメント\nCLAUDE.md\n\n  .claude/skills/s/SKILL.md \n./x.md\n.claude\\a\\b.md\n';
  assert.deepEqual(parseListText(text), [
    'CLAUDE.md',
    '.claude/skills/s/SKILL.md',
    'x.md',
    '.claude/a/b.md',
  ]);
});

test('walkManaged: 対象配下の管理ファイルのみ列挙（集合外・expected-output を除外）', () => {
  const got = walkManaged(fixtureCase('existing'));
  assert.deepEqual(got, [
    '.claude/skills/kept-skill/SKILL.md',
    '.claude/skills/legacy-skill/SKILL.md',
    '.claude/skills/merge-a/SKILL.md',
    '.claude/skills/merge-b/SKILL.md',
    'CLAUDE.md',
  ]);
});

test('sha256File: keep 対象は target と expected-output でバイト同一（非退行の前提）', () => {
  const a = sha256File(path.join(fixtureCase('existing'), '.claude/skills/kept-skill/SKILL.md'));
  const b = sha256File(
    path.join(fixtureCase('existing'), 'expected-output/generated/.claude/skills/kept-skill/SKILL.md')
  );
  assert.equal(a, b, 'keep は verbatim コピーゆえ sha256 が一致していなければならない');
});
