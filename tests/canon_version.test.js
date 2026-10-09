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
import { canonVersion } from '../lib/tables.js';
import { parseFrontmatter } from '../lib/artifact.js';

test('sources.json の claude_code_version が X.Y.Z の形で取れる', () => {
  assert.match(canonVersion(), /^\d+\.\d+\.\d+$/);
});

test('両設計書の canon_version が sources.json の claude_code_version と一致していること（stale 検出）', () => {
  const version = canonVersion();
  for (const rel of DESIGN_DOCS) {
    const abs = path.join(ROOT, rel);
    assert.ok(existsSync(abs), `${rel} が存在すること`);
    const { present, frontmatter } = parseFrontmatter(readFileSync(abs, 'utf8'));
    assert.ok(present, `${rel}: frontmatter ブロックがあること`);
    const entry = frontmatter.canon_version;
    // 「キーが無いから素通り」は vacuous pass。欠落そのものを違反にする。
    assert.ok(entry, `${rel}: frontmatter に canon_version が無い`);
    assert.equal(
      entry.raw,
      version,
      `${rel}:${entry.line} の canon_version（${entry.raw}）が sources.json の claude_code_version（${version}）と不一致。手で追従させること。`
    );
  }
});
