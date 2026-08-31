---
name: cache-invalidation-faq
description: Answer common questions about Redis cache invalidation in this service. Use when cached data looks stale.
---

# cache-invalidation-faq

Redis キャッシュの無効化についてのよくある質問。接続設定そのものは扱わない。

## どのキーがいつ無効化されるか
書き込み時に該当エンティティのキーを削除する。TTL は既定 300 秒。

## stale に見えるとき
まず TTL 内の再取得でないかを疑う。次に無効化イベントが発火したかをログで確認する。

## 手動で飛ばしたいとき
`redis-cli DEL <key>` で個別に消す。全消しは本番では避ける。
