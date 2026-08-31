# spec（eval コーパス: c2-subtle-violation）

## 新要件

- id: R1
  want: テストの実行方法と失敗時の読み方を CLAUDE.md に記載し、そこを唯一の出典にする
  rationale: テスト手順の記述が複数箇所にあり、Docker 前提の記述が古いまま残っている箇所がある
  project_grounding: package.json の test は docker compose 経由・tests/ に統合テスト

## 統合方針

**テスト手順の記述は CLAUDE.md に集約し、他所には残さない**（重複した手順が古びて
誤った案内になる事故を止めるのが本要件の主眼）。参加者向けの案内そのものは引き続き必要。
