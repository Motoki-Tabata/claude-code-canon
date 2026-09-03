import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkG3 } from '../gates/g3_path_convention.js';
import { artifactFromText } from '../gates/lib/artifact.js';

function art(p, fm = '') {
  return artifactFromText(p, `---\n${fm}\n---\nbody`);
}

describe('G3 パス規約', () => {
  test('正しい agent 配置（dir 形）は違反0件', () => {
    const v = checkG3(art('.claude/agents/foo/foo.md', 'name: foo\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('正しい agent 配置（flat 形）は違反0件', () => {
    const v = checkG3(art('.claude/agents/foo.md', 'name: foo\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent はディレクトリ名と name が不一致でも違反にしない（正典 L3_AGENTS.md:154）', () => {
    const v = checkG3(art('.claude/agents/dirname/dirname.md', 'name: totally-different\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('agent の配置が深すぎるパスは違反', () => {
    const v = checkG3(art('.claude/agents/too/deep/extra.md', 'name: x\ndescription: d'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /許可パターン/);
  });

  test('skill はディレクトリ名と name の一致を要求する（設計由来・第3の例外）', () => {
    const v = checkG3(art('.claude/skills/mydir/SKILL.md', 'name: other-name\ndescription: d'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /設計由来の要件/);
  });

  test('skill でディレクトリ名と name が一致していれば違反0件', () => {
    const v = checkG3(art('.claude/skills/mydir/SKILL.md', 'name: mydir\ndescription: d'));
    assert.deepEqual(v, []);
  });

  // -------------------------------------------------------------------------
  // supporting files（正典 docs/L2_SKILLS.md §2.1「ディレクトリ構造」の明示的許可）。
  // 旧 G3 は「skill ディレクトリ配下のファイル名は固定 SKILL.md」として template.md・
  // examples/*.md を一律違反にしていたが、これは正典に反する誤検出だった（G7 の判定④は
  // 逆に supporting file の実在を要求しており、両ゲートが正面から矛盾していた）。
  // 狭めた側（supporting は通す）と、狭めていない側（真の配置逸脱は依然として弾く）の
  // 両方を固定する——緩和が「何も検出しない」に化けていないことの生存証明。
  // -------------------------------------------------------------------------
  test('skill パッケージ直下の supporting file（template.md）は違反0件', () => {
    assert.deepEqual(checkG3(artifactFromText('.claude/skills/mydir/template.md', '# テンプレート\n')), []);
  });

  test('skill パッケージのサブディレクトリの supporting file（examples/sample.md）は違反0件', () => {
    assert.deepEqual(checkG3(artifactFromText('.claude/skills/mydir/examples/sample.md', '例\n')), []);
  });

  test('supporting file には設計由来の「ディレクトリ名＝name 一致」を課さない', () => {
    // examples/SKILL.md は例示用の supporting file であって定義ファイルではない。
    const v = checkG3(art('.claude/skills/mydir/examples/SKILL.md', 'name: some-example\ndescription: d'));
    assert.deepEqual(v, []);
  });

  test('skills ルート直下のファイル（パッケージ無し）は依然として違反（緩和の生存証明）', () => {
    const v = checkG3(art('.claude/skills/orphan.md', 'name: orphan'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /SKILL\.md/);
  });

  test('.claude/commands/ は廃止予定の警告（error ではなく warning）', () => {
    const v = checkG3(art('.claude/commands/legacy.md', 'name: legacy'));
    assert.equal(v.length, 1);
    assert.equal(v[0].severity, 'warning');
  });

  test('rule の正しい配置は違反0件', () => {
    const v = checkG3(art('.claude/rules/foo.md', 'paths: ["**/*.ts"]'));
    assert.deepEqual(v, []);
  });

  test('既知ファミリーに属さないパスは違反', () => {
    const v = checkG3(art('random/place/orphan.md', 'name: orphan'));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /既知の配置ファミリー/);
  });
});
