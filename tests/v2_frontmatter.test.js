import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkV2 } from '../.claude/skills/canon-c/scripts/verify/v2-frontmatter.js';
import { artifactFromText } from '../lib/artifact.js';

function agent(fm) {
  return artifactFromText('.claude/agents/x/x.md', `---\n${fm}\n---\nbody`);
}
function skill(fm) {
  return artifactFromText('.claude/skills/x/SKILL.md', `---\n${fm}\n---\nbody`);
}
function rule(fm) {
  return artifactFromText('.claude/rules/x.md', `---\n${fm}\n---\nbody`);
}

describe('V2 frontmatter スキーマ', () => {
  test('agent: name/description が揃っていれば違反0件', () => {
    const v = checkV2(agent('name: x\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent: description 欠落は必須キー違反', () => {
    const v = checkV2(agent('name: x'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /description/);
  });

  test('agent: frontmatter が全く無ければ両方の必須キー違反', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '本文のみ、frontmatterなし');
    const v = checkV2(a);
    assert.equal(v.length, 2);
  });

  test('agent: 未知キーを検出する', () => {
    const v = checkV2(agent('name: x\ndescription: d\ntotallyUnknownKey: 1'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /未知の frontmatter キー/);
  });

  // E3b（2026-08-19・保守課題まとめ処理）: 互換 alias を撤廃し未知キーとして検出する側へ倒した
  // （L3_AGENTS.md:198・公式 sub-agents に複数回の再検証でハイフン形の裏付けが無いと確定）。
  test('agent: disallowed-tools（ハイフン形）は互換受理せず未知キーとして検出する', () => {
    const v = checkV2(agent('name: x\ndescription: d\ndisallowed-tools: Write'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /未知の frontmatter キー/);
  });

  test('agent: disallowedTools（camelCase・公式キー名）は未知キー扱いしない', () => {
    const v = checkV2(agent('name: x\ndescription: d\ndisallowedTools: Write'));
    assert.deepEqual(v, []);
  });

  test('agent: closed 語彙（effort/permissionMode/memory/color）の逸脱を検出する', () => {
    const v = checkV2(agent('name: x\ndescription: d\neffort: extreme\npermissionMode: yolo\nmemory: global\ncolor: magenta'));
    assert.equal(v.length, 4);
  });

  test('agent: permissionMode のエイリアス manual は違反にしない', () => {
    const v = checkV2(agent('name: x\ndescription: d\npermissionMode: manual'));
    assert.deepEqual(v, []);
  });

  test('agent: model は open 語彙なので任意の値を通す（full ID 等）', () => {
    const v = checkV2(agent('name: x\ndescription: d\nmodel: claude-opus-4-8'));
    assert.deepEqual(v, []);
  });

  test('skill: 必須キーは無いので frontmatter 無しでも必須キー違反は出ない', () => {
    const a = artifactFromText('.claude/skills/x/SKILL.md', '本文のみ');
    const v = checkV2(a);
    assert.deepEqual(v, []);
  });

  test('skill: 未知キーを検出する', () => {
    const v = checkV2(skill('name: x\nbogusKey: 1'));
    assert.equal(v.length, 1);
  });

  test('skill: bool 型キーに非 bool 値を入れると型違反', () => {
    const v = checkV2(skill('name: x\ndisable-model-invocation: yes'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /bool 型/);
  });

  test('skill: shell/context の closed 語彙違反を検出する', () => {
    const v = checkV2(skill('name: x\nshell: zsh\ncontext: spawn'));
    assert.equal(v.length, 2);
  });

  test('rule: 未知キー検出は非対応（正典に完全リファレンスが無いため）', () => {
    const v = checkV2(rule('paths: ["**/*.ts"]\nsome-made-up-key: 1'));
    assert.deepEqual(v, []);
  });

  test('kind 不明（unknown）は種別不明の1件を返す（黙って何もしない、を避ける）', () => {
    const a = artifactFromText('random/orphan.md', '---\nname: x\n---\nbody');
    const v = checkV2(a);
    assert.equal(v.length, 1);
    assert.match(v[0].message, /種別/);
  });
});

describe('V2: frontmatter の構文エラー（artifact.errors）を違反として報告する', () => {
  test('key: value 形に一致しない行（unparsed_line）は違反', () => {
    const v = checkV2(agent('name: x\ndescription: d\n  - 迷子の行'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /構文/);
    assert.match(v[0].message, /unparsed_line/);
  });

  test('キー重複（duplicate_key）は違反', () => {
    const v = checkV2(agent('name: x\ndescription: d\nname: y'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /duplicate_key/);
  });

  test('閉じ無しブロック（unterminated_block）は違反（必須キー欠落とは別に報告する）', () => {
    const a = artifactFromText('.claude/agents/x/x.md', '---\nname: x\ndescription: d\n本文');
    const v = checkV2(a);
    assert.ok(v.some((x) => /unterminated_block/.test(x.message)), JSON.stringify(v));
  });

  test('複数行リスト・ネストしたマップは構文エラーにしない（rule の paths:・skill の hooks:）', () => {
    assert.deepEqual(checkV2(rule('paths:\n  - "lib/**"\n  - "tests/**"')), []);
    assert.deepEqual(checkV2(skill('name: x\ndescription: d\nhooks:\n  PreToolUse:\n    - matcher: Bash')), []);
  });
});
