#!/usr/bin/env node
/**
 * 前進ガード（advance-guard・PreToolUse）。詳細設計書 §11.3。
 *
 * PostToolUse の per-file 違反（G3〜G6）はブロック不可なので、run 全体の
 * `.gate/blocks/gen.blocked` に転写される。本ガードは PreToolUse で発火し、
 * ラッチ存在中は当該 <ts> の output 前進書込（generated/**）を deny する。
 * 唯一の硬遮断は PreToolUse deny（PostToolUse/SubagentStop の exit 2 は
 * 握り潰され得る）。ラッチはゲート再通過でも自動解除されず、解除は
 * 人間 CLI（npm run unblock -- <ts>）のみ。
 *
 * ラッチの鋳造（PostToolUse 側で G3〜G6 を実行し違反を検出する処理）は本スクリプトの
 * PostToolUse 分岐で行う（settings.json の PostToolUse@Write|Edit|NotebookEdit で発火）。
 * 書かれた1ファイルへ per-file ゲートを best-effort で当て（advisory・§11.1）、明確な違反が
 * あれば markBlocked() で gen.blocked を鋳造する。分類・検査は G12 の advisoryReverifyFile()
 * に一本化し（SSoT・重複による drift を避ける・L005）、権威判定は停止時の G12 が再実行する。
 */

import path from 'node:path';
import { posix, CANON_ROOT } from './lib/canon.js';
import { advisoryReverifyFile } from './g12_output_perfile.js';
import {
  readHookInput,
  currentRunTs,
  toRepoRelative,
  hasBlockLatch,
  mintBlockLatch,
  appendProcessedLog,
  allow,
  deny,
  passStop,
  isMainModule,
} from './lib/run.js';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const GEN_STAGE = 'gen';

/** PostToolUse 側から違反を転写するための再利用可能ヘルパ（§11.3 前進ガード）。 */
export function markBlocked(ts, reason, meta = {}) {
  mintBlockLatch(ts, GEN_STAGE, reason, meta);
  appendProcessedLog(ts, { stage: GEN_STAGE, action: 'advance-guard-latch', ok: false, reason });
}

function main() {
  const input = readHookInput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const cwd = input.cwd;
  const hookEvent = input.hook_event_name;

  const ts = currentRunTs();
  if (!ts) {
    if (hookEvent === 'PostToolUse') {
      passStop('run外のため advance-guard 非適用');
      return;
    }
    allow('run外のためガード非適用（ガードの有効条件）');
    return;
  }

  if (hookEvent === 'PostToolUse') {
    // PostToolUse はブロック不可（§11.1）。書かれたファイルへ per-file ゲート（G3〜G6）を
    // best-effort で当て、明確な違反があれば gen.blocked を鋳造する。次の PreToolUse が
    // generated/** への前進書込を deny し、権威判定は停止時の G12 が再実行する。
    const filePath = toolInput.file_path || toolInput.path || toolInput.notebook_path;
    if (filePath) {
      const rel = toRepoRelative(filePath, cwd);
      const generatedPrefix = posix(path.join('output', ts, 'generated')) + '/';
      // 既にラッチ済みなら再鋳造しない（processed.log の重複を避ける・冪等）。
      if (rel.startsWith(generatedPrefix) && !hasBlockLatch(ts, GEN_STAGE)) {
        const absPath = path.join(CANON_ROOT, rel);
        const violations = advisoryReverifyFile(absPath, ts);
        if (violations.length > 0) {
          const genRel = rel.slice(generatedPrefix.length);
          markBlocked(ts, `PostToolUse per-file 助言: generated/${genRel} が G3〜G6 に違反`, {
            file: rel,
            violations,
          });
          passStop(
            `PostToolUse: ${rel} に per-file 違反（${violations.length}件）→ ${GEN_STAGE}.blocked を鋳造。権威判定は G12@Stop`
          );
          return;
        }
      }
    }
    passStop('PostToolUse: per-file 違反なし（または対象外）');
    return;
  }

  if (!WRITE_TOOLS.has(toolName)) {
    allow(`対象外ツール（${toolName}）`);
    return;
  }

  const filePath = toolInput.file_path || toolInput.path;
  if (!filePath) {
    allow('file_path なし（write-scope-guard が別途判定）');
    return;
  }

  const rel = toRepoRelative(filePath, cwd);
  const generatedPrefix = posix(path.join('output', ts, 'generated')) + '/';

  if (rel.startsWith(generatedPrefix) && hasBlockLatch(ts, GEN_STAGE)) {
    deny(
      `前進ガード: .gate/blocks/${GEN_STAGE}.blocked が存在するため generated/** への前進書込を deny（解除は npm run unblock -- ${ts}）`
    );
    return;
  }

  allow('前進ガード: ブロックラッチなし');
}

if (isMainModule(import.meta.url)) main();
