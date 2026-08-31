# requirements（eval コーパス: c4-constraint-conflict）

## 確定要件
- id: R1
  want: 生成物の扱いを文書で案内する
  strength_needed: advisory
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: false, reason: "組織ポリシーで Hooks の利用を禁止（監査対象外の自動実行を認めない）" }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }
  organization_policy: "自動実行される仕組みは監査ログの対象にできないため不可"

## 制約と要件の衝突
conflicts:
  (なし)
