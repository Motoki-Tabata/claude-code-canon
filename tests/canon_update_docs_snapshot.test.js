/**
 * 機能X の docs スナップショット照合の回帰テスト（詳細設計書 §13.1 安全制約）。
 *
 * 承認サイドカーの廃止で「更新ゲート承認まで docs/ への書込を deny」が無くなった。代わりに、
 * 採番時（tools/new-canon-ts.js）の docs/ スナップショットと、提案フェーズ完了リクエスト
 * （`canon-update-proposal`）を消費するときの docs/ を canon-guard が照合する。
 * 実 docs/ は書き換えない（スナップショット側を改変して差分を作る）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, workDir, outputDir, CANON_UPDATE_SESSION_TS_FILE } from './helpers/paths.js';
import { hookRun, runToolCli } from './helpers/hook.js';
import { withCanonUpdateRun, stashFile, cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';
import { snapshotDocs, diffDocsAgainstSnapshot, docsSnapshotPath, writeDocsSnapshot } from '../gates/lib/canon-run.js';

const GUARD = path.join(ROOT, 'gates', 'canon-guard.js');
const TS = tsFor(import.meta.url, 1);

function tmpDocs(t, files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'docs-snap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [n, body] of Object.entries(files)) writeFileSync(path.join(dir, n), body);
  return dir;
}

test('スナップショットは変更・追加・削除をそれぞれ検出する', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['markers'] });
  const dir = tmpDocs(t, { 'a.md': 'A', 'b.md': 'B' });
  writeDocsSnapshot(TS, dir);
  assert.equal(diffDocsAgainstSnapshot(TS, dir).clean, true);

  writeFileSync(path.join(dir, 'a.md'), 'A2');
  writeFileSync(path.join(dir, 'c.md'), 'C');
  rmSync(path.join(dir, 'b.md'));
  const d = diffDocsAgainstSnapshot(TS, dir);
  assert.deepEqual([d.changed, d.added, d.removed], [['a.md'], ['c.md'], ['b.md']]);
  assert.equal(d.clean, false);
});

test('スナップショットが無いときは null（比較不能を「差分なし」と読ませない）', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['markers'] });
  assert.equal(diffDocsAgainstSnapshot(TS, tmpDocs(t, {})), null);
});

test('tools/new-canon-ts.js は採番時に実 docs/ のスナップショットを保存する', (t) => {
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  const NEW_TS = tsFor(import.meta.url, 2);
  cleanupTs(t, NEW_TS);
  const r = runToolCli('new-canon-ts.js', [NEW_TS]);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(docsSnapshotPath(NEW_TS)), 'スナップショットが無い');
  assert.deepEqual(JSON.parse(readFileSync(docsSnapshotPath(NEW_TS), 'utf8')), snapshotDocs());
});

/** canon-guard を Stop hook として叩く。提案リクエストを置いてから。 */
function runGuardWithProposal(ts) {
  writeFileSync(path.join(workDir(ts), '.requests', 'canon-update-proposal'), '', 'utf8');
  return hookRun(GUARD, { hook_event_name: 'SubagentStop' });
}

test('canon-guard: 提案フェーズ完了時に docs/ が無変更なら通過し、リクエストを消費する', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['markers'] });
  writeDocsSnapshot(TS);
  const out = runGuardWithProposal(TS);
  assert.doesNotMatch(out, /^EXIT2/, out);
  assert.equal(existsSync(path.join(workDir(TS), '.requests', 'canon-update-proposal')), false, 'リクエストが消費されていない');
});

test('canon-guard: 提案フェーズ完了時に docs/ が変わっていれば block し、ラッチを鋳造してリクエストを残す（故意の違反注入）', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['markers'] });
  writeDocsSnapshot(TS);
  // 実 docs/ を触らず、スナップショット側を改変して「採番後に docs/00_INDEX.md が変わった」状態を作る。
  const p = docsSnapshotPath(TS);
  const snap = JSON.parse(readFileSync(p, 'utf8'));
  snap['00_INDEX.md'] = '0'.repeat(64);
  writeFileSync(p, JSON.stringify(snap), 'utf8');

  const out = runGuardWithProposal(TS);
  assert.match(out, /^EXIT2/, '違反を検出して停止をブロックしていない（vacuous pass）');
  assert.match(out, /00_INDEX\.md/);
  assert.ok(existsSync(path.join(workDir(TS), '.requests', 'canon-update-proposal')), '違反時はリクエストを残して再照合させる');
  assert.ok(existsSync(path.join(outputDir(TS), '.gate', 'blocks', 'canon-update.blocked')), 'ラッチが鋳造されていない');
});

test('canon-guard: スナップショットが無いときは比較不能として block する', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['markers'] });
  const out = runGuardWithProposal(TS);
  assert.match(out, /^EXIT2/);
  assert.match(out, /スナップショット/);
});
