#!/usr/bin/env node
/**
 * emit-run-manifest.js（npm run run-manifest -- <output-dir> <target-dir>）— 工程9 の配置手順書 RUN.md を
 * `output/<ts>/deploy/RUN.md` に書く（artifacts.md §10.4）。
 *
 * ## なぜスクリプトを複製せず手順書だけを置くのか
 *
 * pre-deploy-check.js・deploy.js は `lib/managed-paths.js`（管理パス集合の SSoT）を import している。
 * スクリプトを output へ複製すると、管理パス集合の定義が canon 本体と output の2か所に分かれ、
 * 一方だけが仕様に追従する単一障害点になる（集合の網羅性が破れると退避スワップが集合外を壊しうる・
 * artifacts.md §10.1）。ゆえにスクリプトは canon 本体のまま実行し、output には手順書だけを置く。
 *
 * RUN.md は固定のテンプレートで、変数は <ts>・output・対象・canon の絶対パスと、配置と廃止の集合の要約、
 * そして逐語で転記する節（MANIFEST の「配置時の追加手順」・README の「前提セットアップと配置後の手作業」）
 * だけにする（自由に作文しない＝決定論）。<ts> は <output-dir> のディレクトリ名から取る。
 *
 *   usage: node .claude/skills/canon-d/scripts/emit-run-manifest.js <output-dir> <target-repo-dir>
 *   exit 0 : RUN.md を出力した
 *   exit 1 : 入力不在／自己指定の拒否
 *   exit 2 : 引数不正
 */

import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readList } from '../../../../lib/managed-paths.js';
import { OUTSIDE_DIR } from '../../../../lib/tree-hash.js';
import { CANON_ROOT } from '../../../../lib/canon.js';
import { computeFenceMask, sectionSlice } from '../../../../lib/markdown.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from './self-target-guard.js';

/** canon 本体からの、このディレクトリ（canon-d の scripts）の相対パス。 */
const SCRIPTS_REL = '.claude/skills/canon-d/scripts';

/** posix 正規化（Windows のバックスラッシュを手順書に出さない）。 */
function posix(p) {
  return p.split(path.sep).join('/');
}

