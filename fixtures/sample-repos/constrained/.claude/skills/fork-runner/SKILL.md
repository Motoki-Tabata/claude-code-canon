---
name: fork-runner
description: 大きな調査を別コンテキストで実行する。実験機能 context:fork に依存する。
context: fork
---

# fork-runner

調査結果をメイン文脈に残さないために `context: fork`（実験機能）を使っている。

experimental が禁止された環境では維持できないため、canon では retire される。
