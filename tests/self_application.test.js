/**
 * 自己適用の回帰スイート（architecture.md §9.2）。
 *
 * verify の検査は「生成物」の検証だが、claude-canon 自身の `.claude/`（agents・skills）も
 * 同じ正典に従う成果物である。canon はフックを使わないので、ワーカーの権限の制限もここで担保する。
 *
 * ここが無いと、ワーカー定義の改変でパス規約・frontmatter・ツール名が壊れても
 * `npm test` は緑のまま——検証系が自分自身には目を閉じている状態になる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadArtifact, parseFrontmatter, splitListValue, skillPathRole } from '../lib/artifact.js';
import { checkV1 } from '../lib/verify/paths.js';
import { checkV2 } from '../lib/verify/frontmatter.js';
import { checkV3 } from '../lib/verify/tool-names.js';
import { checkV4 } from '../lib/verify/security.js';
import { isNonSchemaRel } from '../lib/non-schema.js';
import { PROGRESS_KEY_RE, SETTABLE, STAGES } from '../lib/handoff.js';
import { ROOT } from './helpers/paths.js';
import { REFERENCE_DIR } from '../lib/reference-data.js';
import { buildReferenceIndex, extractReferenceRefs, resolveReferenceRef } from './helpers/reference-refs.js';

const SELF = path.join(ROOT, '.claude');

/** `git ls-files` で追跡対象のファイルを canon のルートからの相対パスで返す（追跡外の物理実在物を拾わない）。 */
function trackedFiles(...pathspecs) {
  return execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

/**
 * `git ls-files` で追跡対象の .md だけを歩く。素朴な readdirSync 再帰だと
 * `.claude/worktrees/<name>/`（.git/info/exclude で除外されたセッション用の
 * ネスト git worktree）配下の無関係なファイルまで拾ってしまう。
 *
 * 非スキーマ判定は lib/non-schema.js が SSoT（同じ除外を独立に複製すると波及漏れが起きる）。dir は常に SELF
 * （`.claude`）またはその配下なので base:'claude' で判定する。
 */
function walkMd(dir) {
  if (!existsSync(dir)) return [];
  const rel = path.relative(ROOT, dir).replace(/\\/g, '/');
  return trackedFiles(rel)
    .filter((f) => f.endsWith('.md') && !isNonSchemaRel(path.relative(SELF, path.join(ROOT, f)), 'claude'))
    .map((f) => path.join(ROOT, f));
}

test('claude-canon 自身の .claude/**.md が V1〜V4 で違反0件', () => {
  const files = walkMd(SELF);
  assert.ok(files.length >= 15, `検査対象が少なすぎる（実際: ${files.length}）。0件を成功と誤認しない。`);

  const found = [];
  for (const f of files) {
    const a = loadArtifact(f);
    for (const v of [...checkV1(a), ...checkV2(a), ...checkV3(a), ...checkV4(a)]) {
      found.push(`${path.relative(ROOT, f)}: ${v.check} ${v.message}`);
    }
  }
  assert.deepEqual(found, [], `自己適用で違反を検出:\n${found.join('\n')}`);
});

test('Skill の scripts/ は skill パッケージの supporting files として扱われる（V1・V2 の対象外）', () => {
  const scripts = trackedFiles('.claude/skills').filter((f) => /^\.claude\/skills\/[^/]+\/scripts\//.test(f));
  assert.ok(scripts.length >= 2, `scripts が少なすぎる（実際: ${scripts.length}）。0件を成功と誤認しない。`);
  const misfiled = scripts.filter((f) => skillPathRole(f) !== 'supporting' || !isNonSchemaRel(f, 'generated'));
  assert.deepEqual(misfiled, []);
});

// ---- ワーカーの権限: コマンド実行系ツールを持たない ----
//
// claude-canon 自身のワーカー（.claude/agents/**）はコマンド実行系ツールを持たない。実行を要する処理は
// オーケストレーターが scripts の CLI で行う。禁止集合は代表例でなく能力で定義する: Bash と同じ
// permission rule で駆動される Monitor、Windows の PowerShell も同じ能力である。tools: の省略は
// 全ツール継承（canon-reference `frontmatter:subagent/tools`: 省略すると全ツールを継承する）なので違反とする。frontmatter が
// 読めない定義は tools を安全に判定できないため違反とする（黙って通すと vacuous pass になる）。

/** コマンド実行系ツール（能力で定義した禁止集合）。 */
const COMMAND_EXECUTION_TOOLS = ['Bash', 'PowerShell', 'Monitor'];

/** agent 定義の本文から、コマンド実行権限に関する違反メッセージを返す（違反なしなら空配列）。 */
function commandToolViolations(text) {
  const { present, frontmatter, errors } = parseFrontmatter(text);
  if (!present) return ['frontmatter（--- ブロック）が無く tools を判定できない'];
  if (errors.length > 0) return [`frontmatter の解析に失敗した（${errors.map((e) => e.type).join(', ')}）`];
  if (!frontmatter.tools) return ['tools: が無い（省略は全ツール継承でコマンド実行系を含む）'];
  const found = splitListValue(frontmatter.tools)
    .map((t) => t.replace(/\(.*$/, '')) // `Bash(git *)` は空白で `Bash(git` と `*)` に割れるため括弧以降を落とす
    .filter((t) => COMMAND_EXECUTION_TOOLS.includes(t));
  return found.length > 0 ? [`tools: にコマンド実行系ツール（${found.join(', ')}）が含まれる`] : [];
}

test('claude-canon 自身のワーカー定義がコマンド実行系ツールを持たない', () => {
  const agents = walkMd(path.join(SELF, 'agents'));
  assert.ok(agents.length > 0, 'agent 定義が0件（検査対象なしを合格と誤認しない）');
  const found = agents.flatMap((f) =>
    commandToolViolations(readFileSync(f, 'utf8')).map((m) => `${path.relative(ROOT, f)}: ${m}`)
  );
  assert.deepEqual(found, [], found.join('\n'));
});

test('検出器の素振り: コマンド実行系ツール・tools 省略・frontmatter 破損を違反として拾う', () => {
  const def = (fm) => `---\nname: x\ndescription: x\n${fm}---\n本文\n`;
  for (const tools of ['Read, Bash', 'Read PowerShell', 'Read, Monitor', 'Read, Bash(git *)']) {
    assert.equal(commandToolViolations(def(`tools: ${tools}\n`)).length, 1, `tools: ${tools} を見逃した`);
  }
  assert.equal(commandToolViolations(def('')).length, 1, 'tools 省略を見逃した');
  assert.equal(commandToolViolations('---\nname: x\ntools: Read\n本文\n').length, 1, '終端 --- の無い frontmatter を見逃した');
  assert.equal(commandToolViolations('本文だけ\n').length, 1, 'frontmatter 無しを見逃した');
  // 対照: 過剰に弾かない（Read/Grep/Write や、名前に Bash を含むだけの別ツールは通す）。
  assert.deepEqual(commandToolViolations(def('tools: Read, Grep, Glob, Write\n')), []);
  assert.deepEqual(commandToolViolations(def('tools: Read, BashOutput\n')), []);
});

test('agent の skills: preload が実在し、disable-model-invocation な Skill を preload していない（V6 相当の自己適用）', () => {
  const agents = walkMd(path.join(SELF, 'agents'));
  let preloads = 0;
  for (const f of agents) {
    const a = loadArtifact(f);
    const entry = a.frontmatter?.skills;
    if (!entry) continue;
    for (const name of splitListValue(entry)) {
      preloads++;
      const skillPath = path.join(SELF, 'skills', name, 'SKILL.md');
      assert.ok(existsSync(skillPath), `${path.relative(ROOT, f)}: preload skill "${name}" が実在しない`);
      const s = loadArtifact(skillPath);
      const dmi = s.frontmatter?.['disable-model-invocation'];
      const val = dmi && typeof dmi === 'object' ? dmi.value : dmi;
      assert.notEqual(String(val), 'true', `${name} は disable-model-invocation:true であり preload 不可`);
    }
  }
  assert.ok(preloads > 0, 'preload が1件も無い（検査が発火していない＝vacuous）');
});

// ---- Agent 6体と知識 Skill 5件（design/architecture.md §6）----

/** Agent と、preload する知識 Skill の対応（design/architecture.md §6.1）。null は preload しない。 */
const EXPECTED_AGENTS = {
  investigator: 'investigation',
  profiler: 'investigation',
  builder: 'generation',
  reviewer: 'review',
  'session-analyst': null,
  'prompt-auditor': null,
};
const KNOWLEDGE_SKILLS = ['investigation', 'requirements', 'design', 'generation', 'review'];

/** parseFrontmatter の値（文字列、または { value } を持つオブジェクト）を文字列で返す。 */
const fmValue = (v) => (v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? ''));

test('Agent は6体ちょうどで（旧版の Agent を作らない）、それぞれ期待する知識 Skill を preload する', () => {
  // `.claude` などサンドボックスのマウント点は定義ではないので、<名前>/<名前>.md を持つものだけを数える。
  const actual = readdirSync(path.join(SELF, 'agents'))
    .filter((n) => existsSync(path.join(SELF, 'agents', n, `${n}.md`)))
    .sort();
  assert.deepEqual(actual, Object.keys(EXPECTED_AGENTS).sort(), '旧定義の残存、または新定義の欠落');
  for (const [name, skill] of Object.entries(EXPECTED_AGENTS)) {
    const a = loadArtifact(path.join(SELF, 'agents', name, `${name}.md`));
    if (skill === null) assert.equal(a.frontmatter?.skills, undefined, `${name} は Skill を preload しないはず`);
    else assert.deepEqual(splitListValue(a.frontmatter?.skills), [skill], `${name} の skills: は [${skill}] のはず`);
  }
});

test('Agent は description に委譲条件（Delegate when）を持ち、本文で書込先を明示する', () => {
  for (const name of Object.keys(EXPECTED_AGENTS)) {
    const text = readFileSync(path.join(SELF, 'agents', name, `${name}.md`), 'utf8');
    const { frontmatter } = parseFrontmatter(text);
    assert.match(fmValue(frontmatter.description), /Delegate when/, `${name}: description に "Delegate when" が無い`);
    const body = text.split(/^---\s*$/m).slice(2).join('---');
    assert.match(body, /work\/<ts>\/|worktree/, `${name}: 本文に書込先（work/<ts>/ または worktree）が無い`);
    assert.match(body, /他の Subagent を起動しない/, `${name}: 本文に「他の Subagent を起動しない」が無い`);
  }
});

test('知識 Skill は5件ちょうどで、user-invocable: false・本文500行未満・disable-model-invocation なし', () => {
  // 段階 Skill・canon-reference（正典リファレンス）・canon-update（保守用）は、知識 Skill とは別に検査する
  const skillDirs = readdirSync(path.join(SELF, 'skills'))
    .filter((n) => existsSync(path.join(SELF, 'skills', n, 'SKILL.md')) && !STAGE_SKILLS.includes(n) && n !== 'canon-reference' && n !== 'canon-update')
    .sort();
  assert.deepEqual(skillDirs, [...KNOWLEDGE_SKILLS].sort(), '旧知識 Skill の残存、または新 Skill の欠落');
  for (const name of KNOWLEDGE_SKILLS) {
    const text = readFileSync(path.join(SELF, 'skills', name, 'SKILL.md'), 'utf8');
    const fm = text.split(/^---\s*$/m)[1] ?? '';
    assert.match(fm, /^user-invocable:\s*false\s*$/m, `${name}: user-invocable: false が無い`);
    assert.doesNotMatch(fm, /disable-model-invocation/, `${name}: preload されるので disable-model-invocation を付けない`);
    assert.ok(text.split('\n').length < 500, `${name}: SKILL.md が500行以上`);
    assert.ok(existsSync(path.join(SELF, 'skills', name, 'references')), `${name}: references/ が無い`);
  }
});

/** ディレクトリ配下の追跡済みの .md を絶対パスで集める。 */
function mdUnder(dir) {
  return trackedFiles(path.relative(ROOT, dir).replace(/\\/g, '/'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(ROOT, f));
}

/**
 * 旧体系の用語・番号: 旧ゲート番号（G4 以上）・v2 の keep 条件 K1〜K5・承認 P1〜P5・spec・design-map・MANIFEST・Phase A〜D・output/<ts>・run 番号・旧機構の語。v3 の番号は V1〜V9・G1〜G3。
 * Agent・知識 Skill は SendMessage（再開）も禁じる。Phase Skill は SendMessage を「再開しない」の規則として書くので許し、
 * 代わりに旧セッション名（S1〜S4）・旧 CLI の語・廃止した標準レビュー（/security-review・/code-review）を禁じる。
 */
const OLD_SYSTEM_TERMS = ['\\bG(?:[4-9]|\\d{2})\\b', '\\bK[1-5]\\b', '\\bP[1-5]\\b', 'spec\\.md', 'spec-writer', 'keep-review', 'design-map', 'MANIFEST', 'Phase [A-D]', 'output\\/<ts>', '\\bC[1-5]_', '\\bP[6-8]\\b', '工程10', 'run 20\\d{6}', 'fixtures\\/', 'marker', '\\.requests', '\\.gate', '基本設計書', '詳細設計書', 'systemA', '系統[AB]', 'eval-', 'quality-checklist'];
const OLD_WORKER_TERMS = new RegExp([...OLD_SYSTEM_TERMS, 'SendMessage'].join('|'));
const OLD_PHASE_TERMS = new RegExp([...OLD_SYSTEM_TERMS, '\\bS[1-4]\\b', 'state:record', 'recheck', 'resume', 'security-review', 'code-review'].join('|'));

test('知識 Skill の Markdown リンクがすべて実在する（references への道しるべが切れていない）', () => {
  const files = KNOWLEDGE_SKILLS.flatMap((n) => mdUnder(path.join(SELF, 'skills', n)));
  assert.ok(files.length >= 20, `検査対象が少なすぎる（実際: ${files.length}）`);
  const broken = [];
  let links = 0;
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|#)/.test(target)) continue;
      links++;
      if (!existsSync(path.resolve(path.dirname(f), target.split('#')[0]))) broken.push(`${path.relative(ROOT, f)} → ${target}`);
    }
  }
  assert.ok(links >= 15, `リンクが少なすぎる（実際: ${links}）。検査が発火していない`);
  assert.deepEqual(broken, []);
});

test('新しい Agent・知識 Skill に、旧体系の用語・番号が残っていない', () => {
  const OLD = OLD_WORKER_TERMS;
  const files = [
    ...mdUnder(path.join(SELF, 'agents')),
    ...KNOWLEDGE_SKILLS.flatMap((n) => mdUnder(path.join(SELF, 'skills', n))),
  ];
  const hits = files.flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .flatMap((line, i) => (OLD.test(line) ? [`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 80)}`] : []))
  );
  assert.deepEqual(hits, []);
});

