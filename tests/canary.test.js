/**
 * ランタイム・カナリア（gates/canary.js）の回帰テスト。詳細設計書 §11.5。
 *
 * canary.js 自身は「Hooks 配線が生きているか」を証明できない（正直な限界。ファイル冒頭
 * コメント参照）。証明できるのはオーケストレータが実際に Write を試みた結果だけである。
 * ゆえにここでテストするのは「観測結果（denied/allowed）を渡したときの判定・記録・
 * 順序制約の強制が正しいか」——canary.js が担える範囲そのもの。
 *
 * ## 隔離方式（重要）
 *
 * `gates/lib/canon.js` の CANON_ROOT は自分自身の `import.meta.url` から導出され、
 * 注入口が無い（`gates/lib/run.js`・`gates/lib/canon.js` は本タスクで変更禁止）。
 * つまり `gates/canary.js` を素朴に import/実行すると、常に**実リポジトリ**の
 * `work/.session-ts`・`output/<ts>/` を触る。これは `tests/write_scope_guard.test.js`
 * （並行して同じ実ファイルを書き換える別テスト）と衝突し、`node --test` のファイル間
 * 並列実行下で決定論的にレースする（実測: 2ファイル同時実行で100%再現・要修正不可の
 * 既存テストへは触れない制約下での対処として、本ファイル側を隔離する）。
 *
 * 対処: `canary.js`・`lib/canon.js`・`lib/run.js` を使い捨てのサンドボックス
 * ディレクトリへ相対構造を保ったままコピーし、CANON_ROOT がサンドボックスを指すように
 * してから import/実行する。テストごとに使い捨てなので後始末も単純（ディレクトリごと削除）。
 * これにより実リポジトリの `work/`・`output/` を一切触らず、他のどのテストファイルとも
 * 状態を共有しない。
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers/paths.js';
import { scratchDir } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const REAL_GATES = path.join(ROOT, 'gates');
const TS = tsFor(import.meta.url, 0);

/** canary.js + 依存2ファイルを使い捨てサンドボックスへコピーし、CANON_ROOT を隔離する。 */
function makeSandbox(t) {
  const root = scratchDir(t, 'canary-sandbox-');
  mkdirSync(path.join(root, 'gates', 'lib'), { recursive: true });
  copyFileSync(path.join(REAL_GATES, 'lib', 'canon.js'), path.join(root, 'gates', 'lib', 'canon.js'));
  copyFileSync(path.join(REAL_GATES, 'lib', 'run.js'), path.join(root, 'gates', 'lib', 'run.js'));
  copyFileSync(path.join(REAL_GATES, 'canary.js'), path.join(root, 'gates', 'canary.js'));
  return { root, canaryPath: path.join(root, 'gates', 'canary.js') };
}

/** サンドボックス版 canary.js を import する（実パスが異なるので独立したモジュール実体になる）。 */
function loadCanary(sandbox) {
  return import(pathToFileURL(sandbox.canaryPath).href);
}

/** サンドボックス内で <ts> を in-flight にする（.session-ts と output/<ts>/.gate 骨格）。 */
function withRunInSandbox(sandbox, ts, fn) {
  const workRoot = path.join(sandbox.root, 'work');
  mkdirSync(workRoot, { recursive: true });
  mkdirSync(path.join(sandbox.root, 'output', ts, '.gate', 'markers'), { recursive: true });
  mkdirSync(path.join(workRoot, ts, '.requests'), { recursive: true });
  writeFileSync(path.join(workRoot, '.session-ts'), ts + '\n', 'utf8');
  return fn();
}

function removeSessionTs(sandbox) {
  rmSync(path.join(sandbox.root, 'work', '.session-ts'), { force: true });
}

describe('canary パス', () => {
  test('的は output/<ts>/.gate/.canary（deny-all 対象・残骸無害）', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    const rel = mod.canaryTargetRelPath(TS);
    assert.equal(rel, `output/${TS}/.gate/.canary`);
    assert.ok(mod.canaryTargetPath(TS).endsWith(path.join('output', TS, '.gate', '.canary')));
  });
});

