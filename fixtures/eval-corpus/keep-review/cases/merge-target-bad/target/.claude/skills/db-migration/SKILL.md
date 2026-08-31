---
name: db-migration
description: Run and roll back database migrations safely. Use when changing the schema.
---

# db-migration

マイグレーションの作成・適用・巻き戻しの手順。適用前に必ずダンプを取る。
巻き戻しは down スクリプトの存在を確認してから実行する。本番適用は保守時間帯に限る。
