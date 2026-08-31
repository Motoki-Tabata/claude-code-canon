# spec（eval コーパス: c2-overlap-new-artifact）

## 新要件

- id: R1
  want: レビュー依頼前のセルフチェック手順を1つの Skill にまとめる（差分の大きさの目安・テスト実行・説明文の書き方を含む）
  rationale: 準備の指針が複数の断片に散っており、レビュー依頼の質がばらつく
  project_grounding: .github/pull_request_template.md にチェック項目・tests/ に統合テスト

## 統合方針

レビュー準備の手順は**新規 Skill（pr-self-check）に一本化**する。差分の大きさに関する
既存の断片的な指針は、この新 Skill が扱う「差分の大きさの目安」に**吸収する**。
準備手順の置き場は新 Skill ただ一つにする。