test('検出器の素振り: 旧体系の語を含む行を上の検査（Agent・知識 Skill と Phase Skill の両方）が拾う', () => {
  for (const bad of ['G9 が止める', 'C2_no_requirement_conflict', 'P8 で確認', '工程10', 'run 20260927_003229', 'fixtures/sample-repos', '.requests/spec', '基本設計書 §8', '系統A', 'K2 を判定', 'P3 で承認', 'spec.md を書く', 'design-map を読む', 'MANIFEST に記録', 'Phase B で', 'keep-review.md', 'spec-writer を起動', 'output/<ts>/generated']) {
    assert.ok(OLD_WORKER_TERMS.test(bad), `${bad} を見逃した`);
    assert.ok(OLD_PHASE_TERMS.test(bad), `${bad} を見逃した（Phase Skill）`);
  }
  assert.ok(OLD_WORKER_TERMS.test('SendMessage で再開する'));
  for (const bad of ['S2 の終わり', 'state:record を呼ぶ', '/security-review を実行', '/code-review を実行']) {
    assert.ok(OLD_PHASE_TERMS.test(bad), `${bad} を見逃した（Phase Skill）`);
  }
  for (const ok of ['V7 が止める', 'G2 の承認を取る', 'G3 は差分のゲート', 'run の骨格', 'work/<ts>/change-plan.md']) {
    assert.ok(!OLD_WORKER_TERMS.test(ok), `${ok} を過検出した`);
    assert.ok(!OLD_PHASE_TERMS.test(ok), `${ok} を過検出した（Phase Skill）`);
  }
  assert.ok(!OLD_PHASE_TERMS.test('SendMessage で再開しない'), 'Phase Skill では「再開しない」の規則を許す');
});

