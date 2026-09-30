/**
 * G7（参照整合）の回帰テスト。
 *
 * 実 work/・output/ を汚さないよう、一意な <ts> を使い、各テストで自分の分だけ掃除する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkG7 } from '../gates/g7_ref_integrity.js';
import { ROOT } from './helpers/paths.js';
import { cleanupTs } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const work = (ts) => path.join(ROOT, 'work', ts);
const out = (ts) => path.join(ROOT, 'output', ts);

function setup(t, ts) {
  cleanupTs(t, ts);
  mkdirSync(work(ts), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'agents'), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'skills'), { recursive: true });
}

test('G7: preload skill 参照が実在すれば通過、不在なら違反', (t) => {
  const ts = tsFor(import.meta.url, 6);
  setup(t, ts);
  const agents = path.join(out(ts), 'generated', '.claude', 'agents');
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  // 実在する skill
  mkdirSync(path.join(skills, 'helper'), { recursive: true });
  writeFileSync(path.join(skills, 'helper', 'SKILL.md'), '---\nname: helper\ndescription: x\n---\n本文\n');
  // それを preload する agent
  mkdirSync(path.join(agents, 'worker'), { recursive: true });
  writeFileSync(
    path.join(agents, 'worker', 'worker.md'),
    '---\nname: worker\ndescription: x\ntools: Read\nskills: [helper]\n---\n本文\n'
  );
  assert.equal(checkG7({ ts }).ok, true, '実在する preload 参照は通る');

  // 不在の skill を preload する agent
  writeFileSync(
    path.join(agents, 'worker', 'worker.md'),
    '---\nname: worker\ndescription: x\ntools: Read\nskills: [does-not-exist]\n---\n本文\n'
  );
  assert.equal(checkG7({ ts }).ok, false, '不在の preload 参照は違反');
});

test('G7: scanned 件数を返す（0件しか見ていないことが分かる衛生設計）', (t) => {
  const ts = tsFor(import.meta.url, 7);
  setup(t, ts);
  const r = checkG7({ ts });
  assert.ok(r.scanned, 'scanned を返すこと');
  assert.equal(typeof r.scanned.agents, 'number');
});

// ---------------------------------------------------------------------------
// G7 supporting file 判定の2段構え（L026 恒久修正・§11.2 G7 契約）。
// 実 run（20260822_182221）へ適用し blocking 61件を実測した誤検出を、Tier A（構造上
// 確定できる参照）と Tier B（未解決トークンは warning に留める）へ分離した。
// 検出器の生存証明として、Tier A が引き続き機能することを故意の違反注入で固定する。
// ---------------------------------------------------------------------------

test('G7 Tier A: ディレクトリが実在する supporting file 参照 → 欠落は blocking で検出', (t) => {
  const ts = tsFor(import.meta.url, 11);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'demo');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  // examples/ ディレクトリは実在するが、参照する sample.md 自体は無い。
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo\ndescription: x\n---\n参照: `examples/missing.md`\n'
  );
  const r = checkG7({ ts });
  assert.equal(r.ok, false, 'examples/ 実在下の欠落参照は blocking のはず');
  assert.ok(
    r.blocking.some((v) => v.message.includes('examples/missing.md')),
    'Tier A（第1セグメント実在）の欠落が検出されること'
  );
});

test('G7 Tier A: 明示相対トークン（./missing.md）の欠落 → blocking で検出', (t) => {
  const ts = tsFor(import.meta.url, 12);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'demo2');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo2\ndescription: x\n---\n参照: `./missing-template.md`\n'
  );
  const r = checkG7({ ts });
  assert.equal(r.ok, false, './ 明示相対の欠落は blocking のはず');
  assert.ok(
    r.blocking.some((v) => v.message.includes('./missing-template.md')),
    'Tier A（明示相対）の欠落が検出されること'
  );
});

test('G7 Tier B: リポジトリ相対の地の文参照（gates/lib/run.js 等）は誤検出しない（L026 の核心）', (t) => {
  const ts = tsFor(import.meta.url, 13);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'demo3');
  mkdirSync(skillDir, { recursive: true });
  // gates/lib/run.js はスキルディレクトリ相対には実在しないが、地の文の説明であり
  // supporting file 参照ではない。第1セグメント "gates" はスキルディレクトリ直下に
  // 実在しないため Tier B（未解決なら warning のみ・ブロックしない）。
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo3\ndescription: x\n---\n実装は `gates/lib/run.js` を参照。テンプレートは `template.md`。\n'
  );
  const r = checkG7({ ts });
  assert.equal(r.ok, true, '地の文参照は blocking にならないこと');
  assert.equal(
    r.blocking.filter((v) => v.path.includes('demo3')).length,
    0,
    'demo3 の SKILL.md から blocking 違反が出ないこと'
  );
  const warnings = r.violations.filter((v) => v.severity === 'warning' && v.path.includes('demo3'));
  assert.ok(
    warnings.some((v) => v.message.includes('gates/lib/run.js')) &&
      warnings.some((v) => v.message.includes('template.md')),
    '未解決トークンは warning として報告される（黙って捨てない）'
  );
});

// ---------------------------------------------------------------------------
// G7 判定⑥: skill パッケージの定義ファイル（SKILL.md）実在。
//
// G3 が supporting files を許すように狭まる前は、「skill ディレクトリ配下は SKILL.md のみ」
// という誤った一律規則が**副作用として**この保証を担っていた。規則を正しく狭めた以上、
// 副作用で塞がっていた穴は明示的に塞ぎ直す必要がある——さもないと `Skill.md` のような
// 綴り違いが全ゲートを素通りし、スキルがロードされないのにエラーも出ない（§11.5）。
// ---------------------------------------------------------------------------

test('G7: supporting files だけで SKILL.md が無い skill パッケージは違反（サイレント不発火の検出）', (t) => {
  const ts = tsFor(import.meta.url, 15);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'broken');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  // 故意の違反注入: 定義ファイルの綴り違い（Skill.md）＋ supporting files のみ。
  writeFileSync(path.join(skillDir, 'Skill.md'), '---\nname: broken\ndescription: x\n---\n本文\n');
  writeFileSync(path.join(skillDir, 'template.md'), '# テンプレート\n');
  writeFileSync(path.join(skillDir, 'examples', 'sample.md'), '# 例\n');

  const r = checkG7({ ts });
  assert.equal(r.ok, false, 'SKILL.md 不在のパッケージを合格にしてはならない');
  assert.ok(
    r.blocking.some((v) => v.message.includes('SKILL.md') && v.path.includes('broken')),
    `broken/ の定義ファイル不在が検出されること: ${JSON.stringify(r.blocking)}`
  );
  assert.equal(r.scanned.skillPackages, 1, '検査したパッケージ数が見えること（0件を合格と誤認しない）');

  // 綴りを正せば通る。Windows の FS は大小無視のため、上書きでなく削除してから書く
  // （同じ実体のまま残るとディレクトリエントリ名が Skill.md のままになる）。
  rmSync(path.join(skillDir, 'Skill.md'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: broken\ndescription: x\n---\n本文\n');
  assert.equal(checkG7({ ts }).ok, true, '正しい綴りの SKILL.md を置けば通ること');
});

test('G7: ネストした examples/SKILL.md はパッケージの定義ファイルに数えない（skillPathRole 委譲の確認）', (t) => {
  const ts = tsFor(import.meta.url, 16);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'nested');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  // supporting file として置かれた例示 SKILL.md。名前だけで拾うと定義ファイル有りに見える。
  writeFileSync(path.join(skillDir, 'examples', 'SKILL.md'), '---\nname: sample\ndescription: 例\n---\n例\n');

  const r = checkG7({ ts });
  assert.equal(r.ok, false, '例示ファイルを定義ファイルと誤認してはならない');
  assert.ok(
    r.blocking.some((v) => v.message.includes('SKILL.md') && v.path.includes('nested')),
    JSON.stringify(r.blocking)
  );
});

// ---------------------------------------------------------------------------
// G7 判定⑦: 非管理ファイルへの行番号引用の禁止。
//
// 実測（vehicle-intake-management・改善バックログ E1・2026-09-04）:
//   `.claude/rules/tsod-workflow.md:23` が README.md:266-269 を行番号で引用しており、
//   README のブランチ戦略節を書き換えた際に引用が陳腐化した。行番号は対象プロジェクト側の
//   編集で無言でずれ、生成物側にはずれを検知する手段が無い——判定⑥（サイレント不発火）と
//   同種の「壊れても誰も気づかない」型の脆さ。
// ---------------------------------------------------------------------------

test('G7 判定⑦: 対象プロジェクトの非管理ファイルへの行番号引用は違反（故意の違反注入）', (t) => {
  const ts = tsFor(import.meta.url, 20);
  setup(t, ts);
  const rules = path.join(out(ts), 'generated', '.claude', 'rules');
  mkdirSync(rules, { recursive: true });
  // 故意の違反注入: 実測どおり README.md への行番号引用（非管理ファイル）。
  writeFileSync(
    path.join(rules, 'tsod-workflow.md'),
    '---\npaths: ["**"]\n---\n' +
      'GitHub 側のブランチ保護は使えない（出典: `README.md:266-269`）。\n'
  );
  const r = checkG7({ ts });
  assert.equal(r.ok, false, '非管理ファイルへの行番号引用は blocking のはず');
  assert.ok(
    r.blocking.some((v) => v.message.includes('README.md') && v.path.includes('tsod-workflow.md')),
    `README.md への行番号引用が検出されること: ${JSON.stringify(r.blocking)}`
  );

  // 是正: 節見出し参照へ書き換えれば通る。
  writeFileSync(
    path.join(rules, 'tsod-workflow.md'),
    '---\npaths: ["**"]\n---\n' +
      'GitHub 側のブランチ保護は使えない（出典: `README.md` の「main への直接 push を防ぐ」節）。\n'
  );
  assert.equal(checkG7({ ts }).ok, true, '節見出し参照へ直せば通ること');
});

test('G7 判定⑦: 行範囲形式（path:N-M）・ネストしたパス（contracts/README.md）も検出する', (t) => {
  const ts = tsFor(import.meta.url, 21);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'impact-scope');
  mkdirSync(skillDir, { recursive: true });
  // 故意の違反注入: 実測どおり contracts/README.md への行範囲引用（ファイル末尾の節ゆえ
  // 1行挿入されるだけで壊れる脆さの実例）。
  writeFileSync(
    skillDir + '/SKILL.md',
    '---\nname: impact-scope\ndescription: x\n---\n' +
      '影響範囲はファイル名パターンで宣言する（出典: `contracts/README.md:64-68`）。\n'
  );
  const r = checkG7({ ts });
  assert.equal(r.ok, false, 'ネストした非管理パスへの行範囲引用も blocking のはず');
  assert.ok(
    r.blocking.some((v) => v.message.includes('contracts/README.md') && v.path.includes('impact-scope')),
    `contracts/README.md への行範囲引用が検出されること: ${JSON.stringify(r.blocking)}`
  );
});

test('G7 判定⑦: 生成物同士（管理ファイル間）の行番号参照は誤検出しない', (t) => {
  const ts = tsFor(import.meta.url, 22);
  setup(t, ts);
  const rules = path.join(out(ts), 'generated', '.claude', 'rules');
  mkdirSync(rules, { recursive: true });
  // 生成物同士の行番号参照は正当（同じ run で一括生成されるため相互の行番号がずれる余地がない）。
  writeFileSync(
    path.join(rules, 'cross-ref.md'),
    '---\npaths: ["**"]\n---\n' + '詳細は `.claude/rules/backend.md:12` および `CLAUDE.md:1-10` を参照。\n'
  );
  const r = checkG7({ ts });
  assert.equal(
    r.blocking.filter((v) => v.path.includes('cross-ref.md')).length,
    0,
    '管理ファイル間の行番号参照は blocking にならないこと'
  );
  assert.ok(r.scanned.unmanagedLineRefsChecked >= 2, '走査件数が見えること（0件を合格と誤認しない）');
});
