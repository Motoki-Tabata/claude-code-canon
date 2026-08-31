# design-map（eval コーパス: c4-stronger-ok）

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/secret-block-runbook/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "既存の機械的阻止が要件を包含するので維持"
```
