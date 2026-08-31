# design-map（constrained シナリオ・fixture）

対象: 代表シナリオ(3)「制約強め」。constraints（hooks / mcp / plugins / experimental すべて禁止）で
機能選択を事前刈り込みした設計。R1 は deterministic を実現できないため L1 Rules（advisory）へ縮退する。

## Used Features
L1: CLAUDE.md ＋ Rules（縮退先） / L2: Skills（既存 keep）
L4 Hooks・MCP: N/A（constraints で禁止） / L5 Plugin: N/A（constraints で禁止）

## レイヤー構成
L1: CLAUDE.md（プロジェクト規約）＋ .claude/rules/schema-review.md（R1 の縮退先・paths で src へ接地）
L2: .claude/skills/style-guide/SKILL.md（既存を keep）
L4: 不使用（hooks・mcp とも constraints で禁止）
L5: 不使用（plugins は constraints で禁止）

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/style-guide/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "制約に触れず新要件とも重複しないため維持（verbatim コピー）"
  - path: .claude/settings.json
    disposition: retire
    reason_code: prohibited_by_constraints
    superseded_by: .claude/rules/schema-review.md
    manifest_note: "hooks 禁止により settings.json の Hooks 設定は廃止。R1 は Rules(advisory) へ縮退"
  - path: .claude/skills/fork-runner/SKILL.md
    disposition: retire
    reason_code: prohibited_by_constraints
    manifest_note: "experimental 禁止により context:fork 依存の fork-runner は廃止"
```

## Model Assignments
N/A（本 fixture は Subagent を生成しない）

## Interface Contracts
schema-review（L1 Rules）は src/**/*.js の編集時に自動ロードされ、style-guide（L2）は必要時に参照される。

## Experimental Dependencies
なし（experimental は constraints で禁止。context:fork / Agent Teams / Channels / Monitors / Themes とも不使用）

## 依存フラグ
nesting: 1段 / isolation:worktree: 不要
