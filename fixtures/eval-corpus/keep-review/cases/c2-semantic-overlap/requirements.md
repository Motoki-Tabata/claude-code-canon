# requirements（eval コーパス: c2-semantic-overlap）

## 確定要件
- id: R1
  want: リリース公開の手順を CLAUDE.md に集約し唯一の出典にする
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
