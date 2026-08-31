---
name: pr-guide
description: Open a well-formed pull request. Use when submitting changes for review.
---

# pr-guide

## PR 本文
変更理由・影響範囲・確認手順を書く。関連 issue をリンクする。

## テストの回し方
`npm test` は統合テストを含むため docker が要る。落ちたら `logs/test.log` の末尾の
スタックトレースから読む。特定の1本は `npm test -- --grep <名前>`。カバレッジは `npm run cov`。

## レビュー依頼
レビュアーを1名指名し、大きな変更は分割した理由を添える。
