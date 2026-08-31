---
name: db-rollback-steps
description: Roll back a database migration safely. Use when a migration must be reverted.
---

# db-rollback-steps

マイグレーションを安全に巻き戻す手順。

## 事前確認
対応する down スクリプトが存在するか確認する。無い場合は手動 SQL を用意する。

## 巻き戻し
本番は保守時間帯に限る。巻き戻し前に必ずダンプを取る。

## 巻き戻し後
アプリの参照する列・テーブルが消えていないか、スモークで確認する。
失敗したらダンプから復元する。
