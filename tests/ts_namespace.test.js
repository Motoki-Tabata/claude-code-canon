/**
 * ts 名前空間レジストリ（`tests/helpers/ts.js`）の回帰テスト。
 *
 * `package.json` の運用規約は「実 `work`/`output` を触るテストの ts 日付部分をテスト
 * ファイル間で重複させない」と定めるが、従来は**コメント頼みで機械検査が無かった**。
 * 2026-08-19 に `advance_guard.test.js`／`g2_keep.test.js` の ts プレフィックス完全重複が
 * 発見・解消され、その後も `eval_bundle.test.js`／`g11_constraints.test.js` が
 * 同一 ts（プレフィックス29990303・連番000001）を再び重複使用していた
 * （本テストスイート最適化で発見）。
 * 同型の再発を「レビューで気づく」から「テストで機械的に落ちる」へ格上げする。
 *
 * `.claude/rules/gates-and-tests.md`「vacuous pass を最優先で疑う」に従い、
 * 検出0件を鵜呑みにせず、必ず走査件数（scanned）を検査する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers/paths.js';
import { TS_NAMESPACES } from './helpers/ts.js';

const TESTS_DIR = path.join(ROOT, 'tests');
// 完全に引用符で囲まれた ts 形状のリテラルのみを検出対象にする（コメント中の裸の
// プレフィックス言及や `29990808_*` のようなワイルドカード表記を誤検知しないため）。
const TS_LITERAL_RE = /['"`]2999\d{4}_\d{6}['"`]/;

test('TS_NAMESPACES: 割当が重複しないこと（package.json 運用規約の機械検査）', () => {
  const entries = Object.entries(TS_NAMESPACES);
  assert.ok(entries.length >= 15, `レジストリが空同然では検査が vacuous になる（実際: ${entries.length}件）`);
  const seen = new Map();
  const dupes = [];
  for (const [name, prefix] of entries) {
    if (seen.has(prefix)) dupes.push(`${prefix}: ${seen.get(prefix)} / ${name}`);
    else seen.set(prefix, name);
  }
  assert.deepEqual(dupes, [], `ts 名前空間の重複を検出:\n${dupes.join('\n')}`);
});

test('TS_NAMESPACES: 各キーに対応する tests/<name>.test.js が実在すること（腐り検出）', () => {
  const missing = Object.keys(TS_NAMESPACES).filter(
    (name) => !existsSync(path.join(TESTS_DIR, `${name}.test.js`))
  );
  assert.deepEqual(
    missing,
    [],
    `TS_NAMESPACES に登録されているが実ファイルが無い（改名・削除の追従漏れ）: ${missing.join(', ')}`
  );
});

test('全テストファイルが ts をレジストリ経由で発行していること（2999 プレフィックスのハードコード禁止）', () => {
  const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.js'));
  assert.ok(files.length >= 30, `走査対象が少なすぎるなら本テスト自体が vacuous（実際: ${files.length}件）`);
  const offenders = files.filter((f) => TS_LITERAL_RE.test(readFileSync(path.join(TESTS_DIR, f), 'utf8')));
  assert.deepEqual(
    offenders,
    [],
    `ts のハードコードが残っている（tests/helpers/ts.js の tsFor/tsSeq 経由に統一すること）: ${offenders.join(', ')}`
  );
});
