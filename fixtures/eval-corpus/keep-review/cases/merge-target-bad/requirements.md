# requirements（eval コーパス: merge-target-bad）

## 確定要件
- id: R1
  want: コミット・PR 規約を1箇所に統合する
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
