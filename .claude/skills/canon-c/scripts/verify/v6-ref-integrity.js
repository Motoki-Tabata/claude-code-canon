/**
 * V6 参照整合（artifacts.md §8.2）。
 *
 * 検査内容:
 *   1. preload skill（`skills:`）実在
 *      出典: docs/L3_AGENTS.md:176「skills: [skill-name] # Preload Skills」
 *   2. `disable-model-invocation:true` skill を preload していない
 *      出典: docs/L3_AGENTS.md:714「disable-model-invocation: true の Skill を skills: で preload → エラー」
 *   3. description による委譲トリガーの妥当
 *      出典: docs/L3_AGENTS.md:124「description の精度が的中率を決める」＋公式コード例4件
 *      （docs/L3_AGENTS.md:243・docs/ORCHESTRATION.md:264,381,408）が全て "Delegate when"/"Delegate for"
 *      で締める。ただし正典はこれを MUST として明文化していない（観測されたパターンに留まる）ため、
 *      2段構えにする:
 *        (a) error: frontmatter の description が公式テンプレートの未編集プレースホルダそのもの
 *            （docs/L3_AGENTS.md:155 "What this agent does and when Claude should delegate to it"）
 *            ＝実質的に書かれていないので機械的に確実な違反。
 *        (b) warning: "Delegate when"/"Delegate for" 相当の委譲条件節が description に無い。
 *            正典に MUST の明文が無いため error にはしない（捏造回避）。
 *   4. supporting files 実在
 *      出典: docs/L2_SKILLS.md:77,99-109（Progressive Disclosure Loading・スキルディレクトリ構造）。
 *      SKILL.md body 中でバッククォート参照されるパス様トークン（`template.md`・`examples/sample.md`
 *      等）を2段で扱う（artifacts.md §8.2 V6-4）。パスらしい構文（拡張子付き or ディレクトリ区切りを
 *      含む・空白/`$`/URL を含まない）に絞るのは、正典がパターンを構造化していないための設計判断。
 *   5. plugin 参照実在
 *      出典: docs/L5_DISTRIBUTION.md:140-200（Plugin Manifest 完全スキーマ・Path挙動規則）。
 *      plugin.json の `skills` / `commands` / `agents` / `hooks` / `mcpServers` / `outputStyles` /
 *      `lspServers` / `experimental.themes` / `experimental.monitors` は明示パス文字列（単一 or 配列）
 *      であり、plugin root 相対で実在照合する。
 *   6. skill パッケージに定義ファイル SKILL.md が実在
 *      出典: docs/L2_SKILLS.md §2.1「ディレクトリ構造」（`SKILL.md # メイン指示（必須）`）。
 *      V1 が supporting files を許す以上、「定義ファイルが無いパッケージ」の検出はここで明示的に持つ。
 *   7. 非管理ファイルへの行番号引用の禁止（本書由来・artifacts.md §8.3）
 *      generated/ 配下のファイルが、管理パス集合（`lib/managed-paths.js` の `isManaged()`）に属さない
 *      対象プロジェクトのファイル（`README.md`・`contracts/README.md` 等）を `` `path/to/file.md:12` ``
 *      `` `path/to/file.md:12-40` `` 形式で行番号引用していたら error。行番号は対象プロジェクト側の編集で
 *      黙ってずれ、生成物側にはずれを検知する手段が無い。管理ファイル同士の行番号参照は対象外——
 *      生成物は同じ run で一括生成されるため相互の行番号がずれる余地がない。判定はバッククォート囲みの
 *      トークンに絞る（4 と同じ誤検出源対策・地の文の記述を拾わない）。
 *
 * generated/ を自分では歩かない。verify.js が1回の走査で作ったコンテキスト（`ctx.files`・`ctx.byRel`・
 * `ctx.dirs`）だけを見る。実在の判定もこの索引で行う（大小を区別する完全一致になるので、大小を
 * 無視する FS で `Skill.md` を `SKILL.md` と取り違えない）。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathsTable } from '../../../../../lib/tables.js';
import { skillPathRole, violation, splitListValue } from '../../../../../lib/artifact.js';
import { isManaged } from '../../../../../lib/managed-paths.js';
import { splitBySeverity } from './format.js';

const CHECK = 'V6';
const PLACEHOLDER_DESCRIPTION = 'What this agent does and when Claude should delegate to it';
const DELEGATE_TRIGGER_RE = /Delegate (when|for)/i;
// skill パッケージの必須エントリ（SKILL.md）の出典。正典 docs/L2_SKILLS.md §2.1 から
// build-conformance-tables.js が抽出した値を使う（出典を手書きせず表から引く）。
const SKILL_PACKAGE_SOURCE = `${pathsTable.kinds.skill.package_layout.required_entry.source}（ディレクトリ構造: SKILL.md は必須）`;

/** generated/ 相対パス（posix）を正規化する（`..` を解き、先頭 `./` を落とす）。 */
function normRel(p) {
  return path.posix.normalize(p).replace(/^\.\//, '').replace(/\/$/, '');
}

/** generated/ 相対のパスがファイルかディレクトリとして実在するか（索引で判定する）。 */
function existsInTree(ctx, relPath) {
  const r = normRel(relPath);
  if (r === '' || r === '.' || r.startsWith('..')) return false;
  return ctx.byRel.has(r) || ctx.dirs.has(r);
}

/** skill 定義ファイル（`.claude/skills/<name>/SKILL.md`）だけを列挙する（形状判定は skillPathRole が SSoT）。 */
function listSkillDefinitions(ctx) {
  return ctx.files.filter((f) => f.artifact && skillPathRole(f.rel) === 'definition');
}

/** skills/<dir>/SKILL.md を識別子（frontmatter name 優先・既定はディレクトリ名）で索引化する。 */
function buildSkillRegistry(ctx) {
  const registry = new Map(); // identifier -> artifact
  for (const f of listSkillDefinitions(ctx)) {
    const dirName = path.posix.basename(path.posix.dirname(f.rel));
    const nameValue = f.artifact.frontmatter?.name?.value;
    const id = typeof nameValue === 'string' && nameValue !== '' ? nameValue : dirName;
    registry.set(id, f.artifact);
    if (id !== dirName) registry.set(dirName, f.artifact); // 両方で引けるようにする（不一致は V1 が検出）
  }
  return registry;
}

// ---------------------------------------------------------------------------
// 1・2・3: agent の skills: preload と description
// ---------------------------------------------------------------------------

function checkAgentReferences(ctx, skillRegistry) {
  const violations = [];
  const files = ctx.files.filter((f) => f.artifact && f.rel.startsWith('.claude/agents/'));
  for (const f of files) {
    const artifact = f.artifact;
    if (artifact.kind !== 'agent') continue; // 配置逸脱は V1 の管轄。V6 は参照整合のみ扱う。

    // 1・2: skills: preload
    const skillsEntry = artifact.frontmatter?.skills;
    if (skillsEntry) {
      const names = splitListValue(skillsEntry);
      for (const skillName of names) {
        const target = skillRegistry.get(skillName);
        if (!target) {
          violations.push(
            violation(
              CHECK,
              artifact.path,
              `frontmatter "skills:" が preload するスキル "${skillName}" が output/<ts>/generated/.claude/skills/ に実在しない。`,
              'docs/L3_AGENTS.md:176'
            )
          );
          continue;
        }
        const disableFlag = target.frontmatter?.['disable-model-invocation']?.value;
        if (disableFlag === true) {
          violations.push(
            violation(
              CHECK,
              artifact.path,
              `frontmatter "skills:" が preload するスキル "${skillName}"（${target.path}）は disable-model-invocation:true であり preload 不可（エラーになる）。`,
              'docs/L3_AGENTS.md:714'
            )
          );
        }
      }
    }

    // 3: description の委譲トリガー
    const descEntry = artifact.frontmatter?.description;
    const descValue = typeof descEntry?.value === 'string' ? descEntry.value.trim() : null;
    if (descValue === PLACEHOLDER_DESCRIPTION) {
      violations.push(
        violation(
          CHECK,
          artifact.path,
          'frontmatter "description" が公式テンプレートの未編集プレースホルダのまま（実質未記入）。委譲判断ができない。',
          'docs/L3_AGENTS.md:155'
        )
      );
    } else if (descValue && !DELEGATE_TRIGGER_RE.test(descValue)) {
      violations.push(
        violation(
          CHECK,
          artifact.path,
          'frontmatter "description" に委譲トリガー節（"Delegate when"/"Delegate for" 相当）が見当たらない。' +
            '正典の公式コード例は一貫してこの形を採る（docs/L3_AGENTS.md:243・docs/ORCHESTRATION.md:264,381,408）が、' +
            'MUST として明文化されてはいないため非ブロッキングの注意に留める。',
          'docs/L3_AGENTS.md:124,243・docs/ORCHESTRATION.md:264,381,408',
          'warning'
        )
      );
    }
  }
  return { violations, scanned: files.length };
}

// ---------------------------------------------------------------------------
// 4: supporting files 実在
// ---------------------------------------------------------------------------

const PATH_LIKE_FILE_RE = /^(\.{1,2}\/)?[\w.-]+(\/[\w.-]+)*\.[A-Za-z0-9]{1,6}$/;
const PATH_LIKE_DIR_RE = /^(\.{1,2}\/)?[\w.-]+(\/[\w.-]+)*\/$/;

function extractPathLikeTokens(text) {
  const tokens = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[1].trim();
    if (!tok || /\s/.test(tok)) continue;
    if (tok.includes('$') || tok.includes('<') || tok.includes('>')) continue;
    if (/^https?:\/\//i.test(tok)) continue;
    if (tok.startsWith('mcp__')) continue;
    if (PATH_LIKE_FILE_RE.test(tok) || PATH_LIKE_DIR_RE.test(tok)) tokens.push(tok);
  }
  return [...new Set(tokens)];
}

/**
 * トークンが Tier A（構造上 supporting file 参照と確定できる）かを判定する（artifacts.md §8.2 V6-4）:
 *   - `./`・`../` を冠する明示相対トークン、または
 *   - トークンの第1セグメントがスキルディレクトリ直下に実在するエントリ名と一致するトークン
 *     （例: `examples/` が実在する場合の `examples/sample.md`）。
 * 該当しないものは Tier B（未解決なら warning に留める）。
 */
function isTierAToken(ctx, tok, skillDir) {
  if (tok.startsWith('./') || tok.startsWith('../')) return true;
  const firstSegment = tok.split('/')[0];
  return existsInTree(ctx, path.posix.join(skillDir, firstSegment));
}

function checkSupportingFiles(ctx) {
  const violations = [];
  let checked = 0;
  const targetRoot = ctx.targetRoot; // null でも Tier B は縮退して機能する
  for (const f of listSkillDefinitions(ctx)) {
    const artifact = f.artifact;
    const skillDir = path.posix.dirname(f.rel);
    const tokens = extractPathLikeTokens(artifact.body ?? artifact.rawText ?? '');
    for (const tok of tokens) {
      checked++;
      if (isTierAToken(ctx, tok, skillDir)) {
        if (!existsInTree(ctx, path.posix.join(skillDir, tok))) {
          violations.push(
            violation(
              CHECK,
              artifact.path,
              `body 中で参照される supporting file "${tok}" がスキルディレクトリ配下に実在しない（Progressive Disclosure Loading 対象・§L2_SKILLS.md）。`,
              'docs/L2_SKILLS.md:77,99-109'
            )
          );
        }
        continue;
      }

      // Tier B: スキルディレクトリ → generated root → target root の順で解決を試みる。
      // どこでも解決できなければ「参照先が解決できないパス様トークン」として報告に留める
      // （地の文のリポジトリ相対パスや一般名詞的なファイル名の言及を誤ブロックしない）。
      const resolvedSomewhere =
        existsInTree(ctx, path.posix.join(skillDir, tok)) ||
        existsInTree(ctx, tok) ||
        (targetRoot !== null && existsSync(path.resolve(targetRoot, tok)));
      if (!resolvedSomewhere) {
        violations.push(
          violation(
            CHECK,
            artifact.path,
            `body 中のパス様トークン "${tok}" の参照先が解決できない（supporting file か地の文かを構造だけでは断定できないため報告のみ）。`,
            'docs/L2_SKILLS.md:77,99-109',
            'warning'
          )
        );
      }
    }
  }
  return { violations, checked };
}

// ---------------------------------------------------------------------------
// 5: plugin 参照実在
// ---------------------------------------------------------------------------

const PLUGIN_PATH_FIELDS = ['skills', 'commands', 'agents', 'hooks', 'mcpServers', 'outputStyles', 'lspServers'];

function collectPluginPathValues(manifest) {
  const values = [];
  for (const field of PLUGIN_PATH_FIELDS) {
    const v = manifest[field];
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (typeof item === 'string') values.push({ field, value: item });
    } else if (typeof v === 'string') {
      values.push({ field, value: v });
    }
  }
  if (manifest.experimental && typeof manifest.experimental === 'object') {
    for (const field of ['themes', 'monitors']) {
      const v = manifest.experimental[field];
      if (typeof v === 'string') values.push({ field: `experimental.${field}`, value: v });
    }
  }
  return values;
}

