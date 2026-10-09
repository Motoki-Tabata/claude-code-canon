/**
 * V8 スナップショット完全性（artifacts.md §8.2・§7・§10.1）。
 *
 * 全量スナップショット方式では「generated/ ＝ design-map の射影」であり、配置は管理パス集合の全置換で
 * 行われる。ゆえに次を機械照合する:
 *   1. design-map の宣言 ⇒ generated/: 機能の節（`## <機能>`）の見出しと keep・modify のレコードが
 *      宣言した生成物が、すべて generated/ に実在する（宣言源は slice の `targets-all.txt` と同じ
 *      `listDeclaredArtifacts`）。機能の節が1つも無いのに disposition に無いファイルがあれば違反
 *      （宣言0件で素通りさせない）。照合元は design-map で、builder や MANIFEST の自己申告ではない。
 *   2. MANIFEST ⇔ generated/: MANIFEST の `## 全ファイル` 節が generated/ の実ファイル集合と双方向に
 *      一致する。存在だけを見ると、1行欠けた MANIFEST が素通りする。
 *   3. 空でない: generated/ にファイルがある（verify.js が走査の時点で判定する）。
 *   4. 配置リスト: `deploy/managed-paths.list` の各行が管理パス集合に属し、glob ではなく、generated/ に
 *      実在する。generated/ の全ファイルが list に載っている。`retired.list` も glob を禁じる。
 *      集合への所属（パターンの照合）と具体性（glob でないこと）は別に判定する（`.claude/rules/**` の
 *      パターンは glob の行にもマッチしてしまうため）。generated/ の全ファイルが管理パス集合に収まる
 *      ことも見る（集合外は退避スワップで壊しうる・§10.1）。
 */

import { isManaged, checkConcreteEntries } from '../../../../../lib/managed-paths.js';
import { parseManifestFiles, MANIFEST_FILES_HEADING } from '../../../../../lib/manifest.js';
import { listDeclaredArtifacts, countFeatureSections } from '../../../../../lib/design-map.js';

const CHECK = 'V8';

/** 4. 配置リスト。 */
function checkDeployLists(ctx, actual, violations) {
  const entries = ctx.lists.managed;
  if (entries === null) {
    violations.push(`${CHECK}: output/<ts>/deploy/managed-paths.list が無い（配置スクリプトの唯一の入力・artifacts.md §7.5）。`);
  } else {
    if (entries.length === 0) violations.push(`${CHECK}: managed-paths.list が空（置換対象ゼロ）。`);
    for (const rel of entries) {
      if (!isManaged(rel)) {
        violations.push(
          `${CHECK}: managed-paths.list に管理パス集合【外】のパス "${rel}" がある。` +
            '集合外（.github/workflows・CODEOWNERS 等）は退避スワップで壊れる（artifacts.md §10.1）。'
        );
      }
    }
    // 具体性（glob でないこと）は共有の判定で、実在は1回の走査の索引で確かめる（generated/ を読み直さない）。
    const { glob } = checkConcreteEntries(entries);
    const missing = entries.filter((rel) => !glob.includes(rel) && !actual.has(rel));
    for (const rel of glob) {
      violations.push(
        `${CHECK}: managed-paths.list の行 "${rel}" が glob になっている。deploy.js は各行を具体パスとして` +
          'コピーに使い展開しないので、配置時に失敗する。実在ファイルを1行1件で書くこと。'
      );
    }
    for (const rel of missing) {
      violations.push(`${CHECK}: managed-paths.list の行 "${rel}" が generated/ に実在しない（配置時に失敗する）。`);
    }
    const listed = new Set(entries);
    for (const rel of actual) {
      if (!listed.has(rel)) violations.push(`${CHECK}: generated/${rel} が managed-paths.list に載っていない（生成したのに配置されない）。`);
    }
  }

  // retired.list（任意）も具体性を要求する。V7 と pre-deploy-check は完全一致で参照するため、glob 行は
  // 黙って一致せず、想定内の廃止が uncaptured に化ける。実在照合は課さない（もう generated/ に無いことの宣言）。
  for (const rel of checkConcreteEntries(ctx.lists.retired ?? []).glob) {
    violations.push(`${CHECK}: retired.list の行 "${rel}" が glob になっている（完全一致で参照されるので廃止の宣言が無効になる）。`);
  }

  for (const rel of actual) {
    if (!isManaged(rel)) violations.push(`${CHECK}: generated/ に管理パス集合外のファイル "${rel}" がある（artifacts.md §10.1）。`);
  }
}

/** 2. MANIFEST ⇔ generated/。 */
function checkManifest(ctx, actual, violations) {
  if (ctx.manifestText === null) {
    violations.push(`${CHECK}: output/<ts>/MANIFEST.md が無い（何が変わるかの記録・artifacts.md §7.2）。`);
    return;
  }
  const listed = parseManifestFiles(ctx.manifestText);
  if (!listed.found) {
    violations.push(
      `${CHECK}: MANIFEST.md に \`## ${MANIFEST_FILES_HEADING}\` 節が無い（generated/ の全ファイルを1行1件で列挙する契約）。`
    );
    return;
  }
  const listedSet = new Set(listed.files);
  for (const f of actual) {
    if (!listedSet.has(f)) violations.push(`${CHECK}: generated/${f} が MANIFEST の全ファイル節に載っていない。`);
  }
  for (const f of listedSet) {
    if (!actual.has(f)) violations.push(`${CHECK}: MANIFEST の全ファイル節の "${f}" が generated/ に実在しない。`);
  }
}

/** 1. design-map の宣言 ⇒ generated/。 */
function checkDeclared(ctx, actual, violations) {
  if (ctx.designMapText === null) {
    violations.push(`${CHECK}: output/<ts>/design-map.md が無い（宣言との照合元が無い）。`);
    return 0;
  }
  const declared = listDeclaredArtifacts(ctx.designMapText);
  if (countFeatureSections(ctx.designMapText) === 0) {
    const declaredSet = new Set(declared.map((d) => d.path));
    const undeclared = [...actual].filter((f) => /\.md$|^\.mcp\.json$/.test(f) && !declaredSet.has(f));
    if (undeclared.length > 0) {
      violations.push(
        `${CHECK}: design-map に機能の節（機能名で始まる ## 見出し）が1つも無いのに、disposition に無い生成物がある` +
          `（例: ${undeclared.slice(0, 3).join(', ')}）。新規ファイルの宣言を抽出できず、脱落の照合が空振りする。`
      );
    }
  }
  for (const d of declared) {
    if (!actual.has(d.path)) {
      violations.push(
        `${CHECK}: design-map が宣言した ${d.path}（${d.source === 'feature-heading' ? `${d.feature} の見出し` : `disposition: ${d.annotation}`}）` +
          'が generated/ に実在しない（builder が1件落とした疑い）。'
      );
    }
  }
  return declared.length;
}

/** verify のコンテキストに V8 を当てる（3. 空でないことは verify.js が先に判定している）。 */
export function checkV8(ctx) {
  const violations = [];
  const actual = new Set(ctx.files.map((f) => f.rel));
  const declared = checkDeclared(ctx, actual, violations);
  checkManifest(ctx, actual, violations);
  checkDeployLists(ctx, actual, violations);
  return { violations, warnings: [], checked: actual.size + declared };
}
