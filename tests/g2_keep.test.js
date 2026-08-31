/**
 * G2 維持判定妥当性（stage=design・§11.2・§8.2）の回帰テスト。
 * keep の C1/C3/C5 実照合と C2/C4 形式検査、retire/merge の manifest_note 照合を固定する。
 * vacuous pass 防止（design-map 不在・keep_conditions 欠落を成功と誤認しない）を必ず含む。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';
import { checkG2 } from '../gates/g2_keep_judgement.js';
import { parseExistingDisposition, DesignMapError } from '../gates/lib/design-map.js';

test('G2: keep 全 C1〜C5（実照合＋形式検査）を通過', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 1));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(r.keeps, 1);
});

test('G2: C1 実照合失敗（系統A canon_conformance が dirty）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 2));
  const p = path.join(c.work, 'existing_customizations.md');
  // kept-skill が最初のレコード。その tool_names_valid を false に。
  writeFileSync(p, readFileSync(p, 'utf8').replace('tool_names_valid: true', 'tool_names_valid: false'));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C1')));
});

test('G2: C3 実照合失敗（keep の依存先が retire される）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 3));
  const p = path.join(c.work, 'existing_customizations.md');
  // kept-skill の customization_refs に retire 対象 legacy を追加。
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(
      'customization_refs: []\n    project_refs:',
      'customization_refs: [.claude/skills/legacy-skill/SKILL.md]\n    project_refs:'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C3')));
});

test('G2: C5 実照合失敗（project_ref が系統B で未解決）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 4));
  const p = path.join(c.work, 'project_profile.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('resolved: true', 'resolved: false'));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C5')));
});

test('L024 G2: deprecated_notation の自然文（「なし」）は C1 で clean と判定されない（値の語彙契約の根拠）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 9));
  const p = path.join(c.work, 'existing_customizations.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('deprecated_notation: []', 'deprecated_notation: なし'));
  const r = checkG2({ ts: c.ts });
  assert.equal(
    r.ok,
    false,
    '「なし」は文字列 `[]` と厳密不一致——ワーカー定義（existing-customization-analyzer）が' +
      '明記する語彙契約「無しは [] のみ」の根拠'
  );
  assert.ok(r.violations.some((v) => v.includes('C1')));
});

test('L024 G2: project_refs.value と ref_resolution.ref の粒度不一致は C5 で未解決扱い（結合キーの語彙契約の根拠）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 10));
  const p = path.join(c.work, 'existing_customizations.md');
  // 系統Aが project_refs.value を圧縮表記（複数参照のまとめ書き）で書くと、系統Bの
  // ref_resolution.ref（"src/**/*.js" 単独）と文字列完全一致しなくなる。
  writeFileSync(p, readFileSync(p, 'utf8').replace('value: "src/**/*.js"', 'value: "src/**/*.js, other.js"'));
  const r = checkG2({ ts: c.ts });
  assert.equal(
    r.ok,
    false,
    '圧縮表記は ref_resolution.ref と文字列完全一致しない——1参照1エントリを要求する' +
      '値の語彙契約の根拠（対象自体は実在し resolved:true でも、結合キーがずれれば未解決扱い）'
  );
  assert.ok(r.violations.some((v) => v.includes('C5')));
});

test('G2: keep_conditions に false 宣言があれば keep 不可（形式検査）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 5));
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('C4_strength_consistent: true', 'C4_strength_consistent: false'));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C4')));
});

test('G2: retire の manifest_note 欠落を検出', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 6));
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace('\n    manifest_note: "legacy-skill は廃止し new-skill へ移行"', ''));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('manifest_note')));
});

test('G2: design-map 不在は違反（vacuous pass 防止）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 7));
  rmSync(path.join(c.out, 'design-map.md'));
  assert.equal(checkG2({ ts: c.ts }).ok, false);
});

test('parseExistingDisposition: existing_disposition 不在は throw（silent empty 禁止）', () => {
  assert.throws(() => parseExistingDisposition('# design-map\n本文のみ\n'), DesignMapError);
});

// --- F3: パーサ堅牢化（インラインコメント許容・ブロックスカラー folding） ---

