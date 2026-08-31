# requirements（eval コーパス: sec-scoped-bash）

## 確定要件
- id: R1
  want: テストを実行して結果を要約する Subagent
  strength_needed: advisory

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }
