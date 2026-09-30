/**
 * 自己適用の回帰スイート（詳細設計書 §15.3）。
 *
 * gates/ の検査は「生成物」の検証だが、claude-canon 自身の `.claude/`（agents・skills）も
 * 同じ正典に従う成果物である。§15.3 は「自己適用を回帰スイート化する」と規定するが、
 * 開発初期は移植元の旧 `.claude`（`_old/`・2026-08-28 に削除済み）への回帰テストしか
 * 存在せず、**現行の `.claude/` を検査するテストが無かった**（追跡外の資産に依存する回帰
 * テストだけが自己適用を名乗っていた）。その後 eval-* 5体と quality-checklist を足すに
 * あたり、この空白を埋めた。
 *
 * ここが無いと、ワーカー定義の改変でパス規約・frontmatter・ツール名が壊れても
 * `npm test` は緑のまま——検証系が自分自身には目を閉じている状態になる。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadArtifact, parseFrontmatter, splitListValue } from '../gates/lib/artifact.js';
import { checkG3 } from '../gates/g3_path_convention.js';
import { checkG4 } from '../gates/g4_frontmatter_schema.js';
import { checkG5 } from '../gates/g5_tool_names.js';
import { checkG6 } from '../gates/g6_security.js';
import { readdirSync, statSync } from 'node:fs';
import { isNonSchemaRel } from '../gates/lib/non-schema.js';
import { ROOT } from './helpers/paths.js';

const SELF = path.join(ROOT, '.claude');

/**
 * `git ls-files` で追跡対象の .md だけを歩く。素朴な readdirSync 再帰だと
 * `.claude/worktrees/<name>/`（.git/info/exclude で除外されたセッション用の
 * ネスト git worktree）配下の無関係なファイルまで拾ってしまう（L017 系の罠）。
 *
 * 非スキーマ判定は gates/lib/non-schema.js が SSoT（L005／L027／L029・walkMd/walkMdFs の
 * 姉妹関数が同じ除外を独立に複製し波及漏れを2度起こした経緯がある）。dir は常に SELF
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

test('claude-canon 自身の .claude/**.md が G3〜G6 で違反0件', () => {
  const files = walkMd(SELF);
  assert.ok(files.length >= 20, `検査対象が少なすぎる（実際: ${files.length}）。0件を成功と誤認しない。`);

  const found = [];
  for (const f of files) {
    const a = loadArtifact(f);
    for (const v of [...checkG3(a), ...checkG4(a), ...checkG5(a), ...checkG6(a)]) {
      found.push(`${path.relative(ROOT, f)}: ${v.gate} ${v.message}`);
    }
  }
  assert.deepEqual(found, [], `自己適用で違反を検出:\n${found.join('\n')}`);
});

// ---- ワーカーの権限: コマンド実行系ツールを持たない ----
//
// claude-canon 自身のワーカー（.claude/agents/**）はコマンド実行系ツールを持たない。実行を要する処理は
// オーケストレーターが scripts の CLI で行う。禁止集合は代表例でなく能力で定義する: Bash と同じ
// permission rule で駆動される Monitor、Windows の PowerShell も同じ能力である。tools: の省略は
// 全ツール継承（docs/TOOLS.md「Inherits all tools if omitted.」）なので違反とする。frontmatter が
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

test('agent の skills: preload が実在し、disable-model-invocation な Skill を preload していない（G7 相当の自己適用）', () => {
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

test('eval-* 5体と quality-checklist が実在する（工程9の成果物が消えたら落ちる）', () => {
  for (const name of [
    'eval-correctness',
    'eval-security',
    'eval-canon',
    'eval-context',
    'eval-keep-review',
  ]) {
    assert.ok(existsSync(path.join(SELF, 'agents', name, `${name}.md`)), `${name} が無い`);
  }
  assert.ok(existsSync(path.join(SELF, 'skills', 'quality-checklist', 'SKILL.md')));
});

/**
 * L035 の機構化: 決定論ゲート（gates/*.js）の判定基準を変更したとき、それを人間可読な形で
 * 説明するワーカー定義（.claude/agents/<name>/<name>.md・.claude/skills/<name>/SKILL.md）が追従しているかを
 * npm test で検出する。L035 は「grep で横断検索せよ」という人間向けの規律だったが、これを
 * 怠ると npm test は緑のまま追従漏れが放置される。
 *
 * ここでは実装契約が変わったときに人間が最初に触るであろう固有の語彙
 * （interface_change・旧規則の断片）を直接照合する。
 */