// ---- 段階 Skill（/canon-plan・/canon-design・/canon-build） ----

const STAGE_SKILLS = ['canon-plan', 'canon-design', 'canon-build'];
const stageSkillText = (n) => readFileSync(path.join(SELF, 'skills', n, 'SKILL.md'), 'utf8');

test('段階 Skill は3件そろい（canon-a〜d を残さない）、手動起動専用・inline 実行・本文500行未満', () => {
  const dirs = readdirSync(path.join(SELF, 'skills')).filter((n) => /^canon-/.test(n) && existsSync(path.join(SELF, 'skills', n, 'SKILL.md')));
  assert.deepEqual(
    dirs.filter((n) => n !== 'canon-reference' && n !== 'canon-update').sort(),
    [...STAGE_SKILLS].sort(),
    'v2 の Phase Skill の残存、または段階 Skill の欠落'
  );
  for (const name of STAGE_SKILLS) {
    const text = stageSkillText(name);
    const fm = text.split(/^---\s*$/m)[1] ?? '';
    assert.match(fm, new RegExp(`^name:\\s*${name}\\s*$`, 'm'), `${name}: name が無い`);
    assert.match(fm, /^disable-model-invocation:\s*true\s*$/m, `${name}: disable-model-invocation: true が無い`);
    assert.match(fm, /^argument-hint:/m, `${name}: argument-hint が無い`);
    // fork するとメインの会話履歴を継承せず、ヒアリングと人間ゲートの対話が成り立たない
    assert.doesNotMatch(fm, /^context:\s*fork/m, `${name}: context: fork を付けない`);
    assert.ok(text.split('\n').length < 500, `${name}: SKILL.md が500行以上`);
  }
});

