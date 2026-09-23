#!/usr/bin/env node
/**
 * G9 スナップショット完全性（snapshot 系統・§11.2・§10.1）。SubagentStop@generation。
 *
 * 全量スナップショット方式（§8）では「output ＝ design-map の射影」であり、配置は
 * 管理パス集合の全置換で行われる。ゆえに次を機械照合する:
 *   - 空でない出力（生成物が実在する）
 *   - managed-paths.list が base ＋検出 .claude/* ＋(L5)plugin のみ（集合外を排除・§10.1）
 *   - MANIFEST ⇔ output（MANIFEST が存在する）
 *   - managed-paths.list ⇔ generated/（列挙パスが実際に生成されている・glob 記法の禁止）
 *   - retired.list の glob 記法の禁止（G8・pre-deploy-check が完全一致で参照するため）
 *
 * §10.1 の肝: 管理パス集合の**外**（.github/workflows・CODEOWNERS 等）が list に混入すると、
 * 退避スワップで集合外を破壊しうる。集合外パスの検出は破壊防止の最終防波堤である。
 *
 * design-map ⇒ output（S1-4）: design-map が「生成される」と宣言した成果物
 * （gates/lib/design-map.js の listDeclaredArtifacts: 層ごとの節の見出しと keep/modify の
 * disposition）が、すべて generated/ に実在することを照合する。委譲先ビルダーがファイルを
 * 1件落としても、他のゲートは見つけられなかった（run 20260922 で generator が自分で数えて気づいた）。
 * 照合元は design-map（ビルダーや MANIFEST の自己申告ではない）。
 *
 * MANIFEST ⇔ output（S1-3）: MANIFEST の `## 全ファイル` 節（gates/lib/manifest.js）が
 * generated/ の実ファイル集合と双方向に一致することを照合する。MANIFEST の存在だけを見ると、
 * 1行欠落した MANIFEST が全ゲートを通過する。
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { outputDir, isMainModule, readHookInput, readSessionTs, blockStop, passStop } from './lib/run.js';
import { listGeneratedArtifacts } from './g12_output_perfile.js';
import { isManaged, parseListText, checkConcreteEntries } from './lib/managed-paths.js';
import { parseManifestFiles, MANIFEST_FILES_HEADING } from './lib/manifest.js';
import { listDeclaredArtifacts } from './lib/design-map.js';

/** generated/ 配下の【全ファイル】を列挙する（型で絞らない）。§10.1 の集合内包は全型が対象。 */
function walkAllFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

const GATE = 'G9';
const NOT_YET = [];

// 管理パス集合パターン（MANAGED_PATTERNS/isManaged）は gates/lib/managed-paths.js の SSoT を
// 共有する（§10.1・破壊防止の網羅性が単一障害点ゆえ deploy と定義を一元化する）。

