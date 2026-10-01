/**
 * V6 参照整合（artifacts.md §8.2）の回帰テスト。verify.js の buildContext（1回の走査）を通して当てる。
 *
 * 実 work/・output/ を汚さないよう、一意な <ts> を使い、各テストで自分の分だけ掃除する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkV6 } from '../.claude/skills/canon-c/scripts/verify/v6-ref-integrity.js';
import { buildContext } from '../.claude/skills/canon-c/scripts/verify.js';
import { ROOT } from './helpers/paths.js';
import { cleanupTs } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

const work = (ts) => path.join(ROOT, 'work', ts);
const out = (ts) => path.join(ROOT, 'output', ts);

/** V6 を実行し、合否（ok）と違反・warning の文字列を返す。 */
function v6(ts) {
  const r = checkV6(buildContext(ts));
  return { ...r, ok: r.violations.length === 0 };
}

function setup(t, ts) {
  cleanupTs(t, ts);
  mkdirSync(work(ts), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'agents'), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'skills'), { recursive: true });
}

test('V6: preload skill 参照が実在すれば通過、不在なら違反', (t) => {
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
  assert.equal(v6(ts).ok, true, '実在する preload 参照は通る');

  // 不在の skill を preload する agent
  writeFileSync(
    path.join(agents, 'worker', 'worker.md'),
    '---\nname: worker\ndescription: x\ntools: Read\nskills: [does-not-exist]\n---\n本文\n'
  );
  assert.equal(v6(ts).ok, false, '不在の preload 参照は違反');
});

test('V6: 検査した件数を返す（0件しか見ていないことが分かる衛生設計）', (t) => {
  const ts = tsFor(import.meta.url, 7);
  setup(t, ts);
  writeFileSync(path.join(out(ts), 'generated', '.claude', 'agents', 'a.md'), '---\nname: a\ndescription: x\n---\n');
  assert.equal(typeof v6(ts).checked, 'number');
  assert.ok(v6(ts).checked >= 1);
});

// ---------------------------------------------------------------------------
// supporting file 判定の2段構え（artifacts.md §8.2 V6-4）。
// Tier A（構造上確定できる参照）と Tier B（未解決トークンは warning に留める）に分ける。
// 検出器の生存証明として、Tier A が機能することを故意の違反注入で固定する。
// ---------------------------------------------------------------------------

test('V6 Tier A: ディレクトリが実在する supporting file 参照 → 欠落は違反として検出', (t) => {
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
  const r = v6(ts);
  assert.equal(r.ok, false, 'examples/ 実在下の欠落参照は違反のはず');
  assert.ok(
    r.violations.some((v) => v.includes('examples/missing.md')),
    'Tier A（第1セグメント実在）の欠落が検出されること'
  );
});

test('V6 Tier A: 明示相対トークン（./missing.md）の欠落 → 違反として検出', (t) => {
  const ts = tsFor(import.meta.url, 12);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'demo2');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo2\ndescription: x\n---\n参照: `./missing-template.md`\n'
  );
  const r = v6(ts);
  assert.equal(r.ok, false, './ 明示相対の欠落は違反のはず');
  assert.ok(
    r.violations.some((v) => v.includes('./missing-template.md')),
    'Tier A（明示相対）の欠落が検出されること'
  );
});

test('V6 Tier B: リポジトリ相対の地の文参照（lib/run.js 等）は誤検出しない', (t) => {
  const ts = tsFor(import.meta.url, 13);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'demo3');
  mkdirSync(skillDir, { recursive: true });
  // lib/run.js はスキルディレクトリ相対には実在しないが、地の文の説明であり
  // supporting file 参照ではない。第1セグメント "lib" はスキルディレクトリ直下に
  // 実在しないため Tier B（未解決なら warning のみ・ブロックしない）。
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo3\ndescription: x\n---\n実装は `lib/run.js` を参照。テンプレートは `template.md`。\n'
  );
  const r = v6(ts);
  assert.equal(r.ok, true, '地の文参照は 違反にならないこと');
  assert.equal(
    r.violations.filter((v) => v.includes('demo3')).length,
    0,
    'demo3 の SKILL.md から違反が出ないこと'
  );
  const warnings = r.warnings.filter((v) => v.includes('demo3'));
  assert.ok(
    warnings.some((v) => v.includes('lib/run.js')) && warnings.some((v) => v.includes('template.md')),
    '未解決トークンは warning として報告される（黙って捨てない）'
  );
});