test('L035: designer/existing-disposition の C3 説明が interface_change 機構に追従している', () => {
  const targets = [
    path.join(SELF, 'agents', 'designer', 'designer.md'),
    path.join(SELF, 'skills', 'existing-disposition', 'SKILL.md'),
  ];
  for (const f of targets) {
    const body = readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    assert.ok(body.includes('interface_change'), `${rel}: C3 の説明に interface_change 機構への言及が無い（L035）`);
    assert.ok(/interface_change:\s*none/.test(body), `${rel}: interface_change: none の具体例が無い`);
    assert.ok(
      !body.includes('廃止/改修されない'),
      `${rel}: C3 の旧規則の断片（廃止/改修されない）が残っている——interface_change 機構に置き換わっていない`
    );
  }
});

// ── モデルルーティング（run 20260919 の実測欠陥の回帰） ─────────────────────────
// ネイティブ起動で Agent の model 引数を渡すと frontmatter を上書きする（正典 L3 §2.1）。
// オーケストレータ系の定義が例示で固定のモデル名を渡すと LLM が真似て、spec-writer・generator が
// frontmatter sonnet のまま Opus で走った。ネイティブ起動の例示に model 引数を書かない。
const ORCHESTRATOR_DOCS = [
  ...readdirSync(path.join(SELF, 'agents')).map((n) => path.join(SELF, 'agents', n, `${n}.md`)),
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

// ---- 調査ワーカーの直接起動（中継役 investigator の廃止）----

test('investigator（深さ2の中継役）は廃止済み。系統A/B は自分の成果物を書ける（Write）が、コマンド実行系ツールは持たない', () => {
  assert.equal(existsSync(path.join(SELF, 'agents', 'investigator')), false, 'investigator を復活させない（深さ2の報告が呼び出し元に届かない failure mode の再発）');
  const toolsOf = (n) => (/^tools:\s*(.+)$/m.exec(readFileSync(path.join(SELF, 'agents', n, `${n}.md`), 'utf8').split('---')[1])?.[1] ?? '').split(/\s+/);
  for (const n of ['existing-customization-analyzer', 'project-profiler']) {
    const tools = toolsOf(n);
    assert.ok(tools.includes('Write'), `${n} は自分の成果物を書くために Write が要る`);
    for (const banned of ['Bash', 'PowerShell', 'Monitor']) {
      assert.ok(!tools.includes(banned), `${n} がコマンド実行系ツール ${banned} を持っている（G13・承認の偽造経路）`);
    }
  }
});

test('run 20260925・20260927 の分析で入れた規律が定義から消えていない（文言の回帰ロック）', () => {
  const read = (rel) => readFileSync(path.join(SELF, rel), 'utf8');
  const must = [
    ['agents/generator/generator.md', /run_in_background: false` を明示/, 'builder の非同期起動'],
    ['agents/generator/generator.md', /ポーリングしない/, 'Glob ポーリング'],
    ['agents/generator/generator.md', /別の Builder に振り直さない/, '担当の二重振り'],
    ['agents/generator/generator.md', /copy-keep/, 'keep の決定論コピー'],
    ['agents/designer/designer.md', /他の run の `output\/\*\/design-map\.md`/, 'designer の過剰読込'],
    ['agents/readme-writer/readme-writer.md', /全件を載せる/, 'Rules 表の網羅'],
    ['skills/requirement-elicitation/SKILL.md', /preview は表示されない環境がある/, 'preview の位置参照'],
  ];
  const missing = must.filter(([rel, re]) => !re.test(read(rel))).map(([rel, , why]) => `${rel}（${why}）`);
  assert.deepEqual(missing, []);
});
