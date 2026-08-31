# design-map（eval コーパス: c4-strength-gap）

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/secret-hygiene/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "手順書として引き続き有用なので維持する"
```
