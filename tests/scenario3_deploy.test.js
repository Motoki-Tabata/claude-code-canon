/**
 * 代表シナリオ(3)「制約強め」を deploy 工程まで通す統合テスト（§10.2・§15.3）。
 *
 * 従来は generation ゲート群までしか通していなかった。本テストは constrained fixture の
 * output を実 target へ配置し、pre-deploy-check（照合）→ deploy --confirm（退避スワップ）が
 * 期待どおり回ることを固定する:
 *   - 制約で禁止された既存（settings.json の Hooks・context:fork の fork-runner）が retire で消える
 *   - keep（style-guide）は原本と sha256 同一で保全される
 *   - 縮退先（CLAUDE.md・rules/schema-review.md）と README が新規配置される
 *
 * L002 の規律: 「配置が通った」だけを成功の根拠にしない。管理パス集合内の未捕捉ファイルを
 * 注入すると pre-deploy-check が uncaptured で配置を止めることを対で確認する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runDeployCli } from './helpers/hook.js';
import { sha256File } from '../gates/lib/managed-paths.js';

const BAK = '.claude-canon.bak.20260722_000000';

test('代表シナリオ(3): pre-deploy-check は retired のみで exit 0（settings.json・fork-runner）', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const r = runDeployCli('pre-deploy-check.js', [c.output, c.target]);
  assert.equal(r.code, 0, `retired のみなら exit 0（stderr: ${r.stderr}）`);
  assert.match(r.stdout, /\[retired\] \.claude\/settings\.json/);
  assert.match(r.stdout, /\[retired\] \.claude\/skills\/fork-runner\/SKILL\.md/);
  assert.doesNotMatch(r.stdout, /uncaptured\] /, 'uncaptured は0件');
});

test('代表シナリオ(3): deploy --confirm で retire 消去・keep 非退行・縮退先 新規配置', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const keptBefore = sha256File(path.join(c.target, '.claude/skills/style-guide/SKILL.md'));
  const srcBefore = sha256File(path.join(c.target, 'src', 'schema.js'));

  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);

  // 制約で禁止された既存は retire で消える（削除でなく .bak へ退避）
  assert.ok(!existsSync(path.join(c.target, '.claude/settings.json')), 'hooks 設定は消える');
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/fork-runner/SKILL.md')), 'context:fork Skill は消える');
  assert.ok(existsSync(path.join(c.target, BAK, '.claude/settings.json')), 'settings.json は .bak へ退避');
  assert.ok(
    existsSync(path.join(c.target, BAK, '.claude/skills/fork-runner/SKILL.md')),
    'fork-runner は .bak へ退避'
  );

  // keep（style-guide）は非退行（配置前と sha256 同一・output とも一致）
  assert.equal(sha256File(path.join(c.target, '.claude/skills/style-guide/SKILL.md')), keptBefore);
  assert.equal(
    sha256File(path.join(c.target, '.claude/skills/style-guide/SKILL.md')),
    sha256File(path.join(c.output, 'generated/.claude/skills/style-guide/SKILL.md'))
  );

  // 縮退先（R1: deterministic→advisory）と README が新規配置され output と一致
  for (const rel of ['CLAUDE.md', '.claude/rules/schema-review.md', '.claude/README.md']) {
    assert.ok(existsSync(path.join(c.target, rel)), `${rel} が新規配置される`);
    assert.equal(
      sha256File(path.join(c.target, rel)),
      sha256File(path.join(c.output, 'generated', rel)),
      `${rel} が output とバイト同一`
    );
  }

  // 集合外（プロジェクトソース）は不可侵
  assert.equal(sha256File(path.join(c.target, 'src', 'schema.js')), srcBefore);
});

test('代表シナリオ(3): 管理パス集合内の未捕捉ファイルは uncaptured で配置を止める（通過だけを根拠にしない）', (t) => {
  const c = setupTmpCase(t, 'constrained');
  // 調査が取りこぼした（design-map にも retired.list にも無い）既存 Skill を対象に足す。
  const stray = path.join(c.target, '.claude', 'skills', 'stray', 'SKILL.md');
  mkdirSync(path.dirname(stray), { recursive: true });
  writeFileSync(stray, '---\nname: stray\ndescription: 取りこぼし\n---\n本文\n');

  const pre = runDeployCli('pre-deploy-check.js', [c.output, c.target]);
  assert.equal(pre.code, 2, 'uncaptured 検出で exit 2');
  assert.match(pre.stdout, /uncaptured\] \.claude\/skills\/stray\/SKILL\.md/);

  // deploy も P8 を無視した配置を拒否し、対象は変更されない（stray は残る・退避されない）。
  const dep = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(dep.code, 2, 'uncaptured があると deploy は拒否');
  assert.ok(existsSync(stray), '拒否時に対象は不変（stray は退避されない）');
  assert.ok(existsSync(path.join(c.target, '.claude/settings.json')), '拒否時は retire も実行しない');
});
