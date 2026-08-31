#!/usr/bin/env node
/**
 * deploy/pre-deploy-check.js — 工程10①（§10.2・照合専用・配置直前に対象で実行）。
 *
 * verbatim コピー（§9.3）は「把握済みの keep が消える」事故を閉じるが、管理パス集合内で
 * 調査が取りこぼした／調査〜デプロイ間に対象側で増えたファイルは design-map にも系統Aにも
 * 載らず、退避スワップの全置換で黙って消える。防御は破壊の直前に実物どうしを突き合わせる
 * しかない。本スクリプトは配置直前に「対象の実管理パス集合」と output を照合し、消える予定の
 * ファイルを retired（想定内）/ uncaptured（取りこぼし・要注意）へ区分する。
 *
 * 工程10 は claude-canon の外（対象リポジトリで人間が実行）で Hook が発火できないため、これは
 * hook ではなくスタンドアロン CLI（§10.2 実装契約）。<ts> は <output-dir> のディレクトリ名から
 * 取り、run を in-flight 化しない（.session-ts に触れない）。
 *
 *   usage: node deploy/pre-deploy-check.js <output-dir> <target-repo-dir>
 *   exit 0 : 消えるものが無い／retired のみ（配置してよい）
 *   exit 2 : uncaptured を検出（配置を止め、調査 or design-map へ差し戻す）
 *   exit 1 : 引数不正・入力不在
 */

import path from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkManaged, readList } from '../gates/lib/managed-paths.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from '../gates/lib/self-target-guard.js';

/**
 * 消失予定（対象に在って output に無い管理ファイル）を retired/uncaptured に区分する。
 * @param {string} outputDir  output/<ts>/（generated/ ＋ .deploy/ を含む）
 * @param {string} targetDir  対象リポジトリのルート
 * @returns {{ vanishing: {rel:string,category:string}[], retired: string[], uncaptured: string[], targetManaged: string[] }}
 */
export function computeVanishing(outputDir, targetDir) {
  const genRoot = path.join(outputDir, 'generated');
  const retiredSet = new Set(readList(path.join(outputDir, '.deploy', 'retired.list')) ?? []);
  // 「対象の【実】管理パス集合 全ファイル」＝ §10.1 のパターンを対象へ適用した実在ファイル（§10.2 実装契約）。
  const targetManaged = walkManaged(targetDir);
  const vanishing = [];
  const retired = [];
  const uncaptured = [];
  for (const rel of targetManaged) {
    if (existsSync(path.join(genRoot, rel))) continue; // output に在る＝置換で残る
    if (retiredSet.has(rel)) {
      vanishing.push({ rel, category: 'retired' });
      retired.push(rel);
    } else {
      vanishing.push({ rel, category: 'uncaptured' });
      uncaptured.push(rel);
    }
  }
  return { vanishing, retired, uncaptured, targetManaged };
}

/** pre-deploy-report の本文を組み立てる（§10.2 実装契約: retired/uncaptured の区分と件数）。 */
export function renderReport(outputDir, targetDir, r) {
  const ts = path.basename(outputDir);
  const lines = [
    `# pre-deploy-report (<ts>=${ts})`,
    `target: ${targetDir}`,
    `消失予定: ${r.vanishing.length} 件（retired ${r.retired.length} / uncaptured ${r.uncaptured.length}）`,
    '',
  ];
  if (r.vanishing.length === 0) {
    lines.push('（置換で消える管理ファイルは無い）');
  } else {
    for (const v of r.vanishing) lines.push(`  [${v.category}] ${v.rel}`);
  }
  if (r.uncaptured.length > 0) {
    lines.push('');
    lines.push('⚠ uncaptured を検出。調査取りこぼしの疑いがあるため配置を止め、調査 or design-map へ差し戻すこと（§10.2）。');
  }
  return lines.join('\n') + '\n';
}

/** report を output/<ts>/.deploy/pre-deploy-report.txt に書き、本文を返す。 */
export function writeReport(outputDir, targetDir, r) {
  const dep = path.join(outputDir, '.deploy');
  mkdirSync(dep, { recursive: true });
  const body = renderReport(outputDir, targetDir, r);
  writeFileSync(path.join(dep, 'pre-deploy-report.txt'), body);
  return body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [outputDir, targetDir] = process.argv.slice(2);
  if (!outputDir || !targetDir) {
    process.stderr.write('usage: node deploy/pre-deploy-check.js <output-dir> <target-repo-dir>\n');
    process.exit(1);
  }
  if (!existsSync(path.join(outputDir, 'generated'))) {
    process.stderr.write(`入力不在: ${path.join(outputDir, 'generated')} が無い（output/<ts>/generated）。\n`);
    process.exit(1);
  }
  if (!existsSync(targetDir)) {
    process.stderr.write(`対象リポジトリが無い: ${targetDir}\n`);
    process.exit(1);
  }
  if (isCanonSelfTarget(targetDir)) {
    process.stderr.write(`[pre-deploy-check] ${SELF_TARGET_MESSAGE}\n`);
    process.exit(1);
  }
  const r = computeVanishing(outputDir, targetDir);
  const body = writeReport(outputDir, targetDir, r);
  process.stdout.write(body);
  if (r.uncaptured.length > 0) {
    process.exit(2); // 配置中断＝差し戻し（§10.2）
  }
  process.exit(0);
}