test('F3 parseExistingDisposition: C 行の行末インラインコメントを許容し C1〜C5 を全て読む', () => {
  const md = [
    '## existing_disposition',
    'existing_disposition:',
    '  - path: .claude/skills/kept/SKILL.md',
    '    disposition: keep',
    '    keep_conditions:',
    '      C1_canon_clean: true',
    '      C2_no_requirement_conflict: true  # 系統A と矛盾なし（根拠コメント）',
    '      C3_dependency_healthy: true',
    '      C4_strength_consistent: false # 既存が強い分には可',
    '      C5_project_refs_resolved: true',
    '',
  ].join('\n');
  const recs = parseExistingDisposition(md);
  assert.equal(recs.length, 1);
  const kc = recs[0].keep_conditions;
  // 修正前はコメント付き C2 行以降が早期クローズで欠落し、C2〜C5 が undefined になっていた。
  assert.deepEqual(kc, { C1: true, C2: true, C3: true, C4: false, C5: true });
});

test('F3 parseExistingDisposition: manifest_note のブロックスカラー(>)を畳み込む', () => {
  const md = [
    '## existing_disposition',
    'existing_disposition:',
    '  - path: .claude/skills/legacy/SKILL.md',
    '    disposition: retire',
    '    reason_code: superseded_by_new',
    '    superseded_by: .claude/skills/new/SKILL.md',
    '    manifest_note: >',
    '      legacy は new へ移行する。',
    '      複数行にわたる注記。',
    '',
  ].join('\n');
  const recs = parseExistingDisposition(md);
  assert.equal(recs.length, 1);
  // 修正前は `>` が値として拾われ manifest_note が空扱いになる footgun だった。
  assert.equal(recs[0].manifest_note, 'legacy は new へ移行する。 複数行にわたる注記。');
});

test('F3 parseExistingDisposition: 従来のインライン manifest_note は不変（回帰）', () => {
  const md = [
    '## existing_disposition',
    'existing_disposition:',
    '  - path: .claude/skills/legacy/SKILL.md',
    '    disposition: retire',
    '    manifest_note: "legacy は廃止"',
    '',
  ].join('\n');
  const recs = parseExistingDisposition(md);
  assert.equal(recs[0].manifest_note, 'legacy は廃止');
});

// --- A1（実昇格準備2）: C3 の interface_change 粒度 ---

/** design-map.md の existing_disposition 末尾（閉じフェンス直前）にレコード行を挿入する。 */
function insertBeforeFence(text, insertion) {
  const idx = text.lastIndexOf('```');
  return text.slice(0, idx) + insertion + text.slice(idx);
}

test('A1 G2: C3 実照合失敗（keep の依存先が modify されるが interface_change 宣言なし）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 11));
  const sysAPath = path.join(c.work, 'existing_customizations.md');
  writeFileSync(
    sysAPath,
    readFileSync(sysAPath, 'utf8').replace(
      'customization_refs: []\n    project_refs:',
      'customization_refs: [CLAUDE.md]\n    project_refs:'
    )
  );
  // design-map.md の CLAUDE.md は modify のみ（interface_change 宣言なし）— fixture 既定のまま。
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C3') && v.includes('interface_change')));
});

