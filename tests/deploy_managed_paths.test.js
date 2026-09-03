/**
 * gates/lib/managed-paths.js（管理パス集合 SSoT・§10.1）のユニットテスト。
 * G9 と deploy が本 lib を共有する（G9 はローカル定義を持たず import する＝構造で SSoT を担保）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import {
  MANAGED_PATTERNS,
  isManaged,
  managedRoots,
  normalizeRel,
  parseListText,
  walkManaged,
  walkManagedDetailed,
  sha256File,
} from '../gates/lib/managed-paths.js';
import { sampleRepoDir as fixtureCase, scratchDir } from './helpers/fixtures.js';

test('MANAGED_PATTERNS: base 集合の10パターン（§10.1）', () => {
  // 9 → 10: `.claude/hooks/**`（hook ハンドラ実体）を追加（2026-09-03・§10.1）。
  // 件数を固定するのは、集合の拡大が「気づかれずに」起きないようにするため——集合が
  // 広がることは退避スワップが破壊しうる範囲が広がることと同義である（§10.1 の単一障害点）。
  assert.equal(MANAGED_PATTERNS.length, 10);
});

test('isManaged: 集合内は true', () => {
  for (const rel of [
    'CLAUDE.md',
    '.claude/rules/esm.md',
    '.claude/skills/s/SKILL.md',
    '.claude/agents/a/a.md',
    '.claude/settings.json',
    '.claude/README.md',
    '.claude/EXTRA.md',
    '.claude/hooks/block-rm.sh',
    '.claude/hooks/nested/format.mjs',
    '.mcp.json',
    'plugin/x.js',
  ]) {
    assert.equal(isManaged(rel), true, rel);
  }
});

test('isManaged: 集合外（不可侵）は false', () => {
  for (const rel of [
    '.github/workflows/ci.yml',
    'CODEOWNERS',
    'hooks/stray.sh', // `.claude/` の外の hooks/ は集合外のまま（拡張しすぎていないこと）
    '.claude/hooks', // ディレクトリ自身は対象外（`.+` が要る）
    'src/.claude/hooks/x.sh', // 集合パターンは先頭アンカー。サブツリーの同名は拾わない
    'src/app.js',
    'package.json',
    '.claude-canon.bak.20260722_000000/CLAUDE.md',
    'expected-output/generated/CLAUDE.md',
  ]) {
    assert.equal(isManaged(rel), false, rel);
  }
});

test('normalizeRel: バックスラッシュ→スラッシュ・先頭 ./ 除去・trim', () => {
  assert.equal(normalizeRel('  .claude\\skills\\s\\SKILL.md '), '.claude/skills/s/SKILL.md');
  assert.equal(normalizeRel('./CLAUDE.md'), 'CLAUDE.md');
});

test('parseListText: # コメント・空行を除去し正規化する（G9 従来挙動と同一）', () => {
  const text = '# コメント\nCLAUDE.md\n\n  .claude/skills/s/SKILL.md \n./x.md\n.claude\\a\\b.md\n';
  assert.deepEqual(parseListText(text), [
    'CLAUDE.md',
    '.claude/skills/s/SKILL.md',
    'x.md',
    '.claude/a/b.md',
  ]);
});

test('walkManaged: 対象配下の管理ファイルのみ列挙（集合外・expected-output を除外）', () => {
  const got = walkManaged(fixtureCase('existing'));
  assert.deepEqual(got, [
    '.claude/skills/kept-skill/SKILL.md',
    '.claude/skills/legacy-skill/SKILL.md',
    '.claude/skills/merge-a/SKILL.md',
    '.claude/skills/merge-b/SKILL.md',
    'CLAUDE.md',
  ]);
});

// ---------------------------------------------------------------------------
// walkManaged の頑健性と走査範囲
//
// 実観測の事故（<ts> 20260903_091044・対象 vehicle-intake-management）: 旧 walkManaged は
// 全ツリーを再帰しつつ全エントリへノーガードで statSync していたため、対象リポジトリの
// socket 実在物（backend/ 配下13件＋ルート1件、いずれも .gitignore 済み）1件目の EACCES で
// pre-deploy-check ごと落ち、P8 の最終防波堤が起動不能になった。
// ---------------------------------------------------------------------------

/** 事故当時の対象リポジトリの形（管理パス＋走査根の外の重量物＋socket 実在物）を作る。 */
function targetLike(t) {
  const dir = scratchDir(t, 'canon-walk-');
  const w = (rel, body = 'x\n') => {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  };
  w('CLAUDE.md');
  w('.mcp.json', '{}\n');
  w('.claude/settings.json', '{}\n');
  w('.claude/rules/a.md');
  w('.claude/skills/s/SKILL.md');
  w('package.json', '{}\n');
  w('backend/app.py');
  w('frontend/node_modules/left-pad/index.js');
  w('docker/volumes/pg/data.bin');
  for (let i = 0; i < 13; i++) w(`backend/socket_${1066983714 + i}`); // .gitignore: backend/socket_*
  w('socket_root');
  return dir;
}

const TARGET_LIKE_MANAGED = [
  '.claude/rules/a.md',
  '.claude/settings.json',
  '.claude/skills/s/SKILL.md',
  '.mcp.json',
  'CLAUDE.md',
];

/** socket_* への stat を EACCES で落とす注入 stat（実観測の失敗を再現する）。 */
function eaccesOnSockets(p, ...rest) {
  if (path.basename(String(p)).startsWith('socket_')) {
    const err = new Error(`EACCES: permission denied, stat '${p}'`);
    err.code = 'EACCES';
    throw err;
  }
  return statSync(p, ...rest);
}

