/**
 * tools/promote.js の乖離検出（computeDivergence・checkDivergence）と
 * tools/stage-candidate.js の --resync-keep（resyncKeep）の回帰テスト。
 * 詳細設計書 §13.2「乖離検出」・§13.2.1「--resync-keep」。
 *
 * 実昇格準備で発見した穴を固定する: stage-candidate.js が候補を取り込んだ後に稼働中
 * .claude/ を直接 hot-fix すると、候補は派生元から静かに乖離する（実測: candidate-readme
 * の self-optimize/SKILL.md が commit 1adede3 の修正前の版のまま残置していた）。従来の
 * promote.js（G13・G3〜G6 のみ）はこれを検出できなかった。
 *
 * すべてスクラッチディレクトリ（node:os tmpdir 配下）で完結し、実リポジトリの
 * .claude/・output/・generations/ には一切触れない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runPromote, computeDivergence, checkDivergence } from '../tools/promote.js';
import { resyncKeep } from '../tools/stage-candidate.js';
import { scratchDir } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const TS = tsFor(import.meta.url, 0);

function fakeRunTestsPass() {
  /* no-op */
}

const AGENT_MD = (label) =>
  `---\nname: foo\ndescription: divergence fixture ${label}\ntools: Read\nmodel: sonnet\n---\n${label}\n`;

/**
 * スクラッチ環境を1つ作る:
 *   scratch/.claude/agents/foo/foo.md            … 「現行世代」（live）
 *   scratch/.claude/agents/foo/foo.md            … disposition=keep 対象
 *   scratch/generations/candidate-<label>/.claude/… 候補（settings.json 付き）
 *   scratch/output/<ts>/design-map.md            … existing_disposition（keep foo.md）
 *   candidate/SOURCE_RUN = <ts>
 */
function makeDivergenceScratch(t, { label = 'demo', liveFooContent = AGENT_MD('live'), candFooContent = AGENT_MD('live') } = {}) {
  const scratch = scratchDir(t, 'canon-promote-divergence-');

  mkdirSync(path.join(scratch, '.claude', 'agents', 'foo'), { recursive: true });
  writeFileSync(path.join(scratch, '.claude', 'agents', 'foo', 'foo.md'), liveFooContent, 'utf8');
  // settings.json は候補・live 双方に同一内容で置く（added/removed の分類テストのノイズにしない）。
  writeFileSync(path.join(scratch, '.claude', 'settings.json'), '{}\n', 'utf8');

  const candClaudeDir = path.join(scratch, 'generations', `candidate-${label}`, '.claude');
  mkdirSync(path.join(candClaudeDir, 'agents', 'foo'), { recursive: true });
  writeFileSync(path.join(candClaudeDir, 'agents', 'foo', 'foo.md'), candFooContent, 'utf8');
  writeFileSync(path.join(candClaudeDir, 'settings.json'), '{}\n', 'utf8');
  writeFileSync(path.join(scratch, 'generations', `candidate-${label}`, 'SOURCE_RUN'), TS + '\n', 'utf8');

  const outputDir = path.join(scratch, 'output', TS);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'design-map.md'),
    [
      '## 既存判定（existing_disposition・§8）',
      '',
      '```yaml',
      'existing_disposition:',
      '  - path: .claude/agents/foo/foo.md',
      '    disposition: keep',
      '    keep_conditions:',
      '      C1_canon_clean: true',
      '      C2_no_requirement_conflict: true',
      '      C3_dependency_healthy: true',
      '      C4_strength_consistent: true',
      '      C5_project_refs_resolved: true',
      '    rationale: "既存のまま維持（keep・verbatim コピー）"',
      '```',
      '',
    ].join('\n'),
    'utf8'
  );

  return { scratch, candClaudeDir, outputDir };
}

// ---------------------------------------------------------------------------
// computeDivergence（純粋な差分算出）
// ---------------------------------------------------------------------------

test('computeDivergence: added/removed/modified を正しく分類する', (t) => {
  const { scratch } = makeDivergenceScratch(t, {
    liveFooContent: AGENT_MD('live-v1'),
    candFooContent: AGENT_MD('cand-v1'),
  });
  // 候補にのみ在る新規ファイルを追加。
  mkdirSync(path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'bar'), { recursive: true });
  writeFileSync(
    path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'bar', 'bar.md'),
    AGENT_MD('bar'),
    'utf8'
  );
  // live にのみ在るファイルを追加（候補が取りこぼした想定）。
  mkdirSync(path.join(scratch, '.claude', 'agents', 'baz'), { recursive: true });
  writeFileSync(path.join(scratch, '.claude', 'agents', 'baz', 'baz.md'), AGENT_MD('baz'), 'utf8');

  const d = computeDivergence(path.join(scratch, 'generations', 'candidate-demo'), scratch);
  assert.deepEqual(d.added, ['.claude/agents/bar/bar.md']);
  assert.deepEqual(d.removed, ['.claude/agents/baz/baz.md']);
  assert.deepEqual(d.modified, ['.claude/agents/foo/foo.md']);
});

