import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkG4 } from '../gates/g4_frontmatter_schema.js';
import { artifactFromText } from '../gates/lib/artifact.js';

function agent(fm) {
  return artifactFromText('.claude/agents/x/x.md', `---\n${fm}\n---\nbody`);
}
function skill(fm) {
  return artifactFromText('.claude/skills/x/SKILL.md', `---\n${fm}\n---\nbody`);
}
function rule(fm) {
  return artifactFromText('.claude/rules/x.md', `---\n${fm}\n---\nbody`);
}

describe('G4 frontmatter スキーマ', () => {
  test('agent: name/description が揃っていれば違反0件', () => {
    const v = checkG4(agent('name: x\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent: description 欠落は必須キー違反', () => {
    const v = checkG4(agent('name: x'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /description/);
  });

  test('agent: frontmatter が全く無ければ両方の必須キー違反', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '本文のみ、frontmatterなし');
    const v = checkG4(a);
    assert.equal(v.length, 2);
  });

  test('agent: 未知キーを検出する', () => {
    const v = checkG4(agent('name: x\ndescription: d\ntotallyUnknownKey: 1'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /未知の frontmatter キー/);
  });

  // E3b（2026-08-19・保守課題まとめ処理）: 互換 alias を撤廃し未知キーとして検出する側へ倒した
  // （L3_AGENTS.md:198・公式 sub-agents に複数回の再検証でハイフン形の裏付けが無いと確定）。
  test('agent: disallowed-tools（ハイフン形）は互換受理せず未知キーとして検出する', () => {
    const v = checkG4(agent('name: x\ndescription: d\ndisallowed-tools: Write'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /未知の frontmatter キー/);
  });

  test('agent: disallowedTools（camelCase・公式キー名）は未知キー扱いしない', () => {
    const v = checkG4(agent('name: x\ndescription: d\ndisallowedTools: Write'));
    assert.deepEqual(v, []);
  });

  test('agent: closed 語彙（effort/permissionMode/memory/color）の逸脱を検出する', () => {
    const v = checkG4(agent('name: x\ndescription: d\neffort: extreme\npermissionMode: yolo\nmemory: global\ncolor: magenta'));
    assert.equal(v.length, 4);
  });

  test('agent: permissionMode のエイリアス manual は違反にしない', () => {
    const v = checkG4(agent('name: x\ndescription: d\npermissionMode: manual'));
    assert.deepEqual(v, []);
  });

  test('agent: model は open 語彙なので任意の値を通す（full ID 等）', () => {
    const v = checkG4(agent('name: x\ndescription: d\nmodel: claude-opus-4-8'));
    assert.deepEqual(v, []);
  });

  test('skill: 必須キーは無いので frontmatter 無しでも必須キー違反は出ない', () => {
    const a = artifactFromText('.claude/skills/x/SKILL.md', '本文のみ');
    const v = checkG4(a);
    assert.deepEqual(v, []);
  });

  test('skill: 未知キーを検出する', () => {
    const v = checkG4(skill('name: x\nbogusKey: 1'));
    assert.equal(v.length, 1);
  });

  test('skill: bool 型キーに非 bool 値を入れると型違反', () => {
    const v = checkG4(skill('name: x\ndisable-model-invocation: yes'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /bool 型/);
  });

  test('skill: shell/context の closed 語彙違反を検出する', () => {
    const v = checkG4(skill('name: x\nshell: zsh\ncontext: spawn'));
    assert.equal(v.length, 2);
  });

  test('rule: 未知キー検出は非対応（正典に完全リファレンスが無いため）', () => {
    const v = checkG4(rule('paths: ["**/*.ts"]\nsome-made-up-key: 1'));
    assert.deepEqual(v, []);
  });

  test('kind 不明（unknown）は種別不明の1件を返す（黙って何もしない、を避ける）', () => {
    const a = artifactFromText('random/orphan.md', '---\nname: x\n---\nbody');
    const v = checkG4(a);
    assert.equal(v.length, 1);
    assert.match(v[0].message, /種別/);
  });
});
