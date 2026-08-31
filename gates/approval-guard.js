#!/usr/bin/env node
/**
 * 承認ガード（approval-guard・PreToolUse）。詳細設計書 §11.3。
 *
 * 「承認を待ってから次工程」を書込で強制する（前進ゲート＋凍結）。
 *   前進(a): design-map.md 書込は spec.approved が無ければ deny
 *   前進(b): output/<ts>/generated/** 書込は design.approved が無ければ deny
 *   凍結(c): spec.md 書込は spec.approved が在れば deny
 *   凍結(d): design-map.md 書込は design.approved が在れば deny
 *
 * 承認サイドカーの鋳造/取消は tools/approve.js のみ（§4.4・承認鋳造経路の一本化）。
 * ガードは run が in-flight のときのみ有効（ガードの有効条件）。
 */

import path from 'node:path';
import { posix } from './lib/canon.js';
import { readHookInput, currentRunTs, toRepoRelative, hasApproval, allow, deny, isMainModule } from './lib/run.js';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

function main() {
  const input = readHookInput();
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};
  const cwd = input.cwd;

  const ts = currentRunTs();
  if (!ts) {
    allow('run外のためガード非適用（ガードの有効条件）');
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
  const specPath = posix(path.join('output', ts, 'spec.md'));
  const designMapPath = posix(path.join('output', ts, 'design-map.md'));
  const generatedPrefix = posix(path.join('output', ts, 'generated')) + '/';

  if (rel === designMapPath) {
    if (!hasApproval(ts, 'spec')) {
      deny('前進ゲート(a): spec.approved が無いため design-map.md へ書込不可');
      return;
    }
    if (hasApproval(ts, 'design')) {
      deny('凍結(d): design.approved が在るため design-map.md は改変不可（取消は npm run approve -- <ts> design --revoke）');
      return;
    }
    allow('design-map.md: spec 承認済み・design 未承認');
    return;
  }

  if (rel === specPath) {
    if (hasApproval(ts, 'spec')) {
      deny('凍結(c): spec.approved が在るため spec.md は改変不可（取消は npm run approve -- <ts> spec --revoke）');
      return;
    }
    allow('spec.md: 未承認のため書込可');
    return;
  }

  if (rel.startsWith(generatedPrefix)) {
    if (!hasApproval(ts, 'design')) {
      deny('前進ゲート(b): design.approved が無いため generated/** へ書込不可');
      return;
    }
    allow('generated/**: design 承認済み');
    return;
  }

  allow('承認ガードの対象パスではない');
}

if (isMainModule(import.meta.url)) main();
