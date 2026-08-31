/**
 * deploy/emit-run-manifest.js（run-manifest 方式・§10.2・§14）の回帰テスト。
 *
 * output バンドルに同梱する RUN.md が、配置/廃止される集合と実行コマンドを決定論的に
 * 反映することを固定する。テンプレート変数（<ts>・パス）が未展開のまま残らないことも確認する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runDeployCli } from './helpers/hook.js';
import { renderRunManifest } from '../deploy/emit-run-manifest.js';

test('emit-run-manifest: RUN.md に両コマンド・配置集合・廃止集合・<ts> が入る', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const r = runDeployCli('emit-run-manifest.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);

  const runMd = path.join(c.output, '.deploy', 'RUN.md');
  assert.ok(existsSync(runMd), 'RUN.md が output/<ts>/.deploy/ に出力される');
  const body = readFileSync(runMd, 'utf8');

  // 実行コマンド（pre-deploy-check / deploy --confirm）が canon 正本を指す
  assert.match(body, /deploy\/pre-deploy-check\.js/);
  assert.match(body, /deploy\/deploy\.js/);
  assert.match(body, /--confirm/);

  // 配置される集合（新規＋keep）
  for (const rel of [
    'CLAUDE.md',
    '.claude/README.md',
    '.claude/rules/schema-review.md',
    '.claude/skills/style-guide/SKILL.md',
  ]) {
    assert.ok(body.includes(rel), `配置集合に ${rel} が列挙される`);
  }

  // 廃止される集合（retire）
  for (const rel of ['.claude/settings.json', '.claude/skills/fork-runner/SKILL.md']) {
    assert.ok(body.includes(rel), `廃止集合に ${rel} が列挙される`);
  }

  // <ts> が展開されている（テンプレートのプレースホルダが残っていない）
  const ts = path.basename(c.output);
  assert.ok(body.includes(ts), 'RUN.md に実 <ts> が入る');
  assert.ok(!/<ts>=<ts>/.test(body), 'プレースホルダ <ts> がリテラルで残っていない');
  assert.ok(body.includes(`.claude-canon.bak.${ts}`), 'ロールバック手順が実 <ts> の .bak を指す');
});

test('emit-run-manifest: managed-paths.list が無ければ exit 1（黙って空手順書を出さない）', (t) => {
  const c = setupTmpCase(t, 'constrained');
  rmSync(path.join(c.output, '.deploy', 'managed-paths.list'));
  const r = runDeployCli('emit-run-manifest.js', [c.output, c.target]);
  assert.equal(r.code, 1, 'generator の配置リスト欠落は入力不在として exit 1');
  assert.ok(!existsSync(path.join(c.output, '.deploy', 'RUN.md')), '入力欠落時に RUN.md を書かない');
});

test('emit-run-manifest(render): 集合が空でも本文を組み立てられる（要約は「なし」）', (t) => {
  // 純関数を直接叩く（CLI 前提の入力検査を経由しない経路の単体確認）。
  const c = setupTmpCase(t, 'new');
  const body = renderRunManifest(c.output, c.target);
  assert.match(body, /配置される管理パス集合/);
  assert.match(body, /対象から消える/);
});
