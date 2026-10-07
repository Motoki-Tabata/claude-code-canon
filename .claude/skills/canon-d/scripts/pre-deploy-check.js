#!/usr/bin/env node
/**
 * pre-deploy-check.js（npm run pre-deploy -- <output-dir> <target-dir>）— 工程9 の配置前照合（artifacts.md §10.2）。
 *
 * keep の verbatim コピーは「把握済みの keep が消える」事故を閉じるが、管理パス集合内で
 * 調査が取りこぼした／調査〜配置の間に対象側で増えたファイルは design-map にも existing.md にも
 * 載らず、退避スワップの全置換で黙って消える。防御は破壊の直前に実物どうしを突き合わせる
 * しかない。本スクリプトは配置直前に「対象の実管理パス集合」と output を照合し、消える予定の
 * ファイルを retired（想定内）/ uncaptured（取りこぼし・要注意）へ区分する。
 *
 * 出力は `output/<ts>/deploy/pre-deploy-report.txt`（P5 の対象）と stdout。<ts> は <output-dir> の
 * ディレクトリ名から取る。
 *
 *   usage: node .claude/skills/canon-d/scripts/pre-deploy-check.js <output-dir> <target-repo-dir>
 *   exit 0 : 消えるものが無い／retired のみ（配置してよい。配置先が既定ブランチ・未コミットの変更ありは report の warning で exit に影響しない）
 *   exit 1 : uncaptured または list の書式欠陥（glob・実在しない行・管理パス集合外の行）を検出（配置を止め、調査 or design-map へ差し戻す）／入力不在／自己指定の拒否
 *   exit 2 : 引数不正
 */

import path from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashGate } from '../../../../lib/tree-hash.js';
import { walkManagedDetailed, readList, checkConcreteEntries, findUnmanagedEntries } from '../../../../lib/managed-paths.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from './self-target-guard.js';

/**
 * `deploy/*.list` の各行が「具体的な1ファイル」を指しているかを検査する。
 *
 * 本 CLI は P5（配置承認）の前の最終防波堤なので、`retired.list` だけでなく `managed-paths.list` も
 * 読む。glob 行を含む list を素通りさせると、`--confirm` を打った `deploy.js` が「output に配置対象が
 * 無い」で初めて落ちる。V8 と同じ判定を `lib/managed-paths.js` から import して共有する
 * （判定ロジックを複製しない）。
 *
 * `managed-paths.list` の各行が管理パス集合（正規化済みで `..`・絶対パスを含まない）に属することも検査する
 * （deploy.js は行を `path.join` で解決するため、`..` を含む行は集合の外へ書く）。
 *
 * @returns {{ globEntries: {list:string, rel:string}[], missingEntries: {list:string, rel:string}[], unmanagedEntries: {list:string, rel:string}[] }}
 */
export function checkDeployLists(outputDir) {
  const genRoot = path.join(outputDir, 'generated');
  const globEntries = [];
  const missingEntries = [];
  const unmanagedEntries = [];

  const managed = readList(path.join(outputDir, 'deploy', 'managed-paths.list'));
  if (managed) {
    const { glob, missing } = checkConcreteEntries(managed, { genRoot });
    for (const rel of glob) globEntries.push({ list: 'managed-paths.list', rel });
    for (const rel of missing) missingEntries.push({ list: 'managed-paths.list', rel });
    for (const rel of findUnmanagedEntries(managed)) unmanagedEntries.push({ list: 'managed-paths.list', rel });
  }

  // retired.list は「もう generated/ に無い」ことの宣言なので実在照合は課さない。
  // ただし V7・本 CLI が完全一致で参照するため glob 行は無効になる。
  const retired = readList(path.join(outputDir, 'deploy', 'retired.list'));
  if (retired) {
    for (const rel of checkConcreteEntries(retired).glob) {
      globEntries.push({ list: 'retired.list', rel });
    }
  }

  return { globEntries, missingEntries, unmanagedEntries };
}

