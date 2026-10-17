/**
 * V6 参照整合。
 *
 * 検査内容:
 *   1. preload skill（`skills:`）実在
 *      出典: canon-reference features/subagents.md（`frontmatter:subagent/skills` は Skill の全文を起動時に注入する）
 *   2. `disable-model-invocation:true` skill を preload していない
 *      出典: V-subagents-11（`disable-model-invocation: true` の Skill は preload できない）
 *   3. description による委譲トリガーの妥当
 *      出典: Q-subagents-01（description は、どの依頼のときに委譲すべきかを具体的に書く）。
 *      "Delegate when"/"Delegate for" で締める形は canon の慣習で、canon-reference は
 *      その文言を MUST として定めていない。そのため2段構えにする:
 *        (a) error: frontmatter の description が公式テンプレートの未編集プレースホルダそのもの
 *            （canon 独自の規則。未編集のテンプレートの文言を「書かれていない」と見なす）
 *            ＝実質的に書かれていないので機械的に確実な違反。
 *        (b) warning: "Delegate when"/"Delegate for" 相当（日本語の「委譲される」「委譲する」を含む）の
 *            委譲条件節が description に無い。
 *            canon-reference に MUST の明文が無いため error にはしない（捏造回避）。
 *   4. supporting files 実在
 *      出典: V-skills-18（SKILL.md から相対パスでリンクした補助ファイルが Skill のディレクトリの中に存在する）。
 *      SKILL.md body 中でバッククォート参照されるパス様トークン（`template.md`・`examples/sample.md`
 *      等）を2段で扱う（artifacts.md §8.2 V6-4）。パスらしい構文（拡張子付き or ディレクトリ区切りを
 *      含む・空白/`$`/URL を含まない）に絞るのは、canon-reference がパターンを構造化していないための設計判断。
 *      Markdown の相対リンク（`[表示名](./references/x.md)`）は、V-skills-18 の「相対パスでリンクした」
 *      そのものなので、コードフェンスの外のものを skill ディレクトリ相対で解決し、無ければ error にする
 *      （URL・`#` だけのリンク・絶対パスは対象外）。
 *   5. plugin 参照実在
 *      出典: V-plugins-05（manifest が指すコンポーネントのパスが、プラグインの中に存在する）。
 *      plugin.json の `skills` / `commands` / `agents` / `hooks` / `mcpServers` / `outputStyles` /
 *      `lspServers` / `experimental.themes` / `experimental.monitors` は明示パス文字列（単一 or 配列）
 *      であり、plugin root 相対で実在照合する。
 *   6. skill パッケージに定義ファイル SKILL.md が実在
 *      出典: V-skills-01（Skill の定義ファイルは `skills/<name>/` の直下の `SKILL.md`）。
 *      V1 が supporting files を許す以上、「定義ファイルが無いパッケージ」の検出はここで明示的に持つ。
 *   7. 変えたファイル以外への行番号引用の禁止
 *      変えたファイルが、この run で変えない（差分に無い）ファイルを `` `path/to/file.md:12` `` 形式で
 *      行番号引用していたら error。行番号は触らないファイル側の編集で黙ってずれ、検知する手段が無い。
 *      差分の中のファイル同士は同じ run で一括して直すので対象外。判定はバッククォート囲みのトークンに絞る。
 *   8. 変えたファイルからの参照（lib/refs.js の分類で missing のもの）は warning（地の文のパスを誤ブロックしない）
 *   9. 削除したファイルを指す、触らないファイル（と変えたファイル）の参照（`impact` と同じ走査）
 *      change-plan の「参照元の扱い」で「変えない（理由）」と答えたものは warning、答えていないものは error。
 *
 * worktree を自分では歩かない。lib/verify/context.js が作ったコンテキスト（`ctx.files`＝変えたファイル、
 * `ctx.has`・`ctx.hasDir`＝HEAD で追跡されている全体の索引）だけを見る。実在の判定は大小を区別する
 * 完全一致なので、大小を無視する FS で `Skill.md` を `SKILL.md` と取り違えない。
 */

import path from 'node:path';
import { cite } from '../reference-data.js';
import { skillPathRole, violation, splitListValue } from '../artifact.js';
import { computeFenceMask } from '../markdown.js';
import { extractRefs, classifyRef, basenameIndex as refBasenames } from '../refs.js';
import { splitBySeverity } from './format.js';

