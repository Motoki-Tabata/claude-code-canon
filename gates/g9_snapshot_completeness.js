#!/usr/bin/env node
/**
 * G9 スナップショット完全性（snapshot 系統・§11.2・§10.1）。SubagentStop@generation。
 *
 * 全量スナップショット方式（§8）では「output ＝ design-map の射影」であり、配置は
 * 管理パス集合の全置換で行われる。ゆえに次を機械照合する:
 *   - 空でない出力（生成物が実在する）
 *   - managed-paths.list が base ＋検出 .claude/* ＋(L5)plugin のみ（集合外を排除・§10.1）
 *   - MANIFEST ⇔ output（MANIFEST が存在する）
 *   - managed-paths.list ⇔ generated/（列挙パスが実際に生成されている）
 *
 * §10.1 の肝: 管理パス集合の**外**（.github/workflows・CODEOWNERS 等）が list に混入すると、
 * 退避スワップで集合外を破壊しうる。集合外パスの検出は破壊防止の最終防波堤である。
 *
 * 注（現行スコープ）: design-map ⇔ output の完全な双方向突合（design-map の各
 * コンポーネント宣言と output の1対1照合）は design-map パーサを要するため現行実装では
 * 「生成物が managed-paths に含まれる」方向の検査に絞る。逆方向（design-map 宣言が
 * すべて output に在る）は not_yet に明示する。
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { outputDir, isMainModule, readHookInput, readSessionTs, blockStop, passStop } from './lib/run.js';
import { listGeneratedArtifacts } from './g12_output_perfile.js';
import { isManaged, parseListText } from './lib/managed-paths.js';

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
const NOT_YET = ['design-map⇔output の逆方向突合（design-map パーサ要・MVP強化）'];

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
