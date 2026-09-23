/**
 * deploy/deploy.js（工程10②・退避スワップ・§10.2）の統合テスト。
 * greenfield と既存改修(2) の両方で「生成→実配置→ロールバック」を通す。
 * retire/backup は(2)でのみ踏む。post-check 失敗を注入して自動 restore の完全性を固定する。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setupTmpCase } from './helpers/fixtures.js';
import { runDeployCli } from './helpers/hook.js';
import { walkManaged, sha256File } from '../gates/lib/managed-paths.js';

const BAK = '.claude-canon.bak.20260722_000000';

/** 対象の管理集合を {rel: sha256} で撮る（配置前後の完全一致比較に使う）。 */
function snapshot(target) {
  const m = {};
  for (const rel of walkManaged(target)) m[rel] = sha256File(path.join(target, rel));
  return m;
}

test('deploy: greenfield 配置成功・集合外は不可侵', (t) => {
  const c = setupTmpCase(t, 'new');
  const srcBefore = sha256File(path.join(c.target, 'src', 'server.js'));
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);
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

test('deploy: 既存改修 — retire 消去・keep 非退行・new 追加・集合外不可侵・.bak 退避', (t) => {
  const c = setupTmpCase(t, 'existing');
  const keptBefore = sha256File(path.join(c.target, '.claude/skills/kept-skill/SKILL.md'));
  const ciBefore = sha256File(path.join(c.target, '.github/workflows/ci.yml'));
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
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
});

test('deploy: --confirm 無しは dry-run（対象不変・退避なし）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /dry-run/);
  assert.deepEqual(snapshot(c.target), before, '配置していないこと');
  assert.ok(!existsSync(path.join(c.target, BAK)), '退避もしていないこと');
});

test('deploy: uncaptured があると配置を拒否（対象不変・P8 機械化）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const surprise = path.join(c.target, '.claude', 'skills', 'surprise', 'SKILL.md');
  mkdirSync(path.dirname(surprise), { recursive: true });
  writeFileSync(surprise, '---\nname: surprise\ndescription: x\n---\n本文\n');
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 2, 'uncaptured は配置拒否');
  assert.match(r.stderr, /拒否/);
  assert.deepEqual(snapshot(c.target), before, '拒否時は対象不変');
  assert.ok(!existsSync(path.join(c.target, BAK)));
});

test('deploy: 配置失敗で自動 restore（配置前と完全一致・.bak 掃除）', (t) => {
  const c = setupTmpCase(t, 'existing');
  // output に実体の無い幽霊エントリを混ぜて step2 を失敗させる（post-check 前に throw）。
  appendFileSync(
    path.join(c.output, '.deploy', 'managed-paths.list'),
    '.claude/skills/ghost/SKILL.md\n'
  );
  const before = snapshot(c.target);
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 2, '失敗は非ゼロ');
  assert.match(r.stderr, /rolled-back|復帰/);
  assert.deepEqual(snapshot(c.target), before, 'restore で配置前と完全一致');
  assert.ok(!existsSync(path.join(c.target, BAK)), 'restore 後は .bak を掃除して配置前状態へ');
});

test('deploy: merge 元は retired 区分で退避され merged が配置される（統廃合）', (t) => {
  const c = setupTmpCase(t, 'existing');
  const r = runDeployCli('deploy.js', [c.output, c.target, '--confirm']);
  assert.equal(r.code, 0, r.stderr);
  // merge 元は対象から消える（削除でなく .bak へ退避）
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-a/SKILL.md')));
  assert.ok(!existsSync(path.join(c.target, '.claude/skills/merge-b/SKILL.md')));
  assert.ok(existsSync(path.join(c.target, BAK, '.claude/skills/merge-a/SKILL.md')), 'merge-a は退避');
  // 統合先 merged が配置される
  assert.ok(existsSync(path.join(c.target, '.claude/skills/merged/SKILL.md')));
});

// ---- R-S1-1（EBUSY で半壊）・S3-6（存在しない .bak の案内）----

import { readdirSync, readFileSync } from 'node:fs';
import { deploy, probeMovable } from '../deploy/deploy.js';
import { moveFileForTest } from './helpers/deploy-ops.js';

const ebusy = () => Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
const leftovers = (target) => walkAllFiles(target).filter((f) => f.endsWith('.canon-probe'));

function walkAllFiles(root) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) walk(p);
      else out.push(path.relative(root, p).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out;
}

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
  // 旧実装の restore は managed-paths.list の全エントリを rmSync してから退避物を戻したため、
  // まだ退避していない元ファイル（keep 等・list に載っている）を消していた。
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
  appendFileSync(path.join(c.output, '.deploy', 'managed-paths.list'), '.claude/skills/ghost/SKILL.md\n'); // step2 を失敗させる
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

test('S3-6: 対象に管理ファイルが無ければ退避は0件で .bak は作られない（実在しない .bak を案内しない）', (t) => {
  const c = setupTmpCase(t, 'new');
  const r = deploy(c.output, c.target, { confirm: true });
  assert.equal(r.status, 'deployed');
  assert.equal(r.baked, 0);
  assert.equal(r.bakExists, false);
  const cli = setupTmpCase(t, 'new');
  const out = runDeployCli('deploy.js', [cli.output, cli.target, '--confirm']);
  assert.equal(out.code, 0, out.stderr);
  assert.match(out.stdout, /退避は 0 件で、\.bak は作られていない/);
  assert.doesNotMatch(out.stdout, /から手動 restore/, '存在しない .bak からの restore を案内している');
});

test('S3-6: 既存改修の成功は .bak の実在と退避件数を返す', (t) => {
  const c = setupTmpCase(t, 'existing');
  const r = deploy(c.output, c.target, { confirm: true });
  assert.equal(r.status, 'deployed');
  assert.equal(r.bakExists, true);
  assert.ok(r.baked > 0);
});

test('deploy-result.json は成功時だけ書かれ（resume の配置済み判定）、失敗時は deploy-attempt.json だけ', (t) => {
  const ok = setupTmpCase(t, 'new');
  assert.equal(runDeployCli('deploy.js', [ok.output, ok.target, '--confirm']).code, 0);
  const res = JSON.parse(readFileSync(path.join(ok.output, '.deploy', 'deploy-result.json'), 'utf8'));
  assert.deepEqual([res.status, res.baked, res.bak_exists], ['deployed', 0, false]);

  const ng = setupTmpCase(t, 'existing');
  appendFileSync(path.join(ng.output, '.deploy', 'managed-paths.list'), '.claude/skills/ghost/SKILL.md\n');
  assert.equal(runDeployCli('deploy.js', [ng.output, ng.target, '--confirm']).code, 2);
  assert.ok(!existsSync(path.join(ng.output, '.deploy', 'deploy-result.json')), '失敗したのに配置済みの印がある');
  assert.equal(JSON.parse(readFileSync(path.join(ng.output, '.deploy', 'deploy-attempt.json'), 'utf8')).status, 'rolled-back');
});
