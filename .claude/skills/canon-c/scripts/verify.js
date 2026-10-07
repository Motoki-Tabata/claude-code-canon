#!/usr/bin/env node
/**
 * verify.js（npm run verify -- <ts>）— 工程7 の検証 CLI（artifacts.md §8）。
 *
 * V1〜V9 を1本で実行し、`output/<ts>/verify-report.md` を書く。違反が1件でもあれば exit 1、
 * 無ければ exit 0、引数が不正（<ts> の形式違い・output/<ts>/ が無い）なら exit 2。
 *
 * - **1回の走査**: generated/ を1回だけ歩き、各ファイルを1回だけ読む（buildContext）。ファイルごとに
 *   V1〜V5 を当て、全体に V6〜V9 を当てる。各検査は同じツリーを読み直さない。output/ は gitignore の
 *   対象なので `git ls-files` では列挙できず、readdir で歩く。
 * - **検査対象ゼロは違反**: generated/ が無い・空なら全検査を違反にする。design-map・requirements.md・
 *   handoff.md の欠落は、それを入力にする検査が違反にする。「対象なし」と書くのは、定義上対象が無いと
 *   確定する場合（new モードの V7、スキーマを持つファイルが無いときの V1〜V3 など）だけで、理由を書く。
 * - **error と warning**: warning は exit code に影響しないが、report に必ず載せる。
 * - report には検査した generated/ のハッシュを載せる（architecture.md §6.2・§9.3）。P4 の前に
 *   オーケストレーターが現在の generated/ と照合する。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { artifactFromText } from '../../../../lib/artifact.js';
import { isNonSchemaRel } from '../../../../lib/non-schema.js';
import { readList } from '../../../../lib/managed-paths.js';
import { hashGate, TREE_HASH_COMMAND, TREE_HASH_COMMAND_WITH_OUTSIDE } from '../../../../lib/tree-hash.js';
import { isMainModule, outputDir, readHandoff, readTsArg, resolveTargetRoot, workDir } from '../../../../lib/run.js';
import { checkV1 } from './verify/v1-paths.js';
import { checkV2 } from './verify/v2-frontmatter.js';
import { checkV3 } from './verify/v3-tool-names.js';
import { checkV4, checkMcpJsonText } from './verify/v4-security.js';
import { checkV5 } from './verify/v5-fragments.js';
import { checkV6 } from './verify/v6-ref-integrity.js';
import { checkV7 } from './verify/v7-keep.js';
import { checkV8 } from './verify/v8-snapshot.js';
import { checkV9 } from './verify/v9-constraints.js';
import { splitBySeverity } from './verify/format.js';

export const CHECKS = [
  ['V1', '配置パス'],
  ['V2', 'frontmatter'],
  ['V3', 'ツール名'],
  ['V4', 'secret と展開'],
  ['V5', '書式片'],
  ['V6', '参照整合'],
  ['V7', 'keep'],
  ['V8', 'スナップショット完全性'],
  ['V9', 'constraints'],
];

/** スキーマ（frontmatter）を持つ種別。これだけが V1〜V4 の per-file 検査の対象。 */
const SCHEMA_KINDS = new Set(['agent', 'skill', 'rule']);

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/** generated/ を1回だけ歩き、ファイル（本文と .md の artifact）とディレクトリの索引を作る。 */
function scanGenerated(genRoot) {
  const files = [];
  const dirs = new Set();
  const walk = (abs, rel) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const a = path.join(abs, e.name);
      if (e.isDirectory()) {
        dirs.add(r);
        walk(a, r);
      } else if (e.isFile()) {
        const bytes = readFileSync(a);
        const text = bytes.toString('utf8');
        files.push({ rel: r, abs: a, bytes, text, artifact: r.endsWith('.md') ? artifactFromText(r, text) : null });
      }
    }
  };
  walk(genRoot, '');
  files.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
  return { files, dirs };
}

