/**
 * lib/markdown.js の computeFenceMask の回帰テスト。
 * フェンスは「開いた文字と長さ」を覚え、同じ文字で開き以上の長さ・後ろに文字が無い行だけで閉じる（CommonMark）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFenceMask } from '../lib/markdown.js';

const mask = (text) => computeFenceMask(text.split('\n'));

test('computeFenceMask: 4個のバッククォートのフェンス内の ``` では閉じない', () => {
  const m = mask('````md\n```yaml\n# 見出しに見える行\n```\n````\n# 本物の見出し');
  assert.deepEqual(m, [true, true, true, true, true, false]);
});

test('computeFenceMask: 開きより長い閉じは閉じる・短い閉じは閉じない', () => {
  assert.deepEqual(mask('```\nx\n````\ny'), [true, true, true, false]);
  assert.deepEqual(mask('````\nx\n```\ny\n````\nz'), [true, true, true, true, true, false]);
});

test('computeFenceMask: 別の文字（~~~）では閉じない。~~~ で開いたら ``` では閉じない', () => {
  assert.deepEqual(mask('```\nx\n~~~\ny\n```\nz'), [true, true, true, true, true, false]);
  assert.deepEqual(mask('~~~\nx\n```\ny\n~~~\nz'), [true, true, true, true, true, false]);
});

test('computeFenceMask: 後ろに文字がある行は閉じにならない（info string は開きだけ）', () => {
  assert.deepEqual(mask('```js\nx\n```js\ny\n```\nz'), [true, true, true, true, true, false]);
});

test('computeFenceMask: 通常の3個フェンスは従来どおり', () => {
  assert.deepEqual(mask('a\n```\nx\n```\nb'), [false, true, true, true, false]);
});