/** 見出しの本文が headingRe に一致する節（見出しレベル問わず・コードブロック外）の全文を、出現順に返す。 */
export function extractSections(text, headingRe) {
  const lines = text.split(/\r?\n/);
  const mask = computeFenceMask(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const m = lines[i].match(/^#{2,6}\s+(.*?)\s*$/);
    if (!m || !headingRe.test(m[1])) continue;
    const { start, end } = sectionSlice(lines, i, mask);
    out.push(lines.slice(start, end).join('\n').replace(/\s+$/, ''));
  }
  return out;
}

/**
 * run 固有の追加手順（MANIFEST の `## 配置時の追加手順` 節）と、配置後の手作業（README の
 * `## 前提セットアップと配置後の手作業` 節）を逐語で取り出す。RUN.md に載らないと Phase D の
 * オーケストレーターが実行を落とし、要旨に言い換えると意味が変わる（「5件削除」が「台帳の削除」になる等）。
 */
export function readRunSpecificSteps(outputDir) {
  const read = (rel) => {
    const p = path.join(outputDir, rel);
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  };
  return {
    deploySteps: extractSections(read('MANIFEST.md'), /^配置時の追加手順/),
    outsideChanges: extractSections(read('MANIFEST.md'), /^管理パス外の変更/),
    postDeploy: extractSections(read(path.join('generated', '.claude', 'README.md')), /^前提セットアップ/),
  };
}

/** `output/<ts>/outside-managed/` の全ファイルの相対パス（posix・バイト順）。無ければ空。 */
export function listOutsideManaged(outputDir) {
  const root = path.join(outputDir, OUTSIDE_DIR);
  const out = [];
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(abs, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (existsSync(root)) walk(root, '');
  return out.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

/** 転記した節の見出しを1段下げ、RUN.md の章立て（### 手順）の下に収める。 */
const demote = (section) => section.replace(/^(#{2,4})(\s)/gm, '##$1$2');

/** RUN.md の本文を組み立てる（固定テンプレート・変数はパスと集合要約、および逐語転記する節のみ）。 */
export function renderRunManifest(outputDir, targetDir) {
  const ts = path.basename(outputDir);
  const outAbs = posix(path.resolve(outputDir));
  const tgtAbs = posix(path.resolve(targetDir));
  const canon = posix(CANON_ROOT);

  const managed = readList(path.join(outputDir, 'deploy', 'managed-paths.list')) ?? [];
  const retired = readList(path.join(outputDir, 'deploy', 'retired.list')) ?? [];

  const bullets = (items, empty) =>
    items.length === 0 ? [`  （${empty}）`] : items.map((r) => `  - ${r}`);

  const { deploySteps, outsideChanges, postDeploy } = readRunSpecificSteps(outputDir);
  const outsideFiles = listOutsideManaged(outputDir);
  const verbatim = (sections, empty) =>
    sections.length === 0 ? [`（${empty}）`] : ['以下は生成物からの逐語転記です（言い換えずにこのとおり実行・提示する）。', '', ...sections.map(demote).flatMap((s) => [s, ''])];

  const preCheck = `node "${canon}/${SCRIPTS_REL}/pre-deploy-check.js" "${outAbs}" "${tgtAbs}"`;
  const deployDry = `node "${canon}/${SCRIPTS_REL}/deploy.js" "${outAbs}" "${tgtAbs}"`;
  const deployRun = `node "${canon}/${SCRIPTS_REL}/deploy.js" "${outAbs}" "${tgtAbs}" --confirm`;

  return [
    `# 配置手順（RUN.md・<ts>=${ts}）`,
    '',
    'この output バンドルを対象リポジトリへ配置する手順です。配置スクリプトは claude-canon 本体',
    'に置いたまま実行します（このバンドルには複製しません）。以下は canon リポジトリと',
    '対象リポジトリの両方にアクセスできる環境で実行してください。',
    '',
    `- canon リポジトリ: ${canon}`,
    `- output バンドル:   ${outAbs}`,
    `- 配置先（対象）:     ${tgtAbs}`,
    '',
    '## 配置される管理パス集合（対象へ全置換で書かれる）',
    ...bullets(managed, '配置対象なし'),
    '',
    '## 対象から消える（意図的廃止・retire ＋ merge 被統合元）',
    ...bullets(retired, '廃止対象なし'),
    '',
    '配置は管理パス集合の**全置換**です。集合外（`.github/workflows/`・`CODEOWNERS` 等）には',
    '一切触れません。',
    '',
    '## 手順',
    '',
    '### 1. 配置前照合（pre-deploy-check）',
    '',
    '対象の実状態と output を突き合わせ、置換で消えるファイルを retired（想定内）/ uncaptured',
    '（調査取りこぼし・要注意）に区分します。',
    '',
    '```bash',
    preCheck,
    '```',
    '',
    '- exit 0: 消えるものが無い／retired のみ → 配置してよい。',
    '- exit 1: **uncaptured または managed-paths.list の集合外・`..` 等の行を検出** → 配置を止め、調査 or design-map へ差し戻す（入力不在・引数不正と区別するには、stdout のレポートに uncaptured や書式欠陥の行があるかを見る）。',
    '- exit 2: 引数不正（<output-dir>・<target-repo-dir> の渡し間違い）。',
    '  レポートは `deploy/pre-deploy-report.txt` にも出力されます。',
    '',
    '### 2. P5: 消失予定を人間が確認',
    '',
    'pre-deploy-report の retired 一覧が「意図した廃止」と一致することを確認してから次へ進みます。',
    '',
    '### 2a. この run 固有の追加手順（MANIFEST の「配置時の追加手順」節）',
    '',
    ...verbatim(deploySteps, 'この run に固有の追加手順は無い'),
    '',
    '### 3. 配置（退避スワップ）',
    '',
    'まず `--confirm` 無しで配置予定だけを確認できます（対象は変更されません）:',
    '',
    '```bash',
    deployDry,
    '```',
    '',
    '問題なければ `--confirm` で実配置します。対象の管理パス集合は',
    `\`.claude-canon.bak.${ts}/\` へ mv 退避してから output を配置し、配置後に sha256 バイト同一を`,
    '確認します（post-check）。post-check 失敗時は退避物から自動 restore して配置前へ戻します。',
    '',
    '```bash',
    deployRun,
    '```',
    '',
    '- exit 0: 配置成功（`.bak` は revert 用に保持されます。対象に管理ファイルが無く退避が0件のときは`.bak`は作られません）。',
    '- exit 1: uncaptured・list の集合外の行・退避先 `.bak.<ts>` の既存で拒否、退避できないファイルがあり事前検査で拒否（対象は無変更）、または post-check 失敗で自動 restore（配置前状態へ復帰）。',
    '',
    '配置に成功すると `deploy/deploy-result.json` が書かれます（存在すること＝配置済み）。',
    '',
    '### 3a. 管理パス外の変更（MANIFEST の「管理パス外の変更」節）',
    '',
    '配置の後、同じ作業ブランチで1件ずつ適用し、配置のコミットとは別のコミットにする。各項目の「確認」を実行して結果を残す。',
    '確認が通らなければ「撤回条件」に従って戻し、「撤回したら直す生成物」に挙がった生成物も直す。',
    '',
    ...verbatim(outsideChanges, 'この run に管理パス外の変更は無い'),
    ...(outsideFiles.length === 0
      ? []
      : [
          `変更後のファイルは \`${outAbs}/${OUTSIDE_DIR}/\` にあります（P4 の承認が generated/ と一緒に束縛しています）。`,
          '対象へ次のコマンドでコピーしてから、各項目の「確認」を実行します（対象の現物は上書きされるので、先に作業ブランチを切ってあること）。',
          '',
          '```bash',
          ...outsideFiles.flatMap((rel) => [
            `mkdir -p "$(dirname "${tgtAbs}/${rel}")" && cp "${outAbs}/${OUTSIDE_DIR}/${rel}" "${tgtAbs}/${rel}"`,
          ]),
          '```',
          '',
        ]),
    '',
    '### 4. 配置後の手作業（README の「前提セットアップと配置後の手作業」節）',
    '',
    ...verbatim(postDeploy, 'README に配置後の手作業の節が無い'),
    '',
    '## 実行環境の注意',
    '',
    '- **`--confirm` はサンドボックスの外（通常のシェル）で実行する**。サンドボックスが `.mcp.json` などを',
    '  バインドマウントしていると、そのファイルの退避（rename）が EBUSY で失敗する。配置前の事前検査が',
    '  動かせないファイルを検出して**対象を変更せずに**止めるが、そもそも外で実行すれば起きない。',
    '- **対象リポジトリへの push は、対象リポジトリで起動した Claude Code セッションで行う**。claude-canon の',
    '  セッションから push すると、対象側のサンドボックス例外設定が効かず、pre-push（gitleaks 等）が失敗する。',
    '  リモートが SSH（`git@github.com`）のときは、対象側の設定で `github.com:22` への接続も許可されている必要がある。',
    '',
    '## ロールバック',
    '',
    `- 対象リポジトリの git revert に加え、\`.claude-canon.bak.${ts}/\` から手動 restore できます。`,
    '- `.bak` の掃除は配置が正しいと確認できてから人間が明示的に行ってください（自動削除しません）。',
    '',
  ].join('\n');
}

/** RUN.md を output/<ts>/deploy/RUN.md に書き、本文を返す。 */
export function writeRunManifest(outputDir, targetDir) {
  const dep = path.join(outputDir, 'deploy');
  mkdirSync(dep, { recursive: true });
  const body = renderRunManifest(outputDir, targetDir);
  writeFileSync(path.join(dep, 'RUN.md'), body.endsWith('\n') ? body : body + '\n');
  return body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [outputDir, targetDir] = process.argv.slice(2);
  if (!outputDir || !targetDir) {
    process.stderr.write('usage: npm run run-manifest -- <output-dir> <target-repo-dir>\n');
    process.exit(2);
  }
  if (!existsSync(path.join(outputDir, 'generated'))) {
    process.stderr.write(`入力不在: ${path.join(outputDir, 'generated')} が無い（output/<ts>/generated）。\n`);
    process.exit(1);
  }
  if (!existsSync(path.join(outputDir, 'deploy', 'managed-paths.list'))) {
    process.stderr.write(
      `入力不在: ${path.join(outputDir, 'deploy', 'managed-paths.list')} が無い（emit-manifest.js の配置リスト）。\n`
    );
    process.exit(1);
  }
  if (isCanonSelfTarget(targetDir)) {
    process.stderr.write(`[emit-run-manifest] ${SELF_TARGET_MESSAGE}\n`);
    process.exit(1);
  }
  const body = writeRunManifest(outputDir, targetDir);
  process.stdout.write(body);
  process.stdout.write(`\n[emit-run-manifest] ${path.join(outputDir, 'deploy', 'RUN.md')} を出力した。\n`);
  process.exit(0);
}