const CHECK = 'V6';
const PLACEHOLDER_DESCRIPTION = 'What this agent does and when Claude should delegate to it';
// 英語の "Delegate when/for" に加え、日本語の description の委譲条件（「…ときに委譲される」「…は委譲する」）も認める。
const DELEGATE_TRIGGER_RE = /Delegate (when|for)|委譲(される|する)/i;
// skill パッケージの必須エントリ（SKILL.md）の出典。
const PRELOAD_SOURCE = 'canon-reference features/subagents.md（frontmatter:subagent/skills）';
const PRELOAD_DISABLED_SOURCE = cite('V-subagents-11', 'frontmatter:skill/disable-model-invocation');
const DELEGATE_SOURCE = cite('Q-subagents-01');
const PLACEHOLDER_SOURCE = 'canon 独自の規則（公式テンプレートの未編集の文言）';
const SUPPORTING_FILE_SOURCE = cite('V-skills-18');
const PLUGIN_PATH_SOURCE = cite('V-plugins-05', 'plugin-manifest:fields');
const PLUGIN_JSON_SOURCE = cite('V-plugins-01', 'plugin-manifest:fields');
const SKILL_PACKAGE_SOURCE = `${cite('V-skills-01', 'paths:files/project:.claude/skills/<name>/SKILL.md')}（SKILL.md は必須）`;

