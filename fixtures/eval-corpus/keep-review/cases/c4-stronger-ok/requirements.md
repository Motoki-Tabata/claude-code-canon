# requirements（eval コーパス: c4-stronger-ok）

## 確定要件
- id: R1
  want: 認証情報のコミットについて開発者に注意喚起する
  strength_needed: advisory
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true, reason: "既存の機械的阻止をそのまま使う" }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
