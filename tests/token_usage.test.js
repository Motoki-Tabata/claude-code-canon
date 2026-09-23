import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonl, aggregateRecords, countDesignMapReads, totalInput, formatMarkdown } from '../tools/token-usage.js';

const asst = (id, model, usage, content = []) => ({ type: 'assistant', message: { id, model, usage, content } });
const u = (i, cc, cr, o) => ({ input_tokens: i, cache_creation_input_tokens: cc, cache_read_input_tokens: cr, output_tokens: o });

test('同一 message.id は最後のレコードだけを採る（先頭採用だと output が過小になる）', () => {
  const recs = [asst('m1', 'opus', u(1, 0, 100, 5)), asst('m1', 'opus', u(1, 0, 100, 50)), asst('m2', 'opus', u(2, 10, 200, 7))];
  const { byModel, turns } = aggregateRecords(recs);
  assert.equal(turns, 2);
  assert.equal(byModel.opus.output, 57);
  assert.equal(byModel.opus.cacheRead, 300);
  assert.equal(totalInput(byModel.opus), 1 + 2 + 10 + 300);
});

test('<synthetic> と usage の無いレコードは集計しない', () => {
  const recs = [asst('s1', '<synthetic>', u(0, 0, 0, 0)), { type: 'user', message: {} }, asst('m1', 'sonnet', u(1, 0, 0, 1))];
  const { byModel, turns } = aggregateRecords(recs);
  assert.deepEqual(Object.keys(byModel), ['sonnet']);
  assert.equal(turns, 1);
});

test('model 別に分けて集計する', () => {
  const { byModel } = aggregateRecords([asst('a', 'opus', u(1, 0, 0, 1)), asst('b', 'sonnet', u(2, 0, 0, 2))]);
  assert.equal(byModel.opus.calls, 1);
  assert.equal(byModel.sonnet.input, 2);
});

test('design-map.md への Read だけを数える（他ファイル・他ツール・同一 tool_use の重複は数えない）', () => {
  const read = (id, p, name = 'Read') => asst(`x${id}`, 'opus', u(0, 0, 0, 0), [{ type: 'tool_use', id, name, input: { file_path: p } }]);
  const recs = [
    read('t1', '/x/output/20260101_000000/design-map.md'),
    read('t1', '/x/output/20260101_000000/design-map.md'),
    read('t2', '/x/output/20260101_000000/spec.md'),
    read('t3', '/x/output/20260101_000000/design-map.md', 'Grep'),
    read('t4', 'C:\\x\\design-map.md'),
  ];
  assert.equal(countDesignMapReads(recs), 2);
});

test('壊れた行を飛ばして JSONL を読む', () => {
  assert.equal(parseJsonl('{"a":1}\n{broken\n\n{"b":2}').length, 2);
});

test('Markdown 表は main を先頭に、以降を総入力の降順で並べる', () => {
  const g = (label, cr) => ({ label, agents: 1, designMapReads: 0, agg: { byModel: { m: { calls: 1, input: 0, cacheCreation: 0, cacheRead: cr, output: 0 } }, turns: 1 } });
  const lines = formatMarkdown([g('main', 1), g('small', 10), g('big', 1000)]).split('\n');
  assert.match(lines[2], /^\| main /);
  assert.match(lines[3], /^\| big /);
  assert.match(lines[4], /^\| small /);
});
