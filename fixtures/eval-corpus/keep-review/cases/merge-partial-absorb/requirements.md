# requirements（eval コーパス: merge-partial-absorb）

## 確定要件
- id: R1
  want: マイグレーションの作成・適用・巻き戻し手順を1つの Skill に集約する
  strength_needed: advisory
  priority: should

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
