# design-map（eval コーパス: keep-clean-adjacent）

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/api-error-catalog/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "エラーコード表は今回の要件と別物なので維持"
```
