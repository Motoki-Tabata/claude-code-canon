/**
 * canon-update-scope-guard の回帰テスト（詳細設計書 §13.1・§11.3「ガードの2系統」）。
 *
 * write-scope-guard（`/canon` run 用）と極性が逆であることを固定する:
 *   - `docs/` は sanctioned（ただし更新ゲート承認まで deny）
 *   - `.claude/`・`gates/`・`tests/`・`design/`（設計書2冊）は常時保護
 *   - 判定材料は `work/.canon-update-ts`（`work/.session-ts` とは別名前空間）
 *
 * ts は `tests/helpers/ts.js` のレジストリ経由（本ファイル専有の名前空間）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DESIGN_DOCS, SESSION_TS_FILE, CANON_UPDATE_SESSION_TS_FILE, outputDir, workDir } from './helpers/paths.js';
import { decide } from './helpers/hook.js';
import { withCanonUpdateRun, withoutSentinel, stashFile, cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

const GUARD = path.join(ROOT, 'gates', 'canon-update-scope-guard.js');
const TS = tsFor(import.meta.url, 0);

test('逆極性: docs/ への書込は sanctioned（更新ゲート承認まで deny）', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  const p = `${ROOT.replace(/\\/g, '/')}/docs/00_INDEX.md`;
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: p } }), 'deny', '承認前は deny');

  // 更新ゲート承認を鋳造（tools/approve.js と同じサイドカー形式）。
  const approvalPath = path.join(outputDir(TS), '.gate', 'approvals', 'canon-update.approved');
  writeFileSync(approvalPath, JSON.stringify({ kind: 'canon-update', approved_at: new Date().toISOString() }), 'utf8');
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: p } }), 'allow', '承認後は allow');
});

test('逆極性: .claude/・gates/・tests/・design/（設計書2冊）は常時保護（docs/ とは真逆）', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  const cases = [
    `${ROOT.replace(/\\/g, '/')}/.claude/settings.json`,
    `${ROOT.replace(/\\/g, '/')}/gates/g5_tool_names.js`,
    `${ROOT.replace(/\\/g, '/')}/tests/g1_g7.test.js`,
    ...DESIGN_DOCS.map((d) => `${ROOT.replace(/\\/g, '/')}/${d}`),
  ];
  for (const p of cases) {
    assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: p } }), 'deny', `${p} は機能X run 中も保護される`);
  }
});

test('回帰ロック: DESIGN_DOCS が指すファイルが実在し、ガードがそのパスを保護する', (t) => {
  for (const d of DESIGN_DOCS) {
    assert.ok(
      existsSync(path.join(ROOT, d)),
      `gates/lib/canon.js の DESIGN_DOCS（${d}）を指すファイルが実在しない。` +
        '設計書を改名・移動した場合は DESIGN_DOCS も追従させ、ファイル本体を伴わない参照だけの改名を防ぐ。'
    );
  }
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  for (const d of DESIGN_DOCS) {
    assert.equal(
      decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/${d}` } }),
      'deny',
      `${d} の実ファイル名で deny が効くことを確認する（ディレクトリ保護のズレによる vacuous pass を防ぐ）`
    );
  }
});

test('work/<ts>/・output/<ts>/（.gate/** 除く）は sanctioned', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/work/${TS}/canon-diff-proposal.md` } }),
    'allow'
  );
  assert.equal(
    decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/work/${TS}/impact-report.md` } }),
    'allow'
  );
});

test('.gate/** は機能X run 中も deny-all', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  const p = `${ROOT.replace(/\\/g, '/')}/output/${TS}/.gate/approvals/canon-update.approved`;
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: p } }), 'deny');
});

test('シェル経由でも docs/ 未承認書込・.claude 書込を deny する', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: "Set-Content docs/foo.md 'x'" } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: 'echo x > .claude/settings.json' } }), 'deny');
  assert.equal(decide(GUARD, { tool_name: 'Monitor', tool_input: { command: 'echo x > gates/g5_tool_names.js' } }), 'deny');
});

test('シェルの読取は誤検出しない', (t) => {
  withCanonUpdateRun(t, TS, { dirs: ['approvals'] });
  assert.equal(decide(GUARD, { tool_name: 'PowerShell', tool_input: { command: 'Get-Content docs/00_INDEX.md' } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'Bash', tool_input: { command: `npm run approve -- ${TS} canon-update` } }), 'allow');
});

// L023（fd 複製の誤検知・退行防止）は3ガード共通の SSoT（gates/lib/shell-write.js）に
// 由来する振る舞いのため、tests/shell_guard_ssot.test.js のテーブル駆動テストへ統合した。

test('機能X run 外ではガードが素通りする（write-scope-guard 側が判定を担う）', (t) => {
  withoutSentinel(t, CANON_UPDATE_SESSION_TS_FILE);
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/docs/foo.md` } }), 'allow');
  assert.equal(decide(GUARD, { tool_name: 'Write', tool_input: { file_path: `${ROOT.replace(/\\/g, '/')}/.claude/settings.json` } }), 'allow');
});

test('相互排他: /canon run が in-flight のとき tools/new-canon-ts.js は異常終了する', (t) => {
  stashFile(t, SESSION_TS_FILE);
  const CANON_TS = tsFor(import.meta.url, 999999);
  cleanupTs(t, CANON_TS);
  mkdirSync(path.join(outputDir(CANON_TS), '.gate', 'markers'), { recursive: true });
  writeFileSync(SESSION_TS_FILE, CANON_TS + '\n', 'utf8');
  assert.throws(() => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'new-canon-ts.js'), tsFor(import.meta.url, 111111)], {
      cwd: ROOT,
      stdio: 'pipe',
    });
  }, /status 1|Command failed/);
});

test('相互排他: /canon run 完了後（終端マーカー有）なら tools/new-canon-ts.js は成功する', (t) => {
  stashFile(t, SESSION_TS_FILE);
  stashFile(t, CANON_UPDATE_SESSION_TS_FILE);
  const CANON_TS = tsFor(import.meta.url, 888888);
  const NEW_TS = tsFor(import.meta.url, 222222);
  cleanupTs(t, CANON_TS, NEW_TS);
  mkdirSync(path.join(outputDir(CANON_TS), '.gate', 'markers'), { recursive: true });
  writeFileSync(path.join(outputDir(CANON_TS), '.gate', 'markers', 'generation.done'), '{}', 'utf8');
  writeFileSync(SESSION_TS_FILE, CANON_TS + '\n', 'utf8');

  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'new-canon-ts.js'), NEW_TS], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(out.trim(), NEW_TS);
  assert.ok(existsSync(outputDir(NEW_TS)));
});
