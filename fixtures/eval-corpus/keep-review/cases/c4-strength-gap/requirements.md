# requirements（eval コーパス: c4-strength-gap）

## 確定要件
- id: R1
  want: 認証情報のコミットを機械的に阻止する
  strength_needed: deterministic
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true, reason: "決定論的な阻止に必要なので許可" }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
