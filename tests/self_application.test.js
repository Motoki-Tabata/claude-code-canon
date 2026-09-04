/**
 * 自己適用の回帰スイート（詳細設計書 §15.3）。
 *
 * G1〜G12 は「生成物」の検証だが、claude-canon 自身の `.claude/`（agents・skills）も
 * 同じ正典に従う成果物である。§15.3 は「自己適用を回帰スイート化する」と規定するが、
 * 開発初期は移植元の旧 `.claude`（`_old/`・2026-08-28 に削除済み）への回帰テストしか
 * 存在せず、**現行の `.claude/` を検査するテストが無かった**（追跡外の資産に依存する回帰
 * テストだけが自己適用を名乗っていた）。その後 eval-* 6体と quality-checklist を足すに
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
import { loadArtifact } from '../gates/lib/artifact.js';
import { splitListValue } from '../gates/lib/artifact.js';
import { checkG3 } from '../gates/g3_path_convention.js';
import { checkG4 } from '../gates/g4_frontmatter_schema.js';
import { checkG5 } from '../gates/g5_tool_names.js';
import { checkG6 } from '../gates/g6_security.js';
import { checkG13 } from '../gates/g13_worker_privilege.js';
import { listCandidates, candidateClaudeDir } from '../gates/lib/generations.js';
import { readdirSync, statSync } from 'node:fs';
import { isNonSchemaRel } from '../gates/lib/non-schema.js';
import { deriveLaunchMethod } from '../gates/g10_readme.js';
import { collectListingEntries, analyzeReadmeMentions } from '../gates/lib/readme-listing.js';
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

test('claude-canon 自身のワーカー定義が G13（シェル剥奪）を通る', () => {
  const r = checkG13({});
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.ok(r.checked >= 18, `検査対象が少なすぎる（実際: ${r.checked}）。agents 不在を合格と誤認しない。`);
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

/** readdirSync 再帰版の .md 列挙。generations/candidate-<label>/ は .gitignore 対象で
 * git ls-files に現れないため、walkMd（git ベース）は使えない（§13.2）。
 * 非スキーマ判定は gates/lib/non-schema.js が SSoT（L005／L027／L029）: ワーカー定義
 * （agent/skill/rule）ではなく G10 の担当のため G3/G4 の対象外（機能Y ライブ e2e で
 * candidate-readme/ 実測時に発見）。dir は常に候補の `.claude` 直下（またはその配下）を
 * 指すため base:'claude' で判定する（root は再帰の起点＝最初の呼び出しの dir を保つ）。 */
function walkMdFs(dir, root = dir) {
  if (!existsSync(dir)) return [];
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walkMdFs(p, root));
    else if (name.endsWith('.md') && !isNonSchemaRel(path.relative(root, p), 'claude')) out.push(p);
  }
  return out;
}

test('機能Y: generations/candidate-*/ が存在すれば G3〜G6＋G13 を適用する（不在ならスキップ・§13.2）', () => {
  const labels = listCandidates(ROOT);
  if (labels.length === 0) {
    // 候補世代が無いのは正当な状態（機能Yの自己再生成は未着手・§13.2末尾）。
    // 0件を「検査した」と誤認しないよう、スキップである旨を明示する。
    return;
  }
  for (const label of labels) {
    const candDir = candidateClaudeDir(label, ROOT);
    const files = walkMdFs(candDir);
    const found = [];
    for (const f of files) {
      const a = loadArtifact(f);
      for (const v of [...checkG3(a), ...checkG4(a), ...checkG5(a), ...checkG6(a)]) {
        found.push(`${path.relative(candDir, f)}: ${v.gate} ${v.message}`);
      }
    }
    assert.deepEqual(found, [], `候補世代 ${label} が G3〜G6 に違反:\n${found.join('\n')}`);

    const r = checkG13({ canonRoot: path.dirname(candDir) });
    assert.equal(r.ok, true, `候補世代 ${label} が G13 に違反（自己欺瞞の可能性）: ${JSON.stringify(r.violations)}`);
  }
});

