/**
 * 設計書の正典バージョン追従テスト。
 *
 * 両設計書 frontmatter の `canon_version` は「本書が参照している canon-reference の版」であり、
 * `.claude/skills/canon-reference/sources.json` の `claude_code_version`（`v` なし）と一致しなければならない。
 *
 * この乖離は静かに伝播する: spec のテンプレートは `canon_version` を持ち、ワーカーが出典を
 * 持たないと設計書 frontmatter から複写して `spec.md` へ陳腐化を持ち込む。run の外で落とせる
 * ものは run の外で落とす。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DESIGN_DOCS } from './helpers/paths.js';
import { canonVersion } from '../lib/reference-data.js';
import { parseFrontmatter } from '../lib/artifact.js';

test('sources.json の claude_code_version が X.Y.Z の形で取れる', () => {
  assert.match(canonVersion(), /^\d+\.\d+\.\d+$/);
});

/** 設計書の本文（frontmatter を含む）が版 `version` に追従していなければ、その理由を返す。追従していれば null。 */
function staleCanonVersion(rel, text, version) {
  const { present, frontmatter } = parseFrontmatter(text);
  if (!present) return `${rel}: frontmatter ブロックが無い`;
  const entry = frontmatter.canon_version;
  // 「キーが無いから素通り」は vacuous pass。欠落そのものを違反にする。
  if (!entry) return `${rel}: frontmatter に canon_version が無い`;
  if (entry.raw !== version) {
    return `${rel}:${entry.line} の canon_version（${entry.raw}）が sources.json の claude_code_version（${version}）と不一致。手で追従させること。`;
  }
  return null;
}

test('両設計書の canon_version が sources.json の claude_code_version と一致していること（stale 検出）', () => {
  const version = canonVersion();
  for (const rel of DESIGN_DOCS) {
    const abs = path.join(ROOT, rel);
    assert.ok(existsSync(abs), `${rel} が存在すること`);
    assert.equal(staleCanonVersion(rel, readFileSync(abs, 'utf8'), version), null);
  }
});

test('検出器の素振り: 版の不一致・キーの欠落・frontmatter の欠落を拾う', () => {
  const doc = (fm) => `---\n${fm}\n---\n# 本文\n`;
  assert.equal(staleCanonVersion('x.md', doc('canon_version: 2.1.0'), '2.1.0'), null);
  assert.match(staleCanonVersion('x.md', doc('canon_version: 2.0.9'), '2.1.0') ?? '', /不一致/);
  assert.match(staleCanonVersion('x.md', doc('title: x'), '2.1.0') ?? '', /canon_version が無い/);
  assert.match(staleCanonVersion('x.md', '# 本文だけ\n', '2.1.0') ?? '', /frontmatter ブロックが無い/);
});