const PLUGIN_ROOT = 'plugin';
const PLUGIN_MANIFEST = `${PLUGIN_ROOT}/.claude-plugin/plugin.json`;

function checkPluginReferences(ctx) {
  const violations = [];
  const file = ctx.byRel.get(PLUGIN_MANIFEST);
  if (!file) return { violations, checked: 0 }; // plugin 未使用は正当（L5 を使うかは設計次第）

  let manifest;
  try {
    manifest = JSON.parse(file.text);
  } catch (err) {
    violations.push(violation(CHECK, PLUGIN_MANIFEST, `plugin.json が正当な JSON として解析できない: ${err.message}`, 'docs/L5_DISTRIBUTION.md:140'));
    return { violations, checked: 0 };
  }

  const entries = collectPluginPathValues(manifest);
  for (const { field, value } of entries) {
    if (!existsInTree(ctx, path.posix.join(PLUGIN_ROOT, value))) {
      violations.push(
        violation(
          CHECK,
          PLUGIN_MANIFEST,
          `plugin.json の "${field}" が参照するパス "${value}" が plugin root 配下に実在しない。`,
          'docs/L5_DISTRIBUTION.md:140-200（Plugin Manifest 完全スキーマ・Path挙動規則）'
        )
      );
    }
  }
  return { violations, checked: entries.length };
}

