#!/usr/bin/env node
/**
 * 機能X（正典更新）専用の書込先ガード（canon-update-scope-guard・PreToolUse）。
 * 詳細設計書 §13.1・§11.3「ガードの2系統」。
 *
 * write-scope-guard（`/canon` run 用）と極性が逆:
 *   - write-scope-guard は `docs/`・`gates/`・`.claude/`（システム本体）を保護し、
 *     `output/<ts>/`・`work/<ts>/` を sanctioned とする。
 *   - 本ガードは `docs/` を書込対象とし、`.claude/`・`gates/`・`tests/`・`design/`（設計書2冊）を保護する。
 *
 * 判定材料は `work/.canon-update-ts`（gates/lib/canon-run.js）。`/canon` run
 * （`work/.session-ts`）とは相互排他（tools/new-ts.js・tools/new-canon-ts.js が
 * 互いの in-flight を検査して異常終了する）ため、両ガードが同時に deny を出す
 * 状況は想定しない。
 *
 * sanctioned（書込許可）:
 *   - `work/<ts>/`（機能X run の作業領域・canon-diff-proposal.md・impact-report.md 等）
 *   - `output/<ts>/`（`.gate/**` を除く。マーカー・承認・ラッチは §4.4 と同じく
 *     tools/ CLI とゲートスクリプトのみが鋳造する＝deny-all）
 *   - `docs/`（ただし `output/<ts>/.gate/approvals/canon-update.approved` が
 *     存在するまでは deny＝更新ゲート。§13.1「安全制約」の機械強制）
 *
 * 保護（deny）: 上記以外の全て（`.claude/`・`gates/`・`tests/`・`design/`（設計書2冊）を含む）。
 * write-scope-guard と同じく sanctioned 外はデフォルト deny の規律を踏襲する。
 */

import path from 'node:path';
import { CANON_ROOT, posix } from './lib/canon.js';
import { readHookInput, toRepoRelative, hasApproval, gateDir, allow, deny, isMainModule } from './lib/run.js';
import { currentCanonUpdateRunTs } from './lib/canon-run.js';
import { SHELL_TOOLS, looksLikeWriteCommand, analyzeShellWrite, underAnyDir, containsGateSegment } from './lib/shell-write.js';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// 保護対象（システム本体）。docs/ はここに含めない（sanctioned だが承認ゲート付き・別扱い）。
// design/ は設計書2冊（基本設計書・詳細設計書）のディレクトリ（gates/lib/canon.js の DESIGN_DOCS）。
const PROTECTED_DIRS = ['.claude', 'gates', 'tests', 'design'];
const DOCS_DIRS = ['docs'];

// unresolved 時のフォールバック専用（出現ベースの広域スキャン・保険）。宛先を静的に同定できた
// 通常時は analyzeShellWrite() の宛先ベース判定を使う（下記シェル分岐）。
const PROTECTED_TOKEN_RE = /(^|["'\s/\\])(\.claude|gates|tests|design)[\\/]/i;
const DOCS_TOKEN_RE = /(^|["'\s/\\])docs[\\/]/i;
const GATE_TOKEN_RE = /\.gate[\\/]/i;

function main() {
  const input = readHookInput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || CANON_ROOT;

  const ts = currentCanonUpdateRunTs();
  if (!ts) {
    // 機能X run 外（.canon-update-ts 不在または終端マーカー有）→ ガード素通り。
    // write-scope-guard と対称の規律（§11.3 ガードの有効条件）。
    allow('機能X run 外（.canon-update-ts 不在または終端マーカー有）のためガード非適用');
    return;
  }

  if (SHELL_TOOLS.has(toolName)) {
    const command = String(toolInput.command || '');
    const { targets, unresolved, scanText } = analyzeShellWrite(command, cwd);
    const looksLikeWrite = looksLikeWriteCommand(command);

    const protectedHit = targets.some((t) => underAnyDir(t, PROTECTED_DIRS) || containsGateSegment(t));
    const protectedFallback =
      unresolved && looksLikeWrite && (PROTECTED_TOKEN_RE.test(scanText) || GATE_TOKEN_RE.test(scanText));
    if (protectedHit || protectedFallback) {
      deny(`${toolName} 経由での保護パス（.claude/・gates/・tests/・design/）への書込を検出: ${command}`);
      return;
    }

    const approved = hasApproval(ts, 'canon-update');
    const docsHit = !approved && targets.some((t) => underAnyDir(t, DOCS_DIRS));
    const docsFallback = !approved && unresolved && looksLikeWrite && DOCS_TOKEN_RE.test(scanText);
    if (docsHit || docsFallback) {
      deny(`${toolName} 経由での docs/ 書込を検出（更新ゲート未承認・§13.1）: ${command}`);
      return;
    }

    allow(`${toolName}: 保護パスへの書込を示唆するパターンなし（またはゲート通過済み）`);
    return;
  }

  if (!WRITE_TOOLS.has(toolName)) {
    allow(`対象外ツール（${toolName}）`);
    return;
  }

  const filePath = toolInput.file_path || toolInput.path || toolInput.notebook_path;
  if (!filePath) {
    deny('tool_input からファイルパスを特定できない');
    return;
  }

  const rel = toRepoRelative(filePath, cwd);
  const outputTsPrefix = posix(path.join('output', ts)) + '/';
  const workTsPrefix = posix(path.join('work', ts)) + '/';
  const gateRel = posix(path.relative(CANON_ROOT, gateDir(ts))) + '/';

  if (rel.startsWith(gateRel)) {
    deny(`.gate/** は deny-all（§4.4 と同じ規律）: ${rel}`);
    return;
  }
  if (rel.startsWith(outputTsPrefix) || rel.startsWith(workTsPrefix)) {
    allow(`sanctioned ツリー内（機能X run）: ${rel}`);
    return;
  }
  if (underAnyDir(rel, DOCS_DIRS)) {
    if (!hasApproval(ts, 'canon-update')) {
      deny(`更新ゲート未承認のため docs/ へ書込不可（§13.1・npm run approve -- ${ts} canon-update）: ${rel}`);
      return;
    }
    allow(`docs/: 更新ゲート承認済み: ${rel}`);
    return;
  }
  if (underAnyDir(rel, PROTECTED_DIRS)) {
    deny(`保護パス（システム本体・機能X run 中は書換不可）: ${rel}`);
    return;
  }
  deny(`sanctioned ツリー（docs/・work/${ts}/・output/${ts}/）外: ${rel}`);
}

if (isMainModule(import.meta.url)) main();
