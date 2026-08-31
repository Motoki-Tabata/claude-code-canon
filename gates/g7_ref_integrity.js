#!/usr/bin/env node
/**
 * G7 参照整合（snapshot 系統・§11.2）。SubagentStop@generation。
 *
 * 検査内容（詳細設計書 §11.2 G7 行）:
 *   1. preload skill（`skills:`）実在
 *      出典: docs/L3_AGENTS.md:176「skills: [skill-name] # Preload Skills」
 *   2. `disable-model-invocation:true` skill を preload していない
 *      出典: docs/L3_AGENTS.md:714「disable-model-invocation: true の Skill を skills: で preload → エラー」
 *   3. description による委譲トリガーの妥当
 *      出典: docs/L3_AGENTS.md:124「description の精度が的中率を決める」＋公式コード例4件
 *      （docs/L3_AGENTS.md:243・docs/ORCHESTRATION.md:264,381,408）が全て "Delegate when"/"Delegate for"
 *      で締める。ただし正典はこれを MUST として明文化していない（観測されたパターンに留まる）ため、
 *      本ゲートでは2段構えにする:
 *        (a) error: frontmatter の description が公式テンプレートの未編集プレースホルダそのもの
 *            （docs/L3_AGENTS.md:155 "What this agent does and when Claude should delegate to it"）
 *            ＝実質的に書かれていないので機械的に確実な違反。
 *        (b) warning（非ブロッキング）: "Delegate when"/"Delegate for" 相当の委譲条件節が
 *            description に無い。正典に MUST の明文が無いため error にはしない（捏造回避）。
 *   4. supporting files 実在
 *      出典: docs/L2_SKILLS.md:77,99-109（Progressive Disclosure Loading・スキルディレクトリ構造）。
 *      SKILL.md body 中でバッククォート参照されるパス様トークン（`template.md`・`examples/sample.md`
 *      等）をスキルディレクトリ相対で実在照合する。誤検出源: バッククォートで囲まれた汎用コード語も
 *      拾いうるため、パスらしい構文（拡張子付き or ディレクトリ区切りを含む・空白/`$`/URL を含まない）
 *      に絞るヒューリスティック（正典はパターンを構造化していないため設計判断・§11.4 と同型の明示）。
 *   5. plugin 参照実在
 *      出典: docs/L5_DISTRIBUTION.md:140-200（Plugin Manifest 完全スキーマ・Path挙動規則）。
 *      plugin.json の `skills` / `commands` / `agents` / `hooks` / `mcpServers` / `outputStyles` /
 *      `lspServers` / `experimental.themes` / `experimental.monitors` は明示パス文字列（単一 or 配列）
 *      であり、plugin root 相対で実在照合する。
 *
 * 純関数。副作用（fs 書込・process.exit）なし。
 */

import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CANON_ROOT, posix } from './lib/canon.js';
import { loadArtifact, violation, splitListValue } from './lib/artifact.js';
import { outputDir, resolveTargetRoot } from './lib/run.js';

const GATE = 'G7';
const PLACEHOLDER_DESCRIPTION = 'What this agent does and when Claude should delegate to it';
const DELEGATE_TRIGGER_RE = /Delegate (when|for)/i;

function rel(absPath) {
  return posix(path.relative(CANON_ROOT, absPath));
}

function isBlocking(v) {
  return (v.severity ?? 'error') === 'error';
}

function formatViolation(v) {
  return `${v.gate}${v.severity && v.severity !== 'error' ? `(${v.severity})` : ''} ${v.path}: ${v.message} [出典: ${v.source}]`;
}

function walkFiles(root, predicate) {
  if (!existsSync(root)) return [];
  let out = [];
  for (const name of readdirSync(root)) {
    const p = path.join(root, name);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(walkFiles(p, predicate));
    else if (predicate(name)) out.push(p);
  }
  return out;
}

function generatedRoot(ts) {
  return path.join(outputDir(ts), 'generated');
}
function agentsRoot(ts) {
  return path.join(generatedRoot(ts), '.claude', 'agents');
}
function skillsRoot(ts) {
  return path.join(generatedRoot(ts), '.claude', 'skills');
}
function pluginRoot(ts) {
  return path.join(generatedRoot(ts), 'plugin');
}

/** skills/<dir>/SKILL.md を全て集めて識別子（frontmatter name優先・既定ディレクトリ名）で索引化する。 */
function buildSkillRegistry(ts) {
  const root = skillsRoot(ts);
  const files = walkFiles(root, (name) => name === 'SKILL.md');
  const registry = new Map(); // identifier -> artifact
  for (const f of files) {
    const artifact = loadArtifact(f);
    const dirName = path.basename(path.dirname(f));
    const nameValue = artifact.frontmatter?.name?.value;
    const id = typeof nameValue === 'string' && nameValue !== '' ? nameValue : dirName;
    registry.set(id, artifact);
    if (id !== dirName) registry.set(dirName, artifact); // 両方で引けるようにする（G3 が不一致を別途検出）
  }
  return registry;
}

// ---------------------------------------------------------------------------
// 1・2・3: agent の skills: preload と description
// ---------------------------------------------------------------------------

