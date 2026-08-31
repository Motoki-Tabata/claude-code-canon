# 系統A（eval コーパス: c4-constraint-conflict）

## レコード（1ファイル1件）
- path: .claude/skills/schema-guard/SKILL.md
  layer: L2
  kind: skill
  strength: deterministic
  depends_on:
    customization_refs: []
    project_refs:
      - kind: path  value: "ops/hooks/deny-schema-edit.js"
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
