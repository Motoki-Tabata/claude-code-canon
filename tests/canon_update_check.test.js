/**
 * canon-update の検査（.claude/skills/canon-update/scripts/checks.js）の回帰テスト。
 * 実リファレンスでオフライン7検査が通ること、一時コピーに故意の違反を入れると各検査が発火することを示す。
 * ネットワークの検査（2・4・5）は、取得関数を差し替えて判定ロジックだけを確かめる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { REFERENCE_DIR } from '../lib/tables.js';
import { CANON_ROOT } from '../lib/canon.js';
import { runNodeScript } from './helpers/run-cli.js';
import {
  OFFLINE_CHECKS, checkJson, checkCompleteness, checkFeatureHeadings, checkDataRefs, checkRuleIds,
  checkBannedWording, checkSkillIndex, checkAnchors, checkPages,
} from '../.claude/skills/canon-update/scripts/checks.js';

const CHECK_CLI = path.join(CANON_ROOT, '.claude', 'skills', 'canon-update', 'scripts', 'check.js');

/** リファレンスの一時コピーを作り、`mutate(root)` で故意の違反を入れて返す。 */
function mutated(mutate) {
  const root = mkdtempSync(path.join(tmpdir(), 'canon-ref-'));
  cpSync(REFERENCE_DIR, root, { recursive: true });
  mutate(root);
  return root;
}
const edit = (root, rel, fn) => {
  const abs = path.join(root, rel);
  writeFileSync(abs, fn(readFileSync(abs, 'utf8')));
};

test('実リファレンス: オフライン7検査が、対象を走査したうえで違反0', () => {
  for (const check of OFFLINE_CHECKS) {
    const r = check(REFERENCE_DIR);
    assert.ok(r.scanned > 0, `検査${r.id} の走査が0件（vacuous pass）`);
    assert.deepEqual(r.violations, [], `検査${r.id}`);
  }
  assert.equal(checkFeatureHeadings(REFERENCE_DIR).scanned, 12);
});

const CASES = [
  ['1 壊れた JSON', checkJson, (r) => appendFileSync(path.join(r, 'data', 'tools.json'), '{')],
  ['3 complete_basis の欠落', checkCompleteness, (r) => edit(r, 'data/tools.json', (t) => t.replace(/"complete_basis"/, '"x_basis"'))],
  ['3 stated_total の不一致', checkCompleteness, (r) => edit(r, 'data/tools.json', (t) => t.replace(/"stated_total": [^,\n]+/, '"stated_total": 9999'))],
  ['6 見出しの欠落', checkFeatureHeadings, (r) => edit(r, 'references/features/rules.md', (t) => t.replace('## 7. 品質基準', ''))],
  ['7 解決しない data 参照', checkDataRefs, (r) => appendFileSync(path.join(r, 'references/features/rules.md'), '\n`tools:tools/NoSuchTool`\n')],
  ['8 ID の欠番', checkRuleIds, (r) => edit(r, 'references/features/hooks.md', (t) => t.replace('**V-hooks-02**', '**V-hooks-05**'))],
  ['9 取り消し線', checkBannedWording, (r) => appendFileSync(path.join(r, 'references/patterns.md'), '\n~~消した~~\n')],
  ['9 L3 の語', checkBannedWording, (r) => appendFileSync(path.join(r, 'references/patterns.md'), '\nL3 の構成\n')],
  ['11 索引に無いファイル', checkSkillIndex, (r) => appendFileSync(path.join(r, 'references/extra.md'), '# x\n')],
];

for (const [label, check, mutate] of CASES) {
  test(`故意の違反で発火する: ${label}`, () => {
    const root = mutated(mutate);
    try {
      assert.ok(check(root).violations.length > 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('検査4: llms.txt との過不足と page_count の不一致を検出し、一致すれば通る', async () => {
  const pages = JSON.parse(readFileSync(path.join(REFERENCE_DIR, 'sources.json'), 'utf8')).pages.map((p) => p.url);
  const same = await checkPages(REFERENCE_DIR, async () => pages.join('\n'));
  assert.deepEqual(same.violations, []);
  const fewer = await checkPages(REFERENCE_DIR, async () => pages.slice(1).join('\n'));
  assert.ok(fewer.violations.some((v) => v.includes('pages にあるが llms.txt に無い')));
});

test('検査2: HTML に anchor の id が無ければ発火する', async () => {
  const ok = await checkAnchors(REFERENCE_DIR, async () => '');
  assert.ok(ok.scanned > 0);
  assert.ok(ok.violations.length > 0, 'id を含まない HTML では違反になる');
});

test('CLI: 実リファレンスで exit 0、故意の違反を入れたコピーで exit 1、引数不正で exit 2', () => {
  const okRun = runNodeScript(CHECK_CLI);
  assert.equal(okRun.code, 0, okRun.stdout + okRun.stderr);
  assert.match(okRun.stdout, /未実行 検査2・4・5/);
  const root = mutated((r) => appendFileSync(path.join(r, 'references/patterns.md'), '\n~~消した~~\n'));
  try {
    const ng = runNodeScript(CHECK_CLI, ['--root', root]);
    assert.equal(ng.code, 1);
    assert.match(ng.stdout, /NG\s+検査9/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(runNodeScript(CHECK_CLI, ['--bogus']).code, 2);
});
