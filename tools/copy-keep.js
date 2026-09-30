#!/usr/bin/env node
/**
 * tools/copy-keep.js（npm run copy-keep -- <ts>）。
 *
 * design-map の `disposition: keep` のレコードを、対象リポジトリの原本から `output/<ts>/generated/` へ
 * **バイト同一で**コピーする。keep は「再生成しない・内容を一切変えない」verbatim コピーであり、
 * LLM が Read して Write する必要は無い。run 20260927_003229 では generator が keep 10件を Read/Write で
 * 写しており、トークンを使ううえ、写し違いは G8（sha256 非回帰）違反になる。
 *
 * 実行主体はオーケストレータ（Bash）。design-map の承認後、`npm run slice` の後・生成の前に実行する。
 * コピー後に sha256 を照合し、1件でも食い違えば exit 1。
 *
 * 出力（JSON）: { copied: string[], missing: string[], rejected: string[] }
 *   missing  = 対象リポジトリに原本が無い（design-map・系統A の誤り。コピーせず exit 1）
 *   rejected = 管理パス集合の外・`..` を含む等、generated/ に置けないパス（コピーせず exit 1）
 */

import path from 'node:path';
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { isValidTs, outputDir, resolveTargetRoot, isMainModule } from '../gates/lib/run.js';
import { parseExistingDisposition } from '../gates/lib/design-map.js';
import { isManaged, sha256File } from '../gates/lib/managed-paths.js';

/**
 * keep レコードをコピーする（純粋な入出力のみ）。
 * @returns {{ copied: string[], missing: string[], rejected: string[], mismatched: string[] }}
 */
export function copyKeep(ts) {
  const targetRoot = resolveTargetRoot(ts);
  if (!targetRoot) throw new Error(`work/${ts}/target.txt が無く、対象リポジトリの原本を特定できない。`);
  const genRoot = path.join(outputDir(ts), 'generated');
  const records = parseExistingDisposition(readFileSync(path.join(outputDir(ts), 'design-map.md'), 'utf8'));
  const out = { copied: [], missing: [], rejected: [], mismatched: [] };
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
  return out;
}

if (isMainModule(import.meta.url)) {
  const fail = (msg) => {
    process.stderr.write(`[copy-keep] ${msg}\n`);
    process.exit(1);
  };
  const [ts] = process.argv.slice(2);
  if (!ts) fail('使い方: npm run copy-keep -- <ts>');
  if (!isValidTs(ts)) fail(`不正な <ts> 形式: ${ts}（期待形式: YYYYMMDD_hhmmss）`);
  if (!existsSync(path.join(outputDir(ts), 'design-map.md'))) fail(`output/${ts}/design-map.md が無い。`);
  let r;
  try {
    r = copyKeep(ts);
  } catch (err) {
    fail(err.message);
  }
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  if (r.missing.length + r.rejected.length + r.mismatched.length > 0) {
    fail('コピーできなかった keep がある（missing: 原本不在／rejected: 管理パス集合外／mismatched: sha256 不一致）。design-map を確かめること。');
  }
}