test('eval-* 6体と quality-checklist が実在する（工程9の成果物が消えたら落ちる）', () => {
  for (const name of [
    'eval-reviewer',
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

test('J-1: preload 専用 Skill（user-invocable:false）が .claude/README.md に露出していない（§12.4 自己適用）', () => {
  // G10 自身は output/<ts>/generated/ 固定で自己適用できないため、export 済みの
  // deriveLaunchMethod（起動方式の導出ロジック・SSoT）を稼働中の .claude/skills/*/SKILL.md へ
  // 直接適用する（実昇格準備2・J-1 決着）。
  const skillsDir = path.join(SELF, 'skills');
  const readme = readFileSync(path.join(SELF, 'README.md'), 'utf8');
  const internal = [];
  const listed = [];
  for (const name of readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    const a = loadArtifact(skillPath);
    const { listed: isListed } = deriveLaunchMethod('skill', a.frontmatter);
    (isListed ? listed : internal).push(name);
  }
  assert.equal(internal.length, 11, `内部専用 Skill は11件のはず（実際: ${internal.length}）`);
  assert.equal(listed.length, 3, `ユーザー起動可能な Skill は3件（canon/self-optimize/update-docs）のはず（実際: ${listed.length}）`);

  // 判定式は G10 と同じ SSoT（gates/lib/readme-listing.js）を使う。ここへ独立実装を
  // 置くと、片側だけが §12.4 の改訂に追従しない（gates-and-tests.md「複製しない」）。
  const entries = collectListingEntries(readme);
  for (const name of internal) {
    const { slash, listing } = analyzeReadmeMentions(readme, name, entries);
    assert.equal(listing.length, 0, `内部専用 Skill "${name}" が利用者向け一覧に載っている（§12.4 違反）`);
    assert.equal(slash.length, 0, `内部専用 Skill "${name}" の起動表記 \`/${name}\` が README にある（§12.4 起動不可）`);
  }
  for (const name of listed) {
    assert.ok(readme.includes(name), `ユーザー起動可能な Skill "${name}" が README に登場しない（網羅性・§12.2 違反）`);
    const { slash } = analyzeReadmeMentions(readme, name, entries);
    assert.ok(slash.length > 0, `Skill "${name}" の起動方法 \`/${name}\` が README に無い（起動方式の正典整合・§12.4）`);
  }

  // 検出力の証明: 上のループが「一覧が空だから素通りしている」のでないことを、README 文字列へ
  // 一覧行を注入して確かめる（実ファイルは触らない・.claude/rules/gates-and-tests.md）。
  const victim = internal[0];
  const injected = `${readme}\n\n| Skill | 起動方法 |\n|---|---|\n| \`${victim}\` | 起動不可 |\n`;
  assert.ok(
    analyzeReadmeMentions(injected, victim).listing.length > 0,
    `一覧への注入が検出されない——J-1 の述語が vacuous（対象: ${victim}）`
  );
  assert.ok(
    analyzeReadmeMentions(`${readme}\n\n\`/${victim}\` で起動。\n`, victim).slash.length > 0,
    `スラッシュ表記の注入が検出されない——J-1 の述語が vacuous（対象: ${victim}）`
  );
});

/**
 * L035 の機構化: 決定論ゲート（gates/*.js）の判定基準を変更したとき、それを人間可読な形で
 * 説明するワーカー定義（.claude/agents/<name>/<name>.md・.claude/skills/<name>/SKILL.md）が追従しているかを
 * npm test で検出する。L035 は「grep で横断検索せよ」という人間向けの規律だったが、これを
 * 怠ると npm test は緑のまま追従漏れが放置される（実際に3回目の /self-optimize run で発生）。
 *
 * gates/g2_keep_judgement.js の INTERFACE_CHANGE_VALUES/BREAKING_DISPOSITIONS は export
 * されておらず（gates/ 側のコードは本 run のスコープ外で変更しない）、ここでは実装契約が
 * 変わったときに人間が最初に触るであろう固有の語彙（interface_change・旧規則の断片）を
 * 直接照合する。
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

test('L035: 系統A/B・eval-keep-review の調査スコープ説明が /self-optimize 例外（§5.1）に追従している', () => {
  const targets = [
    path.join(SELF, 'agents', 'existing-customization-analyzer', 'existing-customization-analyzer.md'),
    path.join(SELF, 'agents', 'investigator', 'investigator.md'),
    path.join(SELF, 'agents', 'project-profiler', 'project-profiler.md'),
    path.join(SELF, 'agents', 'eval-keep-review', 'eval-keep-review.md'),
  ];
  for (const f of targets) {
    const body = readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    // 「claude-canon 自身は（棚卸し）対象にしません」型の記述自体は /canon の既定動作として
    // 正しい。stale の兆候は、その記述の近くに /self-optimize 例外への言及が一切無いこと
    // （基本設計書 §5.1 の唯一の例外を無条件表現のまま読者に伝え損ねている状態）。
    assert.ok(
      body.includes('self-optimize'),
      `${rel}: 調査スコープの説明が /self-optimize 例外（基本設計書 §5.1）に触れていない`
    );
  }
});

test('L035: G13 matcher を引用する SKILL.md が .claude/settings.json の実値と一致する', () => {
  const settings = JSON.parse(readFileSync(path.join(SELF, 'settings.json'), 'utf8'));
  const actualMatcher = settings.hooks?.UserPromptExpansion?.[0]?.matcher;
  assert.ok(actualMatcher, 'settings.json から UserPromptExpansion matcher を読めない（検査対象なし）');

  const targets = [
    path.join(SELF, 'skills', 'canon', 'SKILL.md'),
    path.join(SELF, 'skills', 'update-docs', 'SKILL.md'),
    path.join(SELF, 'skills', 'self-optimize', 'SKILL.md'),
  ];
  let quoted = 0;
  const matcherLiteralRe = /`([a-z][a-z-]*(?:\|[a-z][a-z-]*)+)`/g;
  for (const f of targets) {
    const body = readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    for (const m of body.matchAll(matcherLiteralRe)) {
      // matcher らしき文字列（"canon" を含むパイプ区切り）だけを対象にする。他の無関係な
      // パイプ区切りバッククォート文字列（無い想定だが将来の誤検知を避ける）は無視する。
      if (!m[1].includes('canon')) continue;
      quoted++;
      assert.equal(m[1], actualMatcher, `${rel}: matcher 引用 "${m[1]}" が settings.json の実値 "${actualMatcher}" と不一致`);
    }
  }
  assert.ok(quoted > 0, 'matcher を引用する SKILL.md が1件も見つからない（検査が発火していない＝vacuous）');
});