/**
 * 配置先の git の状態を読む（配置は対象の作業ツリーへ直接行われ、未コミットのまま終わる）。
 * 既定ブランチは `origin/HEAD`、無ければ main・master。git でない・読めないときは `unknown` に理由を入れる
 * （警告なしに見えないよう、report に「確認できなかった」と書く）。
 * @returns {{branch:string|null, defaultBranches:string[], onDefault:boolean, dirty:string[], unknown:string|null}}
 */
export function readGitState(targetDir) {
  const git = (...args) => execFileSync('git', ['-C', targetDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (git('rev-parse', '--is-inside-work-tree') !== 'true') return { branch: null, defaultBranches: [], onDefault: false, dirty: [], unknown: 'git の作業ツリーでない' };
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    let defaults = ['main', 'master'];
    try {
      defaults = [git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, ''), ...defaults];
    } catch {
      // origin/HEAD が無い（clone でない等）。main・master で判定する。
    }
    // 配置が対象に作る .claude-canon.bak.* は、過去の配置の残骸であって未コミットの変更ではない。
    const dirty = git('status', '--porcelain').split('\n').filter((l) => l && !/\.claude-canon\.bak\./.test(l));
    return { branch, defaultBranches: defaults, onDefault: defaults.includes(branch), dirty, unknown: null };
  } catch (err) {
    return { branch: null, defaultBranches: [], onDefault: false, dirty: [], unknown: `git を読めない（${err.code ?? err.message}）` };
  }
}

/**
 * 消失予定（対象に在って output に無い管理ファイル）を retired/uncaptured に区分する。
 * @param {string} outputDir  output/<ts>/（generated/ ＋ deploy/ を含む）
 * @param {string} targetDir  対象リポジトリのルート
 * @returns {{ vanishing: {rel:string,category:string}[], retired: string[], uncaptured: string[], targetManaged: string[], unreadable: {rel:string,code:string}[] }}
 */
export function computeVanishing(outputDir, targetDir) {
  const genRoot = path.join(outputDir, 'generated');
  const retiredSet = new Set(readList(path.join(outputDir, 'deploy', 'retired.list')) ?? []);
  const listDefects = checkDeployLists(outputDir);
  // 「対象の【実】管理パス集合 全ファイル」＝ 管理パス集合のパターンを対象へ適用した実在ファイル（artifacts.md §10.2）。
  // unreadable（走査根の内側で種別判定できなかったエントリ）は「列挙できなかった範囲」＝
  // 本防波堤の盲点なので、握りつぶさず report に載せて P5 の人間に見せる。
  const { files: targetManaged, unreadable } = walkManagedDetailed(targetDir);
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
  const git = readGitState(targetDir);
  const deployCount = (readList(path.join(outputDir, 'deploy', 'managed-paths.list')) ?? []).length;
  return { vanishing, retired, uncaptured, targetManaged, unreadable, listDefects, deployCount, git };
}

/** report に書く generated/ のハッシュの行（generated/ が無い・空ならその旨）。 */
function generatedHashLine(outputDir) {
  const gen = path.join(outputDir, 'generated');
  if (!existsSync(gen)) return 'generated/ のハッシュ: なし（generated/ が無い）';
  const t = hashGate(outputDir);
  return `generated/ のハッシュ: ${t.hash}（${t.files} ファイル）`;
}

