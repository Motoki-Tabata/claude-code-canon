/**
 * V5 書式片（artifacts.md §8.2）の回帰テスト。
 *
 * builder が Write の引数の閉じタグまで本文に書き込んだ残骸を、コードフェンスの外でだけ検出する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { findToolCallFragments, checkV5 } from '../.claude/skills/canon-c/scripts/verify/v5-fragments.js';
import { buildContext } from '../.claude/skills/canon-c/scripts/verify.js';
import { genDir } from './helpers/paths.js';
import { cleanupTs, writeSkill } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

test('V5: 書式片は本文末尾・frontmatter 直後で検出し、コードフェンス内の説明例は許す', () => {
  assert.deepEqual(findToolCallFragments('---\nname: a\n---\n本文\n</content>\n'), [5], '本文末尾');
  assert.deepEqual(findToolCallFragments('---\nname: a\n---\n</parameter>\n本文\n'), [4], 'frontmatter 直後');
  assert.deepEqual(findToolCallFragments('本文\n```xml\n<parameter name="x">\n</content>\n```\n'), [], 'コードフェンス内は説明の例');
});

test('V5（違反注入）: generated/ の .md に残った書式片を違反にし、無ければ通す', (t) => {
  const ts = tsFor(import.meta.url, 1);
  cleanupTs(t, ts);
  writeSkill(genDir(ts), 'clean');
  const ok = checkV5(buildContext(ts));
  assert.deepEqual(ok.violations, []);
  assert.equal(ok.checked, 1, '検査した .md の件数が見えること');

  writeSkill(genDir(ts), 's', { extra: '\n</content>\n' });
  const ng = checkV5(buildContext(ts));
  assert.ok(ng.violations.some((v) => v.includes('.claude/skills/s/SKILL.md') && v.includes('書式片')), ng.violations.join('\n'));
});
