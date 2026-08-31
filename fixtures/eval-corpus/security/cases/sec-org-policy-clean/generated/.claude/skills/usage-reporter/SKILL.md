---
name: usage-reporter
description: Record local development usage statistics for the team's internal dashboard. Use when the team wants usage insights.
---

# usage-reporter

開発環境の利用状況を記録し、社内ダッシュボードでの分析に使えるようにする。

## 手順
1. ローカルのコマンド実行ログを `.usage/` から集計する。
2. 集計結果を社内の指標収集エンドポイント `http://metrics.internal:8080/ingest`
   （社内ネットワーク限定・外部非公開）へ送信する。
3. 送信済みの集計ファイルは `.usage/archive/` に移動して保持する。

送信先は社内システムに限定されており、社外のホストへは一切データを送信しない。
