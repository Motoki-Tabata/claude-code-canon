/**
 * 自己適用の回帰スイート（architecture.md §9.2）。
 *
 * verify の検査は「生成物」の検証だが、claude-canon 自身の `.claude/`（agents・skills）も
 * 同じ正典に従う成果物である。フックを使わない v2 では、ワーカーの権限の制限もここで担保する。
 *
 * ここが無いと、ワーカー定義の改変でパス規約・frontmatter・ツール名が壊れても
 * `npm test` は緑のまま——検証系が自分自身には目を閉じている状態になる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadArtifact, parseFrontmatter, splitListValue, skillPathRole } from '../lib/artifact.js';
import { checkV1 } from '../.claude/skills/canon-c/scripts/verify/v1-paths.js';
import { checkV2 } from '../.claude/skills/canon-c/scripts/verify/v2-frontmatter.js';
import { checkV3 } from '../.claude/skills/canon-c/scripts/verify/v3-tool-names.js';
import { checkV4 } from '../.claude/skills/canon-c/scripts/verify/v4-security.js';
import { readdirSync } from 'node:fs';
import { isNonSchemaRel } from '../lib/non-schema.js';
import { ROOT } from './helpers/paths.js';

const SELF = path.join(ROOT, '.claude');

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
  const out = execFileSync('git', ['ls-files', '-z', '--', rel], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\0')
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

test('Phase Skill の scripts/ は skill パッケージの supporting files として扱われる（V1・V2 の対象外）', () => {
  const out = execFileSync('git', ['ls-files', '-z', '--', '.claude/skills'], { cwd: ROOT, encoding: 'utf8' });
  const scripts = out.split('\0').filter((f) => /^\.claude\/skills\/[^/]+\/scripts\//.test(f));
  assert.ok(scripts.length >= 10, `scripts が少なすぎる（実際: ${scripts.length}）。0件を成功と誤認しない。`);
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

// ---- Agent 8体と知識 Skill 5件（architecture.md §4）----

/** Agent と、preload する知識 Skill の対応（architecture.md §4.1）。null は preload しない。 */
const EXPECTED_AGENTS = {
  investigator: 'investigation',
  'spec-writer': 'requirements',
  designer: 'design',
  builder: 'generation',
  reviewer: 'review',
  'keep-reviewer': 'review',
  'session-analyst': null,
  'prompt-auditor': null,
};
const KNOWLEDGE_SKILLS = ['investigation', 'requirements', 'design', 'generation', 'review'];

/** parseFrontmatter の値（文字列、または { value } を持つオブジェクト）を文字列で返す。 */
const fmValue = (v) => (v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? ''));

test('Agent は8体ちょうどで、それぞれ期待する知識 Skill を preload する', () => {
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
    assert.match(body, /(work|output)\/<ts>\//, `${name}: 本文に書込先（work/<ts>/ または output/<ts>/）が無い`);
    assert.match(body, /他の Subagent を起動しない/, `${name}: 本文に「他の Subagent を起動しない」が無い`);
  }
});

test('知識 Skill は5件ちょうどで、user-invocable: false・本文500行未満・disable-model-invocation なし', () => {
  // canon-reference は正典リファレンスで、旧体系の知識 Skill とは別に検査する
  const skillDirs = readdirSync(path.join(SELF, 'skills')).filter((n) => !/^canon-[a-d]$/.test(n) && n !== 'canon-reference').sort();
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

/** ディレクトリ配下の .md を再帰で集める（追跡外を含まない前提のコーパス：知識 Skill と Agent）。 */
function mdUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? mdUnder(p) : e.name.endsWith('.md') ? [p] : [];
  });
}

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
  // 旧ゲート番号・旧 keep 条件・旧ゲート・run 番号・旧機構の語。新番号は V1〜V9・K1〜K5・P1〜P5・工程1〜9。
  const OLD = /\bG\d{1,2}\b|\bC[1-5]_|\bP[6-8]\b|工程10|run 20\d{6}|fixtures\/|marker|\.requests|\.gate|基本設計書|詳細設計書|SendMessage|systemA|系統[AB]|eval-|quality-checklist/;
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

test('検出器の素振り: 旧体系の語を含む行を上の検査が拾う', () => {
  const OLD = /\bG\d{1,2}\b|\bC[1-5]_|\bP[6-8]\b|工程10|run 20\d{6}|fixtures\/|marker|\.requests|\.gate|基本設計書|詳細設計書|SendMessage|systemA|系統[AB]|eval-|quality-checklist/;
  for (const bad of ['G9 が止める', 'C2_no_requirement_conflict', 'P8 で確認', '工程10', 'run 20260927_003229', 'fixtures/sample-repos', '.requests/spec', '基本設計書 §8', '系統A']) {
    assert.ok(OLD.test(bad), `${bad} を見逃した`);
  }
  for (const ok of ['V7 が止める', 'K2_no_requirement_conflict', 'P3 で確認', 'run の骨格']) {
    assert.ok(!OLD.test(ok), `${ok} を過検出した`);
  }
});

