/**
 * G14/G15/G16 の回帰テスト（機能X・詳細設計書 §11.2「G14/G15/G16 実装契約」）。
 *
 * ts は `tests/helpers/ts.js` のレジストリ経由（本ファイル専有の名前空間・29990808_*）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { workDir } from '../gates/lib/run.js';
import { extractCanonVersion, DOCS_DIR } from '../gates/lib/canon.js';
import { CANON_FILES } from '../gates/build-conformance-tables.js';
import { checkG14 } from '../gates/g14_canon_consistency.js';
import { checkG15 } from '../gates/g15_propagation.js';
import { checkG16 } from '../gates/g16_ledger.js';
import { ROOT } from './helpers/paths.js';
import { cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

// docs/SOURCES.md 更新履歴に実在することが確認済みの日付（初版行）。
const KNOWN_HISTORY_DATE = '2026-08-29';

function proposalText({ investigated_at, confirmed_version, todo_marker_count, oldToNewRows = [] }) {
  const lines = ['# canon-diff-proposal', '', '## メタ'];
  if (investigated_at !== undefined) lines.push(`- investigated_at: ${investigated_at}`);
  if (confirmed_version !== undefined) lines.push(`- confirmed_version: ${confirmed_version}`);
  if (todo_marker_count !== undefined) lines.push(`- todo_marker_count: ${todo_marker_count}`);
  lines.push('', '## 差分候補', '（テスト用・空）', '', '## 旧表現→新表現');
  if (oldToNewRows.length > 0) {
    lines.push('| 旧表現 | 新表現 |', '|---|---|');
    for (const [o, n] of oldToNewRows) lines.push(`| ${o} | ${n} |`);
  } else {
    lines.push('（無し）');
  }
  lines.push('', '## 一次ソースとの矛盾', 'なし', '');
  return lines.join('\n');
}

/** work/<ts>/ を作り、t.after() で work/<ts>・output/<ts> を掃除する。 */
function withTs(t, ts) {
  mkdirSync(workDir(ts), { recursive: true });
  cleanupTs(t, ts);
}

// ---------------------------------------------------------------------------
// G14
// ---------------------------------------------------------------------------

test('G14: 正しい proposal（実バージョン一致・履歴実在）で通過する', (t) => {
  const ts = tsFor(import.meta.url, 1);
  withTs(t, ts);
  const canon = extractCanonVersion(CANON_FILES);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({ investigated_at: KNOWN_HISTORY_DATE, confirmed_version: canon.version, todo_marker_count: 19 }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, true, r.violations.join(' / '));
});

test('G14: canon-diff-proposal.md 不在は違反', (t) => {
  const ts = tsFor(import.meta.url, 2);
  withTs(t, ts);
  const r = checkG14({ ts });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(' '), /canon-diff-proposal\.md.*存在しない/);
});

test('G14: メタ欠落（investigated_at 無し）は違反', (t) => {
  const ts = tsFor(import.meta.url, 3);
  withTs(t, ts);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({ confirmed_version: 'v2.1.235', todo_marker_count: 19 }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(' '), /investigated_at/);
});

test('G14: confirmed_version が docs/ の実バージョンと不一致なら違反', (t) => {
  const ts = tsFor(import.meta.url, 4);
  withTs(t, ts);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({ investigated_at: KNOWN_HISTORY_DATE, confirmed_version: 'v0.0.0-bogus', todo_marker_count: 19 }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(' '), /不一致/);
});

test('G14: investigated_at が SOURCES.md 更新履歴に無い日付なら違反', (t) => {
  const ts = tsFor(import.meta.url, 5);
  withTs(t, ts);
  const canon = extractCanonVersion(CANON_FILES);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({ investigated_at: '1999-01-01', confirmed_version: canon.version, todo_marker_count: 19 }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(' '), /SOURCES\.md/);
});

