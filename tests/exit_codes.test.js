/**
 * CLI の exit code 規約: 0=合格 / 1=違反・拒否・失敗（入力不在を含む）/ 2=引数不正。
 *
 * スクリプトごとに規約がずれると、呼び出し側（SKILL.md・RUN.md）が「2 は拒否」「2 は引数不正」を
 * 取り違える。実際の起動経路（子プロセス）で、引数不正は 2、拒否・失敗は 1 であることを固定する。
 * 実 work/・output/ には存在しない未来日付の ts だけを渡し、何も作らせない。
 * uncaptured・rolled-back の exit 1 は deploy_swap・deploy_pre_check が、RUN.md の exit の文面は
 * deploy_run_manifest が見る。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { scratchDir } from './helpers/fixtures.js';
import { runScript, runNodeScript } from './helpers/run-cli.js';
import { tsFor } from './helpers/ts.js';
import { ROOT, outputDir } from './helpers/paths.js';

const GHOST_TS = tsFor(import.meta.url, 1); // 実在しない ts（作らない）
const TOKENS = path.join(ROOT, 'tools', 'token-usage.js');

test('引数不正は exit 2（deploy・pre-deploy-check・emit-run-manifest・slice・copy-keep・token-usage・review-bundle）', () => {
  const cases = [
    ['canon-d', 'deploy.js', []],
    ['canon-d', 'pre-deploy-check.js', []],
    ['canon-d', 'emit-run-manifest.js', []],
    ['canon-c', 'slice.js', []],
    ['canon-c', 'slice.js', ['not-a-ts']],
    ['canon-c', 'copy-keep.js', []],
    ['canon-c', 'copy-keep.js', ['not-a-ts']],
    ['canon-c', 'review-bundle.js', []],
    ['canon-c', 'review-bundle.js', ['not-a-ts']],
  ];
  for (const [phase, script, args] of cases) {
    const r = runScript(phase, script, args);
    assert.equal(r.code, 2, `${script} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
  const tok = runNodeScript(TOKENS, []);
  assert.equal(tok.code, 2, tok.stderr);
});

test('入力不在・実行時の失敗は exit 1（verify・slice・copy-keep・review-bundle・token-usage・deploy 系）', (t) => {
  for (const [phase, script] of [
    ['canon-c', 'verify.js'],
    ['canon-c', 'slice.js'],
    ['canon-c', 'copy-keep.js'],
    ['canon-c', 'review-bundle.js'],
  ]) {
    const r = runScript(phase, script, [GHOST_TS]);
    assert.equal(r.code, 1, `${script}: ${r.stdout}${r.stderr}`);
  }
  assert.ok(!existsSync(outputDir(GHOST_TS)), '失敗した CLI が output/<ts>/ を作った');

  const tok = runNodeScript(TOKENS, [path.join(scratchDir(t, 'canon-exit-'), 'none.jsonl')]);
  assert.equal(tok.code, 1, tok.stderr);

  const empty = scratchDir(t, 'canon-exit-');
  const target = scratchDir(t, 'canon-exit-');
  for (const script of ['deploy.js', 'pre-deploy-check.js', 'emit-run-manifest.js']) {
    const r = runScript('canon-d', script, [empty, target]);
    assert.equal(r.code, 1, `${script}（generated/ が無い）: ${r.stdout}${r.stderr}`);
  }
});
