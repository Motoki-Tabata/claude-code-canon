/**
 * V7 keep（artifacts.md §8.2・§6.3）の回帰テスト。verify.js の buildContext を通して当てる。
 *
 * keep の非回帰（sha256）・廃止の明示・keep_conditions の宣言・K1/K3/K5 の事実照合・interface_change の
 * 照合を固定する。どの検査も故意の違反を注入して発火することを示す（通過だけを根拠にしない）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo, writeHandoff, cleanupTs } from './helpers/fixtures.js';
import { outputDir, workDir } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import { checkV7 } from '../.claude/skills/canon-c/scripts/verify/v7-keep.js';
import { buildContext } from '../.claude/skills/canon-c/scripts/verify.js';
import { interfaceSignature } from '../lib/interface-signature.js';

function v7(ts) {
  const r = checkV7(buildContext(ts));
  return { ...r, ok: r.violations.length === 0 };
}

const has = (r, ...words) => r.violations.some((v) => words.every((w) => v.includes(w)));

/** existing サンプルの design-map を書き換える。 */
function editDesignMap(c, fn) {
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

/** existing サンプルの existing.md を書き換える。 */
function editExisting(c, fn) {
  const p = path.join(c.work, 'investigation', 'existing.md');
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

// ---- 非回帰・廃止の明示 ----

test('V7: existing サンプル（keep・modify・retire・merge）は通過する', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 1));
  const r = v7(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(r.checked, 5, 'existing_disposition の5件を検査したこと');
});

test('V7: generated/ のコピーの1バイト改変を検出する', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 2));
  const p = path.join(c.gen, '.claude/skills/kept-skill/SKILL.md');
  writeFileSync(p, readFileSync(p, 'utf8') + '改変\n');
  assert.ok(has(v7(c.ts), 'kept-skill', 'sha256'));
});

test('V7: keep が generated/ に無いと違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 3));
  rmSync(path.join(c.gen, '.claude/skills/kept-skill/SKILL.md'));
  assert.ok(has(v7(c.ts), 'kept-skill', 'generated/ に存在しない'));
});

test('V7: retire が generated/ に残っていると違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 4));
  const p = path.join(c.gen, '.claude/skills/legacy-skill/SKILL.md');
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, 'x\n');
  assert.ok(has(v7(c.ts), 'legacy-skill', '残っている'));
});

test('V7: retired.list に載っていない廃止は違反。retired.list が無ければそれ自体を違反にする', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 5));
  const list = path.join(c.out, 'deploy/retired.list');
  writeFileSync(list, '# 空\n');
  assert.ok(has(v7(c.ts), 'legacy-skill', 'retired.list に載っていない'));
  rmSync(list);
  assert.ok(has(v7(c.ts), 'retired.list が無い'));
});

test('V7: retire・merge に manifest_note が無いと違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 6));
  editDesignMap(c, (s) => s.replace('    manifest_note: "legacy-skill は廃止し new-skill へ移行"\n', ''));
  assert.ok(has(v7(c.ts), 'legacy-skill', 'manifest_note'));
});

// ---- 入力の欠落と対象なし ----

test('V7: design-map が無い・handoff の mode が無いときは違反（vacuous pass 防止）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 7));
  rmSync(path.join(c.out, 'design-map.md'));
  assert.ok(has(v7(c.ts), 'design-map.md が無い'));

  const d = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 8));
  rmSync(path.join(d.work, 'handoff.md'));
  assert.ok(has(v7(d.ts), 'mode'));
});

test('V7: new モードで既存判定が無ければ「対象なし」、レコードがあれば違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 9));
  writeHandoff(c.ts, { target: c.work, mode: 'new' });
  assert.ok(has(v7(c.ts), 'new モードなのに'), 'new モードでレコードがあるのに通した');

  editDesignMap(c, () => '# design-map\n\n## Used Features\nskills\n');
  const r = v7(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.match(r.na, /new モード/);
});

test('V7: refactor モードで既存判定が読めなければ違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 10));
  editDesignMap(c, () => '# design-map\n\n## Used Features\nskills\n');
  assert.ok(has(v7(c.ts), 'refactor モードなのに'));
});

// ---- keep_conditions の宣言と K1・K3・K5 の事実照合 ----

test('V7: keep_conditions に false があると違反（宣言の段階で keep にできない）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 11));
  editDesignMap(c, (s) => s.replace('K2_no_requirement_conflict: true', 'K2_no_requirement_conflict: false'));
  assert.ok(has(v7(c.ts), 'kept-skill', 'K2'));
});

test('V7 K1: existing.md の canon_conformance が clean でない keep は違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 12));
  editExisting(c, (s) => s.replace('    deprecated_notation: []', '    deprecated_notation: [Task]'));
  assert.ok(has(v7(c.ts), 'kept-skill', 'K1'));
});

test('V7 K1: existing.md に keep のレコードが無い・existing.md 自体が無いときは違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 13));
  editExisting(c, (s) => s.replace('- path: .claude/skills/kept-skill/SKILL.md', '- path: .claude/skills/other/SKILL.md'));
  assert.ok(has(v7(c.ts), 'kept-skill', 'existing.md に無い'));
  rmSync(path.join(c.work, 'investigation', 'existing.md'));
  assert.ok(has(v7(c.ts), 'existing.md が無い'));
});

