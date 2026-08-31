# spec（eval コーパス: corr-a1-met）

## 新要件

- id: R1
  want: 新しい API エンドポイントを追加する手順を Skill 化する
  project_grounding: src/routes/ にルータ定義・tests/ に統合テスト

## 受け入れ基準

- id: A1
  functional: 生成された Skill が「ルータ登録・入力バリデーション・テスト追加」の3手順を、
    このプロジェクトの実体（src/routes/・tests/）に即して具体的に示していること。