/** 判定の入力を1回だけ読み集めたコンテキスト。 */
export function buildContext(ts) {
  const out = outputDir(ts);
  const work = workDir(ts);
  const genRoot = path.join(out, 'generated');
  const genExists = existsSync(genRoot);
  const { files, dirs } = genExists ? scanGenerated(genRoot) : { files: [], dirs: new Set() };
  return {
    ts,
    genRoot,
    genExists,
    files,
    byRel: new Map(files.map((f) => [f.rel, f])),
    dirs,
    handoff: readHandoff(ts),
    targetRoot: resolveTargetRoot(ts),
    designMapText: readIfExists(path.join(out, 'design-map.md')),
    manifestText: readIfExists(path.join(out, 'MANIFEST.md')),
    requirementsText: readIfExists(path.join(work, 'requirements.md')),
    existingText: readIfExists(path.join(work, 'investigation', 'existing.md')),
    focusedText: readIfExists(path.join(work, 'investigation', 'focused.md')),
    lists: {
      managed: readList(path.join(out, 'deploy', 'managed-paths.list')),
      retired: readList(path.join(out, 'deploy', 'retired.list')),
    },
  };
}

function emptyResult() {
  return { violations: [], warnings: [], checked: 0, na: null };
}

/** V1〜V5: ファイルごとに振り分けて当てる。 */
function runPerFile(ctx, results) {
  const add = (id, objs) => {
    const { violations, warnings } = splitBySeverity(objs);
    results[id].violations.push(...violations);
    results[id].warnings.push(...warnings);
    results[id].checked++;
  };
  let mcpJson = 0;
  for (const f of ctx.files) {
    if (path.posix.basename(f.rel) === '.mcp.json') {
      add('V4', checkMcpJsonText(f.text, f.rel));
      mcpJson++;
      continue;
    }
    if (!f.artifact || isNonSchemaRel(f.rel)) continue; // CLAUDE.md・README・hooks・supporting files
    if (!SCHEMA_KINDS.has(f.artifact.kind)) {
      // 種別を判定できない .md を黙って飛ばすと vacuous pass になる（配置の誤り）。
      results.V1.violations.push(
        `V1 ${f.rel}: 種別（agent・skill・rule）を判定できず、既知の非スキーマファイルでもない。配置が誤っている可能性。`
      );
      results.V1.checked++;
      continue;
    }
    add('V1', checkV1(f.artifact));
    add('V2', checkV2(f.artifact));
    add('V3', checkV3(f.artifact));
    add('V4', checkV4(f.artifact));
  }
  const noSchema = 'スキーマを持つファイル（agent・skill・rule）が generated/ に無い';
  for (const id of ['V1', 'V2', 'V3']) if (results[id].checked === 0) results[id].na = noSchema;
  if (results.V4.checked === 0 && mcpJson === 0) results.V4.na = `${noSchema}。.mcp.json も無い`;
  Object.assign(results.V5, checkV5(ctx));
}

/** V1〜V9 を実行する。 */
export function runChecks(ctx) {
  const results = Object.fromEntries(CHECKS.map(([id]) => [id, emptyResult()]));
  if (!ctx.genExists || ctx.files.length === 0) {
    const why = ctx.genExists ? 'generated/ が空' : 'generated/ が無い';
    for (const [id] of CHECKS) results[id].violations.push(`${id}: ${why}（検査対象ゼロを合格にしない）。`);
    return results;
  }
  // 想定外の例外は、その検査の違反にして続行する（例外終了すると verify-report.md が書かれず、
  // 「違反」と「検査が壊れた」を exit 1 から区別できない）。
  const crashed = (id, err) => `${id}: 検査が例外で中断した（${err?.message ?? err}）。入力の形を確かめること。`;
  try {
    runPerFile(ctx, results);
  } catch (err) {
    for (const id of ['V1', 'V2', 'V3', 'V4', 'V5']) results[id].violations.push(crashed(id, err));
  }
  for (const [id, fn] of [['V6', checkV6], ['V7', checkV7], ['V8', checkV8], ['V9', checkV9]]) {
    try {
      Object.assign(results[id], emptyResult(), fn(ctx));
    } catch (err) {
      results[id].violations.push(crashed(id, err));
    }
  }
  return results;
}

