# requirements（fixture・代表シナリオ(3)「制約強め」・§6.3）

## メタ
confirmed_at: 2026-07-24
confirmed_by: fixture

## 確定要件（人間が言ったこと・合意したこと）
- id: R1
  want: API スキーマ変更時にレビュー観点の確認を必ず通したい
  strength_needed: deterministic
  priority: must
- id: R2
  want: コーディング規約を Claude が参照できるようにしたい
  strength_needed: advisory
  priority: should

## 使用可能なカスタマイズ機能（環境制約・探索空間の事前刈り込み）
constraints:
  hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }
  mcp:          { allowed: false, reason: "外部接続はネットワークポリシーで不可" }
  plugins:      { allowed: false, reason: "配布基盤を持たず個別ファイル配置のみ" }
  experimental: { allowed: false, reason: "実験機能への本番依存を禁止" }
  organization_policy: "生成物は監査可能な平文ファイルに限る"

## 制約と要件の衝突（ヒアリング時点で見えたもの・方向づけまで）
conflicts:
  - requirement: R1（deterministic 希望）
    constraint: hooks 禁止
    note: Hooks が使えないため deterministic は実現できない。L1 Rules による advisory へ格下げする（P2 で合意）。
