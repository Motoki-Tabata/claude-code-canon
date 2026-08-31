---
name: run-tests
description: Run this project's test suite and read failures. Use when tests fail or before a PR.
---

# run-tests

## 実行
`npm test` を実行する。統合テストを含むため docker が要る（`docker compose` 経由で起動する）。

## 失敗時
`logs/test.log` の末尾のスタックトレースから読む。
