import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { scratchDir } from './helpers/fixtures.js';
import path from 'node:path';
import { parseJsonl, aggregateRecords, totalInput, formatMarkdown, resolveSessionPath } from '../tools/token-usage.js';
import { projectSlug } from '../lib/claude-session.js';
import { CANON_ROOT } from '../lib/canon.js';

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

test('壊れた行を飛ばして JSONL を読む', () => {
  assert.equal(parseJsonl('{"a":1}\n{broken\n\n{"b":2}').length, 2);
});

test('Markdown 表は main を先頭に、以降を総入力の降順で並べる', () => {
  const g = (label, cr) => ({ label, agents: 1, agg: { byModel: { m: { calls: 1, input: 0, cacheCreation: 0, cacheRead: cr, output: 0 } }, turns: 1 } });
  const lines = formatMarkdown([g('main', 1), g('small', 10), g('big', 1000)]).split('\n');
  assert.match(lines[2], /^\| main /);
  assert.match(lines[3], /^\| big /);
  assert.match(lines[4], /^\| small /);
});

test('projectSlug: Claude Code のプロジェクトディレクトリ名は英数字以外をすべて - にしたもの', () => {
  // ~/.claude/projects/ に実在するディレクトリ名
  assert.equal(projectSlug('/home/motoki-tabata/work/claude-code-canon'), '-home-motoki-tabata-work-claude-code-canon');
  // Windows: ドライブ文字の `:`・`\`・`.`・`_` も置換する
  assert.equal(projectSlug('C:\\Users\\a.b\\work_x'), 'C--Users-a-b-work-x');
});

test('resolveSessionPath: session-id を canon 以外のプロジェクトディレクトリからも解決する', (t) => {
  const root = scratchDir(t, 'tokens-');
  const put = (dir, id) => {
    mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, dir, `${id}.jsonl`), '');
    return path.join(root, dir, `${id}.jsonl`);
  };
  // canon 側にあればそれを採る（他にあっても曖昧にしない）
  const own = put(projectSlug(CANON_ROOT), 'a');
  put('-home-x-target', 'a');
  assert.equal(resolveSessionPath('a', root), own);
  // 対象側にだけあれば横断して採る
  const target = put('-home-x-target', 'b');
  assert.equal(resolveSessionPath('b', root), target);
  // 無ければ throw
  assert.throws(() => resolveSessionPath('none', root), /transcript が無い/);
  // canon 以外の複数にあれば、候補を挙げて throw
  put('-home-x-target', 'c');
  put('-home-y-other', 'c');
  assert.throws(() => resolveSessionPath('c', root), /複数のプロジェクト[\s\S]*-home-x-target[\s\S]*-home-y-other/);
  // .jsonl のパスはそのまま
  assert.equal(resolveSessionPath('rel/x.jsonl', root), path.resolve('rel/x.jsonl'));
});

import { turnRows, formatTurns, turnsReport } from '../tools/token-usage.js';
import { runNodeScript } from './helpers/run-cli.js';
import { ROOT } from './helpers/paths.js';

const tu = (id, name, input) => ({ type: 'tool_use', id, name, input });
const toolResult = (id, content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
const asstBlocks = (id, usage, content) => ({ type: 'assistant', message: { id, model: 'm', usage, content } });

test('turnRows: 同じ message.id をまとめて1ターンにし、増分・ツール・結果の字数・持ち越し（字数×残りターン）を出す', () => {
  const recs = [
    asstBlocks('m1', u(10, 0, 0, 5), [tu('t1', 'Read', { file_path: '/a/b/c.md' })]),
    asstBlocks('m1', u(10, 0, 0, 9), [tu('t2', 'Grep', { pattern: 'a|b' })]), // 同じ id の別ブロック。最後の usage を採る
    toolResult('t1', 'x'.repeat(100)),
    toolResult('t2', [{ type: 'text', text: 'y'.repeat(20) }]),
    asstBlocks('m2', u(1, 0, 50, 3), []),
    asstBlocks('m3', u(1, 100, 50, 2), [tu('t3', 'Bash', { command: 'ls' })]),
    toolResult('t3', 'z'),
  ];
  const rows = turnRows(recs);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { n: 1, total: 10, delta: 10, output: 9, tools: ['Read c.md', 'Grep a/b'], resultChars: 120, carry: 240 });
  assert.equal(rows[1].delta, 41);
  assert.equal(rows[2].carry, 0, '最後のターンは持ち越さない');
  const table = formatTurns('main', rows);
  assert.match(table, /^## main（3 ターン）/);
  assert.equal(table.split('\n').filter((l) => l.startsWith('| ')).length, 1 + 3, '見出しの行のほか、1ターン1行');
  assert.match(table, /持ち越しの合計: 240/);
});

test('tokens --turns: 実際の起動経路で、メインのターン表とサブエージェントの要約を出す。--agent で1体、未知の id は exit 1、--agent だけは exit 2', (t) => {
  const root = scratchDir(t, 'tokens-turns-');
  const jsonl = path.join(root, 'sess.jsonl');
  const sub = path.join(root, 'sess', 'subagents');
  mkdirSync(sub, { recursive: true });
  const lines = (recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(jsonl, lines([asstBlocks('m1', u(5, 0, 0, 1), [tu('t1', 'Read', { file_path: '/x/y.md' })]), toolResult('t1', 'abc'), asstBlocks('m2', u(6, 0, 0, 1), [])]));
  writeFileSync(path.join(sub, 'agent-abc123.jsonl'), lines([asstBlocks('s1', u(7, 0, 0, 1), [])]));
  writeFileSync(path.join(sub, 'agent-abc123.meta.json'), JSON.stringify({ agentType: 'investigator' }));
  const cli = (...a) => runNodeScript(path.join(ROOT, 'tools', 'token-usage.js'), [jsonl, ...a]);
  const all = cli('--turns');
  assert.equal(all.code, 0, all.stderr);
  assert.match(all.stdout, /## main（2 ターン）/);
  assert.match(all.stdout, /\| abc123 \| investigator \| 1 \| 7 \|/);
  const one = cli('--turns', '--agent', 'abc');
  assert.equal(one.code, 0, one.stderr);
  assert.match(one.stdout, /## investigator abc123（1 ターン）/);
  assert.equal(cli('--turns', '--agent', 'zzz').code, 1);
  assert.equal(cli('--agent', 'abc').code, 2);
  assert.equal(turnsReport(jsonl).includes('abc123'), true);
});
