# spec（eval コーパス: corr-a1-unmet）

## 新要件

- id: R1
  want: 認証トークンの失効（expiry / revocation）漏れをレビューする Subagent を用意する
  project_grounding: src/auth/ にトークン発行・検証。失効チェック漏れが過去に事故を起こした

## 受け入れ基準

- id: A1
  functional: 生成された Subagent の指示が、レビュー時に「トークンの失効（expiry / revoked 判定）が
    実装・テストされているか」を実際に確認する手順を含んでいること。
