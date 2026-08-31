# requirements（eval コーパス: c2-altitude-distinct）

## 確定要件
- id: R1
  want: よくある lint エラーの修正手順を新規 Skill 化する
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
