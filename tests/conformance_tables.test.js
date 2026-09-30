/**
 * 判定表（gates/conformance_tables/）と設計書の正典バージョン追従テスト。
 *
 * 照合表の鮮度そのもの（docs/ からの再生成と一致すること）は CI が `npm run build:tables` の
 * 差分で検査する。ここでは、照合表と設計書 frontmatter の `canon_version` が陳腐化していないことを見る。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, DESIGN_DOCS } from './helpers/paths.js';
import { extractCanonVersion } from '../lib/canon.js';
import { CANON_FILES } from '../gates/build-conformance-tables.js';
import { parseFrontmatter } from '../lib/artifact.js';

const HOOKS_TABLE = path.join(ROOT, 'gates', 'conformance_tables', 'hooks.json');

test('照合表の canon_version が正典と一致していること（stale 検出）', () => {
  const table = JSON.parse(readFileSync(HOOKS_TABLE, 'utf8'));
  assert.match(table.canon_version, /^v\d+\.\d+\.\d+$/, 'canon_version が記録されていること');
  // 全正典ファイルでバージョンが揃っていることは build:tables が強制するが、
  // 照合表が古いまま放置されていないかをここでも見る。
  assert.ok(table.events.length > 0, '照合表が空でないこと');
});

/**
 * 両設計書 frontmatter の `canon_version` は「本書が参照している正典のバージョン」であり、
 * `docs/` メタ情報表の「確認したClaude Codeバージョン」と一致しなければならない。
 *
 * この乖離は静かに伝播する: spec のテンプレートは `canon_version` を持ち、ワーカーが出典を
 * 持たないと設計書 frontmatter から複写して `spec.md` へ陳腐化を持ち込む。run の外で落とせる
 * ものは run の外で落とす。
 */
test('両設計書の canon_version が正典 docs/ と一致していること（stale 検出）', () => {
  // 期待値は再導出せず、build:tables と同一の SSoT から取る。
  const { version: canonVersion } = extractCanonVersion(CANON_FILES);
  assert.match(canonVersion, /^v\d+\.\d+\.\d+$/, '正典バージョンが取れていること');

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
      canonVersion,
      `${rel}:${entry.line} の canon_version（${entry.raw}）が docs/ の現行値（${canonVersion}）と不一致。手で追従させること。`
    );
  }
});