// ---------------------------------------------------------------------------
// 6: skill パッケージに定義ファイル（SKILL.md）が実在する
// ---------------------------------------------------------------------------

/**
 * `.claude/skills/<name>/` の各パッケージディレクトリに `SKILL.md` が実在することを照合する。
 *
 * 出典: docs/L2_SKILLS.md §2.1「ディレクトリ構造」——`SKILL.md # メイン指示（必須）`。
 * paths.json の `kinds.skill.package_layout.required_entry` が SSoT。
 *
 * なぜ V6 に置くか: V1（per-file・純関数）は1ファイルしか見ないため「パッケージに定義ファイルが
 * 無い」を構造的に判定できない。V1 が supporting files を許す以上、`Skill.md` のような綴り違い
 * （サイレント不発火）はここで明示的に塞ぐ。
 */
function checkSkillPackages(ctx) {
  const violations = [];
  const prefix = '.claude/skills/';
  const dirs = [...ctx.dirs].filter((d) => d.startsWith(prefix) && !d.slice(prefix.length).includes('/'));
  for (const dir of dirs.sort()) {
    const name = dir.slice(prefix.length);
    // 索引の完全一致で判定する（大小を無視する FS の existsSync だと `Skill.md` を取り違える）。
    if (!ctx.byRel.has(`${dir}/SKILL.md`)) {
      violations.push(
        violation(
          CHECK,
          dir,
          `skill パッケージ "${name}/" に定義ファイル SKILL.md が実在しない（正典は「SKILL.md: メイン指示（必須）」と明記）。` +
            `supporting files だけを置いてもスキルは発動しない（エラーも出ないサイレント不発火）。`,
          SKILL_PACKAGE_SOURCE
        )
      );
    }
  }
  // skills ルート直下のファイルは V1 が orphan として弾くため、ここでは扱わない。
  return { violations, checked: dirs.length };
}

