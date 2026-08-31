/**
 * G5 tools/ツール名照合（per-file・§11.2）。
 *
 * 出典: gates/conformance_tables/tools.json（正典 docs/TOOLS.md から生成）。
 * 実装前に必ず tools.json の `g5_capability` を見ること（能力宣言・§11.4）。
 *
 * 検査内容（詳細設計書 §11.2 G5 行）:
 *   - 正規ツール名照合（canonical_name_allowlist_check: true）
 *   - 旧称・非実在ツール検出（deprecated_name_detection / nonexistent_tool_detection: true）
 *   - MCP `mcp__server__tool` 構文（mcp_syntax_check: true）
 *
 * 実装しない検査（tools.json.g5_capability が false／限定と申告している範囲）:
 *   - 大文字小文字の厳密性（case_sensitivity_check: false・正典 §3 [要確認]）。
 *     完全一致しない名前は「非実在」側に落ちるだけで、"大文字小文字違い" という
 *     専用の違反種別は作らない。
 *   - 「この環境で利用可能か」の判定（nonexistent_tool_detection.caveat）。
 *     判定できるのは「正規の名前set に含まれるか」のみ。
 *   - subagent_unavailable_tools（AskUserQuestion 等5種）は正規名なので違反にしない
 *     （tools: に書いても無視されるだけ、というのが正典の立場）。
 *   - 旧称のうち「非推奨」「既定無効」（TaskOutput / TodoWrite）は実在する正規名として
 *     通す。violation にしてよいのは deprecated_tools.renamed_only（= Task）のみ。
 *
 * 純関数。副作用なし。
 */

import toolsTable from './conformance_tables/tools.json' with { type: 'json' };
import { loadArtifact, violation, splitListValue } from './lib/artifact.js';

const GATE = 'G5';

const CANONICAL_NAMES = new Set(toolsTable.canonical_tool_set.tools.map((t) => t.name));
const RENAMED_ONLY = new Set(toolsTable.deprecated_tools.renamed_only);
const RENAMED_DETAIL = new Map(
  toolsTable.deprecated_tools.all.filter((d) => toolsTable.deprecated_tools.renamed_only.includes(d.name)).map((d) => [d.name, d])
);
const MCP_FULL_RE = new RegExp(toolsTable.mcp_tool_syntax.regex);

// tools.json は agent/skill 双方の tools 系フィールド名までは列挙していないため、
// frontmatter.json（G4 の出典）から「tools っぽい」フィールドを拾う代わりに、
// L3/L2 の frontmatter 完全リファレンスで実際に使われているキー名をここで固定する
// （agent: tools/disallowedTools・skill: allowed-tools/disallowed-tools）。
// agent の `disallowed-tools`（ハイフン形）は2026-08-19に対象から除外した——公式に互換受理の
// 裏付けが無いと確定し、G4 が未知キーとして検出する側へ倒したため（L3_AGENTS.md:198）。
const TOOL_LIST_FIELDS = {
  agent: ['tools', 'disallowedTools'],
  skill: ['allowed-tools', 'disallowed-tools'],
};

function isWildcardMcpForm(tok) {
  // mcp__* / mcp__<server> / mcp__<server>__*
  if (tok === 'mcp__*') return true;
  if (/^mcp__[A-Za-z0-9_-]+$/.test(tok)) return true;
  if (/^mcp__[A-Za-z0-9_-]+__\*$/.test(tok)) return true;
  return false;
}

function checkToken(tok, artifact, field) {
  const violations = [];
  if (tok.startsWith('mcp__')) {
    if (!MCP_FULL_RE.test(tok) && !isWildcardMcpForm(tok)) {
      violations.push(
        violation(
          GATE,
          artifact.path,
          `frontmatter "${field}" のツール名 "${tok}" が MCP 命名規約（${toolsTable.mcp_tool_syntax.forms.map((f) => f.form).join(' / ')}）に合致しない。`,
          `${toolsTable.mcp_tool_syntax.forms[0].source}（regex_confidence: ${toolsTable.mcp_tool_syntax.regex_confidence}）`
        )
      );
    }
    return violations;
  }

  if (CANONICAL_NAMES.has(tok)) return violations; // 正規名（非推奨・既定無効を含む）は pass

  if (RENAMED_ONLY.has(tok)) {
    const d = RENAMED_DETAIL.get(tok);
    violations.push(
      violation(
        GATE,
        artifact.path,
        `frontmatter "${field}" のツール名 "${tok}" は旧称（改名済み）。正規名 "Agent" を使うこと。${d?.note ?? ''}`,
        d?.source ?? toolsTable.canonical_tool_set.source
      )
    );
    return violations;
  }

  violations.push(
    violation(
      GATE,
      artifact.path,
      `frontmatter "${field}" のツール名 "${tok}" は正典 docs/TOOLS.md の正規ツール名に無い（非実在の疑い）。` +
        `${toolsTable.g5_capability.nonexistent_tool_detection.caveat}`,
      toolsTable.canonical_tool_set.source
    )
  );
  return violations;
}

export function checkG5(artifact) {
  const violations = [];
  const fields = TOOL_LIST_FIELDS[artifact.kind];
  if (!fields) return violations; // rule/unknown には tools 系フィールドが無い（正典に規定なし）

  for (const field of fields) {
    const entry = artifact.frontmatter[field];
    if (!entry) continue;
    const tokens = splitListValue(entry);
    for (const tok of tokens) {
      violations.push(...checkToken(tok, artifact, field));
    }
  }
  return violations;
}

export function checkG5File(absPath) {
  return checkG5(loadArtifact(absPath));
}
