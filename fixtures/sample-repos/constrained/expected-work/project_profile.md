# 系統B: project_profile.md（fixture・代表シナリオ(3)・§6.2）

## profile（調査1・浅く広く）
languages: [javascript]
frameworks: []
test: { frameworks: [node:test], test_dirs: [tests] }

## focused（調査2・深く狭く）
requirement_ref: R1
scope: 制約強め（hooks/mcp/plugins/experimental すべて禁止）
findings:
  - topic: 既存 Hooks 設定
    evidence_paths: [.claude/settings.json]
    summary: PostToolUse で schema チェックを機械強制していたが、hooks 禁止により維持できない
  - topic: 実験機能への依存
    evidence_paths: [.claude/skills/fork-runner/SKILL.md]
    summary: context:fork に依存しており experimental 禁止により維持できない
ref_resolution:
  - ref: "src/**/*.js"  kind: paths_glob  resolved: true  match_count: 1  sample: "src/schema.js"
