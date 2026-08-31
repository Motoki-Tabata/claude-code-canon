#!/usr/bin/env node
/**
 * tools/promote.js（npm run promote -- <label>）。機能Y 昇格機構。詳細設計書 §13.2。
 *
 * `generations/candidate-<label>/.claude/` を検証した上で現行 `.claude/` へ昇格する。
 *
 * 手順:
 *   1. 相互排他確認（`/canon` run・機能X run のいずれも in-flight でないこと）
 *   2. 候補へ G13 を適用（`checkG13({ canonRoot: candidateDir(label) })`・自己欺瞞封鎖の実体）
 *   3. 候補の全 .md へ G3〜G6 を適用
 *   4. 1件でも違反があれば昇格拒否（現行 .claude/ は無傷）
 *   5. 現行 .claude/ を generations/archive/<ts>/ へ退避 → 候補を .claude/ へスワップ → CURRENT 更新
 *   6. `npm test` を自動実行。失敗したら自動ロールバック（退避した旧世代を復元）
 *
 * `npm run smoke:arm`／`smoke:check`（配線の実発火確認）は本スクリプトの範囲外。
 * 昇格後に必ず人間が実行すること（guide/setup.md 参照）。
 *
 * `runPromote({ canonRoot, runTests })` はテスト注入口（gates/g13_worker_privilege.js の
 * `canonRoot` 注入と同じ設計方針）。`canonRoot` を差し替えれば実リポジトリの `.claude/` を
 * 汚さずスクラッチディレクトリで昇格の全経路（拒否・スワップ・ロールバック）を検証できる。
 * `runTests` は既定で実際の `npm test` を起動するが、スクラッチ検証では軽量な代替関数を渡す。
 *
 * §13.2.1 の前提（自己再生成との整合）:
 *   - 候補に `.claude/settings.json` が無ければ拒否する（配線消滅時の vacuous pass を事前封鎖。
 *     §11.5 の「settings.json の自己検証は原理的に不可能」を昇格前に機械で先回りする）。
 *   - `work/.self-optim` sentinel が在る間は拒否する（自己最適化 run の途中で昇格させない）。
 *   - `dryRun: true`（`--dry-run`）で G13・G3〜G6・上記前提だけを検査し、スワップ・`npm test` を
 *     伴わずに候補の健全性を確認できる（実昇格せずに確認する手段・§13.2.1）。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CANON_ROOT } from '../gates/lib/canon.js';
import { currentRunTs, mintTs, isMainModule } from '../gates/lib/run.js';
import { currentCanonUpdateRunTs } from '../gates/lib/canon-run.js';
import { loadArtifact } from '../gates/lib/artifact.js';
import { checkG3 } from '../gates/g3_path_convention.js';
import { checkG4 } from '../gates/g4_frontmatter_schema.js';
import { checkG5 } from '../gates/g5_tool_names.js';
import { checkG6 } from '../gates/g6_security.js';
import { checkG13 } from '../gates/g13_worker_privilege.js';
import { sha256File } from '../gates/lib/managed-paths.js';
import { parseExistingDisposition, DesignMapError } from '../gates/lib/design-map.js';
import {
  isValidLabel,
  candidateDir,
  candidateClaudeDir,
  archiveDir,
  readCurrent,
  writeCurrent,
  liveClaudeDir,
} from '../gates/lib/generations.js';
import { readSelfOptim } from '../gates/lib/self-optim.js';
import { isNonSchemaRel } from '../gates/lib/non-schema.js';

// walkMd は常に .claude ディレクトリを root として呼ばれる（下記 candClaudeDir）ため、
// isNonSchemaRel を base:'claude' で使う（gates/lib/non-schema.js が SSoT・L005／L027／L029）。
function walkMd(root) {
  if (!existsSync(root)) return [];
  let out = [];
  for (const name of readdirSync(root)) {
    const p = path.join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walkMd(p));
    else if (name.endsWith('.md') && !isNonSchemaRel(path.relative(root, p), 'claude')) out.push(p);
  }
  return out;
}

function defaultRunTests(canonRoot) {
  execFileSync('npm', ['test'], { cwd: canonRoot, stdio: 'inherit', shell: process.platform === 'win32' });
}

export function rollbackFrom(archive, liveDir) {
  const archivedClaude = path.join(archive, '.claude');
  if (existsSync(liveDir)) rmSync(liveDir, { recursive: true, force: true });
  cpSync(archivedClaude, liveDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// 乖離検出（実昇格準備・§13.2 で追加）。
//
// stage-candidate.js が候補を取り込んだ後に稼働中 .claude/ を直接 hot-fix すると、
// 候補は派生元から静かに乖離する（実測: candidate-readme の self-optimize/SKILL.md が
// 1adede3 の修正前の版のまま残置していた）。promote.js の G13・G3〜G6 はこれを検出できない。
// ---------------------------------------------------------------------------

/** `root/<subDir>` 配下の全ファイルを、root からの posix 相対パス（subDir を含む）で列挙する。 */
function walkAllRelative(root, subDir) {
  const base = path.join(root, subDir);
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  walk(base);
  return out;
}

