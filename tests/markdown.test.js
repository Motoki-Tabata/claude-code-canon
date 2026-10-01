/**
 * lib/markdown.js の computeFenceMask の回帰テスト。
 * フェンスは「開いた文字と長さ」を覚え、同じ文字で開き以上の長さ・後ろに文字が無い行だけで閉じる（CommonMark）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFenceMask, findHeading } from '../lib/markdown.js';

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

test('findHeading: 見出しの先頭一致（直後が語の続きでないもの。括弧書きの注記は許す）。語を含むだけの別の見出しには当たらない', () => {
  const lines = [
    '## 確定要件の経緯',
    '## Old Experimental Dependencies',
    '## Experimental DependenciesList',
    '## 確定要件（ヒアリングの結果）',
    '## Experimental Dependencies',
  ];
  assert.equal(findHeading(lines, '確定要件'), 3, '「確定要件の経緯」や部分一致の別見出しに当たらない');
  assert.equal(findHeading(lines, 'Experimental Dependencies'), 4, '途中・語の続きの見出しに当たらない');
  assert.equal(findHeading(lines, '要件'), -1, '見出しの途中の語には当たらない');
  assert.equal(findHeading(['## 確定要件'], '確定要件'), 0, '完全一致');
  assert.equal(findHeading(['### 確定要件'], '確定要件', 2), -1, 'level 指定は従来どおり');
});
