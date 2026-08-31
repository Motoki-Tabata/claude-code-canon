# spec（eval コーパス: corr-grounded）

## 新要件

- id: R1
  want: テストの実行手順と失敗時の読み方を Skill 化する
  project_grounding: 統合テストは docker compose 前提

## 受け入れ基準

- id: A1
  functional: 生成された Skill が、このプロジェクトで実際に通るテスト実行手順を示していること
    （実在しないコマンドを書かない）。