test('A1 G2: C3 実照合成功（keep の依存先が modify × interface_change: none 宣言）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 12));
  const sysAPath = path.join(c.work, 'existing_customizations.md');
  writeFileSync(
    sysAPath,
    readFileSync(sysAPath, 'utf8').replace(
      'customization_refs: []\n    project_refs:',
      'customization_refs: [CLAUDE.md]\n    project_refs:'
    )
  );
  const dmPath = path.join(c.out, 'design-map.md');
  writeFileSync(
    dmPath,
    readFileSync(dmPath, 'utf8').replace(
      '  - path: CLAUDE.md\n    disposition: modify\n',
      '  - path: CLAUDE.md\n    disposition: modify\n    interface_change: none\n'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('A1 G2: interface_change の不正値は違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 13));
  const dmPath = path.join(c.out, 'design-map.md');
  writeFileSync(
    dmPath,
    readFileSync(dmPath, 'utf8').replace(
      '  - path: CLAUDE.md\n    disposition: modify\n',
      '  - path: CLAUDE.md\n    disposition: modify\n    interface_change: banana\n'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('interface_change') && v.includes('不正値')));
});

test('A1 G2: retire レコードへの interface_change 宣言は違反（modify 専用フィールド）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 14));
  const dmPath = path.join(c.out, 'design-map.md');
  writeFileSync(
    dmPath,
    readFileSync(dmPath, 'utf8').replace(
      '  - path: .claude/skills/legacy-skill/SKILL.md\n    disposition: retire\n',
      '  - path: .claude/skills/legacy-skill/SKILL.md\n    disposition: retire\n    interface_change: none\n'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('interface_change') && v.includes('retire')));
});

// --- A2（実昇格準備2）: kind:settings の unknown_frontmatter_keys 契約 ---

const SETTINGS_SYS_A_RECORD = (unknownKeys) =>
  `- path: .claude/settings.json\n  kind: settings\n  depends_on:\n    customization_refs: []\n` +
  `    project_refs: []\n  canon_conformance:\n    frontmatter_keys_valid: true\n` +
  `    unknown_frontmatter_keys: ${unknownKeys}\n    tool_names_valid: true\n    deprecated_notation: []\n`;

const SETTINGS_DESIGN_MAP_RECORD =
  '  - path: .claude/settings.json\n    disposition: keep\n    keep_conditions:\n' +
  '      C1_canon_clean: true\n      C2_no_requirement_conflict: true\n' +
  '      C3_dependency_healthy: true\n      C4_strength_consistent: true\n' +
  '      C5_project_refs_resolved: true\n    rationale: "settings.json 維持"\n';

test('A2 G2: kind:settings が unknown_frontmatter_keys に $comment 系を書くと C1 違反（圏域錯誤の実害の根拠）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 15));
  const sysAPath = path.join(c.work, 'existing_customizations.md');
  const sysA = readFileSync(sysAPath, 'utf8');
  writeFileSync(sysAPath, sysA + (sysA.endsWith('\n') ? '' : '\n') + SETTINGS_SYS_A_RECORD('[$comment, $comment_hooks]'));
  const dmPath = path.join(c.out, 'design-map.md');
  writeFileSync(dmPath, insertBeforeFence(readFileSync(dmPath, 'utf8'), SETTINGS_DESIGN_MAP_RECORD));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('.claude/settings.json') && v.includes('C1')));
});

test('A2 G2: kind:settings で unknown_frontmatter_keys: [] なら通過（契約どおりの記載）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 16));
  const sysAPath = path.join(c.work, 'existing_customizations.md');
  const sysA = readFileSync(sysAPath, 'utf8');
  writeFileSync(sysAPath, sysA + (sysA.endsWith('\n') ? '' : '\n') + SETTINGS_SYS_A_RECORD('[]'));
  const dmPath = path.join(c.out, 'design-map.md');
  writeFileSync(dmPath, insertBeforeFence(readFileSync(dmPath, 'utf8'), SETTINGS_DESIGN_MAP_RECORD));
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// --- A3（実昇格準備2）: sentinel の project_ref が ref_resolution に丸ごと欠けている場合 ---

test('A3 G2: project_ref が系統B の ref_resolution に丸ごと欠けていると C5 未解決違反（sentinel 省略の危険の根拠）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 17));
  const sysAPath = path.join(c.work, 'existing_customizations.md');
  // kept-skill の project_refs に sentinel（<ts> を含まない run 種別ファイル）を追加する。
  // project_profile.md 側（work/.canon-update-ts 相当）には対応する ref_resolution エントリを足さない
  // ——「対象外として省略」した場合に何が起きるかを固定する。
  writeFileSync(
    sysAPath,
    readFileSync(sysAPath, 'utf8').replace(
      '      - kind: paths_glob  value: "src/**/*.js"\n',
      '      - kind: paths_glob  value: "src/**/*.js"\n      - kind: supporting_file  value: "work/.canon-update-ts"\n'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('C5') && v.includes('work/.canon-update-ts')));
});

test('F3 G2 経由: keep の C 行にインラインコメントを付けても通過する', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 8));
  const p = path.join(c.out, 'design-map.md');
  writeFileSync(
    p,
    readFileSync(p, 'utf8').replace(
      'C2_no_requirement_conflict: true',
      'C2_no_requirement_conflict: true  # 責務の重複なし（根拠）'
    )
  );
  const r = checkG2({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(r.keeps, 1);
});
