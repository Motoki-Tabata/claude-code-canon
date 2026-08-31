/**
 * 機能Y 自己再生成（詳細設計書 §13.2.1）の回帰テスト。
 *
 * 中心的な関心は3つ:
 *   (1) self-optimize-scope-guard は write-scope-guard と異なり、**終端マーカー
 *       （generation.done）後も sentinel が在る限り保護を解かない**（3リスク(1) 自己コード
 *       改変の露出点を塞ぐ本体・§13.2.1）。
 *   (2) 世代ステージング（tools/stage-candidate.js）は G7〜G12 通過・P6 承認・uncaptured 0件・
 *       `.claude/` 限定を機械で確認してから候補を取り込む。
 *   (3) deploy/ 3スクリプトは対象に claude-canon 自身を指定する経路を持たない（昇格前検証の
 *       迂回を防ぐ）。promote.js は settings.json 欠落・self-optim 途中の昇格を拒否する。
 *
 * ts は `tests/helpers/ts.js` のレジストリ経由（本ファイル専有の名前空間・重複はレジストリの
 * 一意性検査で機械検出される）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { stageCandidate } from '../tools/stage-candidate.js';
import { runPromote } from '../tools/promote.js';
import { readCurrent, liveClaudeDir } from '../gates/lib/generations.js';
import { mintMarker } from '../gates/lib/run.js';
import { setupTmpCase, scratchDir, writeAgent } from './helpers/fixtures.js';
import { runDeployCli, runToolCli, decide } from './helpers/hook.js';
import {
  ROOT,
  posix,
  DESIGN_DOCS,
  SESSION_TS_FILE,
  SELF_OPTIM_FILE,
  CANON_UPDATE_SESSION_TS_FILE,
  outputDir,
  workDir,
} from './helpers/paths.js';
import { withSelfOptim, withoutSentinel, stashFile, cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

const TS = tsFor(import.meta.url, 0);
const abs = (rel) => `${posix(ROOT)}/${rel}`;

// ---------------------------------------------------------------------------
// (1) gates/self-optimize-scope-guard.js
// ---------------------------------------------------------------------------

const GUARD = path.join(ROOT, 'gates', 'self-optimize-scope-guard.js');

test('self-optimize-scope-guard: sentinel 無しなら run 外として素通り', (t) => {
  withoutSentinel(t, SELF_OPTIM_FILE);
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('.claude/settings.json') } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "Set-Content docs/foo.md 'x'" } }), 'allow');
});

test('self-optimize-scope-guard: sentinel 在中は .claude/・docs/・gates/・tests/・design/（設計書2冊）・generations/ を deny', (t) => {
  withSelfOptim(t, TS);
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('.claude/settings.json') } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('docs/00_INDEX.md') } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('gates/g1_stage_order.js') } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('tests/foo.test.js') } }), 'deny');
  for (const d of DESIGN_DOCS) {
    assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs(d) } }), 'deny', `${d} は保護される`);
  }
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('generations/candidate-x/.claude/foo.md') } }),
    'deny',
    '候補の取り込みは tools/stage-candidate.js に一本化するため、エージェント書込は generations/ 全体を deny'
  );
});

test('self-optimize-scope-guard: sanctioned（output/<ts>/・work/<ts>/）は allow・.gate/** は deny-all', (t) => {
  withSelfOptim(t, TS);
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs(`output/${TS}/generated/.claude/agents/foo/foo.md`) } }),
    'allow'
  );
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs(`work/${TS}/target.txt`) } }), 'allow');
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs(`output/${TS}/.gate/approvals/generation.approved`) } }),
    'deny',
    '.gate/** は deny-all（§4.4 と同じ規律）'
  );
});

test('self-optimize-scope-guard: シェル経由の保護パス書込を deny・無害なコマンドは誤検出しない', (t) => {
  withSelfOptim(t, TS);
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "Set-Content .claude/settings.json 'x'" } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'echo x > docs/foo.md' } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-Content docs/00_INDEX.md' } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'npm test' } }), 'allow');
});

// L023（fd 複製の誤検知・退行防止）は3ガード共通の SSoT（gates/lib/shell-write.js）に
// 由来する振る舞いのため、tests/shell_guard_ssot.test.js のテーブル駆動テストへ統合した。

test('self-optimize-scope-guard: 【核心】終端マーカー（generation.done）鋳造後も sentinel が在れば .claude/ を deny し続ける', (t) => {
  withSelfOptim(t, TS, { mintTerminalMarker: true });
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('.claude/settings.json') } }),
    'deny',
    'write-scope-guard は終端マーカーで run 外扱いになるが、self-optimize-scope-guard は sentinel 基準のため解けてはならない'
  );
});

test('self-optimize-scope-guard: sentinel を消せば（残置マーカーがあっても）素通りに戻る', (t) => {
  withSelfOptim(t, TS, { mintTerminalMarker: true });
  // sentinel だけ先に消す（マーカーは残したまま）。
  rmSync(SELF_OPTIM_FILE, { force: true });
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: abs('.claude/settings.json') } }), 'allow');
});

// ---------------------------------------------------------------------------
// (2) tools/stage-candidate.js
// ---------------------------------------------------------------------------

function makeStageScratch(t) {
  const scratch = scratchDir(t, 'canon-stage-test-');
  const outDir = path.join(scratch, 'output', TS);
  writeAgent(path.join(outDir, 'generated'), 'foo', {
    description: 'stage-candidate test fixture',
    tools: 'Read',
    model: 'sonnet',
    body: 'foo',
  });
  return { scratch, outputDir: outDir };
}
function mintGenerationDone(outputDir) {
  mkdirSync(path.join(outputDir, '.gate', 'markers'), { recursive: true });
  writeFileSync(path.join(outputDir, '.gate', 'markers', 'generation.done'), '{}\n', 'utf8');
}
function mintGenerationApproved(outputDir) {
  mkdirSync(path.join(outputDir, '.gate', 'approvals'), { recursive: true });
  writeFileSync(path.join(outputDir, '.gate', 'approvals', 'generation.approved'), '{}\n', 'utf8');
}

test('stage-candidate: generation.done が無ければ拒否', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  const r = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /generation\.done/);
});

test('stage-candidate: generation.approved が無ければ拒否（done のみでは不十分）', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  mintGenerationDone(outputDir);
  const r = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /generation\.approved/);
});

test('stage-candidate: .claude/ 配下でないファイルが混入していれば拒否', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  mintGenerationDone(outputDir);
  mintGenerationApproved(outputDir);
  writeFileSync(path.join(outputDir, 'generated', 'CLAUDE.md'), '# root claude.md\n', 'utf8');
  const r = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /\.claude\/ 配下でない/);
});

test('stage-candidate: uncaptured を検出したら拒否（稼働中の資産が候補で消える恐れ）', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  mintGenerationDone(outputDir);
  mintGenerationApproved(outputDir);
  // 「稼働中」の .claude/ に候補側が持たない管理ファイルを置く（取りこぼしの模擬）。
  writeAgent(scratch, 'orphan', { description: 'uncaptured fixture', tools: 'Read', model: 'sonnet', body: 'orphan' });
  const r = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, false);
  assert.match(r.reason, /uncaptured/);
  assert.ok(r.uncaptured.includes('.claude/agents/orphan/orphan.md'));
});

test('stage-candidate: 正常系はステージング成功し SOURCE_RUN を記録する', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  mintGenerationDone(outputDir);
  mintGenerationApproved(outputDir);
  const r = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(r.ok, true, r.reason);
  assert.ok(existsSync(path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'foo', 'foo.md')));
  assert.equal(
    readFileSync(path.join(scratch, 'generations', 'candidate-demo', 'SOURCE_RUN'), 'utf8').trim(),
    TS
  );
});

test('stage-candidate: 既存候補は --force 無しでは上書き拒否、--force 有りなら上書き成功', (t) => {
  const { scratch, outputDir } = makeStageScratch(t);
  mintGenerationDone(outputDir);
  mintGenerationApproved(outputDir);
  const first = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(first.ok, true, first.reason);

  const second = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch });
  assert.equal(second.ok, false);
  assert.match(second.reason, /--force/);

  // 内容を変えて --force で上書きされることを確認する。
  writeAgent(path.join(outputDir, 'generated'), 'foo', { description: 'updated', tools: 'Read', model: 'sonnet', body: 'updated' });
  const third = stageCandidate({ outputDir, label: 'demo', canonRoot: scratch, force: true });
  assert.equal(third.ok, true, third.reason);
  assert.match(
    readFileSync(path.join(scratch, 'generations', 'candidate-demo', '.claude', 'agents', 'foo', 'foo.md'), 'utf8'),
    /updated/
  );
});

// ---------------------------------------------------------------------------
// (3) deploy/ 3スクリプトの自己指定拒否（§10.2・§13.2.1）
// ---------------------------------------------------------------------------

test('deploy 3スクリプトは対象に claude-canon 自身を指定すると拒否する', (t) => {
  const c = setupTmpCase(t, 'new');
  const preCheck = runDeployCli('pre-deploy-check.js', [c.output, ROOT]);
  assert.equal(preCheck.code, 1, preCheck.stdout + preCheck.stderr);
  assert.match(preCheck.stderr, /claude-canon 自身/);

  const deploy = runDeployCli('deploy.js', [c.output, ROOT]);
  assert.equal(deploy.code, 1, deploy.stdout + deploy.stderr);
  assert.match(deploy.stderr, /claude-canon 自身/);

  const runManifest = runDeployCli('emit-run-manifest.js', [c.output, ROOT]);
  assert.equal(runManifest.code, 1, runManifest.stdout + runManifest.stderr);
  assert.match(runManifest.stderr, /claude-canon 自身/);
});

// ---------------------------------------------------------------------------
// (4) tools/promote.js の追加前提（§13.2.1）
// ---------------------------------------------------------------------------

function fakeRunTestsPass() {
  /* no-op */
}

