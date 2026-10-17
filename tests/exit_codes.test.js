/**
 * CLI の exit code 規約: 0=合格 / 1=違反・拒否・失敗（入力不在を含む）/ 2=引数不正。
 *
 * スクリプトごとに規約がずれると、呼び出し側（SKILL.md）が「2 は拒否」「2 は引数不正」を
 * 取り違える。実際の起動経路（子プロセス）で、引数不正は 2、入力不在は 1 であることを固定する。
 * 実 work/ には存在しない未来日付の ts だけを渡し、何も作らせない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { scratchDir } from './helpers/fixtures.js';
import { runNodeScript } from './helpers/run-cli.js';
import { tsFor } from './helpers/ts.js';
import { ROOT, workDir } from './helpers/paths.js';

const GHOST_TS = tsFor(import.meta.url, 1); // 実在しない ts（作らない）
const tool = (name) => path.join(ROOT, 'tools', name);

test('引数不正は exit 2（verify・token-usage）', () => {
  for (const [script, args] of [
    ['verify.js', []],
    ['verify.js', ['not-a-ts']],
    ['token-usage.js', []],
  ]) {
    const r = runNodeScript(tool(script), args);
    assert.equal(r.code, 2, `${script} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  }
});

test('入力不在・実行時の失敗は exit 1（verify・token-usage）', (t) => {
  const v = runNodeScript(tool('verify.js'), [GHOST_TS]);
  assert.equal(v.code, 1, `verify.js: ${v.stdout}${v.stderr}`);
  assert.ok(!existsSync(workDir(GHOST_TS)), '失敗した CLI が work/<ts>/ を作った');

  const tok = runNodeScript(tool('token-usage.js'), [path.join(scratchDir(t, 'canon-exit-'), 'none.jsonl')]);
  assert.equal(tok.code, 1, tok.stderr);
});
