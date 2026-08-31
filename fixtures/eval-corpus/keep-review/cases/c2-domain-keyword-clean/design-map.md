# design-map（eval コーパス: c2-domain-keyword-clean）

## 既存判定（existing_disposition・§8）

```yaml
existing_disposition:
  - path: .claude/skills/cache-invalidation-faq/SKILL.md
    disposition: keep
    keep_conditions:
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "キャッシュ無効化の FAQ は問い合わせ削減に有用なので維持"
```
