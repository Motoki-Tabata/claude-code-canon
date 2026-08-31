#!/usr/bin/env node
/**
 * G12 per-file 権威再検証（snapshot 系統・§11.2）。SubagentStop@generation。
 *
 * 停止時に output/<ts>/generated/ 配下の全カスタマイズファイルへ G3〜G6 を再実行する。
 * PostToolUse（per-file 助言）は「ブロック不可＋読取失敗で非ブロッキング降格」しうるため、
 * 権威ある判定は停止時にここでまとめて下す（§11.1）。
 *
 * vacuous pass 防止（§11.5・詳細設計書 §11.2 が明記）:
 *   「output ツリー不在は違反」。generated/ が存在しない／空なら、検査対象ゼロを
 *   「合格」と扱ってはならない。生成が走ったのに成果物が無いのは異常である。
 *
 * G3〜G6 は再実装せず per-file 入口（checkG3File 等）を import して呼ぶ。
 */

import path from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { outputDir, isMainModule, readHookInput, readSessionTs, blockStop, passStop } from './lib/run.js';
import { detectKind } from './lib/artifact.js';
import { checkG3File } from './g3_path_convention.js';
import { checkG4File } from './g4_frontmatter_schema.js';
import { checkG5File } from './g5_tool_names.js';
import { checkG6File, checkMcpJsonFile } from './g6_security.js';
import { isNonSchemaRel } from './lib/non-schema.js';

const GATE = 'G12';

// スキーマ（frontmatter）を持つ種別。これらだけが G3〜G6 の per-file 再検証の対象。
const SCHEMA_KINDS = new Set(['agent', 'skill', 'rule']);

/** generated/ 配下のカスタマイズ定義ファイルを列挙する（.md と .mcp.json）。 */
export function listGeneratedArtifacts(ts) {
  const root = path.join(outputDir(ts), 'generated');
  if (!existsSync(root)) return { root, exists: false, files: [] };
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.md') || name === '.mcp.json') files.push(p);
    }
  };
  walk(root);
  return { root, exists: true, files };
}

/** 各ファイルへ G3〜G6 を当て、違反を集約する。 */
function reverifyFile(absPath) {
  const out = [];
  const push = (arr) => {
    for (const v of arr || []) out.push(typeof v === 'string' ? v : JSON.stringify(v));
  };
  if (absPath.endsWith('.mcp.json')) {
    // .mcp.json は G6 のみ対象（frontmatter/パス規約の対象外）。
    push(checkMcpJsonFile(absPath));
    return out;
  }
  push(asArray(checkG3File(absPath)));
  push(asArray(checkG4File(absPath)));
  push(asArray(checkG5File(absPath)));
  push(asArray(checkG6File(absPath)));
  return out;
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.violations)) return v.violations;
  return [];
}

/**
 * generated/ 配下の単一ファイルを分類し、per-file ゲート（G3〜G6）の対象なら当てて違反を返す。
 * per-file 判定の SSoT 入口: 停止時の権威判定（checkG12）と PostToolUse 助言（advisoryReverifyFile）が
 * ともにこれを使い、判定ロジックの二重化＝drift を避ける（L005）。
 *   { target: false }                      … 対象外（lib/non-schema.js の非スキーマ判定・genRoot 外・.md/.mcp.json 以外の型）
 *   { target: true, violations: string[] } … 対象（schema 種別の .md／.mcp.json／種別不明の誤配置）
 * genRoot は outputDir(ts)/generated の絶対パス。
 */
function classifyFile(absPath, genRoot) {
  const rel = path.relative(genRoot, absPath).replace(/\\/g, '/');
  if (rel === '' || rel.startsWith('..')) return { target: false }; // genRoot 外
  if (absPath.endsWith('.mcp.json')) return { target: true, violations: reverifyFile(absPath) };
  if (!absPath.endsWith('.md')) return { target: false }; // per-file の対象は .md/.mcp.json のみ（型検査は G9）
  if (isNonSchemaRel(rel, 'generated')) return { target: false }; // L1/README/settings は別ゲートの担当
  const kind = detectKind(absPath);
  if (SCHEMA_KINDS.has(kind)) return { target: true, violations: reverifyFile(absPath) };
  // 想定外の unknown（agents/ 直下の謎の .md 等）。黙って飛ばすと vacuous pass（§11.5）。
  return {
    target: true,
    violations: [
      `${GATE}: generated/${rel} は種別を判定できず（kind=${kind}）、既知の非スキーマファイル` +
        `（CLAUDE.md / .claude/README.md / .claude/settings.json）でもない。配置が誤っている可能性（§11.5）。`,
    ],
  };
}

/**
 * PostToolUse（advisory・§11.1）用の単一ファイル入口。書かれた1ファイルへ per-file ゲート
 * （G3〜G6）を best-effort で当て、checkG12（停止時の権威判定）と**同一の分類・検査**（classifyFile）
 * を使う。返り値が非空なら呼び出し側（advance-guard）が gen.blocked を鋳造し、以降の generated/**
 * 前進書込が PreToolUse で硬遮断される。「PreToolUse が早期に止めるのは G12@Stop が止めるものと同一」
 * を保つのが要点。
 *
 * 対象外（lib/non-schema.js の非スキーマ判定・genRoot 外・.md/.mcp.json 以外）は空配列。読取・パース失敗は例外を
 * 握って空配列を返す＝非ブロッキング降格（§11.1）。
 */
export function advisoryReverifyFile(absPath, ts) {
  try {
    const genRoot = path.join(outputDir(ts), 'generated');
    const c = classifyFile(absPath, genRoot);
    return c.target ? c.violations : [];
  } catch {
    return []; // 読取失敗＝非ブロッキング降格（§11.1）
  }
}

export function checkG12({ ts }) {
  const { root, exists, files } = listGeneratedArtifacts(ts);

  // vacuous pass 防止: output ツリー不在／空は違反（§11.2）。
  if (!exists) {
    return {
      ok: false,
      violations: [
        `${GATE}: output ツリー（${path.relative(process.cwd(), root)}）が存在しない。` +
          `生成が走ったのに成果物ツリーが無いのは異常（vacuous pass 防止・§11.5）。`,
      ],
    };
  }
  if (files.length === 0) {
    return {
      ok: false,
      violations: [
        `${GATE}: generated/ にカスタマイズ定義（.md / .mcp.json）が1件も無い。` +
          `検査対象ゼロを「合格」と扱わない（§11.5）。`,
      ],
    };
  }

  const genRoot = path.join(outputDir(ts), 'generated');
  const violations = [];
  let reverified = 0;
  for (const f of files) {
    const c = classifyFile(f, genRoot); // 分類・検査は advisory と共有（SSoT）
    if (!c.target) continue; // lib/non-schema.js の非スキーマ判定等は別ゲートの担当
    for (const v of c.violations) violations.push(v);
    reverified++;
  }
  return { ok: violations.length === 0, violations, scanned: files.length, reverified };
}

/** stage-guard.js / gen-guard.js が期待する { ok, violations: string[] } 形。 */
export function check({ ts }) {
  return checkG12({ ts });
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readSessionTs();
  if (!ts) {
    passStop('G12: .session-ts 不在のため対象なし');
  } else {
    const r = checkG12({ ts });
    if (r.ok) passStop(`G12: 通過（${r.scanned}件を権威再検証・違反0）`);
    else blockStop(`G12: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
