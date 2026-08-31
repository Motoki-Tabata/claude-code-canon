/**
 * advance-guard の PostToolUse per-file 配線（G3〜G6 助言ラッチ）の回帰テスト。
 * 詳細設計書 §11.1・§11.3。
 *
 * PostToolUse はブロック不可なので、書かれた generated/** ファイルへ per-file ゲートを
 * best-effort で当て、明確な違反があれば gen.blocked を鋳造する（＝次の PreToolUse が
 * generated/** への前進書込を deny する）。権威判定は停止時の G12 が再実行する。
 *
 * 分類・検査は G12 の advisoryReverifyFile() に一本化しているため（SSoT）、ここでは
 * 「助言が正しくラッチするか／ラッチしてはいけない場面で沈黙するか」を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasBlockLatch } from '../gates/lib/run.js';
import { advisoryReverifyFile } from '../gates/g12_output_perfile.js';
import { ROOT, posix, genDir } from './helpers/paths.js';
import { hookRun, decide } from './helpers/hook.js';
import { withRun, withoutSentinel, cleanupTs } from './helpers/run-state.js';
import { writeAgent } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const GUARD = path.join(ROOT, 'gates', 'advance-guard.js');
const abs = (ts, ...parts) => path.join(genDir(ts), ...parts);

/** advance-guard を hook と同じ stdin 契約で叩く（PostToolUse は exit 0・stdout 空）。 */
function runGuard(input) {
  return hookRun(GUARD, input);
}
function decideGuard(input) {
  return decide(GUARD, input);
}

/** `.claude/agents/<name>/<name>.md` を書く（tools は素の文字列で渡す＝旧称混入のテストに使う）。 */
function writeAgentFile(ts, name, tools) {
  return writeAgent(genDir(ts), name, { tools });
}

test('PostToolUse: generated の schema 違反ファイルで gen.blocked を鋳造する', (t) => {
  const ts = tsFor(import.meta.url, 1);
  withRun(t, ts, { dirs: ['generated'] });
  const p = writeAgentFile(ts, 'w', 'Read Task'); // Task は旧称 → G5 違反
  assert.equal(hasBlockLatch(ts, 'gen'), false, '前提: まだラッチは無い');
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(p) } });
  assert.equal(hasBlockLatch(ts, 'gen'), true, '違反ファイルの書込で gen.blocked が立つ');
});

test('PostToolUse: 正常な generated ファイルではラッチしない', (t) => {
  const ts = tsFor(import.meta.url, 2);
  withRun(t, ts, { dirs: ['generated'] });
  const p = writeAgentFile(ts, 'w', 'Read Grep'); // 正規ツール
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(p) } });
  assert.equal(hasBlockLatch(ts, 'gen'), false, '正常ファイルでラッチしてはならない');
});

test('PostToolUse: KNOWN_NON_SCHEMA（CLAUDE.md）はラッチ対象外', (t) => {
  const ts = tsFor(import.meta.url, 3);
  withRun(t, ts, { dirs: ['generated'] });
  const p = abs(ts, 'CLAUDE.md');
  writeFileSync(p, '# c\n本文\n'); // frontmatter なし L1（別ゲートの担当）
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(p) } });
  assert.equal(hasBlockLatch(ts, 'gen'), false, 'CLAUDE.md を per-file スキーマで弾かない');
});

test('PostToolUse: generated 外の書込ではラッチしない', (t) => {
  const ts = tsFor(import.meta.url, 4);
  withRun(t, ts, { dirs: ['generated'] });
  // sanctioned だが generated/ ではない work/ 配下（作業ファイル）。
  const p = path.join(ROOT, 'work', ts, 'scratch.md');
  writeFileSync(p, '---\nname: w\ndescription: x\ntools: Task\n---\n本文\n'); // 中身が違反でも対象外
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(p) } });
  assert.equal(hasBlockLatch(ts, 'gen'), false, 'generated 外は per-file 助言の対象外');
});

test('PreToolUse 統合: PostToolUse でラッチ後は generated/** への前進書込を deny する', (t) => {
  const ts = tsFor(import.meta.url, 5);
  withRun(t, ts, { dirs: ['generated'] });
  // 1) 違反ファイルの PostToolUse でラッチを立てる。
  const bad = writeAgentFile(ts, 'bad', 'Read Task');
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(bad) } });
  assert.equal(hasBlockLatch(ts, 'gen'), true);

  // 2) 以降の generated/** への前進書込は PreToolUse で deny される。
  const next = posix(abs(ts, '.claude', 'skills', 'nextskill', 'SKILL.md'));
  assert.equal(
    decideGuard({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: next } }),
    'deny',
    'ラッチ存在中は前進書込を硬遮断（唯一の硬遮断は PreToolUse deny）'
  );
});

test('run 外では PostToolUse は何もしない（ラッチを立てない）', (t) => {
  const ts = tsFor(import.meta.url, 6);
  // session-ts を消して run 外を作る。
  withoutSentinel(t, path.join(ROOT, 'work', '.session-ts'));
  cleanupTs(t, ts);
  mkdirSync(genDir(ts), { recursive: true });
  const p = writeAgentFile(ts, 'w', 'Read Task');
  runGuard({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: posix(p) } });
  assert.equal(hasBlockLatch(ts, 'gen'), false, 'run 外ではガード非適用（ガードの有効条件）');
});

// ---- advisoryReverifyFile 単体（分類の境界）----

test('advisoryReverifyFile: 誤配置/不正な .md は G12 と同一に違反として返す', (t) => {
  const ts = tsFor(import.meta.url, 7);
  cleanupTs(t, ts);
  const d = abs(ts, '.claude', 'agents', 'reviewer');
  mkdirSync(d, { recursive: true });
  const notes = path.join(d, 'notes.md'); // frontmatter を欠く不正な agent 定義
  writeFileSync(notes, '走り書き\n');
  // advisory は「PreToolUse が早期に止めるのは G12@Stop が止めるものと同一」を保つ。
  assert.ok(
    advisoryReverifyFile(notes, ts).length > 0,
    'frontmatter 必須キー欠落は checkG12 と同じく違反として返す'
  );
});

test('advisoryReverifyFile: KNOWN_NON_SCHEMA と genRoot 外は空配列（対象外）', (t) => {
  const ts = tsFor(import.meta.url, 9);
  cleanupTs(t, ts);
  const claudeMd = abs(ts, 'CLAUDE.md');
  mkdirSync(path.dirname(claudeMd), { recursive: true });
  writeFileSync(claudeMd, '# c\n本文\n');
  assert.deepEqual(advisoryReverifyFile(claudeMd, ts), [], 'CLAUDE.md は別ゲートの担当');
  const outside = path.join(ROOT, 'work', ts, 'x.md');
  mkdirSync(path.dirname(outside), { recursive: true });
  writeFileSync(outside, '---\nname: x\ndescription: y\n---\n本文\n');
  assert.deepEqual(advisoryReverifyFile(outside, ts), [], 'genRoot 外は対象外');
});

test('advisoryReverifyFile: 違反のある schema ファイルは違反配列を返す', (t) => {
  const ts = tsFor(import.meta.url, 8);
  cleanupTs(t, ts);
  const p = writeAgentFile(ts, 'w', 'Read Task');
  const v = advisoryReverifyFile(p, ts);
  assert.ok(v.length > 0, '旧称 Task を含む agent は per-file 違反を返す');
});