export function checkG9({ ts }) {
  const violations = [];
  const outDir = outputDir(ts);
  const genRoot = path.join(outDir, 'generated');

  // 1. 空でない出力
  const { exists, files } = listGeneratedArtifacts(ts);
  if (!exists) {
    return { ok: false, violations: [`${GATE}: generated/ が存在しない（空でない出力の要件・§11.2）。`] };
  }
  if (files.length === 0) {
    return { ok: false, violations: [`${GATE}: generated/ が空（生成物ゼロ・§11.2）。`] };
  }

  // 2. MANIFEST の存在（何が変わったかの記録・§12.1）
  const manifestPath = path.join(outDir, 'MANIFEST.md');
  if (!existsSync(manifestPath)) {
    violations.push(`${GATE}: MANIFEST.md が存在しない（新規/改修/維持/廃止の差分記録が無い・§12.3）。`);
  }

  // 3. managed-paths.list の存在と集合内包（§10.1・破壊防止の最終防波堤）
  const mplPath = path.join(outDir, '.deploy', 'managed-paths.list');
  if (!existsSync(mplPath)) {
    violations.push(`${GATE}: .deploy/managed-paths.list が存在しない（配置スクリプトの唯一の入力・§9.3）。`);
  } else {
    const entries = parseListText(readFileSync(mplPath, 'utf8'));
    if (entries.length === 0) {
      violations.push(`${GATE}: managed-paths.list が空（置換対象ゼロ）。`);
    }
    for (const rel of entries) {
      if (!isManaged(rel)) {
        // 集合外パスの混入 = 退避スワップで不可侵領域を破壊しうる（§10.1）。
        violations.push(
          `${GATE}: managed-paths.list に管理パス集合【外】のパス "${rel}" が混入している。` +
            `集合外（.github/workflows・CODEOWNERS 等）は不可侵。退避スワップで破壊される（§10.1）。`
        );
      }
    }

    // 3-b. 冒頭コメントが掲げる「managed-paths.list ⇔ generated/（列挙パスが実際に生成されて
    //      いる）」の実装。deploy.js は各行を copyFileSync の src/dst として具体パスのまま
    //      使うため、glob 行・不在パスは配置時に必ず落ちる（rolled-back）。生成段階で止めて
    //      配置まで持ち越さない（ライブ run 20260909_003820 で実際に配置が失敗した）。
    const { glob, missing } = checkConcreteEntries(entries, { genRoot });
    for (const rel of glob) {
      violations.push(
        `${GATE}: managed-paths.list の行 "${rel}" が glob 記法（集合の表記）になっている。` +
          `deploy.js は各行を具体パスとして copyFileSync に渡すため展開されず、配置時に` +
          `「output に配置対象が無い」で rolled-back になる。実在ファイルを1行1件で列挙する（§9.3）。`
      );
    }
    for (const rel of missing) {
      violations.push(
        `${GATE}: managed-paths.list の行 "${rel}" が generated/ に実在しない` +
          `（列挙したのに生成していない＝配置時に rolled-back になる・§11.2）。`
      );
    }
  }

  // 3-c. retired.list（任意）も同じ具体性を要求する。G8（非回帰）と pre-deploy-check は
  //      retired.list を Set の完全一致で参照するため、glob 行は黙って一致せず、「想定内の
  //      廃止」が uncaptured に化けて配置が exit 2 で止まる——原因が読み取れない形で。
  //      実在照合は課さない（retired は「もう generated/ に無い」ことの宣言だから）。
  const retiredPath = path.join(outDir, '.deploy', 'retired.list');
  if (existsSync(retiredPath)) {
    const retired = parseListText(readFileSync(retiredPath, 'utf8'));
    for (const rel of checkConcreteEntries(retired).glob) {
      violations.push(
        `${GATE}: retired.list の行 "${rel}" が glob 記法になっている。` +
          `G8・pre-deploy-check は完全一致で参照するため展開されず、廃止宣言が無効になる（§10.2）。`
      );
    }
  }

  // 4. generated/ の【全ファイル】が managed パスに収まる（集合外を生成していないか）。
  //    listGeneratedArtifacts は .md/.mcp.json のみだが、§10.1 の集合内包は全型が対象。
  //    型で絞ると .github/workflows/*.yml のような集合外ファイルが検査を逃れる。
  for (const f of walkAllFiles(genRoot)) {
    const rel = path.relative(genRoot, f).replace(/\\/g, '/');
    if (!isManaged(rel)) {
      violations.push(`${GATE}: generated/ に管理パス集合外のファイル "${rel}" がある（§10.1）。`);
    }
  }

  // 5. MANIFEST ⇔ generated/（S1-3）: 全ファイル節が実ファイル集合と双方向に一致する。
  const actual = new Set(walkAllFiles(genRoot).map((f) => path.relative(genRoot, f).replace(/\\/g, '/')));
  if (existsSync(manifestPath)) {
    const listed = parseManifestFiles(readFileSync(manifestPath, 'utf8'));
    if (!listed.found) {
      violations.push(
        `${GATE}: MANIFEST.md に \`## ${MANIFEST_FILES_HEADING}\` 節が無い。generated/ の全ファイルを1行1件（バッククォート付きの` +
          '相対パス）で列挙すること（MANIFEST の欠落を機械照合するための契約・S1-3）。'
      );
    } else {
      const listedSet = new Set(listed.files);
      for (const f of actual) {
        if (!listedSet.has(f)) violations.push(`${GATE}: generated/${f} が MANIFEST の全ファイル節に載っていない（MANIFEST の1行欠落・S1-3）。`);
      }
      for (const f of listedSet) {
        if (!actual.has(f)) violations.push(`${GATE}: MANIFEST の全ファイル節の "${f}" が generated/ に実在しない（余剰な行・S1-3）。`);
      }
    }
  }

  // 6. design-map ⇒ generated/（S1-4）: design-map が宣言した成果物がすべて実在する。
  //    design-map が無いときは照合元が無いので行わない（その不在は G1（generation は design.done 前提）の担当）。
  const designMapPath = path.join(outDir, 'design-map.md');
  if (existsSync(designMapPath)) {
    for (const d of listDeclaredArtifacts(readFileSync(designMapPath, 'utf8'))) {
      if (!actual.has(d.path)) {
        violations.push(
          `${GATE}: design-map が宣言した ${d.path}（${d.source === 'layer-heading' ? `${d.layer} の見出し` : `disposition: ${d.annotation}`}）が generated/ に実在しない` +
            '（ビルダーへの委譲で1件脱落した疑い・S1-4）。'
        );
      }
    }
  }

  return { ok: violations.length === 0, violations, scanned: files.length, not_yet: NOT_YET };
}

export function check({ ts }) {
  const { ok, violations } = checkG9({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G9: .session-ts 不在のため対象なし');
  } else {
    const r = checkG9({ ts });
    if (r.ok) passStop(`G9: 通過（${r.scanned}件・managed-paths 集合内包・MANIFEST 有）`);
    else blockStop(`G9: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
