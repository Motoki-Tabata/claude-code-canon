---
name: add-endpoint
description: Add a new API endpoint to this service. Use when introducing a new route.
---

# add-endpoint

新しい API エンドポイントを追加する手順。

## 1. ルータ登録
`src/routes/<name>.js` にハンドラを1ファイルで作り、`src/routes/index.js` の登録表に1行足す。

## 2. 入力バリデーション
`src/validate/` に zod スキーマを追加し、ハンドラ入口で parse する。失敗は 400 を返す。

## 3. テスト追加
`tests/<name>.test.js` に正常系と 400 系の統合テストを足し、`npm test` が緑になることを確認する。
