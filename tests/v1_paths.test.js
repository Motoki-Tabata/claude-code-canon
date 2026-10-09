import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkV1 } from '../.claude/skills/canon-c/scripts/verify/v1-paths.js';
import { artifactFromText } from '../lib/artifact.js';

function art(p, fm = '') {
  return artifactFromText(p, `---\n${fm}\n---\nbody`);
}

describe('V1 パス規約', () => {
  test('正しい agent 配置（dir 形）は違反0件', () => {
    const v = checkV1(art('.claude/agents/foo/foo.md', 'name: foo\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('正しい agent 配置（flat 形）は違反0件', () => {
    const v = checkV1(art('.claude/agents/foo.md', 'name: foo\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent はディレクトリ名と name が不一致でも違反にしない', () => {
    const v = checkV1(art('.claude/agents/dirname/dirname.md', 'name: totally-different\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent は .claude/agents/ の下を再帰的に置ける（深いサブディレクトリも違反にしない）', () => {
    const v = checkV1(art('.claude/agents/too/deep/extra.md', 'name: x\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent が .claude/agents/ の外にあるときは違反でなく未判定（paths:files は complete: false）', () => {
    const v = checkV1(art('.claude/team/agents/x.md', 'name: x\ndescription: d'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'undetermined');
    assert.match(v[0].source, /V-common-01/);
  });

  test('skill はディレクトリ名と name の一致を要求する（設計由来・第3の例外）', () => {
    const v = checkV1(art('.claude/skills/mydir/SKILL.md', 'name: other-name\ndescription: d'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /設計由来の要件/);
  });

  test('skill でディレクトリ名と name が一致していれば違反0件', () => {
    const v = checkV1(art('.claude/skills/mydir/SKILL.md', 'name: mydir\ndescription: d'));
    assert.deepEqual(v, []);
  });

  // -------------------------------------------------------------------------
  // supporting files（canon-reference の skills.md §3・V-skills-18 が前提にする補助ファイル）。
  // 「skill ディレクトリ配下のファイル名は固定 SKILL.md」として template.md・examples/*.md を
  // 一律違反にすると、正典に反する誤検出になる（V6 は逆に supporting file の実在を要求する）。
  // 狭めた側（supporting は通す）と、狭めていない側（真の配置逸脱は依然として弾く）の
  // 両方を固定する——緩和が「何も検出しない」に化けていないことの生存証明。
  // -------------------------------------------------------------------------
  test('skill パッケージ直下の supporting file（template.md）は違反0件', () => {
    assert.deepEqual(checkV1(artifactFromText('.claude/skills/mydir/template.md', '# テンプレート\n')), []);
  });

  test('skill パッケージのサブディレクトリの supporting file（examples/sample.md）は違反0件', () => {
    assert.deepEqual(checkV1(artifactFromText('.claude/skills/mydir/examples/sample.md', '例\n')), []);
  });

  test('supporting file には設計由来の「ディレクトリ名＝name 一致」を課さない', () => {
    // examples/SKILL.md は例示用の supporting file であって定義ファイルではない。
    const v = checkV1(art('.claude/skills/mydir/examples/SKILL.md', 'name: some-example\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('skills ルート直下のファイル（パッケージ無し）は依然として違反（緩和の生存証明）', () => {
    const v = checkV1(art('.claude/skills/orphan.md', 'name: orphan'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /SKILL\.md/);
  });

  test('.claude/commands/ は Skill に統合された古い形式の警告（error ではなく warning）', () => {
    const v = checkV1(art('.claude/commands/legacy.md', 'name: legacy'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'warning');
  });

  test('rule の正しい配置は違反0件（サブディレクトリも可・V-rules-01）', () => {
    assert.deepEqual(checkV1(art('.claude/rules/foo.md', 'paths: ["**/*.ts"]')), []);
    assert.deepEqual(checkV1(art('.claude/rules/frontend/foo.md', 'paths: ["**/*.ts"]')), []);
  });

  test('rule が .claude/rules/ の外にあるときは違反（V-rules-01 は確定の規則）', () => {
    const v = checkV1(art('lib/rules/foo.md', 'paths: ["**/*.ts"]'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'error');
    assert.match(v[0].source, /V-rules-01/);
  });

  test('出力スタイルの正しい配置（.claude/output-styles/*.md・plugin/output-styles/）は違反0件（V-output-styles-05）', () => {
    assert.deepEqual(checkV1(art('.claude/output-styles/terse.md', 'name: terse\ndescription: d')), []);
    assert.deepEqual(checkV1(art('plugin/output-styles/terse.md', 'name: terse\ndescription: d')), []);
  });

  test('出力スタイルがサブディレクトリにあるときは違反でなく未判定（paths:files は complete: false）', () => {
    const v = checkV1(art('.claude/output-styles/team/terse.md', 'name: terse'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'undetermined');
    assert.match(v[0].source, /V-output-styles-05/);
  });

  test('既知の配置に属さないパスは違反でなく未判定（paths:files は complete: false）', () => {
    const v = checkV1(art('random/place/orphan.md', 'name: orphan'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'undetermined');
    assert.match(v[0].message, /未判定/);
  });
});
