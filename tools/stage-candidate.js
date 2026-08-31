#!/usr/bin/env node
/**
 * tools/stage-candidate.js（npm run stage -- <output-dir> <label>）。
 * 機能Y 自己再生成の世代ステージング（§13.2.1・工程10 の代替）。
 *
 * `generated/.claude/` を検証した上で `generations/candidate-<label>/.claude/` へ取り込む。
 * この CLI だけが候補ディレクトリ（`generations/candidate-` で始まるパス）へ書ける
 * （self-optimize-scope-guard が `generations/` をエージェント書込から保護するため・
 * §11.3「ガードの3系統」）。
 *
 * 前提検査（1件でも満たさなければステージング拒否・candidate は無傷）:
 *   1. `<output-dir>/.gate/markers/generation.done` の実在（G7〜G12 通過済み）
 *   2. `<output-dir>/.gate/approvals/generation.approved` の実在（P6 承認済み）
 *   3. `generated/` が空でない
 *   4. `generated/` の全ファイルが `.claude/` 配下（root CLAUDE.md・.mcp.json・plugin/ は
 *      管理パス集合として正当だが、candidate レイアウトは `.claude/` のみを取り込む契約
 *      （詳細設計書 §13.2.1）のため明示的に拒否する）
 *   5. `computeVanishing(outputDir, CANON_ROOT)`（deploy/pre-deploy-check.js の既存 SSoT を再利用）
 *      で uncaptured ゼロ（稼働中の資産が置換で黙って消えないことの確認）
 *   6. 既存候補（`generations/candidate-<label>/`）がある場合は `--force` 必須
 *
 *   usage: node tools/stage-candidate.js <output-dir> <label> [--force]
 *   exit 0 : ステージング成功
 *   exit 1 : 引数不正・入力不在・前提未達
 */

import path from 'node:path';
import { existsSync, readdirSync, statSync, rmSync, cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CANON_ROOT } from '../gates/lib/canon.js';
import { computeVanishing } from '../deploy/pre-deploy-check.js';
import { isValidLabel, candidateDir, candidateClaudeDir } from '../gates/lib/generations.js';
import { sha256File } from '../gates/lib/managed-paths.js';
import { parseExistingDisposition, DesignMapError } from '../gates/lib/design-map.js';

/** `root` 配下の【全ファイル】を相対パス（posix）で列挙する。 */
function walkAllFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

/**
 * ステージングの全ロジック。副作用（ファイル書換・process.exit なし）は呼び出し元の `main()` に
 * 委ね、本関数は `{ ok, reason?, ... }` を返す純粋寄りの実装とする（`tools/promote.js` と同方針）。
 */
export function stageCandidate({ outputDir, label, canonRoot = CANON_ROOT, force = false }) {
  if (!label || !isValidLabel(label)) {
    return { ok: false, reason: `不正な label: ${JSON.stringify(label)}（英数字と - _ のみ）` };
  }

  const genRoot = path.join(outputDir, 'generated');
  if (!existsSync(genRoot)) {
    return { ok: false, reason: `入力不在: ${genRoot} が無い（output/<ts>/generated）` };
  }

  const markerPath = path.join(outputDir, '.gate', 'markers', 'generation.done');
  if (!existsSync(markerPath)) {
    return { ok: false, reason: `前提未達: ${markerPath} が無い（G7〜G12 通過済みの生成物のみ候補にできる・§13.2.1）` };
  }
  const approvalPath = path.join(outputDir, '.gate', 'approvals', 'generation.approved');
  if (!existsSync(approvalPath)) {
    return { ok: false, reason: `前提未達: ${approvalPath} が無い（P6 未承認の生成物は候補にできない・§13.2.1）` };
  }

  const allFiles = walkAllFiles(genRoot);
  if (allFiles.length === 0) {
    return { ok: false, reason: `generated/ が空（生成物ゼロ）` };
  }
  const outsideClaude = allFiles.filter((rel) => !rel.startsWith('.claude/'));
  if (outsideClaude.length > 0) {
    return {
      ok: false,
      reason: `generated/ に .claude/ 配下でないファイルがある（candidate レイアウトは .claude/ のみを取り込む契約・§13.2.1）: ${outsideClaude.join(', ')}`,
    };
  }

  const v = computeVanishing(outputDir, canonRoot);
  if (v.uncaptured.length > 0) {
    return {
      ok: false,
      reason: `uncaptured を ${v.uncaptured.length} 件検出（稼働中の資産が候補への置換で消える恐れ・§10.2）`,
      uncaptured: v.uncaptured,
    };
  }

  const candClaudeDir = candidateClaudeDir(label, canonRoot);
  if (existsSync(candClaudeDir) && !force) {
    return { ok: false, reason: `既存候補が在る（${candClaudeDir}）。上書きするには --force を付けること。` };
  }

  const candDir = candidateDir(label, canonRoot);
  const genClaudeDir = path.join(genRoot, '.claude');
  mkdirSync(candDir, { recursive: true });
  if (existsSync(candClaudeDir)) rmSync(candClaudeDir, { recursive: true, force: true });
  cpSync(genClaudeDir, candClaudeDir, { recursive: true });
  writeFileSync(path.join(candDir, 'SOURCE_RUN'), path.basename(outputDir) + '\n', 'utf8');

  return { ok: true, label, candidateDir: candDir };
}

