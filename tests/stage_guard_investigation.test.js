/**
 * F1 回帰: investigation の phase 別マーカー（§4.5）。
 *
 * 調査工程は1段目（要件確定前）と2段目 focused（要件確定後）が同じ 'investigation' 完了
 * リクエストを書く。既定でリクエスト名をマーカーキーにすると、1段目で investigation.done が
 * 鋳造された後、2段目の SubagentStop が §4.5 ①の冪等スキップに入り、G1 の focused 検査が
 * 実 hook 経路で一度も走らない（run 20260725_021627 で実測）。
 *
 * 本テストは **dispatch 層（processStageRequests＋実 markerKey＋実 G1 check）** を通す。
 * 既存 tests/g1_g7.test.js の investigation テストは checkG1 を直接呼ぶため、このスキップを
 * 検出できず緑になる（「テストが緑」は「経路が実際に踏まれている」ことの証拠にならない、という
 * 盲点）。ここでは hook ディスパッチ層を必ず経由する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  processStageRequests,
  hasMarker,
  mintMarker,
  hasBlockLatch,
  requestPath,
  workDir,
} from '../gates/lib/run.js';
import { investigationMarkerKey } from '../gates/stage-guard.js';
import { check as g1Check } from '../gates/g1_stage_order.js';
import { ROOT, posix } from './helpers/paths.js';
import { cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

const STAGES = ['investigation', 'requirements', 'spec', 'design'];
const runChecks = (ts, stage) => g1Check({ ts, stage });

function setup(t, ts) {
  cleanupTs(t, ts);
  mkdirSync(path.join(workDir(ts), '.requests'), { recursive: true });
  // target.txt は evidence_paths 実在照合用（本テストは evidence_paths を書かないため実害なし）。
  writeFileSync(path.join(workDir(ts), 'target.txt'), posix(ROOT) + '\n');
  // 系統A成果物（investigator.md の集約・永続化契約）。
  // 系統A成果物（investigator.md の集約・永続化契約）。G1 の調査工程スキーマ検査（§6.1）が
  // `- path:` レコードと canon_conformance 4キー・project_refs 節を要求するので、
  // 契約に適合する最小レコードを1件置く（stub でも契約を破らない）。
  writeFileSync(path.join(workDir(ts), 'existing_customizations.md'), '## サマリ\n総数 1\n\n## レコード（1ファイル1件）\n- path: .claude/skills/stub/SKILL.md\n  layer: L2\n  kind: skill\n  depends_on:\n    customization_refs: []\n    project_refs: []\n  canon_conformance:\n    frontmatter_keys_valid: true\n    unknown_frontmatter_keys: []\n    tool_names_valid: true\n    deprecated_notation: []\n');
}
function writeRequest(ts) {
  writeFileSync(requestPath(ts, 'investigation'), '');
}
function writeProfile(ts, { focused }) {
  const body = focused
    ? '## profile\nlanguages: js\n\n## focused\nfindings:\n  - 深掘り結果あり\n'
    : '## profile\nlanguages: js\n';
  writeFileSync(path.join(workDir(ts), 'project_profile.md'), body);
}

test('F1 ①調査1（要件確定前・focused 無し）→ pass・investigation.done 鋳造', (t) => {
  const ts = tsFor(import.meta.url, 1);
  setup(t, ts);
  writeProfile(ts, { focused: false }); // requirements.md 無し＝調査1
  writeRequest(ts);
  const results = processStageRequests({ ts, stages: STAGES, runChecks, markerKey: investigationMarkerKey });
  assert.equal(results.length, 1);
  assert.equal(results[0].action, 'pass', JSON.stringify(results[0]));
  assert.equal(hasMarker(ts, 'investigation'), true, '調査1 は investigation.done を鋳造する');
  assert.equal(hasMarker(ts, 'investigation.focused'), false, '調査1 で focused マーカーは鋳造しない');
  assert.equal(existsSync(requestPath(ts, 'investigation')), false, 'pass でリクエストは削除される');
});

test('F1 ②調査2（要件確定後・focused 有効）→ pass・investigation.focused.done 鋳造', (t) => {
  const ts = tsFor(import.meta.url, 2);
  setup(t, ts);
  writeProfile(ts, { focused: true });
  writeFileSync(path.join(workDir(ts), 'requirements.md'), '## 確定要件\n- id: R1\n'); // ＝調査2
  writeRequest(ts);
  const results = processStageRequests({ ts, stages: STAGES, runChecks, markerKey: investigationMarkerKey });
  assert.equal(results[0].action, 'pass', JSON.stringify(results[0]));
  assert.equal(hasMarker(ts, 'investigation.focused'), true, '調査2 は investigation.focused.done を鋳造する');
  assert.equal(existsSync(requestPath(ts, 'investigation')), false, 'pass でリクエストは削除される');
});

test('F1 ③調査2 focused 欠落＝回帰ロック: phase1 マーカー在でも focused 検査が発火してブロック', (t) => {
  const ts = tsFor(import.meta.url, 3);
  setup(t, ts);
  writeProfile(ts, { focused: false }); // 要件確定後なのに focused 無し＝違反であるべき
  writeFileSync(path.join(workDir(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  mintMarker(ts, 'investigation', {}); // 調査1 が既に investigation.done を鋳造済みと想定

  // --- (A) 旧挙動の再現（identity キー）: investigation.done 在のため冪等スキップされ検査が走らない ---
  writeRequest(ts);
  const legacy = processStageRequests({ ts, stages: STAGES, runChecks }); // markerKey 既定＝リクエスト名
  assert.equal(legacy[0].action, 'idempotent-cleanup', '旧挙動: 調査2 の検査は冪等スキップされる（バグ）');
  assert.equal(hasBlockLatch(ts, 'investigation'), false, '旧挙動では focused 欠落を検出できない');
  assert.equal(hasBlockLatch(ts, 'investigation.focused'), false);

  // --- (B) 修正挙動（phased キー）: investigation.focused.done は未鋳造なので検査が発火しブロック ---
  writeRequest(ts); // (A) の冪等スキップで削除されたので再投入
  const fixed = processStageRequests({ ts, stages: STAGES, runChecks, markerKey: investigationMarkerKey });
  assert.equal(fixed[0].action, 'fail', JSON.stringify(fixed[0]));
  assert.equal(fixed[0].ok, false);
  assert.equal(hasBlockLatch(ts, 'investigation.focused'), true, '修正後: focused 欠落を検出しブロックラッチを鋳造する');
  assert.equal(hasMarker(ts, 'investigation'), true, 'phase1 の investigation.done は不変（意味を壊さない）');
  assert.equal(existsSync(requestPath(ts, 'investigation')), true, 'fail 時はリクエストを残す（再判定の契機）');
});

test('F1 ④ existing_customizations.md 不在＝investigator が配下 spawn 直後に turn を終える failure mode の dispatch 層回帰ロック（実測 run 20260903_091044）', (t) => {
  const ts = tsFor(import.meta.url, 4);
  cleanupTs(t, ts);
  mkdirSync(path.join(workDir(ts), '.requests'), { recursive: true });
  writeFileSync(path.join(workDir(ts), 'target.txt'), posix(ROOT) + '\n');
  // setup() は使わず existing_customizations.md を意図的に欠かせる（故意の違反注入）。
  writeProfile(ts, { focused: false }); // requirements.md 無し＝調査1
  writeRequest(ts);
  const results = processStageRequests({ ts, stages: STAGES, runChecks, markerKey: investigationMarkerKey });
  assert.equal(results[0].action, 'fail', JSON.stringify(results[0]));
  assert.equal(hasBlockLatch(ts, 'investigation'), true, 'dispatch 層を経由しても existing_customizations.md 不在は検出される');
  assert.equal(hasMarker(ts, 'investigation'), false, 'fail 時は marker を鋳造しない');
  assert.equal(existsSync(requestPath(ts, 'investigation')), true, 'fail 時はリクエストを残す（再判定の契機）');
});
