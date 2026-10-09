/**
 * canon-d/scripts/deploy.js（工程9 の配置・退避スワップ・artifacts.md §10.3）の統合テスト。
 * greenfield と既存改修(2) の両方で「生成→実配置→ロールバック」を通す。
 * retire/backup は(2)でのみ踏む。post-check 失敗を注入して自動 restore の完全性を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase, listFiles, TMP_CASE_BAK as BAK } from './helpers/fixtures.js';
import { runScript } from './helpers/run-cli.js';
import { moveFileForTest } from './helpers/deploy-ops.js';
import { walkManaged, sha256File } from '../lib/managed-paths.js';
import { deploy, probeMovable } from '../.claude/skills/canon-d/scripts/deploy.js';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** 対象の管理集合を {rel: sha256} で撮る（配置前後の完全一致比較に使う）。 */
function snapshot(target) {
  const m = {};
  for (const rel of walkManaged(target)) m[rel] = sha256File(path.join(target, rel));
  return m;
}

test('deploy: greenfield 配置成功・集合外は不可侵・退避0件なら .bak を作らず案内もしない', (t) => {
  const c = setupTmpCase(t, 'new');
  const srcBefore = sha256File(path.join(c.target, 'src', 'server.js'));
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);
  // 成功時だけ deploy-result.json（配置済みの判定材料）を書く。対象に管理ファイルが無ければ退避は0件。
  const res = readJson(path.join(c.output, 'deploy', 'deploy-result.json'));
  assert.deepEqual([res.status, res.baked, res.bak_exists], ['deployed', 0, false]);
  assert.ok(!existsSync(path.join(c.target, BAK)), '退避0件なのに .bak を作った');
  assert.match(r.stdout, /退避は 0 件で、\.bak は作られていない/);
  assert.doesNotMatch(r.stdout, /から手動 restore/, '存在しない .bak からの restore を案内している');
  assert.ok(existsSync(path.join(c.target, 'CLAUDE.md')));
  assert.ok(existsSync(path.join(c.target, '.claude', 'skills', 'todo-helper', 'SKILL.md')));
  // 配置物は output とバイト同一
  assert.equal(
    sha256File(path.join(c.target, 'CLAUDE.md')),
    sha256File(path.join(c.output, 'generated', 'CLAUDE.md'))
  );
  // 集合外（プロジェクトソース）は不可侵
  assert.equal(sha256File(path.join(c.target, 'src', 'server.js')), srcBefore);
});

test('deploy: 既存改修 — retire 消去・keep 非退行・new 追加・merge・集合外不可侵・.bak 退避・同じ ts の2回目は拒否', (t) => {
  const c = setupTmpCase(t, 'existing');
  const keptBefore = sha256File(path.join(c.target, '.claude/skills/kept-skill/SKILL.md'));
  const ciBefore = sha256File(path.join(c.target, '.github/workflows/ci.yml'));
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);

  // retire は対象から消える（削除でなく退避）
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/legacy-skill/SKILL.md')));
  assert.ok(
    existsSync(path.join(c.target, BAK, '.claude/skills/legacy-skill/SKILL.md')),
    'legacy は .bak へ退避されていること'
  );
  // keep は非退行（sha256 同一）
  assert.equal(sha256File(path.join(c.target, '.claude/skills/kept-skill/SKILL.md')), keptBefore);
  // new は追加
  assert.ok(existsSync(path.join(c.target, '.claude/skills/new-skill/SKILL.md')));
  // CLAUDE.md は modify（output と一致）
  assert.equal(
    sha256File(path.join(c.target, 'CLAUDE.md')),
    sha256File(path.join(c.output, 'generated/CLAUDE.md'))
  );
  // 集合外は不可侵
  assert.equal(sha256File(path.join(c.target, '.github/workflows/ci.yml')), ciBefore);
  assert.ok(existsSync(path.join(c.target, 'CODEOWNERS')));
  // merge 元は retired 区分で退避され（削除でなく .bak へ）、統合先 merged が配置される
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-a/SKILL.md')));
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-b/SKILL.md')));
  assert.ok(existsSync(path.join(c.target, BAK, '.claude/skills/merge-a/SKILL.md')), 'merge-a は退避');
  assert.ok(existsSync(path.join(c.target, '.claude/skills/merged/SKILL.md')));
  // deploy-result.json は .bak の実在と退避件数を返す
  const res = readJson(path.join(c.output, 'deploy', 'deploy-result.json'));
  assert.equal(res.bak_exists, true);
  assert.ok(res.baked > 0);

  // 同じ ts で2回目を配置すると拒否され、1回目の退避（元ファイル）が残る
  const bakFile = path.join(c.target, BAK, '.claude/skills/legacy-skill/SKILL.md');
  const firstBak = readFileSync(bakFile, 'utf8');
  const second = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(second.code, 1, second.stdout + second.stderr);
  assert.equal(readFileSync(bakFile, 'utf8'), firstBak, '1回目の退避（元ファイル）が上書きされた');
});

