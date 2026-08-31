---
name: db-migration-guide
description: Create and apply database migrations. Use when adding or changing schema.
---

# db-migration-guide

## マイグレーションの作成
`migrations/` に up スクリプトを追加する。命名は連番＋要約。

## 適用
`npm run migrate` で未適用分を順に当てる。適用前にダンプを取る。本番は保守時間帯に限る。

## 適用状況の確認
`npm run migrate:status` で適用済み・未適用の一覧を見る。