// ---------------------------------------------------------------------------
// --resync-keep <label>（実昇格準備・§13.2.1 で追加）。
//
// tools/promote.js の乖離検出が「keep 判定ファイルの乖離」を理由に拒否した場合の、
// 定義上正しい修復手段。keep＝「変更しない」の定義に沿い、live → 候補 の一方向でのみ
// 再同期する（候補へ書ける CLI を増やさない・stage-candidate.js への機能追加に留める）。
// ---------------------------------------------------------------------------

/**
 * 候補の SOURCE_RUN から派生元 design-map.md を読み、keep 判定ファイルのうち候補と
 * 稼働中 `.claude/` が差分を持つものだけを live → 候補へ再同期する。
 */
export function resyncKeep({ label, canonRoot = CANON_ROOT }) {
  if (!label || !isValidLabel(label)) {
    return { ok: false, reason: `不正な label: ${JSON.stringify(label)}（英数字と - _ のみ）` };
  }
  const candDir = candidateDir(label, canonRoot);
  const candClaudeDir = candidateClaudeDir(label, canonRoot);
  if (!existsSync(candClaudeDir)) {
    return { ok: false, reason: `候補が存在しない: ${candClaudeDir}` };
  }
  const sourceRunPath = path.join(candDir, 'SOURCE_RUN');
  if (!existsSync(sourceRunPath)) {
    return { ok: false, reason: `候補に SOURCE_RUN が無い（${sourceRunPath}）。派生元 design-map.md を特定できない。` };
  }
  const ts = readFileSync(sourceRunPath, 'utf8').trim();
  // canonRoot を受け取れる形で組み立てる（gates/lib/run.js の outputDir(ts) は CANON_ROOT
  // 固定でテストのスクラッチ canonRoot に対応しない・tools/promote.js と同じ理由）。
  const designMapPath = path.join(canonRoot, 'output', ts, 'design-map.md');
  if (!existsSync(designMapPath)) {
    return { ok: false, reason: `派生元 design-map.md が無い（${designMapPath}）。` };
  }

  let records;
  try {
    records = parseExistingDisposition(readFileSync(designMapPath, 'utf8'));
  } catch (err) {
    const message = err instanceof DesignMapError ? err.message : String(err);
    return { ok: false, reason: `design-map.md の existing_disposition が解析できない: ${message}` };
  }
  const keepPaths = records.filter((r) => r.disposition === 'keep').map((r) => r.path);

  const resynced = [];
  const skippedMissingLive = [];
  for (const rel of keepPaths) {
    const liveAbs = path.join(canonRoot, rel);
    const candAbs = path.join(candDir, rel);
    if (!existsSync(liveAbs)) {
      skippedMissingLive.push(rel); // live 側に無い（既に消えた等）は候補側の判断に任せ、ここでは触らない。
      continue;
    }
    const liveHash = sha256File(liveAbs);
    const candHash = existsSync(candAbs) ? sha256File(candAbs) : null;
    if (liveHash !== candHash) {
      mkdirSync(path.dirname(candAbs), { recursive: true });
      cpSync(liveAbs, candAbs);
      resynced.push(rel);
    }
  }
  return { ok: true, label, resynced, skippedMissingLive };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const resyncIdx = argv.indexOf('--resync-keep');

  if (resyncIdx !== -1) {
    const label = argv[resyncIdx + 1];
    if (!label) {
      process.stderr.write('usage: node tools/stage-candidate.js --resync-keep <label>\n');
      process.exit(1);
    }
    const result = resyncKeep({ label });
    if (!result.ok) {
      process.stderr.write(`[stage-candidate] --resync-keep を拒否した: ${result.reason}\n`);
      process.exit(1);
    }
    if (result.resynced.length === 0) {
      process.stdout.write(`[stage-candidate] --resync-keep: 乖離している keep ファイルは無かった（label=${result.label}）。\n`);
    } else {
      process.stdout.write(`[stage-candidate] --resync-keep: ${result.resynced.length}件を live → 候補へ再同期した（label=${result.label}）:\n`);
      for (const rel of result.resynced) process.stdout.write(`  - ${rel}\n`);
    }
    if (result.skippedMissingLive.length > 0) {
      process.stdout.write(`  （live 側に無いため対象外: ${result.skippedMissingLive.join(', ')}）\n`);
    }
    process.stdout.write('続けて npm run promote -- <label> --dry-run で乖離が解消したことを確認すること。\n');
  } else {
    const [outputDirArg, label] = argv.filter((a) => a !== '--force');
    if (!outputDirArg || !label) {
      process.stderr.write('usage: node tools/stage-candidate.js <output-dir> <label> [--force]\n');
      process.exit(1);
    }
    const result = stageCandidate({ outputDir: outputDirArg, label, force });
    if (!result.ok) {
      process.stderr.write(`[stage-candidate] ステージングを拒否した: ${result.reason}\n`);
      if (result.uncaptured) {
        for (const rel of result.uncaptured) process.stderr.write(`  - ${rel}\n`);
      }
      process.exit(1);
    }
    process.stdout.write(
      `[stage-candidate] ステージング成功（label=${result.label}）: ${result.candidateDir}\n` +
        `続けて npm run promote -- ${result.label} --dry-run で候補の健全性を確認できる（実昇格は別の明示的な行為）。\n`
    );
  }
}
