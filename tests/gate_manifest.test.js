/**
 * gate-manifest の回帰テスト。
 *
 * 守りたい性質: **ゲートの不在が黙って pass にならないこと**（詳細設計書 §11.5）。
 * バッチが「ファイルが無ければスキップして通す」実装だと、未実装（正当）と
 * ゲート削除・改名（退行）を区別できず、検証能力が静かに失われる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveGate, resolveGates, NOT_YET_IMPLEMENTED } from '../gates/gate-manifest.js';
import { ROOT } from './helpers/paths.js';

const GATES_DIR = path.join(ROOT, 'gates');

test('未宣言の不在は違反（ゲートを消した・改名した退行を捕まえる）', () => {
  const r = resolveGates(['g99_never_existed.js']);
  assert.equal(r.violations.length, 1, '未宣言の不在は violations に入らねばならない');
  assert.equal(r.runnable.length, 0);
  assert.equal(r.skipped.length, 0, '未宣言の不在を skipped に入れてはならない（それが vacuous pass）');
  assert.match(r.violations[0], /vacuous pass/, '理由を述べること');
});

test('実装済みなのに宣言が残っていたら違反（マニフェストの腐りを防ぐ）', (t) => {
  // g5 は実装済み。宣言に足すと stale_declaration になるはず。
  const saved = NOT_YET_IMPLEMENTED['g5_tool_names.js'];
  t.after(() => {
    if (saved === undefined) delete NOT_YET_IMPLEMENTED['g5_tool_names.js'];
    else NOT_YET_IMPLEMENTED['g5_tool_names.js'] = saved;
  });
  NOT_YET_IMPLEMENTED['g5_tool_names.js'] = { gate: 'G5', reason: 'test', planned_phase: 'x', design_ref: 'x' };
  const r = resolveGates(['g5_tool_names.js']);
  assert.equal(r.violations.length, 1, '実装済み × 宣言残存 は違反');
  assert.equal(r.runnable.length, 0, '宣言が残っている限り実行してはならない');
});

test('実装済み × 宣言なし は実行対象になる', () => {
  const r = resolveGates(['g5_tool_names.js']);
  assert.deepEqual(r.runnable, ['g5_tool_names.js']);
  assert.equal(r.violations.length, 0);
});

test('宣言済みの不在はスキップされるが、根拠を必ず持つ', (t) => {
  // G11 の実装で NOT_YET_IMPLEMENTED は空になったため、実在の宣言を例にできない。
  // 機構そのものは残る（将来ゲートを足すときに使う）ので、合成の宣言で検査する。
  const name = 'g99_never_existed.js';
  t.after(() => delete NOT_YET_IMPLEMENTED[name]);
  NOT_YET_IMPLEMENTED[name] = { gate: 'G99', reason: 'test', planned_phase: 'X', design_ref: '§x' };
  const r = resolveGates([name]);
  assert.equal(r.violations.length, 0);
  assert.equal(r.skipped.length, 1);
  const s = r.skipped[0];
  for (const k of ['gate', 'reason', 'planned_phase', 'design_ref']) {
    assert.ok(s[k], `スキップ宣言は ${k} を持たねばならない（根拠なき不在を許さない）`);
  }
});

test('全ゲート実装済み: guards が要求するゲートに「スキップ」が1件も無い', () => {
  // G11 の実装で NOT_YET_IMPLEMENTED は空になった。以降スキップが1件でも現れたら、
  // それは「ゲートが実行されない run」が存在することを意味する。新ゲートを足して
  // 一時的に宣言する場合は、その事実をこのテストの更新として意識的に記録すること。
  const names = new Set();
  for (const f of ['stage-guard.js', 'gen-guard.js']) {
    const src = readFileSync(path.join(GATES_DIR, f), 'utf8');
    for (const m of src.matchAll(/'(g\d+_[a-z0-9_]+\.js)'/g)) names.add(m[1]);
  }
  const r = resolveGates([...names]);
  assert.deepEqual(r.skipped, [], `未実装スキップ: ${r.skipped.map((s) => s.name).join(', ')}`);
  assert.deepEqual(Object.keys(NOT_YET_IMPLEMENTED), [], 'NOT_YET_IMPLEMENTED は空であるはず');
});

test('マニフェストの全宣言が「実際に不在」であること（腐り検出）', () => {
  const stale = Object.keys(NOT_YET_IMPLEMENTED).filter((n) => existsSync(path.join(GATES_DIR, n)));
  assert.deepEqual(
    stale,
    [],
    `実装済みなのに NOT_YET_IMPLEMENTED に残っている: ${stale.join(', ')}。` +
      `ゲートを実装したら gate-manifest.js から宣言を消すこと。`
  );
});

test('guards が要求する全ゲートは「実装済み」か「宣言済み」のいずれかであること', () => {
  // stage-guard / gen-guard が動的 import するモジュール名を実ファイルから拾う。
  const names = new Set();
  for (const f of ['stage-guard.js', 'gen-guard.js']) {
    const src = readFileSync(path.join(GATES_DIR, f), 'utf8');
    for (const m of src.matchAll(/'(g\d+_[a-z0-9_]+\.js)'/g)) names.add(m[1]);
  }
  assert.ok(names.size > 0, 'guards からゲート名を1件も拾えないなら、この検査自体が vacuous');

  const r = resolveGates([...names]);
  assert.deepEqual(
    r.violations,
    [],
    `guards が要求するゲートに未宣言の不在・宣言の残存がある:\n${r.violations.join('\n')}`
  );
});

test('基本設計書 §14 が明記するゲート名を guards が使っていること', () => {
  // 設計書は g1_stage_order.js / g12_output_perfile.js / g13_worker_privilege.js を明記する。
  // 名前がずれると、設計書どおりに実装したゲートが永久に発火しない（実際に gen-guard が
  // g12_perfile_reverify.js を探していた）。
  //
  // 注: ソース全文への正規表現照合は、コメント中の言及にも当たってしまう（この検査を
  // 最初にそう書いて自分のコメントで落ちた）。**実際に import される名前の集合**だけを
  // 見る必要がある。文字列リテラルのうち gN_*.js 形式のものを拾う。
  const src = readFileSync(path.join(GATES_DIR, 'gen-guard.js'), 'utf8');
  const withoutComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const referenced = new Set([...withoutComments.matchAll(/'(g\d+_[a-z0-9_]+\.js)'/g)].map((m) => m[1]));

  assert.ok(referenced.has('g12_output_perfile.js'), '基本設計書 §14 の名前は g12_output_perfile.js');
  assert.ok(!referenced.has('g12_perfile_reverify.js'), '設計書に無い名前を import 対象にしてはならない');
});
