#!/usr/bin/env node
/**
 * 機能Y（自己再生成）専用の書込先ガード（self-optimize-scope-guard・PreToolUse）。
 * 詳細設計書 §13.2.1・§11.3「ガードの3系統」。
 *
 * write-scope-guard（`/canon` run 用）と同じ極性（`.claude/` を保護）だが、決定的に異なる点が
 * 1つある: **終端マーカー（`generation`）到達後も sentinel が在る限り保護を解かない**。
 * 自己最適化では工程7（generation.done）通過の直後こそ「直接 `.claude/` を直したくなる」局面
 * （3リスク(1) 自己コード改変の露出点）であり、write-scope-guard の run 外緩和
 * （終端マーカーで run 外扱いにする＝ガードの有効条件が終端マーカーで解ける仕様）を
 * ここに適用すると、まさに守るべき瞬間に保護が消える。
 *
 * 判定材料は `work/.self-optim`（`gates/lib/self-optim.js`・`readSelfOptim()`）。
 * `.session-ts` の終端マーカーは見ない——sentinel の有無だけで有効/無効を決める。
 *
 * sanctioned（書込許可）: `output/<ts>/`（`.gate/**` 除く）・`work/<ts>/`（sentinel の ts）。
 * 保護（deny）: `.claude/`・`gates/`・`tests/`・`docs/`・`design/`（設計書2冊）・`generations/`
 *   （候補の取り込みは `tools/stage-candidate.js` に一本化する・§13.2.1）。
 *
 * 入力（stdin JSON）: docs/L4_AUTOMATION.md §2.1
 *   { tool_name, tool_input, session_id, cwd, permission_mode, hook_event_name }
 * 出力: exit 0 + hookSpecificOutput.permissionDecision（allow|deny）
 */

import path from 'node:path';
import { CANON_ROOT, posix } from './lib/canon.js';
import { readHookInput, toRepoRelative, gateDir, allow, deny, isMainModule } from './lib/run.js';
import { readSelfOptim } from './lib/self-optim.js';
import { SHELL_TOOLS, looksLikeWriteCommand } from './lib/shell-write.js';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// 保護対象（システム本体＋世代管理）。`generations/` は候補取込を CLI 一本化するため保護に含める。
// `design/` は設計書2冊（基本設計書・詳細設計書）のディレクトリ（gates/lib/canon.js の DESIGN_DOCS）。
const PROTECTED_TOKEN_RE = /(^|["'\s/\\])(\.claude|gates|tests|docs|design|generations)[\\/]/i;
const GATE_TOKEN_RE = /\.gate[\\/]/i;

function main() {
  const input = readHookInput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || CANON_ROOT;

  const sentinel = readSelfOptim();
  if (!sentinel) {
    // 自己最適化 run 外（.self-optim 不在）→ ガード素通り。他2ガードと対称の有効条件。
    allow('自己最適化 run 外（.self-optim 不在）のためガード非適用');
    return;
  }
  const ts = sentinel.ts;

  if (SHELL_TOOLS.has(toolName)) {
    const command = String(toolInput.command || '');
    const looksLikeWrite = looksLikeWriteCommand(command);
    if (looksLikeWrite && (PROTECTED_TOKEN_RE.test(command) || GATE_TOKEN_RE.test(command))) {
      deny(`${toolName} 経由での保護パス（.claude/・gates/・tests/・docs/・design/・generations/）への書込を検出（自己最適化 run 中・§13.2.1）: ${command}`);
      return;
    }
    allow(`${toolName}: 保護パスへの書込を示唆するパターンなし`);
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
    allow(`sanctioned ツリー内（自己最適化 run）: ${rel}`);
    return;
  }
  if (
    rel.startsWith('.claude/') ||
    rel.startsWith('gates/') ||
    rel.startsWith('tests/') ||
    rel.startsWith('docs/') ||
    rel.startsWith('design/') ||
    rel.startsWith('generations/')
  ) {
    deny(`保護パス（システム本体・自己最適化 run 中は終端マーカー後も書換不可・§13.2.1）: ${rel}`);
    return;
  }
  deny(`sanctioned ツリー（output/${ts}/・work/${ts}/）外: ${rel}`);
}

if (isMainModule(import.meta.url)) main();