// ---------------------------------------------------------------------------
// V6-6: skill パッケージの定義ファイル（SKILL.md）実在。
//
// V1 が supporting files を許す以上、「定義ファイルが無いパッケージ」はここで明示的に塞ぐ——
// さもないと `Skill.md` のような綴り違いが全検査を素通りし、スキルがロードされないのにエラーも出ない。
// ---------------------------------------------------------------------------

test('V6: supporting files だけで SKILL.md が無い skill パッケージは違反（サイレント不発火の検出）', (t) => {
  const ts = tsFor(import.meta.url, 15);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'broken');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  // 故意の違反注入: 定義ファイルの綴り違い（Skill.md）＋ supporting files のみ。
  writeFileSync(path.join(skillDir, 'Skill.md'), '---\nname: broken\ndescription: x\n---\n本文\n');
  writeFileSync(path.join(skillDir, 'template.md'), '# テンプレート\n');
  writeFileSync(path.join(skillDir, 'examples', 'sample.md'), '# 例\n');

  const r = v6(ts);
  assert.equal(r.ok, false, 'SKILL.md 不在のパッケージを合格にしてはならない');
  assert.ok(
    r.violations.some((v) => v.includes('SKILL.md') && v.includes('broken')),
    `broken/ の定義ファイル不在が検出されること: ${JSON.stringify(r.violations)}`
  );
  assert.ok(r.checked >= 1, '検査した件数が見えること（0件を合格と誤認しない）');

  // 綴りを正せば通る。Windows の FS は大小無視のため、上書きでなく削除してから書く
  // （同じ実体のまま残るとディレクトリエントリ名が Skill.md のままになる）。
  rmSync(path.join(skillDir, 'Skill.md'));
  writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: broken\ndescription: x\n---\n本文\n');
  assert.equal(v6(ts).ok, true, '正しい綴りの SKILL.md を置けば通ること');
});

test('V6: ネストした examples/SKILL.md はパッケージの定義ファイルに数えない（skillPathRole 委譲の確認）', (t) => {
  const ts = tsFor(import.meta.url, 16);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  const skillDir = path.join(skills, 'nested');
  mkdirSync(path.join(skillDir, 'examples'), { recursive: true });
  // supporting file として置かれた例示 SKILL.md。名前だけで拾うと定義ファイル有りに見える。
  writeFileSync(path.join(skillDir, 'examples', 'SKILL.md'), '---\nname: sample\ndescription: 例\n---\n例\n');

  const r = v6(ts);
  assert.equal(r.ok, false, '例示ファイルを定義ファイルと誤認してはならない');
  assert.ok(
    r.violations.some((v) => v.includes('SKILL.md') && v.includes('nested')),
    JSON.stringify(r.violations)
  );
});

// ---------------------------------------------------------------------------
// V6-7: 非管理ファイルへの行番号引用の禁止。
//
// 生成物が対象の README.md などを行番号で引用すると、対象側の編集で黙ってずれ、生成物側には
// ずれを検知する手段が無い——V6-6（サイレント不発火）と同種の「壊れても誰も気づかない」脆さ。
// ---------------------------------------------------------------------------

