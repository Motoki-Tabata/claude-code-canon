/**
 * G1（工程順・状態）と G7（参照整合）の回帰テスト。
 *
 * 実 work/・output/ を汚さないよう、一意な <ts> を使い、各テストで自分の分だけ掃除する。
 * （既知のレース: lib/run.js は CANON_ROOT 相対で動くため、テスト間で <ts> を分ける）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { checkG1 } from '../gates/g1_stage_order.js';
import { checkG7 } from '../gates/g7_ref_integrity.js';
import { ROOT } from './helpers/paths.js';
import { cleanupTs } from './helpers/run-state.js';
import { tsFor } from './helpers/ts.js';

const work = (ts) => path.join(ROOT, 'work', ts);
const out = (ts) => path.join(ROOT, 'output', ts);

function setup(t, ts) {
  cleanupTs(t, ts);
  mkdirSync(path.join(work(ts), '.requests'), { recursive: true });
  mkdirSync(path.join(out(ts), '.gate', 'approvals'), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'agents'), { recursive: true });
  mkdirSync(path.join(out(ts), 'generated', '.claude', 'skills'), { recursive: true });
  // 系統A成果物（investigator.md の集約・永続化契約）。investigation ステージ以外のテストにも
  // 無害に存在させ、既存の投入手順を崩さない。
  writeFileSync(path.join(work(ts), 'existing_customizations.md'), '## サマリ\n既存カスタマイズなし。\n');
}

test('G1 design ステージ: spec.approved が無ければ違反、有れば通過', (t) => {
  const ts = tsFor(import.meta.url, 1);
  setup(t, ts);
  assert.equal(checkG1({ ts, stage: 'design' }).ok, false, 'spec 未承認で design は通ってはならない');
  // 実際の鋳造経路（tools/approve.js）を使う。G1 と approve.js が承認サイドカーの
  // フォーマット（JSON・approved_by 必須）で一致していることも同時に検証する。
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'approve.js'), ts, 'spec', '--approved-by=test'], {
    encoding: 'utf8',
  });
  assert.equal(checkG1({ ts, stage: 'design' }).ok, true, 'spec 承認済みなら design は通る');
});

test('G1 investigation: requirements.md が無ければ focused 空欄でも正当（調査1段目）', (t) => {
  const ts = tsFor(import.meta.url, 2);
  setup(t, ts);
  // project_profile.md はあるが focused 節なし、requirements.md なし → 調査1段目として正当
  writeFileSync(path.join(work(ts), 'project_profile.md'), '## profile\nlanguages: js\n');
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, true, '要件確定前は focused 空でも通る');
});

test('G1 investigation: existing_customizations.md が無ければ調査1段目でも違反（investigator が配下 spawn 直後に turn を終える failure mode の検出・実測 run 20260903_091044）', (t) => {
  const ts = tsFor(import.meta.url, 20);
  cleanupTs(t, ts);
  mkdirSync(path.join(work(ts), '.requests'), { recursive: true });
  // setup() は使わず existing_customizations.md を意図的に欠かせる（故意の違反注入）。
  writeFileSync(path.join(work(ts), 'project_profile.md'), '## profile\nlanguages: js\n');
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, false, 'existing_customizations.md 不在は project_profile.md の有無に関わらず違反');
  assert.ok(
    r.violations.some((v) => v.message.includes('existing_customizations.md')),
    JSON.stringify(r.violations)
  );
});

test('G1 investigation: existing_customizations.md と project_profile.md が両方無ければ両方が違反として報告される（片方しか報告されない事態の回帰ロック）', (t) => {
  const ts = tsFor(import.meta.url, 21);
  cleanupTs(t, ts);
  mkdirSync(path.join(work(ts), '.requests'), { recursive: true });
  // 何も書かない（両方欠落）。
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, false);
  assert.ok(
    r.violations.some((v) => v.message.includes('existing_customizations.md')),
    'existing_customizations.md の違反が project_profile.md の早期 return に隠されない: ' +
      JSON.stringify(r.violations)
  );
  assert.ok(
    r.violations.some((v) => v.message.includes('project_profile.md')),
    JSON.stringify(r.violations)
  );
});

test('G1 investigation: requirements.md が有るのに focused 節が無ければ違反（調査3段目）', (t) => {
  const ts = tsFor(import.meta.url, 3);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'project_profile.md'), '## profile\nlanguages: js\n');
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, false, '要件確定後に focused 節が無いのは違反（focused 空欄違反）');
});

// --- F2: evidence_paths の行番号 suffix 剥離（詳細設計書 §6.2 書式契約） ---

test('F2 G1 investigation: evidence_paths の行番号 suffix（単一・範囲）を剥離して実在照合する', (t) => {
  const ts = tsFor(import.meta.url, 8);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [docs/L3_AGENTS.md:1]',
      '    summary: s1',
      '  - topic: t2',
      '    evidence_paths: [docs/L3_AGENTS.md:1-20]',
      '    summary: s2',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('F2 G1 investigation: 実在しないパス＋行番号 suffix は剥離後も違反のまま（検出器の生存証明・L002）', (t) => {
  const ts = tsFor(import.meta.url, 9);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [docs/NOT_EXIST.md:12]',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, false, '剥離しても実在しないパスは違反のまま（vacuous pass 防止）');
});

test('F2 G1 investigation: bare path（suffix 無し）の従来挙動は不変（回帰）', (t) => {
  const ts = tsFor(import.meta.url, 10);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [docs/L3_AGENTS.md]',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

// --- L024: 値の語彙契約（evidence_paths は裸パスのみ・バッククォート囲みは剥がされない） ---

test('L024 G1 investigation: バッククォート囲みの evidence_paths は幻覚扱いで違反（値の語彙契約の根拠）', (t) => {
  const ts = tsFor(import.meta.url, 14);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [`docs/L3_AGENTS.md:1-20`]',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(
    r.ok,
    false,
    'バッククォート囲みは剥がされず existsSync が失敗する——ワーカー定義の値語彙契約が' +
      '禁じる書き方（.claude/agents/existing-customization-analyzer 等）が実際に全滅することの根拠'
  );
});

// --- L024追補: evidence_paths の角括弧有無（ライブ /canon run 20260903_091044 の再現・
//     project-profiler.md／existing-customization-analyzer.md の値の語彙契約是正の根拠） ---

test('L024 G1 investigation: 角括弧ありの複数 evidence_paths は各項目に分割され実在照合を通る', (t) => {
  const ts = tsFor(import.meta.url, 17);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [docs/L3_AGENTS.md:48, docs/L2_SKILLS.md:105]',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('L024 G1 investigation: 角括弧なしのカンマ区切り evidence_paths は分割されず行全体が1項目となり違反（ライブ事故の再現）', (t) => {
  const ts = tsFor(import.meta.url, 18);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: docs/L3_AGENTS.md:48, docs/L2_SKILLS.md:105',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(
    r.ok,
    false,
    '各パス単体は実在するのに、角括弧が無いため分割されず行全体が1個の値として existsSync に' +
      '渡り違反になる（「パスが無いから落ちた」との交絡を排除した検証）'
  );
  assert.ok(
    r.violations.some((v) => v.message.includes('docs/L3_AGENTS.md:48, docs/L2_SKILLS.md:105')),
    '違反メッセージが「1項目として」行全体を含むこと——分解されない実挙動の固定: ' +
      JSON.stringify(r.violations)
  );
});

test('L024 G1 investigation: 角括弧の内側ではカンマが項目区切りとして働き、行番号側だけが単独の存在しないパスとして違反になる', (t) => {
  const ts = tsFor(import.meta.url, 19);
  setup(t, ts);
  writeFileSync(path.join(work(ts), 'requirements.md'), '## 確定要件\n- id: R1\n');
  writeFileSync(
    path.join(work(ts), 'project_profile.md'),
    [
      '## focused',
      'requirement_ref: R1',
      'findings:',
      '  - topic: t1',
      '    evidence_paths: [docs/L3_AGENTS.md:1,20]',
      '    summary: s1',
      '',
    ].join('\n')
  );
  writeFileSync(path.join(work(ts), 'target.txt'), ROOT.replace(/\\/g, '/') + '\n');
  const r = checkG1({ ts, stage: 'investigation' });
  assert.equal(r.ok, false, JSON.stringify(r.violations));
  assert.ok(
    r.violations.some((v) => v.message.includes('"20"')),
    '角括弧の内側では `path:1,20` が `path:1` と `20` の2項目に分解され、`20` が単独の' +
      '存在しないパスとして違反になること: ' + JSON.stringify(r.violations)
  );
});

test('G1 spec: spec.md が無ければ違反', (t) => {
  const ts = tsFor(import.meta.url, 4);
  setup(t, ts);
  assert.equal(checkG1({ ts, stage: 'spec' }).ok, false, 'spec.md 不在は違反');
});

test('G1 未知ステージは違反（vacuous pass 防止）', (t) => {
  const ts = tsFor(import.meta.url, 5);
  setup(t, ts);
  assert.equal(checkG1({ ts, stage: 'bogus-stage' }).ok, false, '未知ステージを黙って通してはならない');
});

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