test('managedRoots: MANAGED_PATTERNS から機械導出する（走査根を二重管理しない）', () => {
  // 走査根を手書きの第二リストとして持つと、パターンだけ足して走査根を足し忘れた瞬間
  // walkManaged が黙って列挙漏れを起こす（§10.1 の単一障害点）。導出であることを固定する。
  assert.deepEqual([...managedRoots()].sort(), ['.claude', '.mcp.json', 'CLAUDE.md', 'plugin']);
});

test('walkManaged: stat 不能なエントリ（EACCES socket）が在っても走査全体が落ちない', (t) => {
  const dir = targetLike(t);

  // 対照実験（L002: vacuous pass 対策）——注入した EACCES が「旧実装なら本当に致死」で
  // あることを先に示す。これが throw しないなら以降のアサーションは何も証明していない。
  const walkWholeTree = (root) => {
    for (const name of readdirSync(root)) {
      const abs = path.join(root, name);
      if (eaccesOnSockets(abs).isDirectory()) walkWholeTree(abs);
    }
  };
  assert.throws(walkWholeTree.bind(null, dir), (e) => e.code === 'EACCES', '注入が致死でない＝テストが無効');

  // 現行実装は同じ条件で生き残り、正しい管理パス集合を返す。
  assert.deepEqual(walkManaged(dir, { stat: eaccesOnSockets }), TARGET_LIKE_MANAGED);
});

test('walkManaged: 走査根の外（backend/・node_modules/・docker/）へは降りない', (t) => {
  const dir = targetLike(t);
  const seen = [];
  const spyReaddir = (p, ...rest) => {
    seen.push(path.relative(dir, String(p)).replace(/\\/g, '/') || '.');
    return readdirSync(p, ...rest);
  };

  const r = walkManagedDetailed(dir, { readdir: spyReaddir, stat: eaccesOnSockets });

  assert.deepEqual(r.files, TARGET_LIKE_MANAGED);
  assert.deepEqual(r.unreadable, [], '走査根の内側に読めないものは無い');
  // 走査根の外を1つでも readdir していたら、追跡外の物理実在物を拾う経路が残っている
  // （.claude/rules/gates-and-tests.md「追跡外の物理実在物を誤って拾わない」）。
  assert.deepEqual(
    seen.filter((d) => !(d === '.' || d === '.claude' || d.startsWith('.claude/'))),
    []
  );
});

test('walkManaged: 管理根の【内側】で readdir が失敗しても走査を続け unreadable に記録する', (t) => {
  const dir = targetLike(t);
  const denied = path.join(dir, '.claude', 'skills');
  const denyingReaddir = (p, ...rest) => {
    if (path.resolve(String(p)) === path.resolve(denied)) {
      const err = new Error(`EACCES: permission denied, scandir '${p}'`);
      err.code = 'EACCES';
      throw err;
    }
    return readdirSync(p, ...rest);
  };

  const r = walkManagedDetailed(dir, { readdir: denyingReaddir });

  // 読めなかった部分木だけが欠け、残りは列挙され続ける（1件で全体が落ちない）。
  assert.deepEqual(r.files, ['.claude/rules/a.md', '.claude/settings.json', '.mcp.json', 'CLAUDE.md']);
  // 欠けたことは黙殺しない——防波堤の盲点として報告される。
  assert.deepEqual(r.unreadable, [{ rel: '.claude/skills', code: 'EACCES' }]);
});

test('walkManaged: 壊れたシンボリックリンクは当該エントリだけ捨て、生きたリンクは従来どおり辿る', (t) => {
  const dir = scratchDir(t, 'canon-walk-link-');
  // シンボリックリンクは Windows で特権を要するため、readdir/stat を丸ごと注入して
  // 「リンクが在る対象リポジトリ」を仮想的に組む。
  const de = (name, kind) => ({
    name,
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'link',
  });
  const tree = {
    '.': [de('CLAUDE.md', 'file'), de('.claude', 'dir'), de('backend', 'dir')],
    '.claude': [de('broken', 'link'), de('rules', 'link')],
    '.claude/rules': [de('a.md', 'file')],
  };
  const rel = (p) => path.relative(dir, String(p)).replace(/\\/g, '/') || '.';
  const fakeReaddir = (p) => {
    const entries = tree[rel(p)];
    if (!entries) throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    return entries;
  };
  const fakeStat = (p) => {
    if (rel(p) === '.claude/broken') throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    return { isDirectory: () => true }; // .claude/rules はディレクトリへの生きたリンク
  };

  const r = walkManagedDetailed(dir, { readdir: fakeReaddir, stat: fakeStat });

  // 生きたリンクは辿る（旧 statSync 実装の挙動を維持）。
  assert.deepEqual(r.files, ['.claude/rules/a.md', 'CLAUDE.md']);
  assert.deepEqual(r.unreadable, [{ rel: '.claude/broken', code: 'ENOENT' }]);
});

test('sha256File: keep 対象は target と expected-output でバイト同一（非退行の前提）', () => {
  const a = sha256File(path.join(fixtureCase('existing'), '.claude/skills/kept-skill/SKILL.md'));
  const b = sha256File(
    path.join(fixtureCase('existing'), 'expected-output/generated/.claude/skills/kept-skill/SKILL.md')
  );
  assert.equal(a, b, 'keep は verbatim コピーゆえ sha256 が一致していなければならない');
});