test('V7 K3: keep の参照先が retire・merge になると違反、modify なら interface_change: none が要る', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 14));
  editExisting(c, (s) =>
    s.replace(
      'customization_refs: []\n    project_refs:\n      - kind: paths_glob  value: "src/**/*.js"',
      'customization_refs: [.claude/skills/legacy-skill/SKILL.md, CLAUDE.md]\n    project_refs:\n      - kind: paths_glob  value: "src/**/*.js"'
    )
  );
  const r = v7(c.ts);
  assert.ok(has(r, 'K3', 'legacy-skill', 'retire'), JSON.stringify(r.violations));
  assert.ok(has(r, 'K3', 'CLAUDE.md', 'interface_change: none'), JSON.stringify(r.violations));

  // 対照: 参照先の modify が none を宣言すれば K3 の modify 側は通る（署名の照合は別途）。
  editDesignMap(c, (s) => s.replace('  - path: CLAUDE.md\n    disposition: modify\n', '  - path: CLAUDE.md\n    disposition: modify\n    interface_change: breaking\n'));
  assert.ok(has(v7(c.ts), 'K3', 'CLAUDE.md'), 'breaking でも K3 は満たさない');
});

test('V7: interface_change の不正な値と、retire・merge への記載は違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 15));
  editDesignMap(c, (s) =>
    s
      .replace('  - path: CLAUDE.md\n    disposition: modify\n', '  - path: CLAUDE.md\n    disposition: modify\n    interface_change: maybe\n')
      .replace('    disposition: retire\n', '    disposition: retire\n    interface_change: none\n')
  );
  const r = v7(c.ts);
  assert.ok(has(r, 'CLAUDE.md', 'maybe'), JSON.stringify(r.violations));
  assert.ok(has(r, 'retire', 'legacy-skill', 'interface_change が書かれている'), JSON.stringify(r.violations));
});

test('V7 K5: ref_resolution で resolved: false の project_refs は違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 16));
  const p = path.join(c.work, 'investigation', 'focused.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('resolved: true', 'resolved: false'));
  assert.ok(has(v7(c.ts), 'K5', 'resolved: false'));
});

test('V7 K5: ref_resolution に無い参照は、具体パスなら対象での実在で代えられる。glob は代えられない', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 17));
  rmSync(path.join(c.work, 'investigation', 'focused.md'));
  assert.ok(has(v7(c.ts), 'K5', 'src/**/*.js'), 'glob を実在確認で素通りさせた');

  editExisting(c, (s) => s.replace('value: "src/**/*.js"', 'value: "src/app.js"'));
  assert.equal(v7(c.ts).ok, true, '対象に実在する具体パスは通る');

  editExisting(c, (s) => s.replace('value: "src/app.js"', 'value: "src/gone.js"'));
  assert.ok(has(v7(c.ts), 'K5', 'src/gone.js'), '実在しない具体パスを通した');
});

// ---- interface_change: none の署名照合 ----
// 独立した最小の原本を work/<ts>/ic-target/ に作り、テスト内で完結させる。

function setupInterfaceChangeCase(t, ts, { relPath, originalContent, outputContent }) {
  const out = outputDir(ts);
  const work = workDir(ts);
  cleanupTs(t, ts);
  const targetRoot = path.join(work, 'ic-target');
  mkdirSync(path.join(targetRoot, path.dirname(relPath)), { recursive: true });
  mkdirSync(path.join(out, 'generated', path.dirname(relPath)), { recursive: true });
  writeFileSync(path.join(targetRoot, relPath), originalContent);
  writeFileSync(path.join(out, 'generated', relPath), outputContent);
  writeHandoff(ts, { target: targetRoot, mode: 'refactor' });
  const dm = ['## 既存判定', '```yaml', 'existing_disposition:', `  - path: ${relPath}`, '    disposition: modify', '    interface_change: none', '```', ''].join('\n');
  writeFileSync(path.join(out, 'design-map.md'), dm);
  return { ts };
}

test('V7: interface_change: none × frontmatter name 同一 → 通過', (t) => {
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 20), {
    relPath: '.claude/skills/release-notes/SKILL.md',
    originalContent: '---\nname: release-notes\ndescription: x\n---\n本文（旧）\n',
    outputContent: '---\nname: release-notes\ndescription: x\n---\n本文（新・節を追加）\n',
  });
  const r = v7(c.ts);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('V7: interface_change: none × frontmatter name 変化 → 違反（宣言だけで通る恒真経路が無い）', (t) => {
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 21), {
    relPath: '.claude/skills/release-notes/SKILL.md',
    originalContent: '---\nname: release-notes\ndescription: x\n---\n本文（旧）\n',
    outputContent: '---\nname: release-notes-v2\ndescription: x\n---\n本文（新）\n',
  });
  assert.ok(has(v7(c.ts), 'release-notes'));
});