test('G14: confirmed_version に全角括弧の出典注記が付いていても裸値として一致判定する（回帰・2026-08-29）', (t) => {
  const ts = tsFor(import.meta.url, 12);
  withTs(t, ts);
  const canon = extractCanonVersion(CANON_FILES);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({
      investigated_at: KNOWN_HISTORY_DATE,
      confirmed_version: `${canon.version}（2026-08-28。changelog ページ最上部の見出し）`,
      todo_marker_count: 19,
    }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, true, r.violations.join(' / '));
});

test('G14: confirmed_version に半角括弧の出典注記が付いていても裸値として一致判定する（回帰・2026-08-29）', (t) => {
  const ts = tsFor(import.meta.url, 13);
  withTs(t, ts);
  const canon = extractCanonVersion(CANON_FILES);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({
      investigated_at: KNOWN_HISTORY_DATE,
      confirmed_version: `${canon.version} (2026-08-28, changelog top heading)`,
      todo_marker_count: 19,
    }),
    'utf8'
  );
  const r = checkG14({ ts });
  assert.equal(r.ok, true, r.violations.join(' / '));
});

// ---------------------------------------------------------------------------
// G15
// ---------------------------------------------------------------------------

const FIXTURE_MARKER = 'G15_TEST_FIXTURE_MARKER_UNIQUE_STRING';
const FIXTURE_FILE = path.join(ROOT, 'tests', 'tmp_g15_fixture.generated.js');

