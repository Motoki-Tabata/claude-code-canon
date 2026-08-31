/**
 * tools/promote.js（機能Y 昇格機構）の回帰テスト。詳細設計書 §13.2。
 *
 * `runPromote({ canonRoot, runTests })` の注入口を使い、実リポジトリの `.claude/` を
 * 一切汚さずスクラッチディレクトリ（node:os tmpdir 配下）で昇格の全経路を検証する。
 *
 * 中心的な関心は **自己欺瞞封鎖**（§13.2）: `fixtures/generations/candidate-poisoned/`
 * （`tools: Bash` を持つ次世代候補）を昇格しようとすると G13 が必ず拒否することを固定する。
 * これが破れると「機能Y は `.claude/` を作り替えるため、次世代が自分に `tools: Bash` を
 * 与えれば全ガードを迂回できる」という §13.2 の最大リスクが現実化する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runPromote } from '../tools/promote.js';
import { readCurrent, liveClaudeDir, archiveDir, listArchived } from '../gates/lib/generations.js';
import { ROOT } from './helpers/paths.js';
import { scratchDir } from './helpers/fixtures.js';

// runPromote は canonRoot に対し generations/candidate-<label>/.claude を解決するため、
// canonRoot 自体には 'generations' セグメントを含めない（fixtures/ を渡す）。
const FIXTURES_ROOT = path.join(ROOT, 'fixtures');

function fakeRunTestsPass() {
  /* no-op: 昇格ロジック自体のテストであり、実 npm test の再帰実行は本テストの関心外 */
}
function fakeRunTestsFail() {
  throw new Error('シミュレートしたテスト失敗');
}

test('G13 違反（poisoned fixture）は昇格を拒否する（自己欺瞞封鎖・最重要）', () => {
  const result = runPromote({
    label: 'poisoned',
    canonRoot: FIXTURES_ROOT,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
    // このfixtureに SOURCE_RUN が無いため、実昇格準備で追加した乖離検出（§13.2）が先に
    // 拒否してしまう。本テストの関心は G13 が確実に効くことなので、乖離検出を明示的に
    // 通過させて G13 まで到達させる（乖離検出自体は promote_divergence.test.js で別途検証）。
    acceptDivergence: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /G13/);
  assert.ok(result.violations && result.violations.length > 0, '違反内容が返っていること');
});

test('候補が存在しない label は昇格を拒否する', () => {
  const result = runPromote({
    label: 'does-not-exist-at-all',
    canonRoot: FIXTURES_ROOT,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /存在しない/);
});

test('不正な label（パストラバーサル等）は昇格を拒否する', () => {
  const result = runPromote({
    label: '../../etc',
    canonRoot: FIXTURES_ROOT,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /不正な label/);
});

test('正常な候補は昇格に成功し、.claude/ がスワップされ CURRENT・PROMOTED_FROM が記録される', (t) => {
  const scratch = scratchDir(t, 'canon-promote-test-');
  // 初期 "現行世代": 何もない状態（baseline）を模す最小の .claude/。
  mkdirSync(path.join(scratch, '.claude', 'agents', 'placeholder'), { recursive: true });
  writeFileSync(
    path.join(scratch, '.claude', 'agents', 'placeholder', 'placeholder.md'),
    '---\nname: placeholder\ndescription: baseline placeholder\ntools: Read\nmodel: sonnet\n---\nbaseline\n',
    'utf8'
  );

  // 候補を配置（fixture からコピー）。
  const candDir = path.join(scratch, 'generations', 'candidate-good-demo', '.claude');
  mkdirSync(path.dirname(candDir), { recursive: true });
  cpSync(path.join(FIXTURES_ROOT, 'generations', 'candidate-good-demo', '.claude'), candDir, { recursive: true });

  const result = runPromote({
    label: 'good-demo',
    canonRoot: scratch,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
    // fixture に SOURCE_RUN が無い（本テストの関心はスワップ/ロールバック機構であり
    // 乖離検出ではない）。乖離検出そのものは promote_divergence.test.js で別途検証する。
    acceptDivergence: true,
  });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.label, 'good-demo');

  // CURRENT が更新されている。
  assert.equal(readCurrent(scratch), 'good-demo');

  // 現行 .claude/ が候補の内容にスワップされている。
  assert.ok(
    existsSync(path.join(liveClaudeDir(scratch), 'agents', 'demo-helper', 'demo-helper.md')),
    '候補の内容が現行 .claude/ へスワップされていること'
  );
  assert.ok(
    !existsSync(path.join(liveClaudeDir(scratch), 'agents', 'placeholder')),
    '旧世代のファイルは残らない（rm→cp の完全置換）'
  );

  // 旧世代が退避され、PROMOTED_FROM に昇格前ラベル（baseline）が記録されている。
  const archives = listArchived(scratch);
  assert.equal(archives.length, 1);
  const archive = archiveDir(archives[0], scratch);
  assert.ok(existsSync(path.join(archive, '.claude', 'agents', 'placeholder', 'placeholder.md')));
  assert.equal(readFileSync(path.join(archive, 'PROMOTED_FROM'), 'utf8').trim(), 'baseline');

  // ---- 続けて: 2回目の昇格でテスト失敗 → 自動ロールバックを確認 ----
  // 「テスト失敗」経路の検証にはクリーンな候補を使う（demo-helper と同一内容を別ラベルで再配置）。
  const candDir3 = path.join(scratch, 'generations', 'candidate-broken-after-swap', '.claude');
  mkdirSync(path.dirname(candDir3), { recursive: true });
  cpSync(path.join(FIXTURES_ROOT, 'generations', 'candidate-good-demo', '.claude'), candDir3, { recursive: true });

  const result2 = runPromote({
    label: 'broken-after-swap',
    canonRoot: scratch,
    runTests: fakeRunTestsFail,
    skipMutualExclusionCheck: true,
    acceptDivergence: true,
  });
  assert.equal(result2.ok, false);
  assert.equal(result2.rolledBack, true);
  assert.match(result2.reason, /自動ロールバック/);

  // ロールバック後: CURRENT は good-demo に戻り、現行 .claude/ も good-demo の内容のまま。
  assert.equal(readCurrent(scratch), 'good-demo');
  assert.ok(existsSync(path.join(liveClaudeDir(scratch), 'agents', 'demo-helper', 'demo-helper.md')));
});

test('相互排他チェックは既定で有効（skipMutualExclusionCheck を渡さない場合）', () => {
  // 実 CANON_ROOT の work/.session-ts・.canon-update-ts は通常どちらも不在なので、
  // ここでは「呼び出しがクラッシュせず ok:false（候補不在）まで到達すること」だけを確認する
  // （相互排他チェック自体は canon_update_guard.test.js 側で新規/完了両パターンを検証済み）。
  const result = runPromote({ label: 'no-such-candidate-for-mutual-exclusion-smoke' });
  assert.equal(typeof result.ok, 'boolean');
});