test('deploy: --confirm 無しは dry-run（対象不変・退避なし）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /dry-run/);
  assert.deepEqual(snapshot(c.target), before, '配置していないこと');
  assert.ok(!existsSync(path.join(c.target, BAK)), '退避もしていないこと');
});

test('deploy: uncaptured があると配置を拒否（対象不変・P5 の機械的裏付け）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const surprise = path.join(c.target, '.claude', 'skills', 'surprise', 'SKILL.md');
  mkdirSync(path.dirname(surprise), { recursive: true });
  writeFileSync(surprise, '---\nname: surprise\ndescription: x\n---\n本文\n');
  const before = snapshot(c.target);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1, 'uncaptured は配置拒否');
  assert.match(r.stderr, /拒否/);
  assert.deepEqual(snapshot(c.target), before, '拒否時は対象不変');
  assert.ok(!existsSync(path.join(c.target, BAK)));
});

test('deploy: 配置失敗で自動 restore（配置前と完全一致・.bak 掃除）', (t) => {
  const c = setupTmpCase(t, 'existing');
  // output に実体の無い幽霊エントリを混ぜて step2 を失敗させる（post-check 前に throw）。
  appendFileSync(
    path.join(c.output, 'deploy', 'managed-paths.list'),
    '.claude/skills/ghost/SKILL.md\n'
  );
  const before = snapshot(c.target);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1, '失敗は非ゼロ');
  assert.match(r.stderr, /rolled-back|復帰/);
  assert.deepEqual(snapshot(c.target), before, 'restore で配置前と完全一致');
  assert.ok(!existsSync(path.join(c.target, BAK)), 'restore 後は .bak を掃除して配置前状態へ');
  // 失敗時は deploy-attempt.json だけを書き、配置済みの印（deploy-result.json）は書かない
  assert.ok(!existsSync(path.join(c.output, 'deploy', 'deploy-result.json')), '失敗したのに配置済みの印がある');
  assert.equal(readJson(path.join(c.output, 'deploy', 'deploy-attempt.json')).status, 'rolled-back');
});


// ---- EBUSY で半壊・存在しない .bak の案内 ----

const ebusy = () => Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
const leftovers = (target) => listFiles(target).filter((f) => f.endsWith('.canon-probe'));

test('deploy 事前検査（EBUSY 注入）: 動かせないファイルが1件でもあれば何も変えずに拒否する', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const mv = (src, dst) => {
    if (src.endsWith('CLAUDE.md') || dst.endsWith('CLAUDE.md' + '.canon-probe')) throw ebusy();
    return moveFileForTest(src, dst);
  };
  const r = deploy(c.output, c.target, { confirm: true, moveFile: mv });
  assert.equal(r.status, 'refused');
  assert.equal(r.reason, 'unmovable');
  assert.deepEqual(r.unmovable.map((u) => [u.rel, u.code]), [['CLAUDE.md', 'EBUSY']]);
  assert.deepEqual(snapshot(c.target), before, '拒否したのに対象を変えている');
  assert.ok(!existsSync(path.join(c.target, BAK)), '拒否したのに .bak を作っている');
  assert.deepEqual(leftovers(c.target), [], '事前検査の一時ファイルが残っている');
});

