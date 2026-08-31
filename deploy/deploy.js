#!/usr/bin/env node
/**
 * deploy/deploy.js — 工程10②（§10.2・退避スワップ・P8 承認後に実行）。
 *
 * 管理パス集合（§10.1）を全置換で対象へ配置する。削除でなく mv 退避することで「対象にも .bak
 * にも無い窓」を最小化し、コピー途中失敗でも配置前状態へ restore できる（原子性）。
 *
 *   step1: 対象の管理パス集合を .claude-canon.bak.<ts>/ へ mv で退避
 *   step2: output/<ts>/generated/ の管理パス集合（managed-paths.list）を対象へコピー配置
 *   step3: post-check（配置後に集合が output と sha256 バイト同一か・退避漏れが無いか）
 *   step4: 成功→.bak 保持（ローカル revert 用）／失敗→.bak から restore（配置前状態へ）
 *
 * P8 の機械的裏付け（§10.2 実装契約）:
 *   - `--confirm` 無しでは配置予定を表示するのみで配置しない（人間承認 P8）。
 *   - 実行時に pre-deploy-check 相当を再実行し uncaptured があれば配置を拒否する。
 *
 *   usage: node deploy/deploy.js <output-dir> <target-repo-dir> [--confirm]
 *   exit 0 : dry-run（配置予定表示）／deployed（配置成功）
 *   exit 2 : refused（uncaptured で拒否）／rolled-back（post-check 失敗で復帰）
 *   exit 1 : 引数不正・入力不在
 */

import path from 'node:path';
import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkManaged, readList, sha256File } from '../gates/lib/managed-paths.js';
import { computeVanishing } from './pre-deploy-check.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from '../gates/lib/self-target-guard.js';

function ensureParent(abs) {
  mkdirSync(path.dirname(abs), { recursive: true });
}

/** 同一ボリュームは rename、クロスデバイス（EXDEV）は copy+unlink で退避する。 */
function moveFile(src, dst) {
  ensureParent(dst);
  try {
    renameSync(src, dst);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      copyFileSync(src, dst);
      rmSync(src, { force: true });
    } else {
      throw err;
    }
  }
}

/** post-check（§10.2 step3）: 配置物の sha256 一致と、退避漏れ（余分な管理ファイル）の不在。 */
function postCheck(genRoot, targetDir, manifest) {
  const problems = [];
  // (a) managed-paths.list の各ファイルが配置され output とバイト同一（§9.3 keep=G8 と同基準）。
  for (const rel of manifest) {
    const t = path.join(targetDir, rel);
    if (!existsSync(t)) {
      problems.push(`未配置: ${rel}`);
      continue;
    }
    if (sha256File(t) !== sha256File(path.join(genRoot, rel))) {
      problems.push(`sha256 不一致: ${rel}`);
    }
  }
  // (b) 配置後の対象管理集合が manifest と一致（退避漏れ＝output に無い管理ファイルの残存が無い）。
  //     .claude-canon.bak.<ts>/ 配下は管理パターン外ゆえ walkManaged に含まれない。
  const want = new Set(manifest);
  for (const rel of walkManaged(targetDir)) {
    if (!want.has(rel)) problems.push(`退避漏れ（余分な管理ファイル）: ${rel}`);
  }
  return problems;
}

/** 失敗時の復帰（§10.2 step4 失敗系）: 配置物を除去し、退避物を戻し、.bak を掃除する。 */
function restore(targetDir, bakDir, manifest, retiredManaged) {
  for (const rel of manifest) rmSync(path.join(targetDir, rel), { force: true });
  for (const rel of retiredManaged) {
    const b = path.join(bakDir, rel);
    if (existsSync(b)) moveFile(b, path.join(targetDir, rel));
  }
  rmSync(bakDir, { recursive: true, force: true });
}

/**
 * 退避スワップ本体。
 * @returns {{status:'refused'|'dry-run'|'deployed'|'rolled-back', ...}}
 */
