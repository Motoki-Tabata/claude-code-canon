#!/usr/bin/env node
/**
 * G16 `[要確認]` 台帳整合（機能X・snapshot 系統・§11.2「G14/G15/G16 実装契約」）。SubagentStop@canon-update。
 *
 * `docs/00_INDEX.md §10`（既知の `[要確認]` 項目一覧）の各行が次のいずれかの形式に
 * パース可能であることを検査する（形式検査のみ・解消の妥当性は判定しない）:
 *   - 未解決: 3列（項目｜所在｜検証方法）がいずれも取り消し線を含まない
 *   - 解決済: 項目・所在の列が取り消し線（`~~...~~`）で囲まれ、検証方法欄が
 *     `**解決済（YYYY-MM-DD）**:` で始まる
 * いずれにも当てはまらない行（部分的な取り消し線・日付欠落等）は違反とする。
 *
 * あわせて `docs/` 全体の `[要確認]` 実マーカー総数を数え、`canon-diff-proposal.md`
 * `## メタ` の `todo_marker_count` 申告値と照合する。**乖離は違反にせず**
 * `work/<ts>/impact-report.md`（G15 が生成済み）へ追記報告する（判定は人間・§13.1）。
 *
 * **実マーカー計数規約（詳細設計書 §11.2 G14/G15/G16 実装契約・実昇格準備2 で確定）**:
 * 素朴な `/\[要確認\]/g` は記法そのものへの言及（節見出し・保守ルールの説明・解消済み経緯の
 * 記述）まで拾ってしまい信号にならなかった（較正ギャップ・G7 の L026 と同型）。次の規則で数える:
 *   ①素の形 `[要確認]` と拡張形 `[要確認: 理由]` の両方を対象にする
 *   ②インラインコードスパン（バッククォート囲み）の内側は除外する（記法への言及であって
 *     マーカーではない）
 *   ③見出し行（`^#{1,6}\s`）は除外する
 *   ④`docs/SOURCES.md` は正典本文ではなく保守ログのため除外する
 * この規則は純粋に構文（マークアップ）で判定し、「解消済みの経緯を bare 形で記述している」
 * ような意味的な判定はしない——乖離自体を違反にしない設計（判定は人間）と整合する簡潔さを
 * 優先した。
 *
 * 純関数（fs 読取のみ・process.exit は CLI 実行時のみ）。
 */

import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { DOCS_DIR } from './lib/canon.js';
import { findHeading, sectionSlice, parseTables } from './lib/markdown.js';
import { workDir, isMainModule, readHookInput, blockStop, passStop } from './lib/run.js';
import { readCanonUpdateTs } from './lib/canon-run.js';
import { parseCanonDiffProposal, CanonDiffProposalError } from './lib/canon-diff.js';

const GATE = 'G16';
const RESOLVED_PREFIX_RE = /^\*\*解決済（\d{4}-\d{2}-\d{2}）\*\*:/;
const STRIKETHROUGH_RE = /^~~.+~~$/;

function classifyRow(row) {
  const [item, where, verify] = row.cells;
  const struckItem = STRIKETHROUGH_RE.test((item ?? '').trim());
  const struckWhere = STRIKETHROUGH_RE.test((where ?? '').trim());
  const resolvedVerify = RESOLVED_PREFIX_RE.test((verify ?? '').trim());

  if (!struckItem && !struckWhere && !resolvedVerify) {
    // 未解決形式: 3列とも非空であること
    if ((item ?? '').trim() && (where ?? '').trim() && (verify ?? '').trim()) {
      return 'unresolved';
    }
    return 'malformed';
  }
  if (struckItem && struckWhere && resolvedVerify) {
    return 'resolved';
  }
  return 'malformed';
}