test('promote: 候補に .claude/settings.json が無ければ拒否', (t) => {
  const scratch = scratchDir(t, 'canon-promote-nosettings-');
  writeAgent(path.join(scratch, 'generations', 'candidate-nosettings'), 'foo', {
    description: 'no settings fixture',
    tools: 'Read',
    model: 'sonnet',
    body: 'foo',
  });
  const r = runPromote({
    label: 'nosettings',
    canonRoot: scratch,
    runTests: fakeRunTestsPass,
    skipMutualExclusionCheck: true,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /settings\.json/);
});

test('promote: 自己最適化 run が in-flight の間は昇格を拒否する', (t) => {
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, SESSION_TS_FILE);
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  rmSync(SESSION_TS_FILE, { force: true });
  rmSync(CANON_UPDATE_SESSION_TS_FILE, { force: true });
  writeFileSync(SELF_OPTIM_FILE, `demo-label\n${TS}\n`, 'utf8');
  const r = runPromote({ label: 'anything', canonRoot: path.join(ROOT, 'fixtures'), runTests: fakeRunTestsPass });
  assert.equal(r.ok, false);
  assert.match(r.reason, /自己最適化 run/);
});

test('promote: --dry-run は G13・G3〜G6・前提検査のみ行い、スワップ・npm test を伴わない', (t) => {
  const scratch = scratchDir(t, 'canon-promote-dryrun-');
  writeAgent(scratch, 'placeholder', { description: 'baseline placeholder', tools: 'Read', model: 'sonnet', body: 'baseline' });

  const candDir = path.join(scratch, 'generations', 'candidate-good-demo', '.claude');
  mkdirSync(path.dirname(candDir), { recursive: true });
  cpSync(path.join(ROOT, 'fixtures', 'generations', 'candidate-good-demo', '.claude'), candDir, { recursive: true });

  let testsCalled = false;
  const r = runPromote({
    label: 'good-demo',
    canonRoot: scratch,
    runTests: () => {
      testsCalled = true;
    },
    skipMutualExclusionCheck: true,
    dryRun: true,
    // fixture に SOURCE_RUN が無い（本テストの関心は --dry-run がスワップ/npm test を
    // 伴わないことであり乖離検出ではない）。乖離検出は promote_divergence.test.js で検証。
    acceptDivergence: true,
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.dryRun, true);
  assert.equal(testsCalled, false, '--dry-run は npm test を実行しない');
  assert.equal(readCurrent(scratch), null, '--dry-run は CURRENT を更新しない');
  assert.ok(
    !existsSync(path.join(liveClaudeDir(scratch), 'agents', 'demo-helper')),
    '--dry-run は現行 .claude/ をスワップしない'
  );
  assert.ok(existsSync(path.join(liveClaudeDir(scratch), 'agents', 'placeholder')), '旧世代がそのまま残っている');
});

// ---------------------------------------------------------------------------
// (5) 3方向相互排他: tools/new-ts.js・tools/new-canon-ts.js が self-optim を検査する
// ---------------------------------------------------------------------------

test('new-ts.js は自己最適化 run が in-flight の間は新規採番を拒否する', (t) => {
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, SESSION_TS_FILE);
  cleanupTs(t, TS);
  writeFileSync(SELF_OPTIM_FILE, `demo-label\n${TS}\n`, 'utf8');
  const r = runToolCli('new-ts.js', [TS]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /自己最適化 run/);
  assert.ok(!existsSync(outputDir(TS)), '拒否時は output/<ts> を作らない');
});