/** worktree 相対パス（posix）を正規化する（`..` を解き、先頭 `./` を落とす）。 */
function normRel(p) {
  return path.posix.normalize(p).replace(/^\.\//, '').replace(/\/$/, '');
}

/** worktree 相対のパスがファイルかディレクトリとして実在するか（索引で判定する）。 */
function existsInTree(ctx, relPath) {
  const r = normRel(relPath);
  if (r === '' || r === '.' || r.startsWith('..')) return false;
  return ctx.has(r) || ctx.hasDir(r);
}

/** 変えた skill 定義ファイル（`.claude/skills/<name>/SKILL.md`）だけを列挙する（形状判定は skillPathRole が SSoT）。 */
function listSkillDefinitions(ctx) {
  return ctx.files.filter((f) => f.artifact && skillPathRole(f.rel) === 'definition');
}

/** skills/<dir>/SKILL.md を識別子（frontmatter name 優先・既定はディレクトリ名）で索引化する。 */
function buildSkillRegistry(ctx) {
  const registry = new Map(); // identifier -> artifact
  // preload の参照先は、変えていない skill も含めて HEAD の全体から引く。
  for (const f of ctx.skillDefinitions()) {
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
              `frontmatter "skills:" が preload するスキル "${skillName}" が worktree の .claude/skills/ に実在しない。`,
              PRELOAD_SOURCE
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
              PRELOAD_DISABLED_SOURCE
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
          PLACEHOLDER_SOURCE
        )
      );
    } else if (descValue && !DELEGATE_TRIGGER_RE.test(descValue)) {
      violations.push(
        violation(
          CHECK,
          artifact.path,
          'frontmatter "description" に委譲トリガー節（"Delegate when"/"Delegate for" 相当）が見当たらない。' +
            'canon の description はこの形で委譲の条件を書く慣習だが、canon-reference は文言を定めていないため非ブロッキングの注意に留める。',
          DELEGATE_SOURCE,
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
 * コードフェンスの外にある Markdown の相対リンクの参照先（`#anchor` を除いたパス）を集める。
 * URL（`scheme:`）・`#` だけのリンク・絶対パス・プレースホルダ（`$`・`<`）は対象外。
 */
function extractRelativeLinks(text) {
  const lines = text.split('\n');
  const mask = computeFenceMask(lines);
  const targets = [];
  lines.forEach((line, i) => {
    if (mask[i]) return;
    for (const m of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
      if (target.includes('$') || target.includes('<')) continue;
      targets.push(target);
    }
  });
  return [...new Set(targets)];
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

/** Tier B の未解決トークンを1件の warning にまとめるときに挙げる代表例の数。 */
const UNRESOLVED_SAMPLE_COUNT = 5;

/** worktree の追跡ファイル全体の basename 索引。パスを含まないファイル名のトークンを解決するのに使う。 */
function basenameIndex(ctx) {
  return new Set(ctx.tracked.map((r) => path.posix.basename(r)));
}

function checkSupportingFiles(ctx) {
  const violations = [];
  let checked = 0;
  const basenames = basenameIndex(ctx);
  for (const f of listSkillDefinitions(ctx)) {
    const artifact = f.artifact;
    const skillDir = path.posix.dirname(f.rel);
    const body = artifact.body ?? artifact.rawText ?? '';
    for (const link of extractRelativeLinks(body)) {
      checked++;
      if (!existsInTree(ctx, path.posix.join(skillDir, link))) {
        violations.push(
          violation(
            CHECK,
            artifact.path,
            `body 中の Markdown リンク "${link}" の参照先がスキルディレクトリ配下に実在しない（V-skills-18）。`,
            SUPPORTING_FILE_SOURCE
          )
        );
      }
    }
    const tokens = extractPathLikeTokens(body);
    const unresolved = [];
    for (const tok of tokens) {
      checked++;
      if (isTierAToken(ctx, tok, skillDir)) {
        if (!existsInTree(ctx, path.posix.join(skillDir, tok))) {
          violations.push(
            violation(
              CHECK,
              artifact.path,
              `body 中で参照される supporting file "${tok}" がスキルディレクトリ配下に実在しない（V-skills-18）。`,
              SUPPORTING_FILE_SOURCE
            )
          );
        }
        continue;
      }

      // Tier B: スキルディレクトリ → worktree のルートの順で解決を試みる。パスを含まない
      // ファイル名（`spec-check.mjs` など）は、worktree 全体の basename 一致でも解決とみなす。
      // どこでも解決できなければ「参照先が解決できないパス様トークン」として報告に留める
      // （地の文のリポジトリ相対パスや一般名詞的なファイル名の言及を誤ブロックしない）。
      const resolvedSomewhere =
        existsInTree(ctx, path.posix.join(skillDir, tok)) ||
        existsInTree(ctx, tok) ||
        (!tok.includes('/') && basenames.has(tok));
      if (!resolvedSomewhere) unresolved.push(tok);
    }
    // 1ファイルにつき1件にまとめる（トークンごとに出すと、差分のゲートで読む warning が地の文の数だけ並ぶ）。
    if (unresolved.length > 0) {
      const sample = unresolved.slice(0, UNRESOLVED_SAMPLE_COUNT).map((t) => `"${t}"`).join('・');
      const rest = unresolved.length > UNRESOLVED_SAMPLE_COUNT ? `ほか${unresolved.length - UNRESOLVED_SAMPLE_COUNT}件` : '';
      violations.push(
        violation(
          CHECK,
          artifact.path,
          `body 中のパス様トークン ${unresolved.length}件の参照先が解決できない: ${sample}${rest}` +
            '（supporting file か地の文かを構造だけでは断定できないため報告のみ）。',
          SUPPORTING_FILE_SOURCE,
          'warning'
        )
      );
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
  if (!file) return { violations, checked: 0 }; // plugin 未使用は正当（plugins を使うかは設計次第）

  let manifest;
  try {
    manifest = JSON.parse(file.text);
  } catch (err) {
    violations.push(violation(CHECK, PLUGIN_MANIFEST, `plugin.json が正当な JSON として解析できない: ${err.message}`, PLUGIN_JSON_SOURCE));
    return { violations, checked: 0 };
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    violations.push(violation(CHECK, PLUGIN_MANIFEST, 'plugin.json のトップレベルが JSON object でない。', PLUGIN_JSON_SOURCE));
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
          PLUGIN_PATH_SOURCE
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
 * 出典: V-skills-01。`paths:files/project:.claude/skills/<name>/SKILL.md` が SSoT。
 *
 * なぜ V6 に置くか: V1（per-file・純関数）は1ファイルしか見ないため「パッケージに定義ファイルが
 * 無い」を構造的に判定できない。V1 が supporting files を許す以上、`Skill.md` のような綴り違い
 * （サイレント不発火）はここで明示的に塞ぐ。
 */
function checkSkillPackages(ctx) {
  const violations = [];
  const prefix = '.claude/skills/';
  // 差分に触れたパッケージ（削除したファイルを含む）だけを見る。触らないパッケージは base のまま変わらない。
  const touched = new Set(
    [...ctx.files.map((f) => f.rel), ...ctx.deleted]
      .filter((r) => r.startsWith(prefix) && r.slice(prefix.length).includes('/'))
      .map((r) => `${prefix}${r.slice(prefix.length).split('/')[0]}`)
  );
  const dirs = [...touched].filter((d) => ctx.hasDir(d));
  for (const dir of dirs.sort()) {
    const name = dir.slice(prefix.length);
    // 索引の完全一致で判定する（大小を無視する FS の existsSync だと `Skill.md` を取り違える）。
    if (!ctx.has(`${dir}/SKILL.md`)) {
      violations.push(
        violation(
          CHECK,
          dir,
          `skill パッケージ "${name}/" に定義ファイル SKILL.md が実在しない（V-skills-01: 定義ファイルは SKILL.md）。` +
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
// 7: 変えたファイル以外への行番号引用の禁止
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
 * 変えたファイルの本文を走査し、差分に無いファイルへの行番号引用を検出する。
 * 差分の中のファイル同士の行番号参照は、同じ run で一括して直すので正当である。
 */
function checkUnchangedLineRefs(ctx) {
  const violations = [];
  let checked = 0;
  const changed = new Set(ctx.files.map((f) => f.rel));
  for (const f of ctx.files) {
    for (const { token, refPath } of extractLineNumberRefs(f.text)) {
      checked++;
      if (changed.has(refPath)) continue;
      violations.push(
        violation(
          CHECK,
          f.rel,
          `この run で変えないファイル "${refPath}" を行番号で引用している（\`${token}\`）。` +
            '行番号はそのファイルの編集で無言でずれ、引用側にはずれを検知する手段が無い。' +
            '節見出しで参照すること（例: 「README.md の「main への直接 push を防ぐ」節」）。',
          'canon 独自の規則（design/architecture.md §7）'
        )
      );
    }
  }
  return { violations, checked };
}

// ---------------------------------------------------------------------------
// 8: 変えたファイルからの参照（実在しないもの）
// ---------------------------------------------------------------------------

function checkOutgoingRefs(ctx) {
  const violations = [];
  let checked = 0;
  const basenames = refBasenames(ctx.tracked);
  for (const f of ctx.files) {
    if (!/\.(md|json)$/.test(f.rel)) continue;
    // skill の定義ファイルは、V6-4 が supporting file の参照として見ている（同じ参照を二重に報告しない）。
    if (skillPathRole(f.rel) === 'definition') continue;
    for (const r of extractRefs(f.rel, f.text)) {
      const c = classifyRef(r, f.rel, ctx.root, basenames);
      checked++;
      if (c.status !== 'missing') continue;
      // 新しく足す・名前を変えるファイルを指す参照は、同じ差分の中に現れる。HEAD の索引で解決する。
      if (c.target && (ctx.has(c.target) || ctx.hasDir(c.target))) continue;
      violations.push(
        violation(
          CHECK,
          f.rel,
          `${r.line} 行目の参照 "${r.raw}" の先が worktree に実在しない（地の文のパスの可能性があるので報告のみ）。`,
          'canon 独自の規則（lib/refs.js の分類）',
          'warning'
        )
      );
    }
  }
  return { violations, checked };
}

// ---------------------------------------------------------------------------
// 9: 削除したファイルを指す参照
// ---------------------------------------------------------------------------

function checkDeletedRefs(ctx) {
  const violations = [];
  if (ctx.deleted.length === 0) return { violations, checked: 0 };
  const hits = ctx.deletedRefHits();
  const answers = ctx.planAnswers ?? new Map();
  for (const h of hits) {
    const ans = answers.get(h.id) ?? answers.get(h.path);
    const kept = ans?.verdict === '変えない';
    violations.push(
      violation(
        CHECK,
        h.path,
        `${h.line} 行目が、削除したファイル "${h.term}" を指している（${h.id}）。` +
          (kept ? `change-plan は「変えない（${ans.reason}）」と答えている。` : 'change-plan の「参照元の扱い」で変えるか、変えない理由を答えること。'),
        'design/architecture.md §7（6 参照整合）',
        kept ? 'warning' : 'error'
      )
    );
  }
  return { violations, checked: ctx.deleted.length };
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
  const lineRefResult = checkUnchangedLineRefs(ctx);
  const outgoingResult = checkOutgoingRefs(ctx);
  const deletedResult = checkDeletedRefs(ctx);

  const { violations, warnings, undetermined } = splitBySeverity([
    ...agentResult.violations,
    ...supportingResult.violations,
    ...packageResult.violations,
    ...pluginResult.violations,
    ...lineRefResult.violations,
    ...outgoingResult.violations,
    ...deletedResult.violations,
  ]);
  return {
    violations,
    warnings,
    undetermined,
    checked:
      agentResult.scanned +
      supportingResult.checked +
      packageResult.checked +
      pluginResult.checked +
      lineRefResult.checked +
      outgoingResult.checked +
      deletedResult.checked,
  };
}
