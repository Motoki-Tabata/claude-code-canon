#!/usr/bin/env node
/**
 * deploy/deploy.js — 工程10②（§10.2・退避スワップ・P8 承認後に実行）。
 *
 * 管理パス集合（§10.1）を全置換で対象へ配置する。削除でなく mv 退避することで「対象にも .bak
 * にも無い窓」を最小化し、コピー途中失敗でも配置前状態へ restore できる（原子性）。
 *
 *   step0: 事前検査（退避できないファイルが無いか。有れば何も変えずに拒否する）
 *   step1: 対象の管理パス集合を .claude-canon.bak.<ts>/ へ mv で退避
 *   step2: output/<ts>/generated/ の管理パス集合（managed-paths.list）を対象へコピー配置
 *   step3: post-check（配置後に集合が output と sha256 バイト同一か・退避漏れが無いか）
 *   step4: 成功→.bak 保持（ローカル revert 用）／失敗→.bak から restore（配置前状態へ）
 *
 * 【step0 と step1 の失敗処理（R-S1-1・run 20260919・20260922 で連続して実測）】
 * サンドボックスが `.mcp.json` 等をバインドマウントしていると、そのファイルの rename が EBUSY で
 * 失敗する。旧実装は step1 の退避ループが try の外にあり、29〜30 件を退避した半壊状態のまま
 * 例外で止まった（手で `cp -a` して復旧した）。ゆえに:
 *   - step0 で、退避する全ファイルを「同じ場所で rename して元に戻せるか」で事前検査し、動かせない
 *     ものが1件でもあれば**何も変えずに**拒否する（原因と「サンドボックスの外で実行」を出す）。
 *   - step1 も try の内側に入れる。復元は「実際に退避したファイル」と「実際に置いたファイル」だけを
 *     対象にする（まだ退避していない元ファイルを消さない）。復元できなかったものがあれば .bak を
 *     残し、状態（restored／partial）と残った問題を返す。
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
import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { walkManaged, readList, sha256File } from '../gates/lib/managed-paths.js';
import { computeVanishing } from './pre-deploy-check.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from '../gates/lib/self-target-guard.js';

const PROBE_SUFFIX = '.canon-probe';

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

/**
 * 退避できないファイルの事前検査（step0）。各ファイルを同じ場所で別名へ rename し、すぐ元に戻す。
 * rename できない（EBUSY 等）ファイルを返す。何も変えない（rename して戻すだけ）。
 * @returns {{ rel: string, code: string|null }[]}
 */
export function probeMovable(targetDir, rels, mv = moveFile) {
  const bad = [];
  for (const rel of rels) {
    const src = path.join(targetDir, rel);
    const probe = src + PROBE_SUFFIX;
    try {
      mv(src, probe);
    } catch (err) {
      bad.push({ rel, code: err?.code ?? null });
      continue;
    }
    try {
      mv(probe, src);
    } catch (err) {
      // 元に戻せない状態は握りつぶさない（対象が壊れている）。
      throw new Error(`事前検査で ${rel} を元に戻せなかった（${probe} に残っている）: ${err.message}`);
    }
  }
  return bad;
}

/**
 * 失敗時の復帰（§10.2 step4 失敗系）: **実際に置いたファイル**を除去し、**実際に退避したファイル**を戻す。
 * まだ退避していない元ファイルは触らない（step1 の途中で失敗した場合に、未退避の元ファイルを消さない）。
 * 全部戻せたときだけ .bak を掃除する。戻せないものがあれば .bak を残す。
 * @returns {{ complete: boolean, problems: string[] }}
 */
function restore(targetDir, bakDir, placed, moved, mv = moveFile) {
  const problems = [];
  for (const rel of placed) rmSync(path.join(targetDir, rel), { force: true });
  for (const rel of moved) {
    const b = path.join(bakDir, rel);
    if (!existsSync(b)) continue;
    try {
      mv(b, path.join(targetDir, rel));
    } catch (err) {
      problems.push(`${rel} を .bak から戻せなかった（${err?.code ?? err.message}）`);
    }
  }
  if (problems.length === 0) rmSync(bakDir, { recursive: true, force: true });
  return { complete: problems.length === 0, problems };
}

/**
 * 退避スワップ本体。
 * @returns {{status:'refused'|'dry-run'|'deployed'|'rolled-back', ...}}
 */
