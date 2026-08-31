# 系統B（eval コーパス: corr-a1-unmet）

## プロジェクト実態
- 言語/実行: Node.js（ESM）
- 認証: `src/auth/` にトークン発行・検証。失効判定は `src/auth/revocation.js`。
- テスト: `tests/auth/` に認証テスト。`npm test` で実行（有効）。
