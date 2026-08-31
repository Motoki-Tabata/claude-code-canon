---
paths: src/**/*.js
---

# スキーマ変更時のレビュー観点（R1・advisory へ縮退）

R1 は本来 deterministic（Hooks による機械強制）を望んだが、constraints で hooks が
禁止されているため advisory（自動ロードされる Rules）へ縮退した（requirements.md の
conflicts に記録済み）。強制力は無く、以下は Claude が読む規約である。

- スキーマのフィールドを追加・改名したら、影響する呼び出し箇所を列挙してから編集する。
- 破壊的変更は必ず理由と移行手順を PR 本文に書く。
- 既存フィールドの型変更は互換性の観点から原則避ける。
