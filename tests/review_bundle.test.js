/**
 * canon-c/scripts/review-bundle.js（artifacts.md §9.1）の回帰テスト。
 *
 * 最重要は **宣言を除く規約**の固定である。design-map の keep レコードには designer 自身の
 * 主張（keep_conditions の boolean と rationale）が書かれており、これを keep-reviewer に渡すと
 * 判定対象自身の主張に自己一致して常に問題なしと答える＝検査が恒真になる。バンドルに宣言が
 * 漏れていないことを実際のケース入力に対して assert し、将来の改変で漏れたら落ちるようにする。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import { REVIEW_CHUNK_SIZE, chunkBy, buildKeepReviewBundles, buildReviewerBundle, collectKeepReviewCases, caseIdFor } from '../.claude/skills/canon-c/scripts/review-bundle.js';
import { keepReviewCaseDir, scratchDir } from './helpers/fixtures.js';
import { tsFor } from './helpers/ts.js';

// write:false・roots は常にケースの書き出し先を指すため、この ts は実 work/output に
// 一切触れない飾り値（バンドル本文に埋め込まれるだけ）。
const TS = tsFor(import.meta.url, 0);

function build(caseName) {
  const dir = keepReviewCaseDir(caseName);
  return buildKeepReviewBundles({
    ts: TS,
    write: false,
    roots: { outputDir: dir, workDir: dir, targetRoot: path.join(dir, 'target') },
  });
}

test('keep レコードから K2/K4 のケースを立てる', () => {
  const { cases } = build('k4-strength-gap');
  assert.equal(cases.length, 1);
  assert.equal(cases[0].disposition, 'keep');
  assert.deepEqual(cases[0].conditions, ['K2', 'K4']);
});

test('merge レコードは統合先の妥当性（merge_target）ケースになり、統合先の実体も渡る', () => {
  const { cases } = build('merge-target-bad');
  assert.equal(cases.length, 1);
  assert.deepEqual(cases[0].conditions, ['merge_target']);
  assert.ok(cases[0].text.includes('統合先の実体'));
  assert.ok(cases[0].text.includes('contribution-rules'), '統合先の本文が含まれていない');
});

test('宣言を除く規約: バンドルに designer の keep_conditions 宣言と rationale が現れない', () => {
  for (const name of ['k4-strength-gap']) {
    const dir = keepReviewCaseDir(name);
    const raw = readFileSync(path.join(dir, 'design-map.md'), 'utf8');
    // 前提: 入力の design-map には宣言が実在する（前提が消えるとこのテストは無意味になる）
    assert.ok(raw.includes('keep_conditions'), `${name}: 前提となる宣言が design-map に無い`);
    const dmRationale = raw.match(/rationale:\s*"([^"]+)"/);
    assert.ok(dmRationale, `${name}: 前提となる rationale が design-map に無い`);

    const { cases } = build(name);
    for (const c of cases) {
      assert.ok(!c.text.includes('keep_conditions'), `${name}: バンドルに keep_conditions が漏れている`);
      assert.ok(!c.text.includes('K2_no_requirement_conflict'), `${name}: K2 宣言が漏れている`);
      assert.ok(!c.text.includes('K4_strength_consistent'), `${name}: K4 宣言が漏れている`);
      assert.ok(!/K2:\s*true/.test(c.text), `${name}: K2 の真偽の主張が漏れている`);
      // spec の新要件にも `rationale:` は現れる（要件の理由＝正当な事実）ので、
      // キー名でなく **design-map に書かれた designer の主張そのもの**の不在を見る。
      assert.ok(!c.text.includes(dmRationale[1]), `${name}: designer の rationale が漏れている`);
    }
  }
});

test('宣言を除く規約: merge の manifest_note（designer の正当化）も渡さない', () => {
  const raw = readFileSync(path.join(keepReviewCaseDir('merge-target-bad'), 'design-map.md'), 'utf8');
  assert.ok(raw.includes('manifest_note'), '前提となる manifest_note が design-map に無い');
  const { cases } = build('merge-target-bad');
  assert.ok(!cases[0].text.includes('manifest_note'));
  assert.ok(!cases[0].text.includes('db-migration は contribution-rules へ統合'));
});

test('判定に要る事実は渡っている（実体・existing.md の強度・spec 新要件/統合方針・requirements）', () => {
  const { cases } = build('k4-strength-gap');
  const t = cases[0].text;
  assert.ok(t.includes('secret-hygiene'), '対象原本の本文が無い');
  assert.ok(t.includes('strength: advisory'), 'existing.md の強度が無い（K4 の判定材料）');
  assert.ok(t.includes('strength_needed: deterministic'), 'requirements の強度が無い');
  assert.ok(t.includes('統合方針'), 'spec 統合方針が無い');
  // 見出しの語だけでなく本文が渡っていること（spec の見出しは `## §2 新要件`・`## §4 統合方針（…）`。節の取り違えで空になる退行を捕まえる）
  assert.ok(t.includes('阻止の担い手は新設する PreToolUse Hook'), 'spec 統合方針の本文が無い');
  assert.ok(t.includes('認証情報を含むコミットを機械的に阻止する'), 'spec 新要件の本文が無い');
  assert.ok(t.includes('review_conditions: [K2, K4]'));
});

test('バンドル生成は決定論（同じ入力で同じ出力）', () => {
  const a = build('k4-strength-gap').cases[0].text;
  const b = build('k4-strength-gap').cases[0].text;
  assert.equal(a, b);
});

test('design-map 不在は throw（不在を「対象0件＝合格」と読まない）', (t) => {
  const empty = scratchDir(t, 'bundle-empty-');
  assert.throws(
    () =>
      buildKeepReviewBundles({
        ts: tsFor(import.meta.url, 1),
        write: false,
        roots: { outputDir: empty, workDir: empty },
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

// ---- 出力先の掃除・keep 対象の逆引き ----

const DM_KEEP = [
  '# dm',
  '## 既存判定',
  '```yaml',
  'existing_disposition:',
  '  - path: .claude/skills/impact-scope/SKILL.md',
  '    disposition: keep',
  '    keep_conditions:',
  '      K1_canon_clean: true',
  '      K2_no_requirement_conflict: true',
  '      K3_dependency_healthy: true',
  '      K4_strength_consistent: true',
  '      K5_project_refs_resolved: true',
  '```',
  '',
].join('\n');

function keepRun(t, { generated = {} } = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'bundle-keep-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(path.join(tmp, 'design-map.md'), DM_KEEP);
  for (const [rel, body] of Object.entries(generated)) {
    mkdirSync(path.dirname(path.join(tmp, 'generated', rel)), { recursive: true });
    writeFileSync(path.join(tmp, 'generated', rel), body);
  }
  return tmp;
}

test('逆引き: keep 対象を名指しする生成物の箇所が file:line で入る（不在と誤認させない）', (t) => {
  const tmp = keepRun(t, {
    generated: {
      'CLAUDE.md': '# c\nimpact-scope Skill で影響範囲を判定する\n',
      '.claude/skills/impact-scope/SKILL.md': 'impact-scope 自身（keep の verbatim コピー）\n',
      '.claude/agents/x/x.md': '---\nname: x\n---\n無関係\n',
    },
  });
  const { cases } = buildKeepReviewBundles({ ts: TS, write: false, roots: { outputDir: tmp, workDir: tmp, generatedRoot: path.join(tmp, 'generated') } });
  const text = cases[0].text;
  assert.match(text, /生成物内での言及/);
  assert.match(text, /CLAUDE\.md:2:/, '言及している生成物の行番号が逆引きされていない');
  assert.ok(!text.includes('SKILL.md:1:'), '自分自身（verbatim コピー）を言及とみなしている');
  assert.ok(!/agents\/x\/x\.md:/.test(text), '無関係な行が混ざっている');
});

test('逆引き: 言及が無ければ「Grep で確かめてから不在と言う」旨を出す', (t) => {
  const tmp = keepRun(t, { generated: { 'CLAUDE.md': '# c\n本文\n' } });
  const { cases } = buildKeepReviewBundles({ ts: TS, write: false, roots: { outputDir: tmp, workDir: tmp, generatedRoot: path.join(tmp, 'generated') } });
  assert.match(cases[0].text, /生成物に言及なし。ただし Grep で確かめてから/);
});

test('掃除: 前回のバンドルは書き出し前に消える（消えた keep の古いバンドルを keep-reviewer に読ませない）', (t) => {
  const tmp = keepRun(t, { generated: { 'CLAUDE.md': 'x\n' } });
  const stale = path.join(tmp, 'review-bundle', 'keep-review', 'old_removed_keep.md');
  mkdirSync(path.dirname(stale), { recursive: true });
  writeFileSync(stale, '前 round の keep');
  const { written } = buildKeepReviewBundles({ ts: TS, write: true, roots: { outputDir: tmp, workDir: tmp, generatedRoot: path.join(tmp, 'generated') } });
  const names = readdirSync(path.join(tmp, 'review-bundle', 'keep-review'));
  assert.ok(!names.includes('old_removed_keep.md'), '前回の古いバンドルが残っている');
  assert.equal(names.length, written.length, '今回の対象以外のファイルが残っている');
});

test('caseId の衝突（foo-bar.md と foo_bar.md）は決定論的な連番で避け、どのケースも別ファイルになる', () => {
  const rec = (p) =>
    `  - path: ${p}\n    disposition: keep\n    keep_conditions:\n      K1_canon_clean: true\n    rationale: "x"\n`;
  const text = (paths) => `# dm\n\n## 既存判定\n\n\`\`\`yaml\nexisting_disposition:\n${paths.map(rec).join('')}\`\`\`\n`;
  const paths = ['.claude/rules/foo-bar.md', '.claude/rules/foo_bar.md', '.claude/rules/foo bar.md'];
  const ids = collectKeepReviewCases(text(paths)).map((c) => c.caseId);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3, `caseId が衝突している: ${ids}`);
  assert.deepEqual(ids, collectKeepReviewCases(text(paths)).map((c) => c.caseId), '同じ入力で同じ ID（決定論）');
  assert.equal(ids[0], caseIdFor(paths[0]), '衝突しないケースの ID は変わらない');
});

// ---- reviewer 用バンドル（artifacts.md §9.1）----

const DM_REVIEWER = [
  '# dm',
  '## メタ',
  'patterns: 委譲',
  'rationale: 型の自己弁護',
  '## Used Features',
  'builder を起動する機能: claude-md・rules・subagents',
  '## 既存判定',
  '```yaml',
  'existing_disposition:',
  '  - path: .claude/rules/keep.md',
  '    disposition: keep',
  '    keep_conditions:',
  '      K1_canon_clean: true',
  '      K2_no_requirement_conflict: true',
  '      K3_dependency_healthy: true',
  '      K4_strength_consistent: true',
  '      K5_project_refs_resolved: true',
  '    rationale: "keep の自己弁護"',
  '  - path: .claude/agents/a/a.md',
  '    disposition: modify',
  '    interface_change: none',
  '    rationale: "modify の自己弁護"',
  '  - path: .claude/rules/old.md',
  '    disposition: merge',
  '    superseded_by: .claude/rules/keep.md',
  '    manifest_note: "統合の正当化"',
  '```',
  '## claude-md（builder）',
  '### `CLAUDE.md`（新規）',
  '常に読む規約を書く',
  '  rationale: 機能の節に紛れた自己弁護',
  '## subagents',
  '### `a`（modify）',
  'tools は最小にする',
  '',
].join('\n');

function reviewerRun(t, { designMap = DM_REVIEWER, generated } = {}) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'bundle-reviewer-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(path.join(tmp, 'design-map.md'), designMap);
  writeFileSync(path.join(tmp, 'spec.md'), '# spec\n## §8 受入基準\n- functional（A1）: `/x` で動く\n## §9 未決事項\nなし\n');
  for (const [rel, body] of Object.entries(
    generated ?? {
      'CLAUDE.md': '# c\n',
      '.claude/rules/keep.md': 'keep\n',
      '.claude/agents/a/a.md': '---\nname: a\ndescription: d\ntools: Read, Bash\nmodel: sonnet\n---\n本文\n',
    }
  )) {
    mkdirSync(path.dirname(path.join(tmp, 'generated', rel)), { recursive: true });
    writeFileSync(path.join(tmp, 'generated', rel), body);
  }
  return tmp;
}

const buildR = (tmp, write = false) =>
  buildReviewerBundle({ ts: TS, write, roots: { outputDir: tmp, workDir: tmp, targetRoot: path.join(tmp, 'target') } });

test('reviewer: 宣言を除く規約: rationale・keep_conditions・manifest_note がバンドルに現れない', (t) => {
  const { texts } = buildR(reviewerRun(t));
  for (const [name, text] of Object.entries(texts)) {
    assert.ok(!/自己弁護|統合の正当化/.test(text), `${name}: designer の正当化が漏れている`);
    assert.ok(!/K2_no_requirement_conflict|K2:\s*true|keep_conditions:/.test(text), `${name}: keep_conditions が漏れている`);
  }
  // 設計意図と処遇は渡っている
  assert.match(texts['design.md'], /常に読む規約を書く/);
  assert.match(texts['design.md'], /tools は最小にする/);
  assert.match(texts['design.md'], /`\.claude\/agents\/a\/a\.md` — modify（interface_change: none）/);
  assert.match(texts['design.md'], /`\.claude\/rules\/old\.md` — merge（統合先・後継: `\.claude\/rules\/keep\.md`）/);
  assert.match(texts['acceptance.md'], /functional（A1）: `\/x` で動く/);
  assert.doesNotMatch(texts['acceptance.md'], /未決事項/);
});

test('reviewer: INDEX は generated/ の全ファイルを処遇と security の frontmatter 付きで列挙する', (t) => {
  const { texts, files } = buildR(reviewerRun(t));
  assert.deepEqual(files, ['.claude/agents/a/a.md', '.claude/rules/keep.md', 'CLAUDE.md']);
  assert.deepEqual(Object.keys(texts).filter((n) => n.startsWith('INDEX')), ['INDEX-1.md'], '20件以下でも INDEX-1.md を作り、INDEX.md は作らない');
  const index = texts['INDEX-1.md'];
  assert.match(index, /全ファイル（3 件）を 1 分割した、この 1 番目の 3 件/);
  assert.match(index, /output\/<ts>\/review\/review-1\.md/);
  assert.match(index, /- `\.claude\/agents\/a\/a\.md` — 処遇: modify・tools: Read, Bash・model: sonnet/);
  assert.match(index, /- `\.claude\/rules\/keep\.md` — 処遇: keep（統合先: `\.claude\/rules\/old\.md` を吸収）/);
  assert.match(index, /- `CLAUDE\.md` — 処遇: 新規/);
  assert.match(index, /spec: .*spec\.md/);
});

test('reviewer: new モード（既存判定の節が無い）でも作れる', (t) => {
  const dm = '# dm\n## Used Features\nclaude-md\n## claude-md\n### `CLAUDE.md`\n書く\n';
  const { texts } = buildR(reviewerRun(t, { designMap: dm, generated: { 'CLAUDE.md': '# c\n' } }));
  assert.match(texts['design.md'], /## 既存判定（処遇だけ）\n\nなし/);
});

test('reviewer: generated/ が空なら throw（対象0件を「問題なし」と読まない）', (t) => {
  const tmp = reviewerRun(t, { generated: {} });
  assert.throws(() => buildR(tmp), /generated\/ にファイルが無い/);
});

test('reviewer: 決定論で、書き出し前に前回のバンドルを消す', (t) => {
  const tmp = reviewerRun(t);
  const stale = path.join(tmp, 'review-bundle', 'reviewer', 'stale.md');
  mkdirSync(path.dirname(stale), { recursive: true });
  writeFileSync(stale, '前回');
  const a = buildR(tmp, true);
  const b = buildR(tmp, true);
  assert.deepEqual(a.texts, b.texts);
  assert.deepEqual(readdirSync(path.join(tmp, 'review-bundle', 'reviewer')).sort(), ['INDEX-1.md', 'acceptance.md', 'design.md']);
});

test('reviewer: 対象を20件ずつの INDEX-<k>.md に分け、全 INDEX の和が generated/ の全件と一致して重複しない（20/21/40/41件の境界）', (t) => {
  assert.equal(REVIEW_CHUNK_SIZE, 20);
  for (const [n, parts] of [[1, 1], [20, 1], [21, 2], [40, 2], [41, 3]]) {
    const generated = Object.fromEntries(Array.from({ length: n }, (_, i) => [`.claude/rules/r${String(i).padStart(2, '0')}.md`, `# r${i}\n`]));
    const { texts, files, chunks } = buildR(reviewerRun(t, { generated }));
    assert.equal(chunks.length, parts, `${n}件 → ${parts}分割のはず`);
    const indexNames = Object.keys(texts).filter((x) => x.startsWith('INDEX')).sort();
    assert.deepEqual(indexNames, Array.from({ length: parts }, (_, i) => `INDEX-${i + 1}.md`));
    const listed = indexNames.flatMap((name) => [...texts[name].matchAll(/^- `([^`]+)` — 処遇:/gm)].map((m) => m[1]));
    assert.equal(listed.length, n, `${n}件: 列挙の総数`);
    assert.deepEqual([...listed].sort(), [...files].sort(), `${n}件: 和が全件と一致しない（落ちた・重複した対象がある）`);
    assert.equal(new Set(listed).size, n, `${n}件: 重複`);
    for (const [i, name] of indexNames.entries()) {
      assert.ok(chunks[i].length <= REVIEW_CHUNK_SIZE);
      assert.match(texts[name], new RegExp(`review-${i + 1}\\.md`), `${name}: 書込先 review-${i + 1}.md が書かれていない`);
      assert.match(texts[name], new RegExp(`part: ${i + 1}/${parts}`));
    }
    // 設計意図と受入基準は共有（分割ごとに複製しない）
    assert.equal(Object.keys(texts).filter((x) => x === 'design.md' || x === 'acceptance.md').length, 2);
  }
});

test('chunkBy: 空は []、端数は最後の分割に入る', () => {
  assert.deepEqual(chunkBy([]), []);
  assert.deepEqual(chunkBy([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('reviewer: 書き出し前に前回の INDEX を消す（分割数が減っても古い INDEX-<k>.md が残らない）', (t) => {
  const big = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`.claude/rules/r${i}.md`, `# r${i}\n`]));
  const tmp = reviewerRun(t, { generated: big });
  buildR(tmp, true);
  const dir = path.join(tmp, 'review-bundle', 'reviewer');
  assert.deepEqual(readdirSync(dir).sort(), ['INDEX-1.md', 'INDEX-2.md', 'acceptance.md', 'design.md']);
  rmSync(path.join(tmp, 'generated', '.claude', 'rules'), { recursive: true });
  mkdirSync(path.join(tmp, 'generated', '.claude', 'rules'), { recursive: true });
  writeFileSync(path.join(tmp, 'generated', '.claude', 'rules', 'only.md'), '# o\n');
  buildR(tmp, true);
  assert.deepEqual(readdirSync(dir).sort(), ['INDEX-1.md', 'acceptance.md', 'design.md']);
});