test('new-canon-ts.js は自己最適化 run が in-flight の間は新規採番を拒否する', (t) => {
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  cleanupTs(t, TS);
  writeFileSync(SELF_OPTIM_FILE, `demo-label\n${TS}\n`, 'utf8');
  const r = runToolCli('new-canon-ts.js', [TS]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /自己最適化 run/);
  assert.ok(!existsSync(outputDir(TS)), '拒否時は output/<ts> を作らない');
});

// ---------------------------------------------------------------------------
// (6) tools/selfopt.js（begin/end/status・相互排他）
// ---------------------------------------------------------------------------

test('selfopt.js: begin は session-ts と self-optim を同時に書き、end は self-optim だけを消す', (t) => {
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, SESSION_TS_FILE);
  rmSync(SELF_OPTIM_FILE, { force: true });
  rmSync(SESSION_TS_FILE, { force: true });
  let mintedTs = null;
  t.after(() => {
    if (mintedTs) {
      rmSync(outputDir(mintedTs), { recursive: true, force: true });
      rmSync(workDir(mintedTs), { recursive: true, force: true });
    }
  });

  const begin = runToolCli('selfopt.js', ['begin', 'e2e-demo']);
  assert.equal(begin.code, 0, begin.stderr);
  mintedTs = begin.stdout.trim();
  assert.match(mintedTs, /^\d{8}_\d{6}$/);
  assert.equal(readFileSync(SESSION_TS_FILE, 'utf8').trim(), mintedTs);
  assert.equal(readFileSync(SELF_OPTIM_FILE, 'utf8').trim(), `e2e-demo\n${mintedTs}`);

  const status = runToolCli('selfopt.js', ['status']);
  assert.match(status.stdout, /in-flight/);

  // この時点では .session-ts も同じ ts で in-flight のため、多重起動は /canon 側の
  // 相互排他チェックで先に弾かれる（自己最適化専用チェックの経路は下の専用テストで検証する）。
  const beginAgain = runToolCli('selfopt.js', ['begin', 'another']);
  assert.equal(beginAgain.code, 1, '既存の自己最適化 run が in-flight のうちは多重起動を拒否する');
  assert.match(beginAgain.stderr, /\/canon の run/);

  const end = runToolCli('selfopt.js', ['end']);
  assert.equal(end.code, 0, end.stderr);
  assert.ok(!existsSync(SELF_OPTIM_FILE), 'end は .self-optim を削除する');
  assert.ok(existsSync(SESSION_TS_FILE), 'end は .session-ts に触れない（終端マーカーの通常判定に委ねる）');
});