// ---------------------------------------------------------------------------
// 7: 非管理ファイルへの行番号引用の禁止
// ---------------------------------------------------------------------------

// バッククォート内かつ「拡張子付きパス:行番号[-行番号]」の形のみを対象にする。
// 判定④（extractPathLikeTokens）と同じ誤検出源対策——バッククォートに絞ることで
// 地の文の記述（「README.md の…節を参照」等、コロン無し）や version 文字列（`v2.1.251`）を拾わない。
const BACKTICK_RE = /`([^`\n]+)`/g;
const LINE_REF_RE = /^((?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,6}):(\d+)(?:-(\d+))?$/;

/** テキスト中のバッククォート囲みトークンから「パス:行番号」形の参照だけを抽出する。 */
function extractLineNumberRefs(text) {
  const refs = [];
  let m;
  BACKTICK_RE.lastIndex = 0;
  while ((m = BACKTICK_RE.exec(text)) !== null) {
    const tok = m[1].trim();
    const mm = LINE_REF_RE.exec(tok);
    if (mm) refs.push({ token: tok, refPath: mm[1] });
  }
  return refs;
}

/**
 * generated/ 配下の管理パス集合に属する全ファイル本文を走査し、管理パス集合に属さない参照先
 * （＝対象プロジェクトの非管理ファイル）への行番号引用を検出する。
 * 管理ファイル間の行番号参照（例: 生成物内の `.claude/rules/backend.md:12`）は
 * `isManaged()` が true を返すため対象外——生成物同士は同じ run で一括生成されるため
 * 相互の行番号がずれる余地がなく、正当な参照である。
 */
function checkUnmanagedLineRefs(ctx) {
  const violations = [];
  let checked = 0;
  for (const f of ctx.files) {
    if (!isManaged(f.rel)) continue; // 集合外の生成物は V8 が違反にする
    for (const { token, refPath } of extractLineNumberRefs(f.text)) {
      checked++;
      if (isManaged(refPath)) continue; // 生成物同士の行番号参照は正当
      violations.push(
        violation(
          CHECK,
          f.rel,
          `対象プロジェクトの非管理ファイル "${refPath}" を行番号で引用している（\`${token}\`）。` +
            '行番号は対象プロジェクト側の編集で無言でずれ、生成物側にはずれを検知する手段が無い。' +
            '節見出しで参照すること（例: 「README.md の「main への直接 push を防ぐ」節」）。',
          'artifacts.md §8.2 V6-7（本書由来・正典由来ではない）'
        )
      );
    }
  }
  return { violations, checked };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/** verify のコンテキストに V6 を当てる。 */
export function checkV6(ctx) {
  const skillRegistry = buildSkillRegistry(ctx);
  const agentResult = checkAgentReferences(ctx, skillRegistry);
  const supportingResult = checkSupportingFiles(ctx);
  const packageResult = checkSkillPackages(ctx);
  const pluginResult = checkPluginReferences(ctx);
  const lineRefResult = checkUnmanagedLineRefs(ctx);

  const { violations, warnings } = splitBySeverity([
    ...agentResult.violations,
    ...supportingResult.violations,
    ...packageResult.violations,
    ...pluginResult.violations,
    ...lineRefResult.violations,
  ]);
  return {
    violations,
    warnings,
    checked:
      agentResult.scanned + supportingResult.checked + packageResult.checked + pluginResult.checked + lineRefResult.checked,
  };
}