test('V7: JSON（settings.json）はトップレベルキー集合が署名。キー不変なら通過、hooks 追加は違反', (t) => {
  const same = setupInterfaceChangeCase(t, tsFor(import.meta.url, 22), {
    relPath: '.claude/settings.json',
    originalContent: '{\n  "$comment": "旧",\n  "hooks": {}\n}\n',
    outputContent: '{\n  "$comment": "新",\n  "hooks": {}\n}\n',
  });
  assert.equal(v7(same.ts).ok, true);
  const added = setupInterfaceChangeCase(t, tsFor(import.meta.url, 23), {
    relPath: '.claude/settings.json',
    originalContent: '{\n  "$comment": "旧"\n}\n',
    outputContent: '{\n  "$comment": "旧",\n  "hooks": {}\n}\n',
  });
  assert.ok(has(v7(added.ts), 'json-top-keys'));
});

test('V7: rules は paths の値集合が署名。散文の変更は通し、paths の変化は違反', (t) => {
  const prose = setupInterfaceChangeCase(t, tsFor(import.meta.url, 24), {
    relPath: '.claude/rules/backend.md',
    originalContent: '---\npaths: ["src/**"]\n---\n旧本文\n',
    outputContent: '---\npaths: ["src/**"]\n---\n新本文（散文だけ変更）\n',
  });
  assert.equal(v7(prose.ts).ok, true);
  const widened = setupInterfaceChangeCase(t, tsFor(import.meta.url, 25), {
    relPath: '.claude/rules/backend.md',
    originalContent: '---\npaths: ["src/**"]\n---\n本文\n',
    outputContent: '---\npaths: ["src/**", "lib/**"]\n---\n本文\n',
  });
  assert.ok(has(v7(widened.ts), 'rule-paths'));
});

test('V7: CLAUDE.md は見出し構造が署名。本文の変更は通し、節の追加は違反', (t) => {
  const body = setupInterfaceChangeCase(t, tsFor(import.meta.url, 26), {
    relPath: 'CLAUDE.md',
    originalContent: '# タイトル\n## セクションA\n本文\n## セクションB\n本文\n',
    outputContent: '# タイトル\n## セクションA\n新本文\n## セクションB\n新本文\n',
  });
  assert.equal(v7(body.ts).ok, true);
  const added = setupInterfaceChangeCase(t, tsFor(import.meta.url, 27), {
    relPath: 'CLAUDE.md',
    originalContent: '# タイトル\n## セクションA\n本文\n',
    outputContent: '# タイトル\n## セクションA\n本文\n## セクションB\n新節\n',
  });
  assert.ok(has(v7(added.ts), 'heading-structure'));
});

test('V7: 署名を取れない種別（壊れた JSON）への none 宣言は違反（宣言と強制をずらさない）', (t) => {
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 28), {
    relPath: '.claude/settings.json',
    originalContent: '{ 不正な JSON',
    outputContent: '{ 不正な JSON',
  });
  assert.ok(has(v7(c.ts), '.claude/settings.json', '署名が無く'));
});

test('V7: paths の無い rule は「無条件に読み込まれること」が署名。節の追加は通し、paths を足せば違反', (t) => {
  const relPath = '.claude/rules/research-discipline.md';
  const kept = setupInterfaceChangeCase(t, tsFor(import.meta.url, 29), {
    relPath,
    originalContent: '# 調査の規律\n## 裏取り\n本文\n',
    outputContent: '# 調査の規律\n## 裏取り\n本文\n## 追加した節\n新しい教訓\n',
  });
  const ok = v7(kept.ts);
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));

  const scoped = setupInterfaceChangeCase(t, tsFor(import.meta.url, 30), {
    relPath,
    originalContent: '# 調査の規律\n本文\n',
    outputContent: '---\npaths: ["src/**"]\n---\n# 調査の規律\n本文\n',
  });
  assert.ok(has(v7(scoped.ts), 'rule-paths'));
});

// ---- disposition の語彙 ----

test('V7: disposition が語彙（keep・modify・merge・retire・out_of_scope）に無いレコードは違反（typo・null）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 90));
  editDesignMap(c, (s) => s.replace('disposition: keep', 'disposition: keeep'));
  const r = v7(c.ts);
  assert.ok(has(r, 'disposition', 'keeep'), JSON.stringify(r.violations));
});

test('V7: disposition が空（null・未記入）のレコードも違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 91));
  editDesignMap(c, (s) => s.replace('disposition: keep', 'disposition:'));
  const r = v7(c.ts);
  assert.ok(has(r, 'disposition', '未記入'), JSON.stringify(r.violations));
});

test('interfaceSignature: AGENTS.md は CLAUDE.md と同じく見出し構造が署名', () => {
  const a = interfaceSignature('AGENTS.md', '# a\n本文\n## b\n');
  assert.equal(a.kind, 'heading-structure');
  assert.equal(a.verifiable, true);
  assert.notEqual(interfaceSignature('AGENTS.md', '# a\n## b\n## c\n').signature, a.signature, '節の追加で署名が変わる');
});