test('selfopt.js: begin は工程7完了後（終端マーカー有）でも self-optim sentinel が残っていれば多重起動を拒否する', (t) => {
  // /canon 側の相互排他チェックが通り抜けた後（=終端マーカー有）でも、自己最適化専用の
  // sentinel チェックが単独で多重起動を拒否できることを検証する（工程7完了〜selfopt:end の間の窓）。
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, SESSION_TS_FILE);
  cleanupTs(t, TS);
  mintMarker(TS, 'generation');
  writeFileSync(SESSION_TS_FILE, TS + '\n', 'utf8');
  writeFileSync(SELF_OPTIM_FILE, `demo-label\n${TS}\n`, 'utf8');
  const r = runToolCli('selfopt.js', ['begin', 'another']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /既存の自己最適化 run/);
});

test('selfopt.js: begin は /canon run・機能X run が in-flight の間は拒否する', (t) => {
  stashFile(t, SELF_OPTIM_FILE);
  stashFile(t, SESSION_TS_FILE);
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  cleanupTs(t, TS);
  rmSync(SELF_OPTIM_FILE, { force: true });

  mkdirSync(path.join(outputDir(TS), '.gate'), { recursive: true });
  mkdirSync(workDir(TS), { recursive: true });
  writeFileSync(SESSION_TS_FILE, TS + '\n', 'utf8');
  const r1 = runToolCli('selfopt.js', ['begin', 'blocked-by-canon']);
  assert.equal(r1.code, 1);
  assert.match(r1.stderr, /\/canon の run/);

  rmSync(SESSION_TS_FILE, { force: true });
  writeFileSync(CANON_UPDATE_SESSION_TS_FILE, TS + '\n', 'utf8');
  const r2 = runToolCli('selfopt.js', ['begin', 'blocked-by-canon-update']);
  assert.equal(r2.code, 1);
  assert.match(r2.stderr, /機能X run/);
});