function checkAgentReferences(ts, skillRegistry) {
  const violations = [];
  const files = walkFiles(agentsRoot(ts), (name) => name.endsWith('.md'));
  for (const f of files) {
    const artifact = loadArtifact(f);
    if (artifact.kind !== 'agent') continue; // G3 の管轄（配置逸脱）。G7 は参照整合のみ扱う。

    // 1・2: skills: preload
    const skillsEntry = artifact.frontmatter?.skills;
    if (skillsEntry) {
      const names = splitListValue(skillsEntry);
      for (const skillName of names) {
        const target = skillRegistry.get(skillName);
        if (!target) {
          violations.push(
            violation(
              GATE,
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
              GATE,
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
          GATE,
          artifact.path,
          'frontmatter "description" が公式テンプレートの未編集プレースホルダのまま（実質未記入）。委譲判断ができない。',
          'docs/L3_AGENTS.md:155'
        )
      );
    } else if (descValue && !DELEGATE_TRIGGER_RE.test(descValue)) {
      violations.push(
        violation(
          GATE,
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
 * トークンが Tier A（構造上 supporting file 参照と確定できる）かを判定する。
 * §11.2 G7「2段構え契約」（L026 恒久修正）:
 *   - `./`・`../` を冠する明示相対トークン、または
 *   - トークンの第1セグメントがスキルディレクトリ直下に実在するエントリ名と一致するトークン
 *     （例: `examples/` が実在する場合の `examples/sample.md`）。
 * 該当しないものは Tier B（未解決なら warning に留める）。
 */
function isTierAToken(tok, skillDir) {
  if (tok.startsWith('./') || tok.startsWith('../')) return true;
  const firstSegment = tok.split('/')[0];
  return existsSync(path.join(skillDir, firstSegment));
}

function checkSupportingFiles(ts) {
  const violations = [];
  const files = walkFiles(skillsRoot(ts), (name) => name === 'SKILL.md');
  let checked = 0;
  const generated = generatedRoot(ts);
  const targetRoot = resolveTargetRoot(ts); // 不在なら null（対象プロジェクト未確定でも Tier B は縮退して機能する）
  for (const f of files) {
    const artifact = loadArtifact(f);
    const skillDir = path.dirname(f);
    const tokens = extractPathLikeTokens(artifact.body ?? artifact.rawText ?? '');
    for (const tok of tokens) {
      checked++;
      if (isTierAToken(tok, skillDir)) {
        const resolved = path.resolve(skillDir, tok);
        if (!existsSync(resolved)) {
          violations.push(
            violation(
              GATE,
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
      // （地の文のリポジトリ相対パスや一般名詞的なファイル名の言及を誤ブロックしない・L026）。
      const candidates = [path.resolve(skillDir, tok), path.resolve(generated, tok)];
      if (targetRoot) candidates.push(path.resolve(targetRoot, tok));
      const resolvedSomewhere = candidates.some((c) => existsSync(c));
      if (!resolvedSomewhere) {
        violations.push(
          violation(
            GATE,
            artifact.path,
            `body 中のパス様トークン "${tok}" の参照先が解決できない（supporting file か地の文かを構造だけでは断定できないため報告のみ・§11.2 G7）。`,
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

function checkPluginReferences(ts) {
  const violations = [];
  const root = pluginRoot(ts);
  const manifestPath = path.join(root, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) return { violations, checked: 0 }; // plugin 未使用は正当（L5 は constraints 次第・§6.3）

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    violations.push(violation(GATE, rel(manifestPath), `plugin.json が正当な JSON として解析できない: ${err.message}`, 'docs/L5_DISTRIBUTION.md:140'));
    return { violations, checked: 0 };
  }

  const entries = collectPluginPathValues(manifest);
  for (const { field, value } of entries) {
    const resolved = path.resolve(root, value);
    if (!existsSync(resolved)) {
      violations.push(
        violation(
          GATE,
          rel(manifestPath),
          `plugin.json の "${field}" が参照するパス "${value}" が plugin root 配下に実在しない。`,
          'docs/L5_DISTRIBUTION.md:140-200（Plugin Manifest 完全スキーマ・Path挙動規則）'
        )
      );
    }
  }
  return { violations, checked: entries.length };
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/** 構造化版（テスト・再利用向け）。 */
export function checkG7({ ts }) {
  const skillRegistry = buildSkillRegistry(ts);
  const agentResult = checkAgentReferences(ts, skillRegistry);
  const supportingResult = checkSupportingFiles(ts);
  const pluginResult = checkPluginReferences(ts);

  const violations = [...agentResult.violations, ...supportingResult.violations, ...pluginResult.violations];
  const blocking = violations.filter(isBlocking);

  return {
    ok: blocking.length === 0,
    violations,
    blocking,
    scanned: {
      agents: agentResult.scanned,
      skills: skillRegistry.size,
      supportingFileRefsChecked: supportingResult.checked,
      pluginRefsChecked: pluginResult.checked,
    },
  };
}

/** stage-guard.js / gen-guard.js が期待する { ok, violations: string[] } 形。 */
export function check({ ts }) {
  const { blocking } = checkG7({ ts });
  return { ok: blocking.length === 0, violations: blocking.map(formatViolation) };
}
