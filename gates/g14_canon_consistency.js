#!/usr/bin/env node
/**
 * G14 正典整合（機能X・snapshot 系統・§11.2「G14/G15/G16 実装契約」）。SubagentStop@canon-update。
 *
 * `docs/` 更新後、次を機械照合する:
 *   1. `work/<ts>/canon-diff-proposal.md` の `## メタ` に investigated_at・confirmed_version・
 *      todo_marker_count のいずれも欠落していないこと（固定フォーマット・vacuous pass 防止）
 *   2. `docs/` 9ファイルの確認バージョンが全ファイルで一致すること（`extractCanonVersion` を
 *      in-process 呼び出し。gates/build-conformance-tables.js の関数と同一 SSoT を共有し
 *      二重実装しない・L005）
 *   3. 一致したバージョンが `canon-diff-proposal.md` の申告値（confirmed_version）と一致すること
 *   4. `docs/SOURCES.md` 更新履歴に investigated_at の日付を含む行が1件以上あること
 *
 * 純関数（fs 読取のみ・process.exit は CLI 実行時のみ）。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { workDir, isMainModule, readHookInput, blockStop, passStop } from './lib/run.js';
import { readCanonUpdateTs } from './lib/canon-run.js';
import { CANON_FILES } from './build-conformance-tables.js';
import { extractCanonVersion, ExtractionError, DOCS_DIR } from './lib/canon.js';
import { parseCanonDiffProposal, CanonDiffProposalError } from './lib/canon-diff.js';

const GATE = 'G14';

export function checkG14({ ts }) {
  const violations = [];

  const proposalPath = path.join(workDir(ts), 'canon-diff-proposal.md');
  if (!existsSync(proposalPath)) {
    return { ok: false, violations: [`${GATE}: work/${ts}/canon-diff-proposal.md が存在しない（§13.1 固定フォーマット）。`] };
  }

  let proposal;
  try {
    proposal = parseCanonDiffProposal(readFileSync(proposalPath, 'utf8'));
  } catch (err) {
    if (err instanceof CanonDiffProposalError) {
      return { ok: false, violations: [`${GATE}: ${err.message}`] };
    }
    throw err;
  }

  const REQUIRED_META = ['investigated_at', 'confirmed_version', 'todo_marker_count'];
  for (const key of REQUIRED_META) {
    if (!proposal.meta[key]) {
      violations.push(`${GATE}: canon-diff-proposal.md の ## メタ に ${key} が無い（§13.1 固定フォーマット）。`);
    }
  }

  let canonVersion = null;
  try {
    canonVersion = extractCanonVersion(CANON_FILES);
  } catch (err) {
    if (err instanceof ExtractionError) {
      violations.push(`${GATE}: docs/ の正典バージョンが不整合（${err.message}）。`);
    } else {
      throw err;
    }
  }

  if (canonVersion && proposal.meta.confirmed_version && canonVersion.version !== proposal.meta.confirmed_version) {
    violations.push(
      `${GATE}: docs/ の実バージョン（${canonVersion.version}）と canon-diff-proposal.md の申告（${proposal.meta.confirmed_version}）が不一致。`
    );
  }

  if (proposal.meta.investigated_at) {
    const sourcesPath = path.join(DOCS_DIR, 'SOURCES.md');
    if (!existsSync(sourcesPath)) {
      violations.push(`${GATE}: docs/SOURCES.md が存在しない。`);
    } else {
      const sourcesText = readFileSync(sourcesPath, 'utf8');
      if (!sourcesText.includes(proposal.meta.investigated_at)) {
        violations.push(
          `${GATE}: docs/SOURCES.md 更新履歴に investigated_at（${proposal.meta.investigated_at}）を含む行が無い（§13.1）。`
        );
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function check({ ts }) {
  const { ok, violations } = checkG14({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readCanonUpdateTs();
  if (!ts) {
    passStop('G14: .canon-update-ts 不在のため対象なし');
  } else {
    const r = checkG14({ ts });
    if (r.ok) passStop('G14: 通過（docs/ バージョン整合・SOURCES.md 履歴整合）');
    else blockStop(`G14: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