describe('evaluateCanary（順序制約の実行時強制）', () => {
  test('run in-flight・denied → guard_alive（正常系）', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    withRunInSandbox(sandbox, TS, () => {
      const r = mod.evaluateCanary({ ts: TS, observed: 'denied' });
      assert.equal(r.ok, true);
      assert.equal(r.verdict, 'guard_alive');
    });
  });

  test('run in-flight・allowed → guard_dead（配線死亡・run 中断すべき）', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    withRunInSandbox(sandbox, TS, () => {
      const r = mod.evaluateCanary({ ts: TS, observed: 'allowed' });
      assert.equal(r.ok, false);
      assert.equal(r.verdict, 'guard_dead');
      assert.match(r.message, /Hooks 配線が.*死んでいる|deny されなかった/);
    });
  });

  test('<ts> 採番前（.session-ts 不在）に撃つと order_error（偽陽性の防止）', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    removeSessionTs(sandbox);
    const r = mod.evaluateCanary({ ts: TS, observed: 'allowed' });
    assert.equal(r.ok, false);
    assert.equal(r.verdict, 'order_error', 'run 外での allowed は「ガード死亡」ではなく「順序エラー」と区別すること');
  });

  test('.session-ts が別の <ts> を指している場合も order_error', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    const otherTs = tsFor(import.meta.url, 1);
    withRunInSandbox(sandbox, otherTs, () => {
      const r = mod.evaluateCanary({ ts: TS, observed: 'denied' });
      assert.equal(r.verdict, 'order_error');
    });
  });

  test('不正な <ts> 形式は invalid_ts', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    const r = mod.evaluateCanary({ ts: 'not-a-ts', observed: 'denied' });
    assert.equal(r.verdict, 'invalid_ts');
  });

  test('observed が denied/allowed 以外なら invalid_observation', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    const r = mod.evaluateCanary({ ts: TS, observed: 'maybe' });
    assert.equal(r.verdict, 'invalid_observation');
  });
});

describe('recordCanary / cleanupCanaryArtifact', () => {
  test('判定結果が processed.log に1行の JSON として追記される', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    withRunInSandbox(sandbox, TS, () => {
      const evaluation = mod.evaluateCanary({ ts: TS, observed: 'denied' });
      mod.recordCanary(TS, evaluation, { observed: 'denied' });
      const logPath = path.join(sandbox.root, 'output', TS, '.gate', 'processed.log');
      const log = readFileSync(logPath, 'utf8').trim().split('\n');
      const last = JSON.parse(log[log.length - 1]);
      assert.equal(last.stage, 'canary');
      assert.equal(last.ok, true);
      assert.equal(last.verdict, 'guard_alive');
    });
  });

  test('cleanupCanaryArtifact: 存在すれば削除して true、無ければ false', async (t) => {
    const sandbox = makeSandbox(t);
    const mod = await loadCanary(sandbox);
    withRunInSandbox(sandbox, TS, () => {
      const p = mod.canaryTargetPath(TS);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, 'leftover', 'utf8');
      assert.equal(mod.cleanupCanaryArtifact(TS), true);
      assert.equal(existsSync(p), false);
      assert.equal(mod.cleanupCanaryArtifact(TS), false, '2回目は既に無いので false');
    });
  });
});

describe('canary CLI', () => {
  function runCli(sandbox, args) {
    try {
      const out = execFileSync(process.execPath, [sandbox.canaryPath, ...args], { encoding: 'utf8', cwd: sandbox.root });
      return { code: 0, stdout: out };
    } catch (err) {
      return { code: err.status, stdout: err.stdout, stderr: err.stderr };
    }
  }

  test('target <ts>: 的パスを1行で表示する', (t) => {
    const sandbox = makeSandbox(t);
    const r = runCli(sandbox, ['target', TS]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), `output/${TS}/.gate/.canary`);
  });

  test('report <ts> denied: exit 0（ガード生存）で processed.log に記録される', (t) => {
    const sandbox = makeSandbox(t);
    withRunInSandbox(sandbox, TS, () => {
      const r = runCli(sandbox, ['report', TS, 'denied']);
      assert.equal(r.code, 0);
      const logPath = path.join(sandbox.root, 'output', TS, '.gate', 'processed.log');
      const log = readFileSync(logPath, 'utf8').trim().split('\n');
      assert.ok(log.some((l) => JSON.parse(l).verdict === 'guard_alive'));
    });
  });

  test('report <ts> allowed: exit 2（ガード死亡・run 中断）で processed.log に記録される', (t) => {
    const sandbox = makeSandbox(t);
    withRunInSandbox(sandbox, TS, () => {
      const r = runCli(sandbox, ['report', TS, 'allowed']);
      assert.equal(r.code, 2, 'exit 2 のみが blocking（docs/L4_AUTOMATION.md §2.1）');
      assert.match(r.stderr, /死んでいる|guard_dead|deny されなかった/);
      const logPath = path.join(sandbox.root, 'output', TS, '.gate', 'processed.log');
      const log = readFileSync(logPath, 'utf8').trim().split('\n');
      assert.ok(log.some((l) => JSON.parse(l).verdict === 'guard_dead'));
    });
  });

  test('<ts> 採番前に report すると exit 2（順序エラー）で、processed.log は書かれない', (t) => {
    const sandbox = makeSandbox(t);
    const r = runCli(sandbox, ['report', TS, 'allowed']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /順序|in-flight/);
    const logPath = path.join(sandbox.root, 'output', TS, '.gate', 'processed.log');
    assert.equal(existsSync(logPath), false, '信頼できない <ts> への監査ログ書込みは行わないこと');
  });
});
