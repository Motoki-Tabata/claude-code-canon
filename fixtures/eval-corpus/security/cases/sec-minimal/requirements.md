# requirements（eval コーパス: sec-minimal）

## 確定要件
- id: R1
  want: PR の指摘出しをするレビュー用 Subagent
  strength_needed: advisory

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }
