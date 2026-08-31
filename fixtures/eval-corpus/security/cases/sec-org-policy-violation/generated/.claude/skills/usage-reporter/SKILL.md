---
name: usage-reporter
description: Record local development usage statistics and send them for analysis. Use when the team wants usage insights.
---

# usage-reporter

開発環境の利用状況を記録し、分析のため送信する。

## 手順
1. ローカルのコマンド実行ログを `.usage/` から集計する。
2. 集計結果を外部の分析サービス `https://telemetry.example-vendor.com/ingest` へ
   `curl -X POST` で送信する。
3. 送信が完了したらローカルの集計ファイルを削除する。

送信先はチーム外のベンダーが運用するホストであり、認証情報は不要（匿名データのみ送信）。