test('G15: canon-diff-proposal.md 未申告でも常にレポートを生成する（vacuous pass 防止）', (t) => {
  const ts = tsFor(import.meta.url, 6);
  withTs(t, ts);
  const r = checkG15({ ts });
  assert.equal(r.ok, true, r.violations.join(' / '));
  const reportPath = path.join(workDir(ts), 'impact-report.md');
  assert.ok(existsSync(reportPath), 'impact-report.md が生成されていること');
  const text = readFileSync(reportPath, 'utf8');
  assert.match(text, /# impact-report/);
  assert.match(text, /## 波及 stale 候補/);
});

test('G15: 旧表現→新表現の申告値をシステムツリー内で検出しレポートへ列挙する（検出のみ・非ブロッキング）', (t) => {
  const ts = tsFor(import.meta.url, 7);
  writeFileSync(FIXTURE_FILE, `// ${FIXTURE_MARKER} 残存を検出できるかのテスト用フィクスチャ\n`, 'utf8');
  t.after(() => rmSync(FIXTURE_FILE, { force: true }));
  withTs(t, ts);
  writeFileSync(
    path.join(workDir(ts), 'canon-diff-proposal.md'),
    proposalText({
      investigated_at: KNOWN_HISTORY_DATE,
      confirmed_version: 'v0.0.0',
      todo_marker_count: 0,
      oldToNewRows: [[FIXTURE_MARKER, 'NEW_VALUE']],
    }),
    'utf8'
  );
  const r = checkG15({ ts });
  // 検出のみ・非ブロッキング契約: ヒットがあっても ok は true のまま。
  assert.equal(r.ok, true, r.violations.join(' / '));
  assert.ok(r.systemHitCount >= 1, 'tests/ 配下のフィクスチャがヒットすること');
  const text = readFileSync(path.join(workDir(ts), 'impact-report.md'), 'utf8');
  assert.match(text, new RegExp(FIXTURE_MARKER));
});

// ---------------------------------------------------------------------------
// G16
// ---------------------------------------------------------------------------

test('G16: 現行の docs/00_INDEX.md §10 台帳は形式整合している（回帰ロック）', (t) => {
  const ts = tsFor(import.meta.url, 8);
  withTs(t, ts);
  const r = checkG16({ ts });
  assert.equal(r.ok, true, r.violations.join(' / '));
  assert.ok(r.actualMarkerCount > 0, '[要確認] マーカーが1件以上あること（回帰の前提）');
});

test('G16: 部分的な取り消し線（未解決/解決済のいずれでもない行）は違反', (t) => {
  const indexPath = path.join(DOCS_DIR, '00_INDEX.md');
  const original = readFileSync(indexPath, 'utf8');
  t.after(() => writeFileSync(indexPath, original, 'utf8'));
  const ts = tsFor(import.meta.url, 9);
  withTs(t, ts);
  // §10 の表の最終行の直後に、項目だけ取り消し線・所在は取り消し線なし・解決済接頭辞欠落の
  // 壊れた行を挿入する（未解決/解決済のどちらの形式にも一致しない）。
  const marker = '| Channels ページの正規配置（Reference vs Advanced） | §8 | WebFetch: `https://code.claude.com/docs/en/channels` |';
  assert.ok(original.includes(marker), 'テスト対象の挿入基準行が実在すること（正典の書式変更で失われていないか確認）');
  const malformedRow = '| ~~壊れた行のテスト~~ | 未取消線のまま | WebFetch で確認 |';
  const mutated = original.replace(marker, `${marker}\n${malformedRow}`);
  writeFileSync(indexPath, mutated, 'utf8');
  const r = checkG16({ ts });
  assert.equal(r.ok, false);
  assert.match(r.violations.join(' '), /パースできない/);
});

// 実マーカー計数規約（実昇格準備2・§11.2 G16 実装契約）の検出器の生存証明。
// 素朴な /\[要確認\]/g（見出し・コードスパンを区別しない）に戻っていないかを固定する。
test('G16 実マーカー計数: 拡張形は数える／コードスパン内・見出し行は数えない（fixture）', (t) => {
  const ts = tsFor(import.meta.url, 10);
  withTs(t, ts);
  const scratchPath = path.join(DOCS_DIR, '__scratch_g16_marker_test.md');
  t.after(() => rmSync(scratchPath, { force: true }));
  const baseline = checkG16({ ts }).actualMarkerCount;
  const scratchContent = [
    '# scratch',
    '',
    '## 1. 見出し内の [要確認] は数えない',
    '',
    '本文中の拡張形 [要確認: 理由テキスト] は数える。',
    '',
    'コードスパン内の `[要確認]` は数えない。',
    '',
    '素の形 [要確認] も本文中（非見出し・非コードスパン）なら数える。',
    '',
  ].join('\n');
  writeFileSync(scratchPath, scratchContent, 'utf8');
  const r = checkG16({ ts });
  // scratch ファイルの寄与は「拡張形1＋素の形1」＝2件のみ（見出し・コードスパンは除外）。
  assert.equal(r.actualMarkerCount, baseline + 2, JSON.stringify(r.markerBreakdown));
  const scratchEntry = r.markerBreakdown.find((b) => b.file === '__scratch_g16_marker_test.md');
  assert.ok(scratchEntry, 'scratch ファイルの内訳が markerBreakdown に記録されること');
  assert.equal(scratchEntry.count, 2);
});

test('G16 実マーカー計数: docs/SOURCES.md は除外する（保守ログであり正典本文でない）', (t) => {
  const ts = tsFor(import.meta.url, 11);
  withTs(t, ts);
  const sourcesPath = path.join(DOCS_DIR, 'SOURCES.md');
  const original = readFileSync(sourcesPath, 'utf8');
  t.after(() => writeFileSync(sourcesPath, original, 'utf8'));
  const baseline = checkG16({ ts }).actualMarkerCount;
  writeFileSync(sourcesPath, original + '\n\n本文中の拡張形 [要確認: 追加テスト] を追記。\n', 'utf8');
  const r = checkG16({ ts });
  assert.equal(r.actualMarkerCount, baseline, 'SOURCES.md への追記は実マーカー総数に影響しないこと');
  assert.ok(!r.markerBreakdown.some((b) => b.file === 'SOURCES.md'), 'SOURCES.md が内訳に出ないこと');
});
