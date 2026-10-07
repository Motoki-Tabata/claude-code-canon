#!/usr/bin/env node
/**
 * copy-keep.js（npm run copy-keep -- <ts>）。
 *
 * design-map の `disposition: keep` のレコードを、対象リポジトリの原本から `output/<ts>/generated/` へ
 * **バイト同一で**コピーする（artifacts.md §6.1）。keep は「再生成しない・内容を一切変えない」verbatim
 * コピーであり、LLM が Read して Write する必要は無い（トークンを使ううえ、写し違いは V7 の違反になる）。
 *
 * あわせて、design-map の `## 参照元からのコピー`（`<参照元の絶対パス> → <生成先の相対パス>`）も同じ仕組みで
 * コピーする。別プロジェクトの大きなファイルを builder に打ち直させると、時間と文脈を使ううえ写し違いが
 * 入る。builder には、コピー済みのファイルの差分だけを Edit させる。コピー元は requirements.md の
 * `## 参照元` の `path` のいずれかの配下でなければならない。
 *
 * 実行主体は Phase C のオーケストレーター。`npm run slice` の後・builder の起動前に実行する。
 * 対象リポジトリは `work/<ts>/handoff.md` の frontmatter `target` から解決する。
 * コピー後に sha256 を照合し、1件でも食い違えば exit 1。
 *
 * 出力（JSON）: { copied: string[], ref_copied: string[], missing: string[], rejected: string[], mismatched: string[] }
 *   copied      = keep のコピー済みパス
 *   ref_copied  = 参照元からコピーした生成先のパス
 *   missing     = 原本（対象の keep、または参照元のファイル）が無い（design-map・調査の誤り。コピーせず exit 1）
 *   rejected    = 管理パス集合の外・`..` を含む・参照元の配下でない等、コピーできないパス（コピーせず exit 1）
 */

import path from 'node:path';
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { isValidTs, outputDir, workDir, resolveTargetRoot, isMainModule } from '../../../../lib/run.js';
import { parseExistingDisposition, parseReferenceCopies, DesignMapError } from '../../../../lib/design-map.js';
import { parseReferenceSources } from '../../../../lib/requirements.js';
import { isManaged, sha256File } from '../../../../lib/managed-paths.js';

/** `p` が `root`（絶対パス）の配下（root 自身を含まない）か。 */
function isUnder(root, p) {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * keep と参照元からのコピーを行う（純粋な入出力のみ）。
 * @returns {{ copied: string[], ref_copied: string[], missing: string[], rejected: string[], mismatched: string[] }}
 */
export function copyKeep(ts) {
  const targetRoot = resolveTargetRoot(ts);
  if (!targetRoot) throw new Error(`work/${ts}/handoff.md の target が無く、対象リポジトリの原本を特定できない。`);
  const genRoot = path.join(outputDir(ts), 'generated');
  const designMap = readFileSync(path.join(outputDir(ts), 'design-map.md'), 'utf8');
  const refCopies = parseReferenceCopies(designMap);
  let records = [];
  try {
    records = parseExistingDisposition(designMap);
  } catch (e) {
    // 参照元からのコピーだけがある new モードの design-map には既存判定が無い。コピーも無いなら従来どおり止める。
    if (!(e instanceof DesignMapError) || refCopies.length === 0) throw e;
  }
  const out = { copied: [], ref_copied: [], missing: [], rejected: [], mismatched: [] };
  for (const r of records.filter((x) => x.disposition === 'keep')) {
    const rel = r.path.replace(/\\/g, '/');
    if (rel.split('/').includes('..') || path.isAbsolute(rel) || !isManaged(rel)) {
      out.rejected.push(rel);
      continue;
    }
    const src = path.join(targetRoot, rel);
    if (!existsSync(src)) {
      out.missing.push(rel);
      continue;
    }
    const dst = path.join(genRoot, rel);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    if (sha256File(src) === sha256File(dst)) out.copied.push(rel);
    else out.mismatched.push(rel);
  }

  const reqPath = path.join(workDir(ts), 'requirements.md');
  const roots = (existsSync(reqPath) ? parseReferenceSources(readFileSync(reqPath, 'utf8')) : [])
    .map((s) => s.path)
    .filter((p) => p && path.isAbsolute(p))
    .map((p) => path.resolve(p));
  for (const c of refCopies) {
    const label = `${c.from} → ${c.to ?? '(生成先なし)'}`;
    const to = c.to;
    if (!c.from || !to || !path.isAbsolute(c.from) || to.split('/').includes('..') || path.isAbsolute(to) || !isManaged(to)) {
      out.rejected.push(label);
      continue;
    }
    const src = path.resolve(c.from);
    if (!roots.some((root) => isUnder(root, src))) {
      out.rejected.push(label);
      continue;
    }
    if (!existsSync(src)) {
      out.missing.push(c.from);
      continue;
    }
    const dst = path.join(genRoot, to);
    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    if (sha256File(src) === sha256File(dst)) out.ref_copied.push(to);
    else out.mismatched.push(to);
  }
  return out;
}

if (isMainModule(import.meta.url)) {
  const fail = (msg, code = 1) => {
    process.stderr.write(`[copy-keep] ${msg}\n`);
    process.exit(code);
  };
  const [ts] = process.argv.slice(2);
  if (!ts) fail('使い方: npm run copy-keep -- <ts>', 2);
  if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`, 2);
  if (!existsSync(path.join(outputDir(ts), 'design-map.md'))) fail(`output/${ts}/design-map.md が無い。`);
  let r;
  try {
    r = copyKeep(ts);
  } catch (err) {
    fail(err.message);
  }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (r.missing.length + r.rejected.length + r.mismatched.length > 0) {
    fail('コピーできなかったものがある（missing: 原本不在／rejected: 管理パス集合外・参照元の配下でない／mismatched: sha256 不一致）。design-map と requirements.md の `## 参照元` を確かめること。');
  }
}
