/**
 * deploy/deploy.js（工程10②・退避スワップ・§10.2）の統合テスト。
 * greenfield と既存改修(2) の両方で「生成→実配置→ロールバック」を通す。
 * retire/backup は(2)でのみ踏む。post-check 失敗を注入して自動 restore の完全性を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runDeployCli } from './helpers/hook.js';
import { walkManaged, sha256File } from '../gates/lib/managed-paths.js';

const BAK = '.claude-canon.bak.20260722_000000';

/** 対象の管理集合を {rel: sha256} で撮る（配置前後の完全一致比較に使う）。 */
function snapshot(target) {
  const m = {};
  for (const rel of walkManaged(target)) m[rel] = sha256File(path.join(target, rel));
  return m;
}

test('deploy: greenfield 配置成功・集合外は不可侵', (t) => {
  const c = setupTmpCase(t, 'new');
  const srcBefore = sha256File(path.join(c.target, 'src', 'server.js'));
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(path.join(c.target, 'CLAUDE.md')));
  assert.ok(existsSync(path.join(c.target, '.claude', 'skills', 'todo-helper', 'SKILL.md')));
  // 配置物は output とバイト同一
  assert.equal(
    sha256File(path.join(c.target, 'CLAUDE.md')),
    sha256File(path.join(c.output, 'generated', 'CLAUDE.md'))
  );
  // 集合外（プロジェクトソース）は不可侵
  assert.equal(sha256File(path.join(c.target, 'src', 'server.js')), srcBefore);
});

test('deploy: 既存改修 — retire 消去・keep 非退行・new 追加・集合外不可侵・.bak 退避', (t) => {
  const c = setupTmpCase(t, 'existing');
  const keptBefore = sha256File(path.join(c.target, '.claude/skills/kept-skill/SKILL.md'));
  const ciBefore = sha256File(path.join(c.target, '.github/workflows/ci.yml'));
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);

  // retire は対象から消える（削除でなく退避）
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/legacy-skill/SKILL.md')));
  assert.ok(
    existsSync(path.join(c.target, BAK, '.claude/skills/legacy-skill/SKILL.md')),
    'legacy は .bak へ退避されていること'
  );
  // keep は非退行（sha256 同一）
  assert.equal(sha256File(path.join(c.target, '.claude/skills/kept-skill/SKILL.md')), keptBefore);
  // new は追加
  assert.ok(existsSync(path.join(c.target, '.claude/skills/new-skill/SKILL.md')));
  // CLAUDE.md は modify（output と一致）
  assert.equal(
    sha256File(path.join(c.target, 'CLAUDE.md')),
    sha256File(path.join(c.output, 'generated/CLAUDE.md'))
  );
  // 集合外は不可侵
  assert.equal(sha256File(path.join(c.target, '.github/workflows/ci.yml')), ciBefore);
  assert.ok(existsSync(path.join(c.target, 'CODEOWNERS')));
});

test('deploy: --confirm 無しは dry-run（対象不変・退避なし）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /dry-run/);
  assert.deepEqual(snapshot(c.target), before, '配置していないこと');
  assert.ok(!existsSync(path.join(c.target, BAK)), '退避もしていないこと');
});

test('deploy: uncaptured があると配置を拒否（対象不変・P8 機械化）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const surprise = path.join(c.target, '.claude', 'skills', 'surprise', 'SKILL.md');
  mkdirSync(path.dirname(surprise), { recursive: true });
  writeFileSync(surprise, '---\nname: surprise\ndescription: x\n---\n本文\n');
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 2, 'uncaptured は配置拒否');
  assert.match(r.stderr, /拒否/);
  assert.deepEqual(snapshot(c.target), before, '拒否時は対象不変');
  assert.ok(!existsSync(path.join(c.target, BAK)));
});

test('deploy: 配置失敗で自動 restore（配置前と完全一致・.bak 掃除）', (t) => {
  const c = setupTmpCase(t, 'existing');
  // output に実体の無い幽霊エントリを混ぜて step2 を失敗させる（post-check 前に throw）。
  appendFileSync(
    path.join(c.output, '.deploy', 'managed-paths.list'),
    '.claude/skills/ghost/SKILL.md\n'
  );
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 2, '失敗は非ゼロ');
  assert.match(r.stderr, /rolled-back|復帰/);
  assert.deepEqual(snapshot(c.target), before, 'restore で配置前と完全一致');
  assert.ok(!existsSync(path.join(c.target, BAK)), 'restore 後は .bak を掃除して配置前状態へ');
});

test('deploy: merge 元は retired 区分で退避され merged が配置される（統廃合）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);
  // merge 元は対象から消える（削除でなく .bak へ退避）
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-a/SKILL.md')));
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-b/SKILL.md')));
  assert.ok(existsSync(path.join(c.target, BAK, '.claude/skills/merge-a/SKILL.md')), 'merge-a は退避');
  // 統合先 merged が配置される
  assert.ok(existsSync(path.join(c.target, '.claude/skills/merged/SKILL.md')));
});
