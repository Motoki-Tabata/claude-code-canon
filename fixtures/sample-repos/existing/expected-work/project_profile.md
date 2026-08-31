# 系統B: project_profile.md（fixture・§6.2）

## profile（調査1・浅く広く）
languages: [javascript]
frameworks: []
test: { frameworks: [node:test], test_dirs: [tests] }

## focused（調査2・深く狭く）
requirement_ref: R1
scope: existing 改修
findings:
  - topic: 既存スキル構成
    evidence_paths: [.claude/skills/kept-skill/SKILL.md]
    summary: kept-skill は維持対象
ref_resolution:
  - ref: "src/**/*.js"  kind: paths_glob  resolved: true  match_count: 1  sample: "src/app.js"