test('deploy step1 の途中失敗（EBUSY 注入・事前検査をすり抜けた場合）: 未退避の元ファイルを消さずに配置前へ復元する', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const bakRoot = path.join(c.target, BAK);
  // 事前検査（.canon-probe への rename）は通し、実際の退避（.bak 配下への rename）だけ最初のファイルで失敗させる。
  let failed = 0;
  const mv = (src, dst) => {
    if (dst.startsWith(bakRoot) && failed === 0) {
      failed++;
      throw ebusy();
    }
    return moveFileForTest(src, dst);
  };
  const r = deploy(c.output, c.target, { confirm: true, moveFile: mv });
  assert.equal(failed, 1, '前提: step1 の退避を実際に失敗させた');
  assert.equal(r.status, 'rolled-back');
  assert.equal(r.state, 'restored');
  // restore が managed-paths.list の全エントリを消してから退避物を戻すと、まだ退避していない
  // 元ファイル（keep 等・list に載っている）まで消える。
  assert.deepEqual(snapshot(c.target), before, '未退避の元ファイルが失われた（または配置前と一致しない）');
  assert.ok(!existsSync(bakRoot), '復元後は .bak を掃除する');
});

test('deploy step1 の後半で失敗: 退避済みの分は戻り、配置前と完全一致する', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const bakRoot = path.join(c.target, BAK);
  let n = 0;
  const mv = (src, dst) => {
    if (dst.startsWith(bakRoot) && ++n === 2) throw ebusy(); // 2件目の退避で失敗（1件は退避済み）
    return moveFileForTest(src, dst);
  };
  const r = deploy(c.output, c.target, { confirm: true, moveFile: mv });
  assert.equal(r.status, 'rolled-back');
  assert.equal(r.state, 'restored');
  assert.deepEqual(snapshot(c.target), before, '退避済みの1件が戻っていない');
});

test('deploy 復元の失敗: 戻せないものがあれば .bak を残し、state=partial と問題を返す（黙って掃除しない）', (t) => {
  const c = setupTmpCase(t, 'existing');
  appendFileSync(path.join(c.output, 'deploy', 'managed-paths.list'), '.claude/skills/ghost/SKILL.md\n'); // step2 を失敗させる
  const bakRoot = path.join(c.target, BAK);
  const mv = (src, dst) => {
    if (src.startsWith(bakRoot) && dst.endsWith('CLAUDE.md')) throw ebusy(); // 戻すときだけ CLAUDE.md が失敗
    return moveFileForTest(src, dst);
  };
  const r = deploy(c.output, c.target, { confirm: true, moveFile: mv });
  assert.equal(r.status, 'rolled-back');
  assert.equal(r.state, 'partial');
  assert.match(r.restoreProblems.join('\n'), /CLAUDE\.md/);
  assert.ok(existsSync(path.join(bakRoot, 'CLAUDE.md')), '戻せなかった退避物を .bak に残している');
});

test('probeMovable: 動かせるものは元に戻して何も変えない', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  assert.deepEqual(probeMovable(c.target, Object.keys(before)), []);
  assert.deepEqual(snapshot(c.target), before);
  assert.deepEqual(leftovers(c.target), []);
});

test('pre-deploy-report の退避予定件数は deploy の実際の退避件数と一致する（P5 で .bak を推測で案内しない）', (t) => {
  for (const scenario of ['existing', 'new']) {
    const c = setupTmpCase(t, scenario);
    const report = runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]);
    const m = /退避予定: (\d+) 件/.exec(report.stdout);
    assert.ok(m, `${scenario}: 退避予定の行が無い\n${report.stdout}`);
    assert.match(report.stdout, /配置予定: \d+ 件/);
    const r = deploy(c.output, c.target, { confirm: true });
    assert.equal(r.status, 'deployed', scenario);
    assert.equal(Number(m[1]), r.baked, `${scenario}: 予定 ${m[1]} 件と実際の退避 ${r.baked} 件が食い違う`);
    assert.equal(r.bakExists, r.baked > 0, `${scenario}: .bak の実在と退避件数が食い違う`);
  }
});