test('computeDivergence: 内容が同一なら modified に現れない', (t) => {
  const { scratch } = makeDivergenceScratch(t, { liveFooContent: AGENT_MD('same'), candFooContent: AGENT_MD('same') });
  const d = computeDivergence(path.join(scratch, 'generations', 'candidate-demo'), scratch);
  assert.deepEqual(d.modified, []);
});

// ---------------------------------------------------------------------------
// checkDivergence（design-map と突合した昇格可否判定）
// ---------------------------------------------------------------------------

test('checkDivergence: keep 判定ファイルの乖離は拒否する（実昇格準備の中核発見）', (t) => {
  const { scratch } = makeDivergenceScratch(t, {
    liveFooContent: AGENT_MD('live-hotfixed'), // stage 後に live だけ hot-fix された想定
    candFooContent: AGENT_MD('cand-stale'), // 候補は stage 時点のまま
  });
  const r = checkDivergence({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /keep 判定のファイルが候補と稼働中/);
  assert.deepEqual(r.keepDivergence, ['.claude/agents/foo/foo.md']);
});

test('checkDivergence: modify/新規相当（design-map に keep 記載が無いファイル）の差分は問題にしない', (t) => {
  const { scratch } = makeDivergenceScratch(t, { liveFooContent: AGENT_MD('live'), candFooContent: AGENT_MD('live') });
  // foo.md は同一のまま。候補にだけ新規ファイル（modify/新規相当・design-map に記載なし）を追加。
  mkdirSync(path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'newone'), { recursive: true });
  writeFileSync(
    path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'newone', 'newone.md'),
    AGENT_MD('newone'),
    'utf8'
  );
  const r = checkDivergence({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.divergence.added, ['.claude/agents/newone/newone.md']);
});

test('checkDivergence: SOURCE_RUN 不在は「乖離なし」と読まず拒否する（vacuous pass 封鎖）', (t) => {
  const { scratch } = makeDivergenceScratch(t);
  rmSync(path.join(scratch, 'generations', 'candidate-demo', 'SOURCE_RUN'));
  const r = checkDivergence({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /SOURCE_RUN/);
});

test('checkDivergence: design-map.md 不在は「乖離なし」と読まず拒否する（vacuous pass 封鎖）', (t) => {
  const { scratch, outputDir } = makeDivergenceScratch(t);
  rmSync(path.join(outputDir, 'design-map.md'));
  const r = checkDivergence({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /design-map\.md/);
});

// ---------------------------------------------------------------------------
// runPromote との統合（--accept-divergence・--dry-run の差分表）
// ---------------------------------------------------------------------------

test('runPromote: keep 乖離があれば拒否し、--accept-divergence で明示上書きできる', (t) => {
  const { scratch } = makeDivergenceScratch(t, {
    liveFooContent: AGENT_MD('live-hotfixed'),
    candFooContent: AGENT_MD('cand-stale'),
  });
  const rejected = runPromote({
    label: 'demo',
    canonRoot: scratch,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
    dryRun: true,
  });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.keepDivergence.includes('.claude/agents/foo/foo.md'));

  const accepted = runPromote({
    label: 'demo',
    canonRoot: scratch,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
    dryRun: true,
    acceptDivergence: true,
  });
  assert.equal(accepted.ok, true, accepted.reason);
});

test('runPromote: --dry-run は成功でも拒否でも divergence レポートを結果に含める', (t) => {
  const { scratch } = makeDivergenceScratch(t, { liveFooContent: AGENT_MD('live'), candFooContent: AGENT_MD('live') });
  const r = runPromote({
    label: 'demo',
    canonRoot: scratch,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
    dryRun: true,
  });
  assert.equal(r.ok, true, r.reason);
  assert.ok(r.divergence, 'divergence レポートが結果に含まれること');
  assert.deepEqual(r.divergence.modified, []);
});

// ---------------------------------------------------------------------------
// stage-candidate.js --resync-keep（resyncKeep）
// ---------------------------------------------------------------------------

test('resyncKeep: keep 判定ファイルのうち乖離しているものだけを live → 候補へ再同期する', (t) => {
  const { scratch, candClaudeDir } = makeDivergenceScratch(t, {
    liveFooContent: AGENT_MD('live-hotfixed'),
    candFooContent: AGENT_MD('cand-stale'),
  });
  const r = resyncKeep({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.resynced, ['.claude/agents/foo/foo.md']);
  assert.equal(
    readFileSync(path.join(candClaudeDir, 'agents', 'foo', 'foo.md'), 'utf8'),
    AGENT_MD('live-hotfixed'),
    '候補側が live の内容へ再同期されていること'
  );

  // 再同期後は乖離が解消していること（promote --dry-run が通る）。
  const after = checkDivergence({ label: 'demo', canonRoot: scratch });
  assert.equal(after.ok, true, after.reason);
});

test('resyncKeep: 乖離が無ければ何もしない（0件で成功）', (t) => {
  const { scratch } = makeDivergenceScratch(t, { liveFooContent: AGENT_MD('same'), candFooContent: AGENT_MD('same') });
  const r = resyncKeep({ label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.resynced, []);
});

test('resyncKeep: 候補へ書ける対象は既存の候補のみ（存在しない label は拒否）', (t) => {
  const { scratch } = makeDivergenceScratch(t);
  const r = resyncKeep({ label: 'no-such-candidate', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /存在しない/);
});