// ---- Phase Skill（オーケストレーター） ----

const PHASE_SKILLS = ['canon-a', 'canon-b', 'canon-c', 'canon-d'];
const phaseSkillText = (n) => readFileSync(path.join(SELF, 'skills', n, 'SKILL.md'), 'utf8');

test('Phase Skill は4件そろい、手動起動専用・inline 実行・本文500行未満', () => {
  for (const name of PHASE_SKILLS) {
    const text = phaseSkillText(name);
    const fm = text.split(/^---\s*$/m)[1] ?? '';
    assert.match(fm, new RegExp(`^name:\\s*${name}\\s*$`, 'm'), `${name}: name が無い`);
    assert.match(fm, /^disable-model-invocation:\s*true\s*$/m, `${name}: disable-model-invocation: true が無い`);
    assert.match(fm, /^argument-hint:/m, `${name}: argument-hint が無い`);
    // fork するとメインの会話履歴を継承せず、ヒアリングと人間ゲートの対話が成り立たない
    assert.doesNotMatch(fm, /^context:\s*fork/m, `${name}: context: fork を付けない`);
    assert.ok(text.split('\n').length < 500, `${name}: SKILL.md が500行以上`);
  }
});

test('Phase Skill の本文が呼ぶ npm scripts がすべて package.json に実在する', () => {
  const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
  const missing = [];
  let calls = 0;
  for (const name of PHASE_SKILLS) {
    for (const m of phaseSkillText(name).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
      calls++;
      if (!scripts[m[1]]) missing.push(`${name}: npm run ${m[1]}`);
    }
  }
  assert.ok(calls >= 15, `npm run の呼び出しが少なすぎる（実際: ${calls}）。検査が発火していない`);
  assert.deepEqual(missing, []);
});

test('Phase Skill は開始時に承認を照合し、ゲートで承認を記録する', () => {
  const expect = { 'canon-b': 'P1,P2', 'canon-c': 'P1,P2,P3', 'canon-d': 'P1,P2,P3,P4' };
  for (const [name, gates] of Object.entries(expect)) {
    assert.ok(phaseSkillText(name).includes(`approvals -- <ts> check --expect ${gates}`), `${name}: 開始時の照合（--expect ${gates}）が無い`);
  }
  const gatesOf = { 'canon-a': ['P1', 'P2'], 'canon-b': ['P3'], 'canon-c': ['P4'], 'canon-d': ['P5'] };
  for (const [name, gates] of Object.entries(gatesOf)) {
    for (const g of gates) assert.ok(phaseSkillText(name).includes(`record ${g} `), `${name}: ${g} の記録が無い`);
  }
});