test('V6 V6-7: 対象プロジェクトの非管理ファイルへの行番号引用は違反（故意の違反注入）', (t) => {
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
  const r = v6(ts);
  assert.equal(r.ok, false, '非管理ファイルへの行番号引用は違反のはず');
  assert.ok(
    r.violations.some((v) => v.includes('README.md') && v.includes('tsod-workflow.md')),
    `README.md への行番号引用が検出されること: ${JSON.stringify(r.violations)}`
  );

  // 是正: 節見出し参照へ書き換えれば通る。
  writeFileSync(
    path.join(rules, 'tsod-workflow.md'),
    '---\npaths: ["**"]\n---\n' +
      'GitHub 側のブランチ保護は使えない（出典: `README.md` の「main への直接 push を防ぐ」節）。\n'
  );
  assert.equal(v6(ts).ok, true, '節見出し参照へ直せば通ること');
});

test('V6 V6-7: 行範囲形式（path:N-M）・ネストしたパス（contracts/README.md）も検出する', (t) => {
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
  const r = v6(ts);
  assert.equal(r.ok, false, 'ネストした非管理パスへの行範囲引用も違反のはず');
  assert.ok(
    r.violations.some((v) => v.includes('contracts/README.md') && v.includes('impact-scope')),
    `contracts/README.md への行範囲引用が検出されること: ${JSON.stringify(r.violations)}`
  );
});

test('V6 V6-7: 生成物同士（管理ファイル間）の行番号参照は誤検出しない', (t) => {
  const ts = tsFor(import.meta.url, 22);
  setup(t, ts);
  const rules = path.join(out(ts), 'generated', '.claude', 'rules');
  mkdirSync(rules, { recursive: true });
  // 生成物同士の行番号参照は正当（同じ run で一括生成されるため相互の行番号がずれる余地がない）。
  writeFileSync(
    path.join(rules, 'cross-ref.md'),
    '---\npaths: ["**"]\n---\n' + '詳細は `.claude/rules/backend.md:12` および `CLAUDE.md:1-10` を参照。\n'
  );
  const r = v6(ts);
  assert.equal(
    r.violations.filter((v) => v.includes('cross-ref.md')).length,
    0,
    '管理ファイル間の行番号参照は違反にならないこと'
  );
  assert.ok(r.checked >= 2, '走査件数が見えること（0件を合格と誤認しない）');
});

test('V6 V6-7: 台帳の逐語コピー（ledger-snapshot.txt）の中身は検査せず、他のファイルは引き続き検出する', (t) => {
  const ts = tsFor(import.meta.url, 23);
  setup(t, ts);
  const gen = path.join(out(ts), 'generated');
  const ledgerDir = path.join(gen, '.claude', 'skills', 'lessons-ledger');
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(path.join(ledgerDir, 'SKILL.md'), '---\nname: lessons-ledger\ndescription: x\n---\n本文\n');
  // 対象の台帳には旧文書名の行番号引用が残りうる。コピーは直せないので違反にしない。
  writeFileSync(
    path.join(ledgerDir, 'ledger-snapshot.txt'),
    '## 2026-01-01 例\n- 何が起きたか: `tsod-design/SKILL.md:12` が古い。\n'
  );
  assert.equal(v6(ts).ok, true, '逐語コピーの行番号引用は違反にならないこと');

  // 同じ記述を生成物が自分で書いたら、従来どおり違反になる（除外はコピーのパスに限る）。
  const rules = path.join(gen, '.claude', 'rules');
  mkdirSync(rules, { recursive: true });
  writeFileSync(
    path.join(rules, 'own.md'),
    '---\npaths: ["**"]\n---\n' + '出典: `tsod-design/SKILL.md:12`。\n'
  );
  const r = v6(ts);
  assert.equal(r.ok, false, '生成物自身の行番号引用は違反のまま');
  assert.ok(r.violations.some((v) => v.includes('own.md')), JSON.stringify(r.violations));
  assert.ok(!r.violations.some((v) => v.includes('ledger-snapshot.txt')), 'コピーは違反に含めない');
});
