import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, parseFrontmatter, splitListValue, artifactFromText } from '../gates/lib/artifact.js';

describe('detectKind', () => {
  test('SKILL.md はどこにあっても skill', () => {
    assert.equal(detectKind('.claude/skills/foo/SKILL.md'), 'skill');
    assert.equal(detectKind('~/.claude/skills/foo/SKILL.md'), 'skill');
  });
  test('agents/ 配下は agent', () => {
    assert.equal(detectKind('.claude/agents/foo/foo.md'), 'agent');
    assert.equal(detectKind('.claude/agents/foo.md'), 'agent');
  });
  test('rules/ 配下は rule', () => {
    assert.equal(detectKind('.claude/rules/foo.md'), 'rule');
  });
  test('commands/ 配下は廃止予定の skill 扱い', () => {
    assert.equal(detectKind('.claude/commands/foo.md'), 'skill');
  });
  test('どれにも属さないパスは unknown', () => {
    assert.equal(detectKind('src/foo.md'), 'unknown');
  });
});

describe('parseFrontmatter', () => {
  test('frontmatter が無いファイルは present:false・エラー無し', () => {
    const r = parseFrontmatter('# ただの markdown\n本文のみ。');
    assert.equal(r.present, false);
    assert.deepEqual(r.frontmatter, {});
    assert.equal(r.errors.length, 0);
  });

  test('スカラ・配列・ブール・クォート文字列を正しく解釈する', () => {
    const text = [
      '---',
      'name: my-thing',
      'description: "quoted description"',
      "argument-hint: '[ts]'",
      'skills: [a, b, c]',
      'disable-model-invocation: true',
      'user-invocable: false',
      'tools: Read Grep Bash',
      '---',
      '本文',
    ].join('\n');
    const r = parseFrontmatter(text);
    assert.equal(r.present, true);
    assert.equal(r.frontmatter.name.value, 'my-thing');
    assert.equal(r.frontmatter.description.value, 'quoted description');
    assert.equal(r.frontmatter['argument-hint'].value, '[ts]');
    assert.deepEqual(r.frontmatter.skills.value, ['a', 'b', 'c']);
    assert.equal(r.frontmatter['disable-model-invocation'].value, true);
    assert.equal(r.frontmatter['user-invocable'].value, false);
    // tools はキーの意味論に依存するため raw のまま（splitListValue で明示的に分解する）
    assert.equal(r.frontmatter.tools.value, 'Read Grep Bash');
    assert.equal(r.body, '本文');
  });

  test('インラインコメントを剥がす（クォート内の # は無視）', () => {
    const text = ['---', 'model: sonnet  # sonnet, opus, haiku', 'literal: "a # b"', '---', ''].join('\n');
    const r = parseFrontmatter(text);
    assert.equal(r.frontmatter.model.value, 'sonnet');
    assert.equal(r.frontmatter.model.comment, 'sonnet, opus, haiku');
    assert.equal(r.frontmatter.literal.value, 'a # b');
  });

  test('終端 "---" が無ければエラーを積む（黙って空を返さない）', () => {
    const text = '---\nname: x\n本文のつもりが終端が無い';
    const r = parseFrontmatter(text);
    assert.equal(r.present, true);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].type, 'unterminated_block');
  });

  test('key: value 形に一致しない行はエラーへ積む（黙って捨てない）', () => {
    const text = ['---', 'name: x', '  - インデントされた謎の行', '---', ''].join('\n');
    const r = parseFrontmatter(text);
    assert.equal(r.errors.length, 1);
    assert.equal(r.errors[0].type, 'unparsed_line');
    // name は正常にパースできている（部分的失敗が全体を巻き込まない）
    assert.equal(r.frontmatter.name.value, 'x');
  });
});

describe('splitListValue', () => {
  test('配列はそのまま返す', () => {
    assert.deepEqual(splitListValue({ value: ['a', 'b'] }), ['a', 'b']);
  });
  test('空白/カンマ区切り文字列を分解する', () => {
    assert.deepEqual(splitListValue({ value: 'Read, Grep  Bash' }), ['Read', 'Grep', 'Bash']);
  });
  test('未定義エントリは空配列', () => {
    assert.deepEqual(splitListValue(undefined), []);
  });
});

describe('artifactFromText', () => {
  test('kind・frontmatter・body・rawText を一貫して返す', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '---\nname: x\ndescription: d\n---\nbody text');
    assert.equal(a.kind, 'agent');
    assert.equal(a.path, '.claude/agents/x/x.md');
    assert.equal(a.frontmatter.name.value, 'x');
    assert.equal(a.body, 'body text');
    assert.ok(a.rawText.includes('body text'));
    assert.deepEqual(a.errors, []);
  });
});
