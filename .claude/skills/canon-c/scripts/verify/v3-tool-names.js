/**
 * V3 ツール名（per-file・artifacts.md §8.2）。
 *
 * 出典: 正典リファレンス canon-reference の `tools:tools`（lib/reference-data.js）と、検証ルール
 * V-subagents-08（サブエージェントの `tools`・`disallowedTools`）・V-skills-14（Skill の
 * `allowed-tools`・`disallowed-tools`）。
 *
 * 検査内容:
 *   - 各要素が `tools:tools` のいずれかの `id`（`Agent(...)` のように括弧付きなら括弧の前）か、
 *     `mcp__` で始まる MCP のパターンであること
 *   - 旧称（`tools:tools` の要素の `aliases`。例: `Agent` の旧称 `Task`）は、正規名を案内する違反にする
 *   - `mcp__` で始まる名前は、MCP のツール名の形（`mcp__<server>__<tool>`・`mcp__<server>`・
 *     `mcp__<server>__*`・`mcp__*`）に合うこと。形の正規表現は canon が持つ（data に正規表現は無い。
 *     書式の根拠は `permissions:rule-syntax`）
 *
 * `tools:tools` は `complete: true` なので、無い名前は非実在として違反にする。「この環境で使えるか」
 * は判定しない（名前が正規の集合に含まれるかだけを見る）。大文字小文字の違いは専用の違反種別を
 * 作らず、非実在の側に落ちる（V-subagents-04 は大文字小文字まで一致を求める）。
 *
 * 純関数。副作用なし。
 */

import { collection, cite, plain } from '../../../../../lib/reference-data.js';
import { violation, splitListValue } from '../../../../../lib/artifact.js';

const CHECK = 'V3';

const TOOLS = collection('tools:tools');
/** 旧称 → 正規名。 */
const ALIASES = new Map();
for (const t of TOOLS.items) {
  for (const a of plain(t.aliases) ?? []) ALIASES.set(a, t.id);
}
const MCP_FULL_RE = /^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/;
const MCP_FORMS = 'mcp__<server>__<tool> / mcp__<server> / mcp__<server>__* / mcp__*';

/** サブエージェント・Skill のツールのリストを持つ frontmatter のキーと、当てる検証ルール。 */
const TOOL_LIST_FIELDS = {
  agent: { fields: ['tools', 'disallowedTools'], rule: 'V-subagents-08' },
  skill: { fields: ['allowed-tools', 'disallowed-tools'], rule: 'V-skills-14' },
};

function isWildcardMcpForm(tok) {
  // mcp__* / mcp__<server> / mcp__<server>__*
  if (tok === 'mcp__*') return true;
  if (/^mcp__[A-Za-z0-9_-]+$/.test(tok)) return true;
  if (/^mcp__[A-Za-z0-9_-]+__\*$/.test(tok)) return true;
  return false;
}

/** `ToolName(specifier)` の括弧の前の名前。括弧が無ければそのまま。 */
function toolNameOf(tok) {
  const m = /^([^(]+)\(.*\)$/.exec(tok);
  return m ? m[1] : tok;
}

function checkToken(tok, artifact, field, rule) {
  if (tok.startsWith('mcp__')) {
    if (MCP_FULL_RE.test(tok) || isWildcardMcpForm(tok)) return [];
    return [
      violation(
        CHECK,
        artifact.path,
        `frontmatter "${field}" のツール名 "${tok}" が MCP のツール名の形（${MCP_FORMS}）に合わない。`,
        cite(rule, 'permissions:rule-syntax')
      ),
    ];
  }

  const name = toolNameOf(tok);
  if (TOOLS.byId.has(name)) return [];

  if (ALIASES.has(name)) {
    const canonical = ALIASES.get(name);
    return [
      violation(
        CHECK,
        artifact.path,
        `frontmatter "${field}" のツール名 "${tok}" は旧称。正規名 "${canonical}" を使うこと。`,
        cite(rule, `tools:tools/${canonical}`)
      ),
    ];
  }

  return [
    violation(
      CHECK,
      artifact.path,
      `frontmatter "${field}" のツール名 "${tok}" は tools:tools の正規名に無い（非実在の疑い）。この環境で使えるかは判定していない。`,
      cite(rule, 'tools:tools')
    ),
  ];
}

export function checkV3(artifact) {
  const violations = [];
  const spec = TOOL_LIST_FIELDS[artifact.kind];
  if (!spec) return violations; // rule/output-style/unknown には tools 系フィールドが無い

  for (const field of spec.fields) {
    const entry = artifact.frontmatter[field];
    if (!entry) continue;
    if (entry.nested) {
      // `tools:` の次行以降がリスト（`- Read`）でなくマップ等。トークンを取り出せず、0件のまま通すと素通りになる。
      violations.push(
        violation(
          CHECK,
          artifact.path,
          `frontmatter "${field}" の複数行の値をツール名のリストとして解釈できない（\`- Read\` 形のリスト、またはカンマ・空白区切りの1行で書くこと）。`,
          'lib/artifact.js parseFrontmatter()'
        )
      );
      continue;
    }
    for (const tok of splitListValue(entry)) {
      violations.push(...checkToken(tok, artifact, field, spec.rule));
    }
  }
  return violations;
}