export function deploy(outputDir, targetDir, { confirm, moveFile: mv = moveFile } = {}) {
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

  // step0: 退避できないファイルが無いか事前検査する（有れば何も変えずに拒否）。
  const retiredManaged = walkManaged(targetDir);
  const unmovable = probeMovable(targetDir, retiredManaged, mv);
  if (unmovable.length > 0) {
    return { status: 'refused', reason: 'unmovable', unmovable };
  }

  // step1〜3 はすべて try の内側（step1 の途中で失敗しても、退避済み・配置済みの分を復元する）。
  const moved = [];
  const placed = [];
  try {
    // step1: 対象の管理パス集合を退避（削除でなく mv）。
    for (const rel of retiredManaged) {
      mv(path.join(targetDir, rel), path.join(bakDir, rel));
      moved.push(rel);
    }
    // step2: output の管理パス集合を配置。
    for (const rel of manifest) {
      const src = path.join(genRoot, rel);
      if (!existsSync(src)) throw new Error(`output に配置対象が無い: ${rel}`);
      const dst = path.join(targetDir, rel);
      ensureParent(dst);
      copyFileSync(src, dst);
      placed.push(rel);
    }
    // step3: post-check。
    const problems = postCheck(genRoot, targetDir, manifest);
    if (problems.length > 0) throw new Error(`post-check 失敗: ${problems.join('; ')}`);
  } catch (err) {
    // step4（失敗）: 実際に動かした分だけ復元して配置前状態へ戻す。
    const outcome = restore(targetDir, bakDir, placed, moved, mv);
    return {
      status: 'rolled-back',
      reason: err.message,
      bakDir,
      state: outcome.complete ? 'restored' : 'partial',
      restoreProblems: outcome.problems,
    };
  }

  // step4（成功）: .bak を保持（ローカル revert 用）。退避が0件（対象に管理ファイルが無かった）なら .bak は作られない
  // （S3-6: 存在しない .bak を案内しないよう、実在を確かめて返す）。
  return { status: 'deployed', bakDir, baked: moved.length, bakExists: existsSync(bakDir), deployed: manifest, retired: v.retired };
}

/**
 * 結果を output/<ts>/.deploy/ に残す（resume が「配置済みか」を判定する材料・失敗の診断材料）。
 * `deploy-result.json` は成功時だけ（存在＝配置済み）。試行の記録は `deploy-attempt.json`。
 * 書けなくても配置自体は成功しているので、警告に留める（対象側のセッションから canon の output が
 * 書けないことがある）。
 */
export function recordResult(outputDir, targetDir, r) {
  const dep = path.join(outputDir, '.deploy');
  const base = { status: r.status, reason: r.reason ?? null, at: new Date().toISOString(), target: path.resolve(targetDir) };
  try {
    mkdirSync(dep, { recursive: true });
    writeFileSync(path.join(dep, 'deploy-attempt.json'), JSON.stringify({ ...base, state: r.state ?? null, unmovable: r.unmovable ?? null, restoreProblems: r.restoreProblems ?? null }, null, 2) + '\n');
    if (r.status === 'deployed') {
      writeFileSync(
        path.join(dep, 'deploy-result.json'),
        JSON.stringify({ ...base, bak_dir: r.bakDir, bak_exists: r.bakExists, baked: r.baked, deployed: r.deployed.length, retired: r.retired }, null, 2) + '\n'
      );
    }
    return null;
  } catch (err) {
    return err.message;
  }
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
  if (confirm) {
    const warn = recordResult(outputDir, targetDir, r);
    if (warn) process.stderr.write(`[deploy] 結果の記録（output/<ts>/.deploy/）を書けなかった: ${warn}\n`);
  }
  switch (r.status) {
    case 'refused':
      if (r.reason === 'unmovable') {
        process.stderr.write(
          `配置を拒否（対象は一切変更していない）: 退避できないファイルが ${r.unmovable.length} 件ある。\n` +
            r.unmovable.map((u) => `  - ${u.rel}（${u.code ?? 'rename 失敗'}）`).join('\n') +
            `\nサンドボックスがこれらをバインドマウントしている可能性が高い（EBUSY）。--confirm は\n` +
            `サンドボックスの外（通常のシェル）で実行すること（RUN.md「実行環境の注意」）。\n`
        );
      } else {
        process.stderr.write(
          `配置を拒否: uncaptured を ${r.uncaptured.length} 件検出（${r.uncaptured.join(', ')}）。\n` +
            `先に node deploy/pre-deploy-check.js で確認し、調査 or design-map へ差し戻すこと（§10.2）。\n`
        );
      }
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
      if (r.state === 'restored') {
        process.stderr.write(`配置失敗のため配置前状態へ復帰した（rolled-back）: ${r.reason}\n`);
      } else {
        process.stderr.write(
          `配置失敗（rolled-back）。**復帰が完了していない**: ${r.reason}\n` +
            r.restoreProblems.map((p) => `  - ${p}`).join('\n') +
            `\n退避物は ${r.bakDir} に残してある。対象の状態を確認し、必要なら .bak から手動で戻すこと。\n`
        );
      }
      process.exit(2);
      break;
    case 'deployed':
      process.stdout.write(
        `配置完了（deployed）。配置 ${r.deployed.length} 件 / 廃止 ${r.retired.length} 件。\n` +
          `ロールバック手段:\n` +
          `  1) 対象側 git の revert` +
          (r.bakExists
            ? `、または\n  2) ${r.bakDir} から手動 restore（退避 ${r.baked} 件・.bak の掃除は人間が明示的に行う・§10.2）。\n`
            : `。\n  （対象に管理ファイルが無かったため退避は 0 件で、.bak は作られていない。戻すなら git revert のみ）\n`)
      );
      process.exit(0);
      break;
  }
}
