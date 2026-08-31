# spec（eval コーパス: merge-partial-absorb）

## 新要件

- id: R1
  want: DB マイグレーションの作成・適用・巻き戻しの手順を1つの Skill に集約する
  rationale: マイグレーション関連の手順が複数の断片に分かれていて参照しづらい
  project_grounding: migrations/ に up/down スクリプト・本番は保守時間帯に適用

## 統合方針

マイグレーション関連の手順を db-migration-guide に一本化する。既存の db-rollback-steps
（巻き戻し手順）は db-migration-guide へ統合する。