/**
 * 候補（`candidateDir(label, canonRoot)`）と稼働中 `canonRoot/.claude/` の差分を算出する。
 * 返す相対パスは design-map.md の `existing_disposition[].path` と同じ形式
 * （`.claude/...` を含む・canonRoot 相対）。
 */
export function computeDivergence(candDir, canonRoot) {
  const candFiles = walkAllRelative(candDir, '.claude');
  const liveFiles = walkAllRelative(canonRoot, '.claude');
  const candSet = new Set(candFiles);
  const liveSet = new Set(liveFiles);
  const added = candFiles.filter((f) => !liveSet.has(f)).sort();
  const removed = liveFiles.filter((f) => !candSet.has(f)).sort();
  const modified = [];
  for (const f of candFiles) {
    if (!liveSet.has(f)) continue;
    if (sha256File(path.join(candDir, f)) !== sha256File(path.join(canonRoot, f))) modified.push(f);
  }
  modified.sort();
  return { added, removed, modified };
}

/**
 * 乖離検出の全体判定。`SOURCE_RUN`・`design-map.md` 不在は「乖離なし＝合格」と読まない
 * （§11.5 vacuous pass 封鎖の精神）。keep 判定ファイルの乖離のみを昇格拒否の対象にする
 * （modify/新規ファイルは候補と live が異なって当然であり、乖離ではない）。
 */
export function checkDivergence({ label, canonRoot }) {
  const candDir = candidateDir(label, canonRoot);
  const divergence = computeDivergence(candDir, canonRoot);
  const sourceRunPath = path.join(candDir, 'SOURCE_RUN');

  if (!existsSync(sourceRunPath)) {
    return {
      ok: false,
      reason: `候補に SOURCE_RUN が無い（${sourceRunPath}）。乖離検出の判定材料が無いため「乖離なし」とは読まず拒否する（§11.5）。`,
      divergence,
    };
  }
  const ts = readFileSync(sourceRunPath, 'utf8').trim();
  // gates/lib/run.js の outputDir(ts) は CANON_ROOT に固定（canonRoot 非対応・package.json の
  // 「引数注入への全面改修は降スコープ」注記どおり）。ここは canonRoot を受け取れる必要がある
  // （テストがスクラッチ canonRoot で乖離検出を検証するため）ので、同じ相対構造を直接組み立てる。
  const designMapPath = path.join(canonRoot, 'output', ts, 'design-map.md');
  if (!existsSync(designMapPath)) {
    return {
      ok: false,
      reason: `候補の派生元 design-map.md が無い（${designMapPath}）。乖離検出の判定材料が無いため「乖離なし」とは読まず拒否する（§11.5）。`,
      divergence,
    };
  }

  let records;
  try {
    records = parseExistingDisposition(readFileSync(designMapPath, 'utf8'));
  } catch (err) {
    const message = err instanceof DesignMapError ? err.message : String(err);
    return { ok: false, reason: `design-map.md の existing_disposition が解析できない: ${message}`, divergence };
  }

  const keepPaths = new Set(records.filter((r) => r.disposition === 'keep').map((r) => r.path));
  const keepDivergence = divergence.modified.filter((f) => keepPaths.has(f));
  if (keepDivergence.length > 0) {
    return {
      ok: false,
      reason:
        `keep 判定のファイルが候補と稼働中 .claude/ で乖離している（${keepDivergence.length}件）: ${keepDivergence.join(', ')}。` +
        `stage-candidate.js --resync-keep -- ${label} で修復するか、--accept-divergence で明示上書きすること。`,
      divergence,
      keepDivergence,
    };
  }
  return { ok: true, divergence };
}