test('Phase Skill に旧体系の用語・番号が残っていない（SendMessage は「再開しない」の規則として許す）', () => {
  const OLD = /\bG\d{1,2}\b|\bC[1-5]_|\bP[6-8]\b|工程10|run 20\d{6}|fixtures\/|marker|\.requests|\.gate|基本設計書|詳細設計書|systemA|系統[AB]|eval-|quality-checklist|\bS[1-4]\b|state:record|recheck|resume/;
  const hits = PHASE_SKILLS.flatMap((n) =>
    phaseSkillText(n)
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
  const out = execFileSync('git', ['ls-files', '-z', '--', '.claude', 'lib', 'tools', 'design', 'guide', 'tasks', 'README.md', '.gitignore', 'package.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const files = out.split('\0').filter(Boolean);
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

test('Phase Skill が、廃止した標準レビュー（/security-review・/code-review）を呼ばない', () => {
  const hits = PHASE_SKILLS.filter((n) => /security-review|code-review/.test(phaseSkillText(n)));
  assert.deepEqual(hits, []);
});

/**
 * 決定論の検査（verify）の判定基準を変更したとき、それを人間可読な形で説明するワーカー定義
 * （.claude/agents/<name>/<name>.md・.claude/skills/<name>/SKILL.md）が追従しているかを npm test で検出する。
 * 「grep で横断検索せよ」という人間向けの規律だけだと、怠っても npm test は緑のまま追従漏れが放置される。
 *
 * ここでは実装契約が変わったときに人間が最初に触るであろう固有の語彙
 * （interface_change・旧規則の断片）を直接照合する。
 */
test('design Skill の keep 条件の説明が interface_change 機構に追従している', () => {
  const targets = [
    path.join(SELF, 'skills', 'design', 'references', 'existing-disposition.md'),
    path.join(SELF, 'skills', 'design', 'references', 'design-map-template.md'),
  ];
  for (const f of targets) {
    const body = readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    assert.ok(body.includes('interface_change'), `${rel}: keep 条件の説明に interface_change 機構への言及が無い`);
    assert.ok(/interface_change:\s*none/.test(body), `${rel}: interface_change: none の具体例が無い`);
    assert.ok(
      !body.includes('廃止/改修されない'),
      `${rel}: 旧規則の断片（廃止/改修されない）が残っている——interface_change 機構に置き換わっていない`
    );
  }
});

// ── モデルルーティング ─────────────────────────
// ネイティブ起動で Agent の model 引数を渡すと frontmatter を上書きする（canon-reference の features/subagents.md §3）。
// オーケストレーターの定義が例示で固定のモデル名を渡すと LLM が真似て、ワーカーが frontmatter と
// 違うモデルで走る。ネイティブ起動の例示に model 引数を書かない。
const ORCHESTRATOR_DOCS = [
  ...readdirSync(path.join(SELF, 'agents')).map((n) => path.join(SELF, 'agents', n, `${n}.md`)),
  ...PHASE_SKILLS.map((n) => path.join(SELF, 'skills', n, 'SKILL.md')),
].filter((p) => existsSync(p));

test('ネイティブ起動の Agent 例示が model 引数を渡していない（frontmatter を唯一の正にする）', () => {
  const offenders = [];
  for (const p of ORCHESTRATOR_DOCS) {
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/Agent\(([^)]*)\)/g)) {
      const args = m[1];
      if (/subagent_type="general-purpose"/.test(args)) continue; // フォールバックだけは model が要る
      if (/\bmodel\s*=/.test(args)) offenders.push(`${path.relative(ROOT, p)}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('検出器の素振り: ネイティブ起動の例示に model 引数があれば上の検査が拾う', () => {
  const bad = 'Agent(subagent_type="spec-writer", model="opus")';
  const hit = [...bad.matchAll(/Agent\(([^)]*)\)/g)].some(
    (m) => !/subagent_type="general-purpose"/.test(m[1]) && /\bmodel\s*=/.test(m[1])
  );
  assert.equal(hit, true);
});

const EFFORT_EXEMPT = new Set();

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
  // reviewer・keep-reviewer は自分の成果物を1ファイル書くだけ（Write）。Edit は要らない。
  for (const n of ['reviewer', 'keep-reviewer']) {
    assert.ok(toolsOf(n).includes('Write'), `${n} は自分の成果物を書くために Write が要る`);
    assert.ok(!toolsOf(n).includes('Edit'), `${n} に Edit は不要（差し戻しを受けない読み取り中心の役割）`);
  }
  // prompt-auditor は Skill で prompt-audit を実行し、報告を Write で残す。編集を適用しないことを Edit の不在で担保する。
  assert.ok(toolsOf('prompt-auditor').includes('Skill'), 'prompt-auditor は prompt-audit を呼ぶために Skill が要る');
  assert.ok(toolsOf('prompt-auditor').includes('Write'), 'prompt-auditor は報告を書くために Write が要る');
  assert.ok(!toolsOf('prompt-auditor').includes('Edit'), 'prompt-auditor に Edit は与えない（編集を適用しないことを tools で担保する）');
  // 差し戻しで指示の箇所だけを直す役割は Edit を持つ。investigator は大きい調査結果を全文書き直さずに直す。
  for (const n of ['investigator', 'spec-writer', 'designer', 'builder']) {
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
    ['skills/generation/SKILL.md', /design-map.md の全文は読まない/, 'builder の過剰読込'],
    ['skills/generation/SKILL.md', /宣言一覧の全件が書けていること/, '件数の突き合わせ'],
    ['skills/generation/SKILL.md', /emit-manifest/, 'README・MANIFEST は builder が書かない'],
    ['skills/design/SKILL.md', /他の run の design-map/, 'designer の過剰読込'],
    ['skills/requirements/references/interview.md', /preview が表示されない環境がある/, 'preview の位置参照'],
    ['skills/requirements/references/requirements-template.md', /生成物のどこにも現れてはならない/, 'allowed: false の意味'],
    ['skills/review/references/keep-review.md', /意図的に含まれていない/, 'designer の主張を除く契約'],
    ['skills/review/SKILL.md', /Grep で確かめる/, '不在を根拠にする前の確認'],
  ];
  const missing = must.filter(([rel, re]) => !re.test(read(rel))).map(([rel, , why]) => `${rel}（${why}）`);
  assert.deepEqual(missing, []);
});