test('deploy: managed-paths.list に `..` で集合外へ出る行があれば、配置前に拒否する（対象は無傷）', (t) => {
  const c = setupTmpCase(t, 'new');
  writeFileSync(path.join(c.output, 'generated', 'x'), 'escaped\n');
  writeFileSync(path.join(c.output, 'deploy', 'managed-paths.list'), 'CLAUDE.md\n.claude/rules/../../x\n');
  const before = snapshot(c.target);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /管理パス集合/);
  assert.ok(!existsSync(path.join(c.target, 'x')), '集合外へ書かれた');
  assert.deepEqual(snapshot(c.target), before);
  assert.ok(!existsSync(path.join(c.target, BAK)));
});

test('deploy: 退避先 .bak.<ts> が既にあれば step0 で拒否し、既存の退避を消さない', (t) => {
  const c = setupTmpCase(t, 'existing');
  const sentinel = path.join(c.target, BAK, '.claude/skills/legacy-skill/SKILL.md');
  mkdirSync(path.dirname(sentinel), { recursive: true });
  writeFileSync(sentinel, '前回の退避（元ファイル）\n');
  const before = snapshot(c.target);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /退避先/);
  assert.equal(readFileSync(sentinel, 'utf8'), '前回の退避（元ファイル）\n');
  assert.deepEqual(snapshot(c.target), before, '対象は一切変更されない');
});

test('deploy: 退避先が既にある状態で配置が失敗しても restore は既存の退避を消さない（step0 で止まる）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const sentinel = path.join(c.target, BAK, 'sentinel.txt');
  mkdirSync(path.dirname(sentinel), { recursive: true });
  writeFileSync(sentinel, 'keep me\n');
  const failing = () => {
    throw Object.assign(new Error('boom'), { code: 'EIO' });
  };
  const r = deploy(c.output, c.target, { confirm: true, moveFile: failing });
  assert.equal(r.status, 'refused');
  assert.equal(r.reason, 'bak-exists');
  assert.equal(readFileSync(sentinel, 'utf8'), 'keep me\n');
});

// ---------------------------------------------------------------------------
// 承認の照合（--confirm は P1〜P5 が有効なときだけ配置する）
// ---------------------------------------------------------------------------

test('deploy --confirm: 承認が無ければ拒否し、対象は無変更（dry-run は照合しない）', (t) => {
  const c = setupTmpCase(t, 'existing', undefined, { approved: false });
  const before = snapshot(c.target);
  const dry = runScript('canon-d', 'deploy.js', [c.output, c.target]);
  assert.equal(dry.code, 0, dry.stderr);
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /承認/);
  assert.deepEqual(snapshot(c.target), before);
  assert.ok(!existsSync(path.join(c.target, BAK)));
});

test('deploy --confirm: 承認後に generated/ を書き換えると P4 不一致で拒否する（違反の注入）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  appendFileSync(path.join(c.output, 'generated', 'CLAUDE.md'), '\n承認後の直接編集\n');
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /P4: mismatch/);
  assert.deepEqual(snapshot(c.target), before);
});

test('deploy --confirm: pre-deploy-report が承認後に変わると P5 不一致で拒否する', (t) => {
  const c = setupTmpCase(t, 'existing');
  appendFileSync(path.join(c.output, 'deploy', 'pre-deploy-report.txt'), 'x\n');
  const r = runScript('canon-d', 'deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /P5: mismatch/);
});

test('pre-deploy-report は generated/ のハッシュを書き、中身が変わるとハッシュ（＝P5 の対象）が変わる', (t) => {
  const c = setupTmpCase(t, 'new', undefined, { approved: false });
  const run = () => runScript('canon-d', 'pre-deploy-check.js', [c.output, c.target]).stdout;
  const a = run();
  assert.match(a, /generated\/ のハッシュ: [0-9a-f]{64}/);
  appendFileSync(path.join(c.output, 'generated', 'CLAUDE.md'), '\n変更\n');
  assert.notEqual(run(), a);
});
