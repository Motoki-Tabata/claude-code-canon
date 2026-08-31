#!/usr/bin/env node
/**
 * G15 波及 stale 検出（機能X・snapshot 系統・§11.2「G14/G15/G16 実装契約」）。SubagentStop@canon-update。
 * **検出のみ・非ブロッキング**（§13.1 の「判定しない・人間ゲート必須」原則）。
 *
 * `docs/` 更新に伴い他所へ複写された旧表現が stale のまま残っていないかを検出し、
 * `work/<ts>/impact-report.md` へ列挙する。**判定は「レポートが生成されていること」のみ**
 * （0件でも生成必須・vacuous pass 防止）。波及の要否・当否は人間が判断する。
 *
 * 検出入力の2系統:
 *   (a) `gates/conformance_tables/*.json` の作業ツリー版と `git show HEAD:` 版の差分
 *       （leaf 文字列のうち HEAD にあり作業ツリーに無いもの＝変化した値の候補）
 *   (b) `canon-diff-proposal.md` の `## 旧表現→新表現` 表（更新者の自己申告・確実な入力）
 * 両者の「旧値」を `.claude/**`・`gates/**`・`tests/**`・`design/**`（設計書2冊）・過去の各
 * `output/` run に対して文字列走査する。
 *
 * 純関数（fs/git 読取のみ・process.exit は CLI 実行時のみ）。
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CANON_ROOT, GATES_DIR, posix } from './lib/canon.js';
import { workDir, OUTPUT_ROOT, isMainModule, readHookInput, blockStop, passStop } from './lib/run.js';
import { readCanonUpdateTs } from './lib/canon-run.js';
import { parseCanonDiffProposal, CanonDiffProposalError } from './lib/canon-diff.js';

const GATE = 'G15';
const SCAN_ROOTS = ['.claude', 'gates', 'tests', 'design'];
const TABLE_FILES = ['paths.json', 'frontmatter.json', 'tools.json', 'hooks.json'];
const MIN_LEN = 5; // 短すぎる文字列は誤検出が多いため除外

/** JSON ツリーから leaf 文字列を集める。file:line 形式の出典・source/line キーはノイズなので除外。 */
function collectLeafStrings(node, keyName, out) {
  if (typeof node === 'string') {
    if (node.length >= MIN_LEN && !/:\d+(-\d+)?$/.test(node) && keyName !== 'source' && keyName !== 'generated_at') {
      out.add(node);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectLeafStrings(v, keyName, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectLeafStrings(v, k, out);
  }
}

/** 作業ツリー版と git HEAD 版の差分から「変化した値」（HEAD にあり現行に無い leaf 文字列）を抽出する。 */
function diffConformanceTables() {
  const removed = new Set();
  const notes = [];
  for (const file of TABLE_FILES) {
    const rel = posix(path.relative(CANON_ROOT, path.join(GATES_DIR, 'conformance_tables', file)));
    const absPath = path.join(GATES_DIR, 'conformance_tables', file);
    if (!existsSync(absPath)) {
      notes.push(`${rel}: 作業ツリーに不在（スキップ）`);
      continue;
    }
    let headText;
    try {
      headText = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: CANON_ROOT, encoding: 'utf8' });
    } catch (err) {
      notes.push(`${rel}: git show HEAD 取得失敗（新規追加または git 未初期化・スキップ）: ${err.message.split('\n')[0]}`);
      continue;
    }
    let headJson, currentJson;
    try {
      headJson = JSON.parse(headText);
      currentJson = JSON.parse(readFileSync(absPath, 'utf8'));
    } catch (err) {
      notes.push(`${rel}: JSON パース失敗（スキップ）: ${err.message}`);
      continue;
    }
    const headLeaves = new Set();
    const currentLeaves = new Set();
    collectLeafStrings(headJson, null, headLeaves);
    collectLeafStrings(currentJson, null, currentLeaves);
    for (const v of headLeaves) {
      if (!currentLeaves.has(v)) removed.add(v);
    }
  }
  return { removed: [...removed], notes };
}

function walkAllFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const p = path.join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

/** 与えた旧値の集合を、対象ファイル群（フルパス）から文字列走査し、ヒットを収集する。 */
function scanForOldValues(oldValues, files) {
  const hits = []; // { oldValue, file, line }
  if (oldValues.length === 0 || files.length === 0) return hits;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const oldValue of oldValues) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(oldValue)) {
          hits.push({ oldValue, file, line: i + 1 });
        }
      }
    }
  }
  return hits;
}

