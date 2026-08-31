# MANIFEST（constrained シナリオ・fixture）

## 新規
- CLAUDE.md（L1・プロジェクト規約）
- .claude/rules/schema-review.md（L1 Rules・R1 の advisory 縮退先）
- .claude/README.md（使い方）

## 維持（keep）
- .claude/skills/style-guide/SKILL.md（verbatim・G8 で sha256 照合）

## 廃止（retire）
- .claude/settings.json — hooks 禁止により Hooks 設定を廃止。R1 は Rules(advisory) へ縮退
- .claude/skills/fork-runner/SKILL.md — experimental 禁止により context:fork 依存を廃止
