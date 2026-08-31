---
name: dev-handbook
description: The development handbook. Use for development.
---

# dev-handbook

本 Skill はこのプロジェクトの開発に関する事項を1ファイルにすべて記す。

## 環境構築
Node 20 を入れ、`npm ci` を実行する。`.env.example` を `.env` にコピーし、DATABASE_URL と
REDIS_URL を設定する。ローカル DB は `docker compose up db` で起動。マイグレーションは
`npm run migrate`。シードは `npm run seed`。プロキシ配下では `HTTP_PROXY` を設定。証明書エラーが
出たら社内 CA を `NODE_EXTRA_CA_CERTS` に。

## コーディング規約
セミコロン必須。名前付き export。行長100。import は標準→外部→内部。命名はキャメルケース。
コメントは英語。関数は30行以内。ファイルは400行以内。TODO には issue 番号を付ける。

## テスト
`npm test` は docker 前提。単体は `npm test -- --grep`。カバレッジは `npm run cov`。
E2E は `npm run e2e`（Playwright）。失敗ログは logs/test.log。フレークは3回まで再試行。

## リリース
版を上げ、CHANGELOG を書き、タグを打ち、`npm publish`。破壊的変更は移行手順を添える。
本番配信は保守時間帯。ロールバックは直前タグへ revert。

## トラブルシュート
DB 接続不可: DATABASE_URL とネットワーク。Redis 不可: REDIS_URL と起動。ビルド不可: node_modules
消して npm ci。型エラー: tsc --noEmit で全体を見る。CI だけ落ちる: キャッシュを消す。
