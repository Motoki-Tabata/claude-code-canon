# 系統A: existing_customizations.md（fixture・代表シナリオ(3)・§6.1）

## サマリ
総数 3 / L2 2 / L4 1 / 正典逸脱の疑い: fork-runner が experimental 依存

## レコード（1ファイル1件）
- path: .claude/skills/style-guide/SKILL.md
  layer: L2
  kind: skill
  strength: medium
  depends_on:
    customization_refs: []
    project_refs:
      - kind: paths_glob  value: "src/**/*.js"
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/skills/fork-runner/SKILL.md
  layer: L2
  kind: skill
  strength: low
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
- path: .claude/settings.json
  layer: L4
  kind: settings
  strength: high
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