test('段階 Skill の本文が呼ぶ npm scripts がすべて package.json に実在する', () => {
  const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  const missing = [];
  let calls = 0;
  for (const name of STAGE_SKILLS) {
    for (const m of stageSkillText(name).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
      calls++;
      if (!scripts[m[1]]) missing.push(`${name}: npm run ${m[1]}`);
    }
  }
  assert.ok(calls >= 25, `npm run の呼び出しが少なすぎる（実際: ${calls}）。検査が発火していない`);
  assert.deepEqual(missing, []);
});

test('段階 Skill は開始時に preflight で照合し、ゲートを単独の問いで取って承認を記録し、終わりに承認を照合する', () => {
  const expect = {
    'canon-plan': { stage: 'plan', record: ['record G1 '], check: 'approvals -- <ts> check --expect G1' },
    'canon-design': { stage: 'design', record: ['record G2 '], check: 'approvals -- <ts> check --expect G1,G2' },
    'canon-build': { stage: 'build', record: ['record <G2|G3> '], check: 'approvals -- <ts> check --expect <小は G1,G2／大は G1,G2,G3>' },
  };
  for (const [name, e] of Object.entries(expect)) {
    const t = stageSkillText(name);
    assert.ok(t.includes(`preflight -- <ts> --stage ${e.stage}`), `${name}: 開始時の照合（preflight --stage ${e.stage}）が無い`);
    for (const r of e.record) assert.ok(t.includes(r), `${name}: ${r.trim()} の記録が無い`);
    assert.ok(t.includes(e.check), `${name}: 終わりの承認の照合が無い`);
    assert.ok(t.includes('単独の問い'), `${name}: ゲートを単独の問いで取る規則が無い`);
    assert.ok(STAGES.includes(e.stage));
    assert.ok(t.includes(`session ${e.stage}`), `${name}: セッションの記録（session ${e.stage}）が無い`);
  }
});

