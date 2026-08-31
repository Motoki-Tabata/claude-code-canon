# requirements（eval コーパス: c2-overlap-new-artifact）

## 確定要件
- id: R1
  want: レビュー依頼前のセルフチェック手順を新規 Skill に一本化する
  strength_needed: advisory
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