export function deploy(outputDir, targetDir, { confirm } = {}) {
  const ts = path.basename(outputDir);
  const genRoot = path.join(outputDir, 'generated');
  const manifest = readList(path.join(outputDir, '.deploy', 'managed-paths.list'));
  if (!manifest) throw new Error(`managed-paths.list が無い: ${path.join(outputDir, '.deploy')}`);

  // P8 機械化: uncaptured があれば配置しない（pre-deploy-check の判定を再実行）。
  const v = computeVanishing(outputDir, targetDir);
  if (v.uncaptured.length > 0) {
    return { status: 'refused', reason: 'uncaptured', uncaptured: v.uncaptured };
  }

  const bakDir = path.join(targetDir, `.claude-canon.bak.${ts}`);
  if (!confirm) {
    return { status: 'dry-run', deploy: manifest, retire: v.retired, bakDir };
  }

  // step1: 対象の管理パス集合を退避（削除でなく mv）。
  const retiredManaged = walkManaged(targetDir);
  for (const rel of retiredManaged) {
    moveFile(path.join(targetDir, rel), path.join(bakDir, rel));
  }

  try {
    // step2: output の管理パス集合を配置。
    for (const rel of manifest) {
      const src = path.join(genRoot, rel);
      if (!existsSync(src)) throw new Error(`output に配置対象が無い: ${rel}`);
      const dst = path.join(targetDir, rel);
      ensureParent(dst);
      copyFileSync(src, dst);
    }
    // step3: post-check。
    const problems = postCheck(genRoot, targetDir, manifest);
    if (problems.length > 0) throw new Error(`post-check 失敗: ${problems.join('; ')}`);
  } catch (err) {
    // step4（失敗）: restore で配置前状態へ戻す。
    restore(targetDir, bakDir, manifest, retiredManaged);
    return { status: 'rolled-back', reason: err.message, bakDir };
  }

  // step4（成功）: .bak を保持（ローカル revert 用）。
  return { status: 'deployed', bakDir, deployed: manifest, retired: v.retired };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const confirm = argv.includes('--confirm');
  const [outputDir, targetDir] = argv.filter((a) => a !== '--confirm');
  if (!outputDir || !targetDir) {
    process.stderr.write('usage: node deploy/deploy.js <output-dir> <target-repo-dir> [--confirm]\n');
    process.exit(1);
  }
  if (!existsSync(path.join(outputDir, 'generated'))) {
    process.stderr.write(`入力不在: ${path.join(outputDir, 'generated')} が無い。\n`);
    process.exit(1);
  }
  if (!existsSync(targetDir)) {
    process.stderr.write(`対象リポジトリが無い: ${targetDir}\n`);
    process.exit(1);
  }
  if (isCanonSelfTarget(targetDir)) {
    process.stderr.write(`[deploy] ${SELF_TARGET_MESSAGE}\n`);
    process.exit(1);
  }

  const r = deploy(outputDir, targetDir, { confirm });
  switch (r.status) {
    case 'refused':
      process.stderr.write(
        `配置を拒否: uncaptured を ${r.uncaptured.length} 件検出（${r.uncaptured.join(', ')}）。\n` +
          `先に node deploy/pre-deploy-check.js で確認し、調査 or design-map へ差し戻すこと（§10.2）。\n`
      );
      process.exit(2);
      break;
    case 'dry-run':
      process.stdout.write(
        `dry-run（未配置）。--confirm を付けると配置する。\n` +
          `配置予定 ${r.deploy.length} 件 / 廃止 ${r.retire.length} 件。退避先: ${r.bakDir}\n` +
          r.deploy.map((p) => `  + ${p}`).join('\n') +
          (r.retire.length ? '\n' + r.retire.map((p) => `  - ${p} (retire)`).join('\n') : '') +
          '\n'
      );
      process.exit(0);
      break;
    case 'rolled-back':
      process.stderr.write(
        `配置失敗のため配置前状態へ復帰した（rolled-back）: ${r.reason}\n`
      );
      process.exit(2);
      break;
    case 'deployed':
      process.stdout.write(
        `配置完了（deployed）。配置 ${r.deployed.length} 件 / 廃止 ${r.retired.length} 件。\n` +
          `ロールバック手段:\n` +
          `  1) 対象側 git の revert、または\n` +
          `  2) ${r.bakDir} から手動 restore（.bak の掃除は人間が明示的に行う・§10.2）。\n`
      );
      process.exit(0);
      break;
  }
}
