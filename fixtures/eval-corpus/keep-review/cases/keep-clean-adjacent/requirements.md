# requirements（eval コーパス: keep-clean-adjacent）

## 確定要件
- id: R1
  want: エンドポイント追加手順を Skill 化する
  strength_needed: advisory
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: false, reason: "組織ポリシーで hooks 不可" }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
