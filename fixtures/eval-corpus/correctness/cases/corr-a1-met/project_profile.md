# 系統B（eval コーパス: corr-a1-met）

## プロジェクト実態
- 言語/実行: Node.js（ESM）
- ルータ: `src/routes/` に1ファイル1エンドポイントで定義。`src/routes/index.js` で登録する。
- バリデーション: `src/validate/` の zod スキーマを使う。
- テスト: `tests/` に統合テスト。`npm test` で実行（有効・実在）。
