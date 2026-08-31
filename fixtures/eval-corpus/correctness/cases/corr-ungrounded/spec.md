# spec（eval コーパス: corr-ungrounded）

## 新要件

- id: R1
  want: lint の実行手順を Skill 化する
  project_grounding: （ヒアリング時に lint 導入を希望として挙げたが、現状は未導入）

## 受け入れ基準

- id: A1
  functional: 生成された Skill が、このプロジェクトで実際に通る手順を示していること
    （実在しないコマンド・設定ファイルを既存であるかのように書かない）。
