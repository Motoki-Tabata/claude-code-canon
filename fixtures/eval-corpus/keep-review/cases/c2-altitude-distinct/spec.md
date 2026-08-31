# spec（eval コーパス: c2-altitude-distinct）

## 新要件

- id: R1
  want: よくある lint エラーの直し方（具体的なエラーごとの修正手順）を Skill 化する
  rationale: 同じ lint エラーで詰まる人が多く、その都度聞かれる
  project_grounding: eslint 設定あり・CI で lint を実行

## 統合方針

lint エラーの**修正手順**を新規 Skill に置く。既存のスタイル背景資料（なぜこの規約を
選んだかの説明）は、手順書とは別の責務（判断の拠り所）として維持する。
