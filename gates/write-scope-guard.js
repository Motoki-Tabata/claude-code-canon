#!/usr/bin/env node
/**
 * 書込先ガード（write-scope-guard・PreToolUse）。詳細設計書 §11.3。
 *
 * - `Write`/`Edit`（等）のパスが sanctioned ツリー（output/<ts>/・work/<ts>/）外なら deny。
 *   特に docs/・gates/・.claude/（システム本体）を保護する。
 * - `output/<ts>/.gate/**` はエージェント書込を一律 deny（deny-all・承認鋳造経路の一本化・§4.4）。
 * - matcher にコマンド実行系ツール（Bash・PowerShell）を含め、tool_input.command の
 *   文字列を検査して保護パスへの書込コマンドを deny する（シェル経路の封鎖・(ii) 検査＝保険。
 *   (i) の剥奪＋G13 が正）。
 *   **PowerShell を落としてはならない**: 正典 docs/TOOLS.md の正規ツール名に PowerShell が
 *   実在し（権限要）、Windows では主シェルである。Bash のみを見る実装だと
 *   `PowerShell: Set-Content <ts>/.gate/approvals/spec.approved ''` で承認を捏造でき、
 *   承認鋳造経路の一本化の deny-all と前進ゲートのラチェットが崩壊する（実測で確認済み）。
 * - ガードは run が in-flight のときのみ有効（ガードの有効条件）。run 外は素通り。
 *
 * 入力（stdin JSON）: docs/L4_AUTOMATION.md §2.1
 *   { tool_name, tool_input, session_id, cwd, permission_mode, hook_event_name }
 * 出力: exit 0 + hookSpecificOutput.permissionDecision（allow|deny）
 */

import path from 'node:path';
import { CANON_ROOT, posix } from './lib/canon.js';
import { readHookInput, currentRunTs, toRepoRelative, allow, deny, gateDir, isMainModule } from './lib/run.js';
import { SHELL_TOOLS, looksLikeWriteCommand } from './lib/shell-write.js';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// (ii) シェル経路の封鎖: 保護パスへの書込を示唆するコマンドを検出する（保険・完全ではない）。
const PROTECTED_TOKEN_RE = /(^|["'\s/\\])(docs|gates|\.claude)[\\/]/i;
const GATE_TOKEN_RE = /\.gate[\\/]/i;

function main() {
  const input = readHookInput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const cwd = input.cwd || CANON_ROOT;

  const ts = currentRunTs();
  if (!ts) {
    // ガードの有効条件: run 未開始／run 完了 → ガード素通り（保守ループ・実装作業を通す）。
    allow('run外（.session-ts 不在または終端マーカー有）のためガード非適用');
    return;
  }

  if (SHELL_TOOLS.has(toolName)) {
    const command = String(toolInput.command || '');
    const targetsProtected = PROTECTED_TOKEN_RE.test(command) || GATE_TOKEN_RE.test(command);
    const looksLikeWrite = looksLikeWriteCommand(command);
    if (targetsProtected && looksLikeWrite) {
      deny(`${toolName} 経由での保護パスへの書込を検出（保険的検査・シェル経路の封鎖）: ${command}`);
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
    // パスが取れない書込は安全側で deny（sanctioned 判定ができない）。
    deny('tool_input からファイルパスを特定できない');
    return;
  }

  const rel = toRepoRelative(filePath, cwd);
  const outputTsPrefix = posix(path.join('output', ts)) + '/';
  const workTsPrefix = posix(path.join('work', ts)) + '/';
  const gateRel = posix(path.relative(CANON_ROOT, gateDir(ts))) + '/';

  if (rel.startsWith(gateRel)) {
    deny(`.gate/** は deny-all（承認鋳造経路の一本化・§4.4）: ${rel}`);
    return;
  }
  if (rel.startsWith(outputTsPrefix) || rel.startsWith(workTsPrefix)) {
    allow(`sanctioned ツリー内: ${rel}`);
    return;
  }
  if (rel.startsWith('docs/') || rel.startsWith('gates/') || rel.startsWith('.claude/')) {
    deny(`保護パス（システム本体）への書込: ${rel}`);
    return;
  }
  deny(`sanctioned ツリー（output/${ts}/・work/${ts}/）外: ${rel}`);
}

if (isMainModule(import.meta.url)) main();
