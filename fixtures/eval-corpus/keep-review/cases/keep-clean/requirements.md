# requirements（eval コーパス: keep-clean）

## 確定要件
- id: R1
  want: テスト実行手順を CLAUDE.md に明記する
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