function formatDivergence(divergence) {
  const lines = ['[promote] 乖離レポート（候補 vs 稼働中 .claude/）:'];
  lines.push(`  added（候補のみ・新規）   : ${divergence.added.length}件${divergence.added.length ? ' — ' + divergence.added.join(', ') : ''}`);
  lines.push(`  removed（live のみ）      : ${divergence.removed.length}件${divergence.removed.length ? ' — ' + divergence.removed.join(', ') : ''}`);
  lines.push(`  modified（両方に在り差分）: ${divergence.modified.length}件${divergence.modified.length ? ' — ' + divergence.modified.join(', ') : ''}`);
  return lines.join('\n');
}

/**
 * 昇格の全ロジック。副作用（ファイル書換・process.exit なし）は呼び出し元の `main()` に
 * 委ね、本関数は `{ ok, reason?, archive?, violations? }` を返す純粋寄りの実装とする。
 */
export function runPromote({
  label,
  canonRoot = CANON_ROOT,
  runTests = defaultRunTests,
  skipMutualExclusionCheck = false,
  dryRun = false,
  acceptDivergence = false,
} = {}) {
  if (!label || !isValidLabel(label)) {
    return { ok: false, reason: `不正な label: ${JSON.stringify(label)}（英数字と - _ のみ）` };
  }

  if (!skipMutualExclusionCheck) {
    const canonRunTs = currentRunTs();
    if (canonRunTs) return { ok: false, reason: `/canon の run（${canonRunTs}）が in-flight。先に完了させること。` };
    const canonUpdateRunTs = currentCanonUpdateRunTs();
    if (canonUpdateRunTs) return { ok: false, reason: `機能X run（${canonUpdateRunTs}）が in-flight。先に完了させること。` };
    const selfOptim = readSelfOptim();
    if (selfOptim) {
      return {
        ok: false,
        reason: `自己最適化 run（label=${selfOptim.label}・ts=${selfOptim.ts}）が in-flight。run 途中の昇格は行わない（§13.2.1）。先に npm run selfopt:end で終了させること。`,
      };
    }
  }

  const candDir = candidateDir(label, canonRoot);
  const candClaudeDir = candidateClaudeDir(label, canonRoot);
  if (!existsSync(candClaudeDir)) {
    return { ok: false, reason: `候補が存在しない: ${candClaudeDir}` };
  }
  const candSettingsPath = path.join(candClaudeDir, 'settings.json');
  if (!existsSync(candSettingsPath)) {
    return {
      ok: false,
      reason: `候補に .claude/settings.json が無い（${candSettingsPath}）。配線が無ければ昇格後に全ゲートが沈黙する（vacuous pass・§11.5）ため事前に拒否する。`,
    };
  }

  // 乖離検出（§13.2 実昇格準備で追加）。--accept-divergence で明示上書きできるが、
  // divergence レポート自体は常に結果へ含める（--dry-run が必ず表示するため）。
  const divergenceResult = checkDivergence({ label, canonRoot });
  if (!divergenceResult.ok && !acceptDivergence) {
    return {
      ok: false,
      reason: divergenceResult.reason,
      divergence: divergenceResult.divergence,
      keepDivergence: divergenceResult.keepDivergence,
    };
  }

  // G13（自己欺瞞封鎖の実体・§13.2）。
  const g13 = checkG13({ canonRoot: candDir });
  if (!g13.ok) {
    return {
      ok: false,
      reason: 'G13 違反（候補が自分に Bash/PowerShell/Monitor を与えている可能性）',
      violations: g13.violations,
    };
  }

  // G3〜G6（候補の全 .md）。
  const files = walkMd(candClaudeDir);
  if (files.length === 0) {
    return { ok: false, reason: `候補に .md が1件も無い（${candClaudeDir}）。空の候補を昇格させない。` };
  }
  const violations = [];
  for (const f of files) {
    const a = loadArtifact(f);
    for (const v of [...checkG3(a), ...checkG4(a), ...checkG5(a), ...checkG6(a)]) {
      violations.push(`${path.relative(candDir, f)}: ${v.gate} ${v.message}`);
    }
  }
  if (violations.length > 0) {
    return { ok: false, reason: `G3〜G6 違反（${violations.length}件）`, violations };
  }

  if (dryRun) {
    return { ok: true, label, dryRun: true, divergence: divergenceResult.divergence };
  }

  // 退避スワップ。昇格前の CURRENT ラベルを退避先に記録し、ロールバック時に復元できるようにする。
  const ts = mintTs();
  const archive = archiveDir(ts, canonRoot);
  const liveDir = liveClaudeDir(canonRoot);
  const previousLabel = readCurrent(canonRoot) ?? 'baseline';
  mkdirSync(archive, { recursive: true });
  if (existsSync(liveDir)) cpSync(liveDir, path.join(archive, '.claude'), { recursive: true });
  writeFileSync(path.join(archive, 'PROMOTED_FROM'), previousLabel + '\n', 'utf8');
  // 候補の出自（PROMOTED_FROM と対・§13.2.1）。stage-candidate.js が候補に書いた SOURCE_RUN を
  // 引き継ぐ（自己再生成でない手書き候補には無いことがあるため任意扱い）。
  const candSourceRunPath = path.join(candDir, 'SOURCE_RUN');
  if (existsSync(candSourceRunPath)) {
    writeFileSync(path.join(archive, 'SOURCE_RUN'), readFileSync(candSourceRunPath, 'utf8'), 'utf8');
  }

  try {
    if (existsSync(liveDir)) rmSync(liveDir, { recursive: true, force: true });
    cpSync(candClaudeDir, liveDir, { recursive: true });
    writeCurrent(label, canonRoot);
  } catch (err) {
    rollbackFrom(archive, liveDir);
    writeCurrent(previousLabel, canonRoot);
    return { ok: false, reason: `スワップ中に例外が発生し自動ロールバックした: ${err.message}` };
  }

  // npm test 自動実行。失敗したら自動ロールバック（§13.2・§11.5・§15.3）。
  try {
    runTests(canonRoot);
  } catch (err) {
    rollbackFrom(archive, liveDir);
    writeCurrent(previousLabel, canonRoot);
    return { ok: false, reason: '昇格後のテストが失敗したため自動ロールバックした（旧世代へ復元済み）', rolledBack: true };
  }

  return { ok: true, label, archive: ts, divergence: divergenceResult.divergence };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const acceptDivergence = argv.includes('--accept-divergence');
  const label = argv.filter((a) => a !== '--dry-run' && a !== '--accept-divergence')[0];
  const result = runPromote({ label, dryRun, acceptDivergence });

  // --dry-run は成功・拒否いずれの場合も差分表を必ず表示する（不可逆操作の前に人間が全変更を見る・§13.2）。
  if (dryRun && result.divergence) {
    process.stdout.write(formatDivergence(result.divergence) + '\n');
  }

  if (!result.ok) {
    process.stderr.write(`[promote] 昇格を拒否した: ${result.reason}\n`);
    if (result.keepDivergence) {
      process.stderr.write(`  keep 乖離ファイル: ${result.keepDivergence.join(', ')}\n`);
    }
    if (result.violations) {
      for (const v of result.violations) process.stderr.write(`  - ${typeof v === 'string' ? v : v.message}\n`);
    }
    process.exit(1);
  }
  if (result.dryRun) {
    process.stdout.write(
      `[promote] --dry-run: 検査のみ通過した（label=${result.label}）。スワップ・npm test は実行していない。` +
        `実昇格するには --dry-run を外して再実行すること。\n`
    );
    return;
  }
  process.stdout.write(
    `[promote] 昇格成功（label=${result.label}・archive=${result.archive}）。` +
      `続けて npm run smoke:arm / smoke:check で配線の実発火を確認すること（guide/setup.md 参照）。\n`
  );
}

if (isMainModule(import.meta.url)) main();
