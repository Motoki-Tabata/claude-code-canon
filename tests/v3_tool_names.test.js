import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkV3 } from '../.claude/skills/canon-c/scripts/verify/v3-tool-names.js';
import { artifactFromText } from '../lib/artifact.js';

function agent(tools) {
  return artifactFromText('.claude/agents/x/x.md', `---\nname: x\ndescription: d\ntools: ${tools}\n---\nbody`);
}
function skillAllowed(tools) {
  return artifactFromText('.claude/skills/x/SKILL.md', `---\nname: x\nallowed-tools: ${tools}\n---\nbody`);
}

describe('V3 tools/ツール名', () => {
  test('正規ツール名は違反0件', () => {
    const v = checkV3(agent('Read Grep Glob Bash Write Edit Agent'));
    assert.deepEqual(v, []);
  });

  test('既定無効(TodoWrite)・非推奨(TaskOutput)は正規名として通す', () => {
    const v = checkV3(agent('TodoWrite TaskOutput'));
    assert.deepEqual(v, []);
  });

  test('旧称 Task は違反（正規名 Agent を使えと案内）', () => {
    const v = checkV3(agent('Task'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /旧称/);
  });

  test('非実在ツール名は違反', () => {
    const v = checkV3(agent('NotARealTool'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /非実在/);
  });

  test('大文字小文字違いは case 専用の違反種別を作らず、非実在扱いになる', () => {
    const v = checkV3(agent('read'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /非実在/);
  });

  test('MCP の4形式（server__tool / server / server__* / *）はすべて許可', () => {
    const v = checkV3(agent('mcp__github__search mcp__github mcp__github__* mcp__*'));
    assert.deepEqual(v, []);
  });

  test('MCP の不正構文（mcp__ 単体）は違反', () => {
    const v = checkV3(agent('mcp__'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /MCP 命名規約/);
  });

  test('skill の allowed-tools でも同じ規約が適用される', () => {
    const v = checkV3(skillAllowed('Read Task'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /旧称/);
  });

  test('rule には tools 系フィールドが無いので何も検査しない', () => {
    const a = artifactFromText('.claude/rules/x.md', '---\npaths: ["**/*.ts"]\n---\nbody');
    assert.deepEqual(checkV3(a), []);
  });
});

describe('V3: 複数行リストが素通りしない', () => {
  test('tools: の複数行リストの旧称・非実在ツールを検出する', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '---\nname: x\ndescription: d\ntools:\n  - Task\n  - Bogus\n---\nbody');
    const v = checkV3(a);
    assert.equal(v.length, 2, JSON.stringify(v));
    assert.ok(v.some((x) => x.message.includes('"Task"')));
    assert.ok(v.some((x) => x.message.includes('"Bogus"')));
  });

  test('allowed-tools: の複数行リストも同様', () => {
    const a = artifactFromText('.claude/skills/x/SKILL.md', '---\nname: x\nallowed-tools:\n  - Read\n  - Bogus\n---\nbody');
    assert.equal(checkV3(a).length, 1);
  });

  test('リストとして解釈できない複数行（ネストしたマップ）は違反にする（0件で通さない）', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '---\nname: x\ndescription: d\ntools:\n  Read: yes\n---\nbody');
    const v = checkV3(a);
    assert.equal(v.length, 1, JSON.stringify(v));
    assert.match(v[0].message, /リストとして解釈できない/);
  });
});
