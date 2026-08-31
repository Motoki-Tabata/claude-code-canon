#!/usr/bin/env node
/**
 * deploy/emit-run-manifest.js — 工程10 の実行手順を output バンドルへ同梱する（§10.2・§14）。
 *
 * ## なぜスクリプトを複製せず手順書を同梱するのか（run-manifest 方式・2026-07-24 ユーザー裁定）
 *
 * §14 のツリーは当初 output/<ts>/ に「deploy/ 正本の複製」を置くと書いていた。しかし
 * pre-deploy-check.js / deploy.js は `../gates/lib/managed-paths.js`（管理パス集合の SSoT）を
 * 相対 import しており、素朴に複製しても単体では動かない。かといって managed-paths.js も一緒に
 * 複製すると、**管理パス集合のパターン定義が canon 正本と output コピーの2箇所に分裂**し、
 * 一方だけが仕様に追従する単一障害点になる（L005 がまさに警告するもの）。管理パス集合の
 * 網羅性が破れると退避スワップが不可侵領域を破壊しうる（§10.1）ため、この定義は二重化しない。
 *
 * ゆえにスクリプトは canon 正本のままにし、output には**実行手順書 RUN.md** だけを同梱する。
 * 手順書は canon リポジトリの場所を指し、人間はそこから CLI を回す。RUN.md の中身は固定
 * テンプレートで、変数は <ts>・output/target/canon の絶対パスと、配置/廃止される集合の要約のみ
 * （自由作文しない＝決定論）。
 *
 * これは hook ではなくスタンドアロン CLI（工程10 は run 外）。<ts> は <output-dir> のディレクトリ名
 * から取り、run を in-flight 化しない（.session-ts に触れない）。RUN.md は sanctioned な
 * output/<ts>/.deploy/ に書き、.gate/** には一切触れない。
 *
 *   usage: node deploy/emit-run-manifest.js <output-dir> <target-repo-dir>
 *   exit 0 : RUN.md を出力した
 *   exit 1 : 引数不正・入力不在
 */

import path from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readList } from '../gates/lib/managed-paths.js';
import { isCanonSelfTarget, SELF_TARGET_MESSAGE } from '../gates/lib/self-target-guard.js';

const CANON_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** posix 正規化（Windows のバックスラッシュを手順書に出さない）。 */
function posix(p) {
  return p.split(path.sep).join('/');
}

/** RUN.md の本文を組み立てる（固定テンプレート・変数はパスと集合要約のみ）。 */
export function renderRunManifest(outputDir, targetDir) {
  const ts = path.basename(outputDir);
  const outAbs = posix(path.resolve(outputDir));
  const tgtAbs = posix(path.resolve(targetDir));
  const canon = posix(CANON_ROOT);

  const managed = readList(path.join(outputDir, '.deploy', 'managed-paths.list')) ?? [];
  const retired = readList(path.join(outputDir, '.deploy', 'retired.list')) ?? [];

  const bullets = (items, empty) =>
    items.length === 0 ? [`  （${empty}）`] : items.map((r) => `  - ${r}`);

  const preCheck = `node "${canon}/deploy/pre-deploy-check.js" "${outAbs}" "${tgtAbs}"`;
  const deployDry = `node "${canon}/deploy/deploy.js" "${outAbs}" "${tgtAbs}"`;
  const deployRun = `node "${canon}/deploy/deploy.js" "${outAbs}" "${tgtAbs}" --confirm`;

  return [
    `# デプロイ手順（run-manifest・<ts>=${ts}）`,
    '',
    'この output バンドルを対象リポジトリへ配置する手順です。配置スクリプトは claude-canon 正本',
    'に置いたまま実行します（このバンドルには複製しません・§10.2）。以下は canon リポジトリと',
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
    '一切触れません（§10.1）。',
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
    '- exit 2: **uncaptured を検出** → 配置を止め、調査 or design-map へ差し戻す（§10.2）。',
    '  レポートは `.deploy/pre-deploy-report.txt` にも出力されます。',
    '',
    '### 2. P8: 消失予定を人間が確認',
    '',
    'pre-deploy-report の retired 一覧が「意図した廃止」と一致することを確認してから次へ進みます。',
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
    '- exit 0: 配置成功（`.bak` は revert 用に保持されます）。',
    '- exit 2: uncaptured で拒否、または post-check 失敗で自動 restore（配置前状態へ復帰）。',
    '',
    '## ロールバック',
    '',
    `- 対象リポジトリの git revert に加え、\`.claude-canon.bak.${ts}/\` から手動 restore できます。`,
    '- `.bak` の掃除は配置が正しいと確認できてから人間が明示的に行ってください（自動削除しません）。',
    '',
  ].join('\n');
}

/** RUN.md を output/<ts>/.deploy/RUN.md に書き、本文を返す。 */
export function writeRunManifest(outputDir, targetDir) {
  const dep = path.join(outputDir, '.deploy');
  mkdirSync(dep, { recursive: true });
  const body = renderRunManifest(outputDir, targetDir);
  writeFileSync(path.join(dep, 'RUN.md'), body.endsWith('\n') ? body : body + '\n');
  return body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [outputDir, targetDir] = process.argv.slice(2);
  if (!outputDir || !targetDir) {
    process.stderr.write('usage: node deploy/emit-run-manifest.js <output-dir> <target-repo-dir>\n');
    process.exit(1);
  }
  if (!existsSync(path.join(outputDir, 'generated'))) {
    process.stderr.write(`入力不在: ${path.join(outputDir, 'generated')} が無い（output/<ts>/generated）。\n`);
    process.exit(1);
  }
  if (!existsSync(path.join(outputDir, '.deploy', 'managed-paths.list'))) {
    process.stderr.write(
      `入力不在: ${path.join(outputDir, '.deploy', 'managed-paths.list')} が無い（generator の配置リスト・§9.3）。\n`
    );
    process.exit(1);
  }
  if (isCanonSelfTarget(targetDir)) {
    process.stderr.write(`[emit-run-manifest] ${SELF_TARGET_MESSAGE}\n`);
    process.exit(1);
  }
  const body = writeRunManifest(outputDir, targetDir);
  process.stdout.write(body);
  process.stdout.write(`\n[emit-run-manifest] ${path.join(outputDir, '.deploy', 'RUN.md')} を出力した。\n`);
  process.exit(0);
}
