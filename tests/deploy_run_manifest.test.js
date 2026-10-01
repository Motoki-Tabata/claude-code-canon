/**
 * canon-d/scripts/emit-run-manifest.js（RUN.md・artifacts.md §10.4）の回帰テスト。
 *
 * output バンドルに同梱する RUN.md が、配置/廃止される集合と実行コマンドを決定論的に
 * 反映することを固定する。テンプレート変数（<ts>・パス）が未展開のまま残らないことも確認する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { renderRunManifest } from '../.claude/skills/canon-d/scripts/emit-run-manifest.js';

test('emit-run-manifest: RUN.md に両コマンド・配置集合・廃止集合・<ts> が入る', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const r = runScript('canon-d', 'emit-run-manifest.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);

  const runMd = path.join(c.output, 'deploy', 'RUN.md');
  assert.ok(existsSync(runMd), 'RUN.md が output/<ts>/deploy/ に出力される');
  const body = readFileSync(runMd, 'utf8');

  // 実行コマンド（pre-deploy-check / deploy --confirm）が canon 本体の canon-d/scripts を指す
  assert.match(body, /\.claude\/skills\/canon-d\/scripts\/pre-deploy-check\.js/);
  assert.match(body, /\.claude\/skills\/canon-d\/scripts\/deploy\.js/);
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
  rmSync(path.join(c.output, 'deploy', 'managed-paths.list'));
  const r = runScript('canon-d', 'emit-run-manifest.js', [c.output, c.target]);
  assert.equal(r.code, 1, 'emit-manifest.js の配置リスト欠落は入力不在として exit 1');
  assert.ok(!existsSync(path.join(c.output, 'deploy', 'RUN.md')), '入力欠落時に RUN.md を書かない');
});

test('emit-run-manifest(render): 集合が空でも本文を組み立てられる（要約は「なし」）', (t) => {
  // 純関数を直接叩く（CLI 前提の入力検査を経由しない経路の単体確認）。
  const c = setupTmpCase(t, 'new');
  const body = renderRunManifest(c.output, c.target);
  assert.match(body, /配置される管理パス集合/);
  assert.match(body, /対象から消える/);
});

test('RUN.md に実行環境の注意（サンドボックスの外で --confirm・push は対象のセッションで・SSH ホスト）が入る', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const body = renderRunManifest(c.output, c.target);
  assert.match(body, /## 実行環境の注意/);
  assert.match(body, /`--confirm` はサンドボックスの外/, '前回の事故（EBUSY で半壊）をそのまま防ぐ1行が無い');
  assert.match(body, /EBUSY/);
  assert.match(body, /対象リポジトリで起動した Claude Code セッションで行う/);
  assert.match(body, /github\.com:22/);
  assert.match(body, /deploy-result\.json/);
});

test('RUN.md に MANIFEST「配置時の追加手順」節と README「前提セットアップと配置後の手作業」節を逐語で転記する', (t) => {
  const c = setupTmpCase(t, 'constrained');
  const steps = '## 配置時の追加手順\n\n1. 配置前: `node x.mjs check --root <target>`。\n2. 配置後: 反映済み5件だけを削除する。\n';
  writeFileSync(path.join(c.output, 'MANIFEST.md'), readFileSync(path.join(c.output, 'MANIFEST.md'), 'utf8') + '\n' + steps);
  const readme = path.join(c.output, 'generated', '.claude', 'README.md');
  writeFileSync(readme, readFileSync(readme, 'utf8') + '\n## 前提セットアップと配置後の手作業\n\n- 台帳の反映済み5件だけを削除する（台帳ごと消さない）。\n');
  const body = renderRunManifest(c.output, c.target);
  assert.match(body, /#### 配置時の追加手順/, '見出しを RUN.md の章の下へ下げて転記する');
  assert.ok(body.includes('1. 配置前: `node x.mjs check --root <target>`。'), '手順が逐語で入っていない');
  assert.ok(body.includes('- 台帳の反映済み5件だけを削除する（台帳ごと消さない）。'), '配置後の手作業が逐語で入っていない');
});

test('RUN.md: 追加手順・配置後の手作業の節が無ければ「無い」と明示する（黙って省かない）', (t) => {
  const c = setupTmpCase(t, 'new');
  const body = renderRunManifest(c.output, c.target);
  assert.match(body, /この run に固有の追加手順は無い/);
});