function relOf(absPath) {
  return posix(path.relative(CANON_ROOT, absPath));
}

function renderReport({ ts, oldValues, systemHits, outputHits, notes }) {
  const lines = [];
  lines.push('# impact-report');
  lines.push('');
  lines.push('## メタ');
  lines.push(`- generated_at: ${new Date().toISOString()}`);
  lines.push(`- ts: ${ts}`);
  lines.push(`- 走査した旧値の総数: ${oldValues.length}`);
  lines.push('');
  lines.push('## 波及 stale 候補（.claude/・gates/・tests/・design/ 内の残存）');
  if (systemHits.length === 0) {
    lines.push('該当なし。');
  } else {
    lines.push('| 旧値 | ヒット位置 |');
    lines.push('|---|---|');
    for (const h of systemHits) {
      lines.push(`| ${h.oldValue.replace(/\|/g, '\\|')} | ${relOf(h.file)}:${h.line} |`);
    }
  }
  lines.push('');
  lines.push('## 過去 output/*/ への影響');
  if (outputHits.length === 0) {
    lines.push('該当なし。');
  } else {
    lines.push('| 旧値 | 影響 run |');
    lines.push('|---|---|');
    for (const h of outputHits) {
      lines.push(`| ${h.oldValue.replace(/\|/g, '\\|')} | ${relOf(h.file)}:${h.line} |`);
    }
  }
  lines.push('');
  lines.push('## 注記');
  lines.push('- 本レポートは検出のみ。波及の要否・修正の当否は人間が判断する（§13.1）。');
  if (notes.length > 0) {
    for (const n of notes) lines.push(`- ${n}`);
  } else {
    lines.push('- conformance_tables の git diff 抽出: 特記事項なし。');
  }
  lines.push('');
  return lines.join('\n');
}

export function checkG15({ ts }) {
  const proposalPath = path.join(workDir(ts), 'canon-diff-proposal.md');
  let declaredOld = [];
  if (existsSync(proposalPath)) {
    try {
      const proposal = parseCanonDiffProposal(readFileSync(proposalPath, 'utf8'));
      declaredOld = proposal.oldToNew.map((r) => r.old);
    } catch (err) {
      if (!(err instanceof CanonDiffProposalError)) throw err;
      // フォーマット違反は G14 が既に検出する。G15 は「検出できる分だけ検出する」ベストエフォート。
    }
  }

  const { removed: tableRemoved, notes } = diffConformanceTables();
  const oldValues = [...new Set([...declaredOld, ...tableRemoved])].filter((v) => v.length >= MIN_LEN);

  const systemFiles = SCAN_ROOTS.flatMap((r) => walkAllFiles(path.join(CANON_ROOT, r))).filter((f) =>
    existsSync(f)
  );
  const systemHits = scanForOldValues(oldValues, systemFiles);

  const outputDirs = existsSync(OUTPUT_ROOT)
    ? readdirSync(OUTPUT_ROOT).filter((d) => d !== ts && statSync(path.join(OUTPUT_ROOT, d)).isDirectory())
    : [];
  const outputFiles = outputDirs.flatMap((d) => walkAllFiles(path.join(OUTPUT_ROOT, d)));
  const outputHits = scanForOldValues(oldValues, outputFiles);

  const report = renderReport({ ts, oldValues, systemHits, outputHits, notes });
  const reportPath = path.join(workDir(ts), 'impact-report.md');
  writeFileSync(reportPath, report, 'utf8');

  // vacuous pass 防止: レポートが実際に生成されたことだけを判定条件にする（§13.1）。
  // 内容（検出0件か否か）はブロックしない——検出のみが契約。
  const ok = existsSync(reportPath);
  return {
    ok,
    violations: ok ? [] : [`${GATE}: impact-report.md の生成に失敗した（vacuous pass 防止のため違反扱い）。`],
    systemHitCount: systemHits.length,
    outputHitCount: outputHits.length,
  };
}

export function check({ ts }) {
  const { ok, violations } = checkG15({ ts });
  return { ok, violations };
}

if (isMainModule(import.meta.url)) {
  readHookInput();
  const ts = readCanonUpdateTs();
  if (!ts) {
    passStop('G15: .canon-update-ts 不在のため対象なし');
  } else {
    const r = checkG15({ ts });
    if (r.ok) passStop(`G15: impact-report.md 生成（system hits=${r.systemHitCount} / output hits=${r.outputHitCount}）`);
    else blockStop(`G15: 違反を検出\n${r.violations.join('\n')}`);
  }
}
