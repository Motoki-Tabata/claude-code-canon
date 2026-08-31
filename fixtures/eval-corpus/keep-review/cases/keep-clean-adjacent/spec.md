# spec（eval コーパス: keep-clean-adjacent）

## 新要件

- id: R1
  want: 新しい API エンドポイントを追加する手順（ルータ登録・バリデーション・テスト）を Skill 化する
  rationale: 追加のたびに登録漏れが起きる
  project_grounding: src/routes/ にルータ定義・tests/ に統合テスト

## 統合方針

エンドポイント追加の**手順**を新規 Skill に置く。既存のエラーコード表は
参照される側の資料であり、手順書とは別の責務として維持する。