test('段階 Skill が handoff に書く進捗のキー・route・stage・status が handoff の語彙に実在する', () => {
  let marks = 0;
  const bad = [];
  for (const name of STAGE_SKILLS) {
    const t = stageSkillText(name);
    for (const m of t.matchAll(/handoff -- <ts> mark (\S+)/g)) {
      marks++;
      if (!PROGRESS_KEY_RE.test(m[1].replace(/`.*$/, ''))) bad.push(`${name}: mark ${m[1]}`);
    }
    for (const m of t.matchAll(/\b(route|stage|status)=([a-z_]+)\b/g)) {
      if (!SETTABLE[m[1]].includes(m[2])) bad.push(`${name}: ${m[1]}=${m[2]}`);
    }
  }
  assert.ok(marks >= 9, `mark の呼び出しが少なすぎる（実際: ${marks}）。検査が発火していない`);
  assert.deepEqual(bad, []);
});

test('検出器の素振り: 進捗のキーの正規表現は v2 のキー・存在しないキーを拒否する', () => {
  for (const ok of ['計画1', '計画3', '設計1', '構築5']) assert.ok(PROGRESS_KEY_RE.test(ok), `${ok} を拒否した`);
  for (const bad of ['工程1', 'G1', '構築6', '設計2', '計画4']) assert.ok(!PROGRESS_KEY_RE.test(bad), `${bad} を通した`);
});

test('段階 Skill に旧体系の用語・番号と廃止した標準レビューの呼び出しが残っていない（SendMessage は「再開しない」の規則として許す）', () => {
  const OLD = OLD_PHASE_TERMS;
  const hits = STAGE_SKILLS.flatMap((n) =>
    stageSkillText(n)
      .split('\n')
      .flatMap((line, i) => (OLD.test(line) ? [`${n}:${i + 1}: ${line.trim().slice(0, 80)}`] : []))
  );
  assert.deepEqual(hits, []);
});

/**
 * run の worktree 方式（run ごとの worktree・run ブランチ・成果物の強制追加・handoff の課題候補の転記）の
 * 語が canon 本体に残っていないか。run は canon のルートで行う（architecture.md §7）。旧 docs/ と
 * 過去の版を記録する CHANGELOG.md、検出器自身を含む tests/ は対象外。
 */
const RUN_WORKTREE_TERMS = /canon-runs|run ブランチ|run\/<ts>|git add -f|canon 課題候補/;

test('canon 本体に run の worktree 方式の語が残っていない', () => {
  const files = trackedFiles('.claude', 'lib', 'tools', 'design', 'guide', 'tasks', 'README.md', '.gitignore', 'package.json');
  assert.ok(files.length >= 50, `検査対象が少なすぎる（実際: ${files.length}）`);
  const hits = files.flatMap((rel) =>
    readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => (RUN_WORKTREE_TERMS.test(line) ? [`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`] : []))
  );
  assert.deepEqual(hits, []);
});

test('検出器の素振り: run の worktree 方式の語を拾い、新方式の語は拾わない', () => {
  for (const bad of ['cd ../canon-runs/<ts>', 'run ブランチにコミットする', 'git branch -D run/<ts>', 'git add -f work/<ts>', '## canon 課題候補']) {
    assert.ok(RUN_WORKTREE_TERMS.test(bad), `${bad} を見逃した`);
  }
  for (const ok of ['canon のルートで起動する', 'canon_commit', 'tasks/lessons.md に書く', 'git worktree list --porcelain']) {
    assert.ok(!RUN_WORKTREE_TERMS.test(ok), `${ok} を過検出した`);
  }
});

/**
 * 層の語彙（L1〜L5・N層・layers・scope_layer・targets-l<N>）と、削除・改名したファイル（旧 docs/・判定表・層単位の references・旧ルール名）の語が、工程側に
 * 残っていないか。工程は機能単位（canon-reference の12機能・builder の8担当）で組んである。
 * 対象外: canon-reference（正典の本文は reference-check の検査9が見る）、検出の規則そのもの
 * （canon-update の build.md・checks.js）、旧語を写し替えるための誤マッピング表（terminology.md）、
 * 検出器と故意の違反を含む tests/、過去の版を記録する CHANGELOG.md。
 */
const LAYER_ERA_TERMS =
  /(?<![A-Za-z0-9])L[1-5](?![A-Za-z0-9])|L[1-5]_[A-Z]|(?<!階)層|レイヤー|layers:|targets-l\d|docs\/(00_INDEX|BEST_PRACTICES|ORCHESTRATION|SOURCES|TOOLS)|gates\/|conformance_tables|build:tables|canon-docs|scope_layer|`layer`|layer-design|skill-writing\.md|lib\/tables\.js|canon-reference-build\.md|gates-and-tests|lib gates|tools docs/;
const LAYER_ERA_EXEMPT = new Set([
  '.claude/skills/canon-update/references/build.md',
  '.claude/skills/canon-update/scripts/checks.js',
  '.claude/skills/requirements/references/terminology.md',
]);

test('工程側に層の語彙と旧 docs/・判定表の語が残っていない', () => {
  const files = trackedFiles('.claude', 'lib', 'tools', 'design', 'guide', 'README.md', 'package.json', '.github', '.gitignore')
    .filter((rel) => !rel.startsWith('.claude/skills/canon-reference/') && !LAYER_ERA_EXEMPT.has(rel));
  assert.ok(files.length >= 50, `検査対象が少なすぎる（実際: ${files.length}）`);
  const hits = files.flatMap((rel) =>
    readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => (LAYER_ERA_TERMS.test(line) ? [`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`] : []))
  );
  assert.deepEqual(hits, []);
});

test('検出器の素振り: 層の語彙と旧 docs/ の語を拾い、普通の語は拾わない', () => {
  for (const bad of ['L2 の宣言', 'builder を起動する層', 'targets-l2.txt', 'layers: 3層', '正典 L2_SKILLS.md', 'docs/BEST_PRACTICES.md', 'gates/conformance_tables', '## レイヤー構成', 'purpose / scope_layer', '`layer`・`kind`', 'references/layer-design.md', 'references/skill-writing.md', 'lib/tables.js', 'design/canon-reference-build.md', '.claude/rules/gates-and-tests.md', '-- .claude lib gates tools docs design guide']) {
    assert.ok(LAYER_ERA_TERMS.test(bad), `${bad} を見逃した`);
  }
  for (const ok of ['WSL2 で動かす', 'ディレクトリの階層', 'builder の担当', 'targets-skills-1.txt', 'code.claude.com/docs/en/hooks.md', '.claude/rules/checks-and-tests.md', 'lib/reference-data.js', '-- .claude lib tools design guide', 'scope_features', '`feature`・`kind`']) {
    assert.ok(!LAYER_ERA_TERMS.test(ok), `${ok} を過検出した`);
  }
});

/**
 * 工程側から canon-reference への参照（`features/x.md §N`・V-/Q- ID・`` `<data>:<collection>/<id>` ``）が
 * すべて解決するか。canon-reference は `/canon-update` で全ファイルを作り直すので、節や ID が変わったときに
 * 工程側の追従漏れをここで止める（reference-check は canon-reference の内側しか見ない）。
 */
test('工程側から canon-reference への参照（ファイル・節・ID・data）がすべて解決する', () => {
  const index = buildReferenceIndex(REFERENCE_DIR);
  const files = trackedFiles('.claude', 'lib', 'tools', 'design', 'guide', 'README.md')
    .filter((rel) => /\.(md|js)$/.test(rel) && !rel.startsWith('.claude/skills/canon-reference/'));
  const counts = { file: 0, section: 0, id: 0, data: 0 };
  const broken = [];
  for (const rel of files) {
    readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const ref of extractReferenceRefs(line, index)) {
          counts[ref.type]++;
          const why = resolveReferenceRef(ref, index);
          if (why) broken.push(`${rel}:${i + 1}: ${why}`);
        }
      });
  }
  for (const [type, n] of Object.entries(counts)) assert.ok(n >= 5, `${type} の参照が少なすぎる（実際: ${n}）。抽出が発火していない`);
  assert.deepEqual(broken, []);
});

test('検出器の素振り: 存在しない節・ID・data の要素・ファイルを解決できないと報告する', () => {
  const index = buildReferenceIndex(REFERENCE_DIR);
  const bad = [
    '`canon-reference/references/features/skills.md` §99',
    'selection.md §42',
    'V-skills-999',
    '`tools:tools/NoSuchTool`',
    '`canon-reference/references/features/no-such.md`',
  ];
  for (const line of bad) {
    const refs = extractReferenceRefs(line, index);
    assert.ok(refs.length > 0, `${line} を参照として抜き出せない`);
    assert.ok(refs.some((r) => resolveReferenceRef(r, index) !== null), `${line} の不在を見逃した`);
  }
  const good = extractReferenceRefs('`canon-reference/references/features/skills.md` §4・V-skills-18・`tools:tools/Read`', index);
  assert.deepEqual(good.map((r) => resolveReferenceRef(r, index)).filter(Boolean), []);
  assert.deepEqual(extractReferenceRefs('`generation/references/skills.md` §4', index), [], '工程側の同名ファイルを正典と取り違えない');
});

// ── モデルルーティング ─────────────────────────
// ネイティブ起動で Agent の model 引数を渡すと frontmatter を上書きする（canon-reference の features/subagents.md §3）。
// オーケストレーターの定義が例示で固定のモデル名を渡すと LLM が真似て、ワーカーが frontmatter と
// 違うモデルで走る。ネイティブ起動の例示に model 引数を書かない。
const ORCHESTRATOR_DOCS = [
  ...readdirSync(path.join(SELF, 'agents')).map((n) => path.join(SELF, 'agents', n, `${n}.md`)),
  ...STAGE_SKILLS.map((n) => path.join(SELF, 'skills', n, 'SKILL.md')),
].filter((p) => existsSync(p));

/** 本文中の Agent(...) の例示のうち、model 引数を渡しているもの（general-purpose のフォールバックだけは model が要る）。 */
function agentCallsWithModel(text) {
  return [...text.matchAll(/Agent\(([^)]*)\)/g)]
    .filter((m) => !/subagent_type="general-purpose"/.test(m[1]) && /\bmodel\s*=/.test(m[1]))
    .map((m) => m[0]);
}

test('ネイティブ起動の Agent 例示が model 引数を渡していない（frontmatter を唯一の正にする）', () => {
  const offenders = ORCHESTRATOR_DOCS.flatMap((p) => agentCallsWithModel(readFileSync(p, 'utf8')).map((c) => `${path.relative(ROOT, p)}: ${c}`));
  assert.deepEqual(offenders, []);
});

test('検出器の素振り: ネイティブ起動の例示に model 引数があれば上の検査が拾う', () => {
  assert.deepEqual(agentCallsWithModel('Agent(subagent_type="investigator", model="opus")'), ['Agent(subagent_type="investigator", model="opus")']);
  assert.deepEqual(agentCallsWithModel('Agent(subagent_type="general-purpose", model="opus")'), [], 'フォールバックは許す');
  assert.deepEqual(agentCallsWithModel('Agent(subagent_type="investigator")'), []);
});

const EFFORT_EXEMPT = new Set();

/** 割当（design/architecture.md §6.1）。frontmatter が唯一の正なので、変えるときは設計書と同時に直す。 */
const EXPECTED_MODEL = {
  investigator: ['sonnet', 'medium'],
  profiler: ['haiku', 'high'],
  builder: ['sonnet', 'medium'],
  reviewer: ['sonnet', 'high'],
  'prompt-auditor': ['sonnet', 'medium'],
  'session-analyst': ['haiku', 'high'],
};

test('Agent の model・effort が設計書 §6.1 の割当どおり', () => {
  const wrong = [];
  for (const [name, [model, effort]] of Object.entries(EXPECTED_MODEL)) {
    const fm = parseFrontmatter(readFileSync(path.join(SELF, 'agents', name, `${name}.md`), 'utf8')).frontmatter;
    if (fmValue(fm.model) !== model || fmValue(fm.effort) !== effort) wrong.push(`${name}: ${fmValue(fm.model)}・${fmValue(fm.effort)}（期待 ${model}・${effort}）`);
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual(Object.keys(EXPECTED_MODEL).sort(), Object.keys(EXPECTED_AGENTS).sort());
});

test('全 agent が effort を明示している（未指定だとセッションの effort を継承し、高 effort が伝播する）', () => {
  const missing = [];
  for (const n of readdirSync(path.join(SELF, 'agents'))) {
    const def = path.join(SELF, 'agents', n, `${n}.md`);
    if (EFFORT_EXEMPT.has(n) || !existsSync(def)) continue; // agent 以外のディレクトリ（サンドボックスのマウント点等）は対象外
    const fm = readFileSync(def, 'utf8').split('---')[1] || '';
    if (!/^effort:\s*(low|medium|high|xhigh|max)\s*$/m.test(fm)) missing.push(n);
  }
  assert.deepEqual(missing, []);
});

// ---- ワーカーの書込権限（tools）の設計 ----

test('読むだけの役割に Edit を与えない／書く役割は自分の成果物を書ける', () => {
  const toolsOf = (n) => splitListValue(loadArtifact(path.join(SELF, 'agents', n, `${n}.md`)).frontmatter.tools);
  // reviewer・profiler・session-analyst は自分の成果物を1ファイル書くだけ（Write）。Edit は要らない。
  for (const n of ['reviewer', 'profiler', 'session-analyst']) {
    assert.ok(toolsOf(n).includes('Write'), `${n} は自分の成果物を書くために Write が要る`);
    assert.ok(!toolsOf(n).includes('Edit'), `${n} に Edit は不要（差し戻しを受けない読み取り中心の役割）`);
  }
  // prompt-auditor は Skill で prompt-audit を実行し、報告を Write で残す。編集を適用しないことを Edit の不在で担保する。
  assert.ok(toolsOf('prompt-auditor').includes('Skill'), 'prompt-auditor は prompt-audit を呼ぶために Skill が要る');
  assert.ok(toolsOf('prompt-auditor').includes('Write'), 'prompt-auditor は報告を書くために Write が要る');
  assert.ok(!toolsOf('prompt-auditor').includes('Edit'), 'prompt-auditor に Edit は与えない（編集を適用しないことを tools で担保する）');
  // 差し戻しで指示の箇所だけを直す役割は Edit を持つ。investigator は大きい調査結果を全文書き直さずに直す。
  for (const n of ['investigator', 'builder']) {
    assert.ok(toolsOf(n).includes('Edit'), `${n} は差し戻しで該当箇所だけを直すために Edit が要る`);
  }
});

// ---- 定義に残すべき契約語（消えたら落ちる） ----

test('定義から消えてはならない契約語（生成物の読み手に向けた規約・信頼境界・再発防止の規則）', () => {
  const read = (rel) => readFileSync(path.join(SELF, rel), 'utf8');
  const must = [
    ['skills/generation/references/no-leaks.md', /読み手が解決できない参照/, '未定義の参照を書かない'],
    ['skills/generation/references/no-leaks.md', /編集メモ/, '編集メモを書かない'],
    ['skills/generation/references/no-leaks.md', /差分・経緯/, '差分・経緯の表現を書かない'],
    ['skills/generation/SKILL.md', /他の中間文書は読まない/, 'builder の過剰読込'],
    ['skills/generation/SKILL.md', /担当のファイルの件数と/, '件数の突き合わせ'],
    ['skills/generation/SKILL.md', /指示の無い箇所は 1 文字も変えない/, '触らない箇所を書き換えない'],
    ['skills/design/SKILL.md', /他の run の change-plan/, '設計の過剰読込'],
    ['skills/requirements/references/interview.md', /preview が表示されない環境がある/, 'preview の位置参照'],
    ['skills/requirements/references/requirements-template.md', /差分のどこにも現れてはならない/, 'allowed: false の意味'],
    ['skills/requirements/references/requirements-template.md', /「文言のみ」は `## 確定要件` に置かない/, '文言のみを確定させない'],
    ['skills/review/references/perspectives.md', /変えない（理由）」と答えた参照元を、全件/, 'impact の参照元の整合'],
    ['skills/review/SKILL.md', /Grep で確かめる/, '不在を根拠にする前の確認'],
  ];
  const missing = must.filter(([rel, re]) => !re.test(read(rel))).map(([rel, , why]) => `${rel}（${why}）`);
  assert.deepEqual(missing, []);
});
