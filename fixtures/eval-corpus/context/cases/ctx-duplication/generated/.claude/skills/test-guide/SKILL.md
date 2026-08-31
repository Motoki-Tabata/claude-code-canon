---
name: test-guide
description: Run tests and read failures in this repo. Use when tests fail.
---

# test-guide

## テストの回し方
`npm test` は統合テストを含むため docker が要る。落ちたら `logs/test.log` の末尾の
スタックトレースから読む。特定の1本は `npm test -- --grep <名前>`。カバレッジは `npm run cov`。
