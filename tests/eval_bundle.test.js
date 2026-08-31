/**
 * eval/bundle.js（§16.3）の回帰テスト。
 *
 * 最重要は **宣言除去規約**の固定である。design-map の keep レコードには designer 自身の
 * 主張（keep_conditions の boolean と rationale）が書かれており、これを judge に渡すと
 * judge は判定対象自身の主張に自己一致して常に clean と答える＝検査が恒真になる
 * （G6 の experimental 開示検査の恒真バグと同型）。バンドルに宣言が漏れていないことを
 * 「実際のコーパス入力」に対して assert し、将来の改変で漏れたら落ちるようにする。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { buildKeepReviewBundles, collectKeepReviewCases, caseIdFor, buildAxisBundle, AXES_4 } from '../eval/bundle.js';
import { ROOT } from './helpers/paths.js';
import { tsFor } from './helpers/ts.js';

const CORPUS = path.join(ROOT, 'fixtures', 'eval-corpus', 'keep-review', 'cases');
const AXIS_CORPUS = path.join(ROOT, 'fixtures', 'eval-corpus');
// write:false・roots は常にフィクスチャ配下を指すため、この ts は実 work/output に
// 一切触れない飾り値（バンドル本文に埋め込まれるだけ）。
const TS = tsFor(import.meta.url, 0);

function build(caseName) {
  const dir = path.join(CORPUS, caseName);
  return buildKeepReviewBundles({
    ts: TS,
    write: false,
    roots: { outputDir: dir, workDir: dir, targetRoot: path.join(dir, 'target') },
  });
}

test('keep レコードから C2/C4 のケースを立てる', () => {
  const { cases } = build('c2-duplicate');
  assert.equal(cases.length, 1);
  assert.equal(cases[0].disposition, 'keep');
  assert.deepEqual(cases[0].conditions, ['C2', 'C4']);
});

test('merge レコードは統合先の妥当性（merge_target）ケースになり、統合先の実体も渡る', () => {
  const { cases } = build('merge-target-ok');
  assert.equal(cases.length, 1);
  assert.deepEqual(cases[0].conditions, ['merge_target']);
  assert.ok(cases[0].text.includes('統合先の実体'));
  assert.ok(cases[0].text.includes('contribution-rules'), '統合先の本文が含まれていない');
});

test('宣言除去規約: バンドルに designer の keep_conditions 宣言と rationale が現れない（L004 対策）', () => {
  for (const name of ['keep-clean', 'c2-duplicate', 'c4-strength-gap', 'keep-clean-adjacent']) {
    const dir = path.join(CORPUS, name);
    const raw = readFileSync(path.join(dir, 'design-map.md'), 'utf8');
    // 前提: 入力の design-map には宣言が実在する（前提が消えるとこのテストは無意味になる）
    assert.ok(raw.includes('keep_conditions'), `${name}: 前提となる宣言が design-map に無い`);
    const dmRationale = raw.match(/rationale:\s*"([^"]+)"/);
    assert.ok(dmRationale, `${name}: 前提となる rationale が design-map に無い`);

    const { cases } = build(name);
    for (const c of cases) {
      assert.ok(!c.text.includes('keep_conditions'), `${name}: バンドルに keep_conditions が漏れている`);
      assert.ok(!c.text.includes('C2_no_requirement_conflict'), `${name}: C2 宣言が漏れている`);
      assert.ok(!c.text.includes('C4_strength_consistent'), `${name}: C4 宣言が漏れている`);
      // spec の新要件にも `rationale:` は現れる（要件の理由＝正当な事実）ので、
      // キー名でなく **design-map に書かれた designer の主張そのもの**の不在を見る。
      assert.ok(!c.text.includes(dmRationale[1]), `${name}: designer の rationale が漏れている`);
    }
  }
});

test('宣言除去規約: merge の manifest_note（designer の正当化）も渡さない', () => {
  const raw = readFileSync(path.join(CORPUS, 'merge-target-bad', 'design-map.md'), 'utf8');
  assert.ok(raw.includes('manifest_note'), '前提となる manifest_note が design-map に無い');
  const { cases } = build('merge-target-bad');
  assert.ok(!cases[0].text.includes('manifest_note'));
  assert.ok(!cases[0].text.includes('db-migration は contribution-rules へ統合'));
});

test('判定に要る事実は渡っている（実体・系統A の強度・spec 新要件/統合方針・requirements）', () => {
  const { cases } = build('c4-strength-gap');
  const t = cases[0].text;
  assert.ok(t.includes('secret-hygiene'), '対象原本の本文が無い');
  assert.ok(t.includes('strength: advisory'), '系統A の強度が無い（C4 の判定材料）');
  assert.ok(t.includes('strength_needed: deterministic'), 'requirements の強度が無い');
  assert.ok(t.includes('統合方針'), 'spec 統合方針が無い');
  assert.ok(t.includes('judge_conditions: [C2, C4]'));
});

test('バンドル生成は決定論（同じ入力で同じ出力）', () => {
  const a = build('keep-clean').cases[0].text;
  const b = build('keep-clean').cases[0].text;
  assert.equal(a, b);
});

test('design-map 不在は throw（不在を「対象0件＝合格」と読まない）', () => {
  assert.throws(
    () =>
      buildKeepReviewBundles({
        ts: tsFor(import.meta.url, 1),
        write: false,
        roots: { outputDir: path.join(ROOT, 'fixtures'), workDir: path.join(ROOT, 'fixtures') },
      }),
    /design-map\.md が無い/
  );
});

test('existing_disposition が空の design-map は throw（0件を成功と誤認しない）', () => {
  assert.throws(() => collectKeepReviewCases('# design-map\n\n## 既存判定\n\n本文なし\n'), /existing_disposition/);
});

test('caseId はパスから決定論的に導かれる', () => {
  assert.equal(caseIdFor('.claude/skills/a-b/SKILL.md'), 'claude_skills_a_b_SKILL_md');
});

// ---------------------------------------------------------------------------
// 4軸バンドル（correctness / security / canon / context・§16.3 の一般化・B 2026-08-12）
// ---------------------------------------------------------------------------

function buildAxis(axis, caseName) {
  const dir = path.join(AXIS_CORPUS, axis, 'cases', caseName);
  return buildAxisBundle({
    axis,
    ts: TS,
    caseId: caseName,
    write: false,
    roots: { outputDir: dir, workDir: dir, generatedRoot: path.join(dir, 'generated') },
  });
}

test('4軸すべてでバンドルが生成できる（generated 配下の全ファイルが target になる）', () => {
  const perAxisCase = {
    correctness: 'corr-a1-met',
    security: 'sec-minimal',
    canon: 'canon-good-desc',
    context: 'ctx-tight',
  };
  for (const axis of AXES_4) {
    const { targets, text } = buildAxis(axis, perAxisCase[axis]);
    assert.ok(targets.length >= 1, `${axis}: target が0件`);
    assert.ok(text.includes(`axis: ${axis}`));
  }
});

test('宣言除去規約（4軸への横展開）: design-map の rationale がバンドルに現れない', () => {
  // context/ctx-duplication は responsibilities.md を持つ（design-map の1文責務のみ・rationale は無い）。
  const { text } = buildAxis('context', 'ctx-duplication');
  assert.ok(!text.includes('keep_conditions'), 'keep_conditions が漏れている');
  assert.ok(!/rationale:\s*"/.test(text), 'designer の rationale らしき文字列が漏れている');
});

test('複数ファイルの生成物は全ファイルが1バンドルに含まれる（canon-progressive の4ファイル）', () => {
  const { targets, text } = buildAxis('canon', 'canon-progressive');
  assert.equal(targets.length, 4);
  assert.ok(text.includes('release-deploy/SKILL.md'));
  assert.ok(text.includes('release-deploy/reference/prepare.md'));
  assert.ok(text.includes('release-deploy/reference/deploy.md'));
  assert.ok(text.includes('release-deploy/reference/verify.md'));
});

test('generated 配下が0件は throw（0件を「問題なし」と読まない・§16.5）', () => {
  assert.throws(
    () =>
      buildAxisBundle({
        axis: 'correctness',
        ts: tsFor(import.meta.url, 1),
        write: false,
        roots: { outputDir: path.join(ROOT, 'fixtures'), workDir: path.join(ROOT, 'fixtures'), generatedRoot: path.join(ROOT, 'fixtures', 'does-not-exist') },
      }),
    /生成物が0件/
  );
});

test('未対応の軸は throw', () => {
  assert.throws(() => buildAxis('keep-review', 'x'), /未対応の軸/);
});

test('バンドル生成は決定論（4軸でも同じ入力で同じ出力）', () => {
  const a = buildAxis('security', 'sec-minimal').text;
  const b = buildAxis('security', 'sec-minimal').text;
  assert.equal(a, b);
});
