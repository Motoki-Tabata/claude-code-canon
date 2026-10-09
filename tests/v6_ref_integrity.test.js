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
import { workDir as work, outputDir as out, genDir } from './helpers/paths.js';
import { cleanupTs, writeAgent as writeAgentFile } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

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

test('V6 V6-7: design-map がバイト単位のコピーと宣言したファイル（keep・参照元からのコピー）の中身は検査せず、他のファイルは引き続き検出する', (t) => {
  const ts = tsFor(import.meta.url, 23);
  setup(t, ts);
  const gen = path.join(out(ts), 'generated');
  const skillDir = path.join(gen, '.claude', 'skills', 'ledger');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: ledger\ndescription: x\n---\n本文\n');
  // 原本には対象側の行番号引用が残りうる。コピーは直せないので、宣言されていれば違反にしない。
  const cite = '- 何が起きたか: `tsod-design/SKILL.md:12` が古い。\n';
  writeFileSync(path.join(skillDir, 'kept.txt'), cite);
  writeFileSync(path.join(skillDir, 'copied.txt'), cite);
  writeFileSync(path.join(skillDir, 'undeclared.txt'), cite);
  writeFileSync(
    path.join(out(ts), 'design-map.md'),
    '## 既存判定\n\n```yaml\nexisting_disposition:\n  - path: .claude/skills/ledger/kept.txt\n    disposition: keep\n```\n\n' +
      '## 参照元からのコピー\n\n- `/abs/ref/notes.txt` → `.claude/skills/ledger/copied.txt`\n'
  );
  const r = v6(ts);
  assert.ok(!r.violations.some((v) => v.includes('kept.txt')), `keep のコピーは違反に含めない: ${JSON.stringify(r.violations)}`);
  assert.ok(!r.violations.some((v) => v.includes('copied.txt')), `参照元からのコピーは違反に含めない: ${JSON.stringify(r.violations)}`);
  // 宣言の無いファイルは、同じ記述でも違反のまま（除外は宣言されたパスに限る）。
  assert.ok(r.violations.some((v) => v.includes('undeclared.txt')), JSON.stringify(r.violations));
});

// ---------------------------------------------------------------------------
// 委譲条件の日本語表記・basename 解決・未解決の集約（P4 の warning のノイズを減らす）
// ---------------------------------------------------------------------------

const writeAgent = (ts, name, description) => writeAgentFile(genDir(ts), name, { description, tools: 'Read' });

test('V6 委譲条件: 日本語の「委譲される」「委譲する」は warning にならない。条件の無い description は warning になる（故意の違反）', (t) => {
  const ts = tsFor(import.meta.url, 31);
  setup(t, ts);
  writeAgent(ts, 'ja-passive', 'API の契約を書く。実装の前に契約が要るときに委譲される。');
  writeAgent(ts, 'ja-active', '調査を行う。広い探索が要るときは委譲する。');
  writeAgent(ts, 'en', 'Writes contracts. Delegate when a contract is needed.');
  writeAgent(ts, 'none', 'API の契約を書く。');
  const r = v6(ts);
  assert.equal(r.ok, true);
  const w = r.warnings.filter((v) => v.includes('委譲トリガー'));
  assert.equal(w.length, 1, `warning は条件の無い1件だけ: ${w.join('\n')}`);
  assert.ok(w[0].includes('none'));
});

test('V6 Tier B: パスを含まないファイル名は generated/ 全体の basename 一致で解決する。パス付きは解決しない', (t) => {
  const ts = tsFor(import.meta.url, 32);
  setup(t, ts);
  const skills = path.join(out(ts), 'generated', '.claude', 'skills');
  mkdirSync(path.join(skills, 'demo'), { recursive: true });
  mkdirSync(path.join(skills, 'other', 'scripts'), { recursive: true });
  writeFileSync(path.join(skills, 'other', 'SKILL.md'), '---\nname: other\ndescription: x\n---\n本文\n');
  writeFileSync(path.join(skills, 'other', 'scripts', 'check.mjs'), 'export {};\n');
  writeFileSync(
    path.join(skills, 'demo', 'SKILL.md'),
    '---\nname: demo\ndescription: x\n---\n`check.mjs` を実行する。`missing.mjs` は無い。`scripts/ghost.mjs` も無い。\n'
  );
  const r = v6(ts);
  assert.equal(r.ok, true);
  const w = r.warnings.filter((v) => v.includes('demo'));
  assert.equal(w.length, 1);
  assert.ok(!w[0].includes('"check.mjs"'), 'basename で解決できたトークンは載らない');
  assert.ok(w[0].includes('"missing.mjs"') && w[0].includes('"scripts/ghost.mjs"'));
  assert.match(w[0], /2件/);
});

test('V6 Tier B: 未解決のトークンは1ファイル1件にまとめ、件数と代表例（5件）を載せる', (t) => {
  const ts = tsFor(import.meta.url, 33);
  setup(t, ts);
  const skillDir = path.join(out(ts), 'generated', '.claude', 'skills', 'many');
  mkdirSync(skillDir, { recursive: true });
  const toks = Array.from({ length: 8 }, (_, i) => `\`lib/m${i}.js\``).join('・');
  writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: many\ndescription: x\n---\n${toks}\n`);
  const w = v6(ts).warnings.filter((v) => v.includes('many'));
  assert.equal(w.length, 1, '8トークンでも warning は1件');
  assert.match(w[0], /8件/);
  assert.ok(w[0].includes('"lib/m0.js"') && w[0].includes('"lib/m4.js"'));
  assert.ok(!w[0].includes('"lib/m5.js"'), '代表例は先頭の5件');
  assert.match(w[0], /ほか3件/);
});

test('V6 V-skills-18: SKILL.md の Markdown 相対リンクの参照先が無ければ違反、あれば通る（故意の違反注入）', (t) => {
  const ts = tsFor(import.meta.url, 34);
  setup(t, ts);
  const skillDir = path.join(out(ts), 'generated', '.claude', 'skills', 'linked');
  mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  writeFileSync(path.join(skillDir, 'references', 'guide.md'), '# guide\n');
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: linked\ndescription: x\n---\n' +
      '詳細は [ガイド](./references/guide.md#使い方) を、書式は [書式](references/format.md) を読む。\n'
  );
  const r = v6(ts);
  assert.ok(r.violations.some((v) => v.includes('references/format.md')), JSON.stringify(r.violations));
  assert.ok(!r.violations.some((v) => v.includes('references/guide.md')), '実在するリンク（anchor 付き）は通す');
});

test('V6 V-skills-18: コードフェンスの中のリンク・URL・anchor だけのリンクは検査しない', (t) => {
  const ts = tsFor(import.meta.url, 35);
  setup(t, ts);
  const skillDir = path.join(out(ts), 'generated', '.claude', 'skills', 'fenced');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: fenced\ndescription: x\n---\n' +
      '[公式](https://code.claude.com/docs/en/skills.md)・[節](#手順)・[メール](mailto:a@example.com)\n' +
      '```markdown\n[例](./example-only.md)\n```\n'
  );
  const r = v6(ts);
  assert.deepEqual(r.violations.filter((v) => v.includes('fenced/SKILL.md')), []);
});