function statusOf(r) {
  if (r.violations.length > 0) return '違反';
  if (r.na) return '対象なし';
  return 'pass';
}

/** verify-report.md の本文。 */
export function renderReport({ ts, results, tree, at }) {
  const total = CHECKS.reduce((n, [id]) => n + results[id].violations.length, 0);
  const warns = CHECKS.reduce((n, [id]) => n + results[id].warnings.length, 0);
  const lines = [
    `# verify-report（${ts}）`,
    '',
    `- 実行時刻: ${at}`,
    tree
      ? `- generated/ のハッシュ: \`${tree.hash}\`（${tree.files} ファイル${tree.outsideFiles ? `。outside-managed/ の ${tree.outsideFiles} ファイルを含む` : ''}）`
      : '- generated/ のハッシュ: なし（generated/ が無い）',
    `- 再計算: \`${tree?.outsideFiles ? TREE_HASH_COMMAND_WITH_OUTSIDE.replace('<out>', `output/${ts}`) : TREE_HASH_COMMAND.replace('<dir>', `output/${ts}/generated`)}\``,
    `- 結果: ${total === 0 ? '合格' : '不合格'}（違反 ${total} 件・warning ${warns} 件）`,
    '',
    '| 検査 | 結果 | 違反 | warning |',
    '|---|---|---|---|',
    ...CHECKS.map(([id, name]) => {
      const r = results[id];
      return `| ${id} ${name} | ${statusOf(r)} | ${r.violations.length} | ${r.warnings.length} |`;
    }),
  ];
  for (const [id, name] of CHECKS) {
    const r = results[id];
    lines.push('', `## ${id} ${name}`, '');
    if (r.na && r.violations.length === 0) lines.push(`対象なし: ${r.na}`);
    else if (r.violations.length === 0) lines.push(`pass（検査した対象 ${r.checked} 件）`);
    for (const v of r.violations) lines.push(`- 違反: ${v}`);
    for (const w of r.warnings) lines.push(`- warning: ${w}`);
  }
  return { body: lines.join('\n') + '\n', total, warns };
}

/** <ts> の run を検証し、report を書いて結果を返す。 */
export function verify(ts, { now = new Date() } = {}) {
  const ctx = buildContext(ts);
  const results = runChecks(ctx);
  const tree = ctx.genExists ? hashGate(outputDir(ts)) : null;
  const report = renderReport({ ts, results, tree, at: now.toISOString() });
  mkdirSync(outputDir(ts), { recursive: true });
  const reportPath = path.join(outputDir(ts), 'verify-report.md');
  writeFileSync(reportPath, report.body);
  return { ok: report.total === 0, results, reportPath, ...report };
}

if (isMainModule(import.meta.url)) {
  const ts = readTsArg('npm run verify -- <ts>');
  if (!existsSync(outputDir(ts))) {
    // 存在しない <ts> は引数の誤り。report を書くために output/<ts>/ を作ってはならない。
    process.stderr.write(`[verify] output/${ts}/ が無い。<ts> を確かめること（npm run verify -- <ts>）。\n`);
    process.exit(2);
  }
  const r = verify(ts);
  const summary = CHECKS.map(([id]) => `${id}:${statusOf(r.results[id])}`).join(' ');
  process.stdout.write(
    `[verify] ${r.ok ? '合格' : '不合格'}（違反 ${r.total} 件・warning ${r.warns} 件）${summary}\n` +
      `[verify] report: ${path.relative(process.cwd(), r.reportPath)}\n`
  );
  process.exit(r.ok ? 0 : 1);
}
