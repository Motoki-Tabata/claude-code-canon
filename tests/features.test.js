/**
 * lib/features.js（12機能と builder の担当の対応）の回帰テスト。
 * 機能の一覧は canon-reference の references/features/*.md が正で、コードに複製した一覧がずれたら落とす。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { REFERENCE_DIR, collection } from '../lib/reference-data.js';
import { FEATURES, UNITS, UNIT_NAMES, OTHER_UNIT, unitOfFeature, featureOfPath, unitOfPath } from '../lib/features.js';

test('FEATURES は references/features/*.md のファイル名と過不足なく一致する', () => {
  const dir = path.join(REFERENCE_DIR, 'references', 'features');
  const onDisk = readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  assert.equal(onDisk.length, 12, '機能ファイルが0件・欠けでは照合が vacuous になる');
  assert.deepEqual([...FEATURES].sort(), onDisk.sort());
});

test('UNITS: 8担当が12機能を重複なく覆う', () => {
  assert.equal(UNIT_NAMES.length, 8);
  const all = UNIT_NAMES.flatMap((u) => UNITS[u]);
  assert.deepEqual([...all].sort(), [...FEATURES].sort());
  assert.equal(unitOfFeature('hooks'), 'settings');
  assert.equal(unitOfFeature('statusline'), 'settings');
  assert.equal(unitOfFeature('plugin-mods'), 'plugins');
  assert.equal(unitOfFeature('nope'), null);
});

test('featureOfPath: paths.json の feature を引き、data に無い管理パスは補完表で引く', () => {
  const cases = {
    'CLAUDE.md': 'claude-md',
    'AGENTS.md': 'claude-md',
    '.claude/rules/a.md': 'rules',
    '.claude/rules/sub/a.md': 'rules', // data は `*.md`＝1セグメント。サブディレクトリは補完表（V-rules-01）
    '.claude/settings.json': 'settings',
    '.mcp.json': 'mcp',
    '.claude/skills/s/SKILL.md': 'skills',
    '.claude/skills/s/scripts/run.sh': 'skills',
    '.claude/commands/c.md': 'skills',
    '.claude/agents/a.md': 'subagents',
    '.claude/agents/a/a.md': 'subagents',
    '.claude/output-styles/o.md': 'output-styles',
    '.claude/hooks/block.sh': 'hooks',
    'plugin/.claude-plugin/plugin.json': 'plugins',
    'plugin/skills/x/SKILL.md': 'plugins', // plugin/ 配下は持ち主（plugins 担当）で束ねる
    '.claude/README.md': null,
    'src/app.js': null,
  };
  for (const [rel, want] of Object.entries(cases)) {
    assert.equal(featureOfPath(rel), want, rel);
  }
});

test('unitOfPath: 担当に属さないパスは other', () => {
  assert.equal(unitOfPath('.claude/hooks/x.sh'), 'settings');
  assert.equal(unitOfPath('plugin/hooks/hooks.json'), 'plugins');
  assert.equal(unitOfPath('.claude/README.md'), OTHER_UNIT);
  assert.equal(unitOfPath('docs/x.md'), OTHER_UNIT);
});

test('project スコープで canon が生成する機能の paths は、すべていずれかの担当に引ける', () => {
  const generated = new Set(UNIT_NAMES.flatMap((u) => UNITS[u]));
  const items = collection('paths:files').items.filter((it) => it.scope === 'project' && it.feature && generated.has(it.feature));
  assert.ok(items.length > 0, '照合対象が0件（vacuous）');
  for (const it of items) {
    // `<subdir>`・`<name>` を具体名に置き換えた例で引く（`*` は 1 文字以上）
    const sample = it.path.replace(/<[^>]+>/g, 'x').replace(/\*/g, 'x');
    if (it.path.endsWith('/')) continue; // ディレクトリ（agent-memory）は生成物のパスにならない
    assert.ok(featureOfPath(sample) !== null, `${it.path}（${sample}）がどの機能にも引けない`);
  }
});

test('generation Skill は、担当ごとの規約 references/<担当>.md を持つ（builder が読む契約）', () => {
  const dir = path.join(REFERENCE_DIR, '..', 'generation', 'references');
  assert.equal(UNIT_NAMES.length, 8, '担当が0件では照合が vacuous になる');
  for (const unit of UNIT_NAMES) assert.ok(existsSync(path.join(dir, `${unit}.md`)), `${unit}.md が無い`);
});
