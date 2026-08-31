/**
 * G8 非退行（stage=generation・§11.2・§9.3）の回帰テスト。
 * keep 原本↔output コピーの sha256 バイト同一・keep 全量 output 存在・retire/merge の明示照合を固定する。
 * 1バイト改変・output 不在・retire 残存・design-map 不在を必ず検出する（vacuous pass 防止）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupSampleRepo } from './helpers/fixtures.js';
import { ROOT } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';
import { checkG8 } from '../gates/g8_non_regression.js';

test('G8: keep 原本↔output コピー sha256 一致・廃止明示で通過', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 1));
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.equal(r.keeps, 1);
  assert.equal(r.gone, 3); // legacy retire ＋ merge-a/merge-b
});

test('G8: output コピーの1バイト改変を非退行違反として検出', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 2));
  const p = path.join(c.out, 'generated/.claude/skills/kept-skill/SKILL.md');
  writeFileSync(p, readFileSync(p, 'utf8') + '改変\n');
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('非退行')));
});

test('G8: keep 宣言なのに output 不在を検出', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 3));
  rmSync(path.join(c.out, 'generated/.claude/skills/kept-skill/SKILL.md'));
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('output に存在しない')));
});

test('G8: retire が output に残存すると違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 4));
  const p = path.join(c.out, 'generated/.claude/skills/legacy-skill/SKILL.md');
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, 'x\n');
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('残存')));
});

test('G8: retired.list に廃止明示が無いと違反', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 5));
  writeFileSync(path.join(c.out, '.deploy/retired.list'), '# 空\n');
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('retired.list')));
});

test('G8: design-map 不在は違反（vacuous pass 防止）', (t) => {
  const c = setupSampleRepo(t, 'existing', tsFor(import.meta.url, 6));
  rmSync(path.join(c.out, 'design-map.md'));
  assert.equal(checkG8({ ts: c.ts }).ok, false);
});

// --- A1（実昇格準備2）: interface_change: none の実照合（design 段階では実照合できない宣言の裏取り） ---
// 共有 fixture（sample-repos/existing）は G9/deploy と結合しているため触らず、work/<ts>/ic-target/ に
// 独立した最小の原本を作ってテスト内で完結させる（scenario2_helpers は流用しない）。

function setupInterfaceChangeCase(t, ts, { relPath, originalContent, outputContent }) {
  const out = path.join(ROOT, 'output', ts);
  const work = path.join(ROOT, 'work', ts);
  const targetRoot = path.join(work, 'ic-target');
  mkdirSync(path.join(targetRoot, path.dirname(relPath)), { recursive: true });
  mkdirSync(path.join(out, 'generated', path.dirname(relPath)), { recursive: true });
  writeFileSync(path.join(targetRoot, relPath), originalContent);
  writeFileSync(path.join(out, 'generated', relPath), outputContent);
  writeFileSync(path.join(work, 'target.txt'), targetRoot + '\n');
  const dm = [
    '## existing_disposition',
    '```yaml',
    'existing_disposition:',
    `  - path: ${relPath}`,
    '    disposition: modify',
    '    interface_change: none',
    '```',
    '',
  ].join('\n');
  writeFileSync(path.join(out, 'design-map.md'), dm);
  t.after(() => {
    rmSync(out, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  });
  return { ts, out, work };
}

test('A1 G8: interface_change: none 宣言 × frontmatter name 同一 → 通過', (t) => {
  const relPath = '.claude/skills/self-optimize/SKILL.md';
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 7), {
    relPath,
    originalContent: '---\nname: self-optimize\ndescription: x\n---\n本文（旧）\n',
    outputContent: '---\nname: self-optimize\ndescription: x\n---\n本文（新・節を追加）\n',
  });
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('A1 G8: interface_change: none 宣言 × frontmatter name 変化 → 違反（宣言だけで通る恒真経路が無いことの証明）', (t) => {
  const relPath = '.claude/skills/self-optimize/SKILL.md';
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 8), {
    relPath,
    originalContent: '---\nname: self-optimize\ndescription: x\n---\n本文（旧）\n',
    outputContent: '---\nname: self-optimize-v2\ndescription: x\n---\n本文（新）\n',
  });
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('name') && v.includes('self-optimize')));
});

test('A1 G8: interface_change: none 宣言 × frontmatter 非保持（JSON）→ 検査不能として違反', (t) => {
  const relPath = '.claude/settings.json';
  const c = setupInterfaceChangeCase(t, tsFor(import.meta.url, 9), {
    relPath,
    originalContent: '{\n  "$comment": "旧"\n}\n',
    outputContent: '{\n  "$comment": "新"\n}\n',
  });
  const r = checkG8({ ts: c.ts });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes('検査不能')));
});
