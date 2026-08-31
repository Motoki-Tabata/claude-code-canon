# design-map（existing シナリオ・fixture）

対象: 既存改修(2)。keep / modify / merge / retire / 新規 の5判定を網羅する。
G2/G8 のパース対象（`existing_disposition`）を持つ最小 design-map。

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/kept-skill/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "既存のまま維持（keep・verbatim コピー）"
  - path: CLAUDE.md
    disposition: modify
    manifest_note: "canon により CLAUDE.md を更新"
  - path: .claude/skills/legacy-skill/SKILL.md
    disposition: retire
    reason_code: superseded_by_new
    superseded_by: .claude/skills/new-skill/SKILL.md
    manifest_note: "legacy-skill は廃止し new-skill へ移行"
  - path: .claude/skills/merge-a/SKILL.md
    disposition: merge
    superseded_by: .claude/skills/merged/SKILL.md
    manifest_note: "merge-a は merged へ統合"
  - path: .claude/skills/merge-b/SKILL.md
    disposition: merge
    superseded_by: .claude/skills/merged/SKILL.md
    manifest_note: "merge-b は merged へ統合"
```