/** pre-deploy-report の本文を組み立てる（artifacts.md §10.2: retired/uncaptured の区分と件数）。 */
export function renderReport(outputDir, targetDir, r) {
  const ts = path.basename(outputDir);
  const lines = [
    `# pre-deploy-report (<ts>=${ts})`,
    `target: ${targetDir}`,
    // P5 の承認はこの report のハッシュを束縛する。件数とパスだけでは generated/ の中身が変わっても
    // report が変わらないので、generated/ のツリーハッシュを書いて中身を束縛する。
    generatedHashLine(outputDir),
    `消失予定: ${r.vanishing.length} 件（retired ${r.retired.length} / uncaptured ${r.uncaptured.length}）`,
    // 退避は対象の管理パス集合の全件（deploy.js step1 の walkManaged）。P5 で .bak の有無を推測で案内しない
    // ための実数。
    ...(r.targetManaged
      ? [
          `配置予定: ${r.deployCount ?? '?'} 件（managed-paths.list）`,
          `退避予定: ${r.targetManaged.length} 件（対象の管理パス集合の全件を .claude-canon.bak.${ts}/ へ mv。` +
            `うち上書き ${r.targetManaged.length - r.vanishing.length} / 消失 ${r.vanishing.length}）` +
            (r.targetManaged.length === 0 ? '。退避0件なので .bak は作られない（戻すなら git revert のみ）' : ''),
        ]
      : []),
    '',
  ];
  if (r.vanishing.length === 0) {
    lines.push('（置換で消える管理ファイルは無い）');
  } else {
    for (const v of r.vanishing) lines.push(`  [${v.category}] ${v.rel}`);
  }
  if (r.uncaptured.length > 0) {
    lines.push('');
    lines.push('⚠ uncaptured を検出。調査取りこぼしの疑いがあるため配置を止め、調査 or design-map へ差し戻すこと。');
  }
  const d = r.listDefects;
  const unmanaged = d?.unmanagedEntries ?? [];
  if (d && (d.globEntries.length > 0 || d.missingEntries.length > 0 || unmanaged.length > 0)) {
    lines.push('');
    lines.push(
      `⚠ deploy/*.list の書式欠陥: ${d.globEntries.length + d.missingEntries.length + unmanaged.length} 件。` +
        'deploy.js は各行を具体パスとして copyFileSync に渡すため、glob・実在しない行は rolled-back になり、管理パス集合の外へ出る行は deploy.js が配置前に拒否する。'
    );
    for (const e of unmanaged) lines.push(`  [unmanaged] ${e.list}: ${e.rel}（管理パス集合に属さない・\`..\`／絶対パス／未正規化）`);
    for (const e of d.globEntries) lines.push(`  [glob] ${e.list}: ${e.rel}`);
    for (const e of d.missingEntries) lines.push(`  [missing] ${e.list}: ${e.rel}（generated/ に実在しない）`);
  }
  if (r.unreadable?.length > 0) {
    lines.push('');
    lines.push(`⚠ 走査不能: ${r.unreadable.length} 件（管理パス集合の一部を列挙できていない＝本照合の盲点）。`);
    for (const u of r.unreadable) lines.push(`  [unreadable:${u.code}] ${u.rel}`);
  }
  const g = r.git;
  if (g) {
    if (g.unknown) {
      lines.push('', `⚠ 配置先のブランチと未コミットの変更を確認できなかった: ${g.unknown}。配置の前に人間が確かめること。`);
    } else {
      if (g.onDefault) {
        lines.push('', `⚠ 配置先が既定ブランチ（${g.branch}）にいる。保護されたブランチへは直接 push できないことが多いので、配置の前に作業ブランチを切ること（git -C <target> switch -c <branch>）。`);
      }
      if (g.dirty.length > 0) {
        lines.push('', `⚠ 配置先に未コミットの変更が ${g.dirty.length} 件ある。配置の差分と混ざるので、先にコミットか退避をすること。`);
        for (const l of g.dirty.slice(0, 10)) lines.push(`  [dirty] ${l}`);
        if (g.dirty.length > 10) lines.push(`  …ほか ${g.dirty.length - 10} 件`);
      }
    }
  }
  return lines.join('\n') + '\n';
}

/** report を output/<ts>/deploy/pre-deploy-report.txt に書き、本文を返す。 */
export function writeReport(outputDir, targetDir, r) {
  const dep = path.join(outputDir, 'deploy');
  mkdirSync(dep, { recursive: true });
  const body = renderReport(outputDir, targetDir, r);
  writeFileSync(path.join(dep, 'pre-deploy-report.txt'), body);
  return body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [outputDir, targetDir] = process.argv.slice(2);
  if (!outputDir || !targetDir) {
    process.stderr.write('usage: npm run pre-deploy -- <output-dir> <target-repo-dir>\n');
    process.exit(2);
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
  const defectCount = r.listDefects.globEntries.length + r.listDefects.missingEntries.length + r.listDefects.unmanagedEntries.length;
  if (r.uncaptured.length > 0 || defectCount > 0) {
    process.exit(1); // 配置中断＝差し戻し（uncaptured・list の書式欠陥）
  }
  process.exit(0);
}