const MARKER_RE = /\[要確認(?::[^\]]*)?\]/g;
const CODE_SPAN_RE = /`[^`]*`/g;
const HEADING_LINE_RE = /^#{1,6}\s/;

/** 1ファイル分のテキストから実マーカーを数える（見出し行・コードスパン内を除外）。 */
function countMarkersInText(text) {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (HEADING_LINE_RE.test(line)) continue;
    const stripped = line.replace(CODE_SPAN_RE, '');
    const matches = stripped.match(MARKER_RE);
    if (matches) count += matches.length;
  }
  return count;
}

/** `docs/` 全体の実マーカー総数とファイル別内訳を返す（`SOURCES.md` は保守ログのため除外）。 */
function countTodoMarkers() {
  let total = 0;
  const breakdown = [];
  const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md') && f !== 'SOURCES.md');
  for (const f of files) {
    const n = countMarkersInText(readFileSync(path.join(DOCS_DIR, f), 'utf8'));
    if (n > 0) breakdown.push({ file: f, count: n });
    total += n;
  }
  return { total, breakdown };
}

export function checkG16({ ts }) {
  const violations = [];
  const notes = [];

  const indexPath = path.join(DOCS_DIR, '00_INDEX.md');
  if (!existsSync(indexPath)) {
    return { ok: false, violations: [`${GATE}: docs/00_INDEX.md が存在しない。`] };
  }
  const lines = readFileSync(indexPath, 'utf8').split(/\r?\n/);
  const heading = findHeading(lines, '既知の', 2);
  if (heading < 0) {
    return { ok: false, violations: [`${GATE}: 00_INDEX.md に「§10 既知の [要確認] 項目一覧」節が見つからない。`] };
  }
  const slice = sectionSlice(lines, heading);
  const tables = parseTables(lines, slice.start, slice.end);
  if (tables.length === 0) {
    return { ok: false, violations: [`${GATE}: §10 に台帳の表が見つからない。`] };
  }

  let unresolvedCount = 0;
  for (const t of tables) {
    for (const row of t.rows) {
      const kind = classifyRow(row);
      if (kind === 'malformed') {
        violations.push(
          `${GATE}: 00_INDEX.md:${row.line} の台帳行が未解決／解決済のいずれの形式にもパースできない` +
            `（取り消し線と **解決済（日付）** 接頭は対で必要・§11.2 実装契約）。`
        );
      } else if (kind === 'unresolved') {
        unresolvedCount++;
      }
    }
  }

  const { total: actualMarkerCount, breakdown: markerBreakdown } = countTodoMarkers();

  // 申告値との照合（乖離は違反にせず impact-report.md へ追記報告するのみ）。
  const proposalPath = path.join(workDir(ts), 'canon-diff-proposal.md');
  let declaredCount = null;
  if (existsSync(proposalPath)) {
    try {
      const proposal = parseCanonDiffProposal(readFileSync(proposalPath, 'utf8'));
      const raw = proposal.meta.todo_marker_count;
      declaredCount = raw != null && /^\d+$/.test(raw) ? Number(raw) : null;
    } catch (err) {
      if (!(err instanceof CanonDiffProposalError)) throw err;
    }
  }

  const reportPath = path.join(workDir(ts), 'impact-report.md');
  const ledgerNote = [
    '',
    '## 台帳整合（G16）',
    `- 00_INDEX.md §10 の未解決行数: ${unresolvedCount}`,
    `- docs/ 全体の [要確認] 実マーカー総数: ${actualMarkerCount}` +
      (markerBreakdown.length === 0 ? '' : `（内訳: ${markerBreakdown.map((b) => `${b.file}=${b.count}`).join('・')}）`),
    declaredCount === null
      ? '- canon-diff-proposal.md の todo_marker_count: 申告なし（照合不能）'
      : `- canon-diff-proposal.md の todo_marker_count 申告値: ${declaredCount}` +
        (declaredCount === actualMarkerCount ? '（一致）' : '（乖離あり・判定は人間が行う・§13.1）'),
    '',
  ].join('\n');
  if (existsSync(reportPath)) {
    appendFileSync(reportPath, ledgerNote, 'utf8');
  } else {
    notes.push('impact-report.md が未生成のため台帳整合の追記をスキップした（G15 が先に実行される前提）。');
  }

  return { ok: violations.length === 0, violations, unresolvedCount, actualMarkerCount, markerBreakdown, declaredCount, notes };
}

export function check({ ts }) {
  const { ok, violations } = checkG16({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readCanonUpdateTs();
  if (!ts) {
    passStop('G16: .canon-update-ts 不在のため対象なし');
  } else {
    const r = checkG16({ ts });
    if (r.ok) passStop(`G16: 台帳形式整合（未解決${r.unresolvedCount}件・実マーカー${r.actualMarkerCount}件）`);
    else blockStop(`G16: 違反を検出（${r.violations.length}件）\n${r.violations.join('\n')}`);
  }
}
