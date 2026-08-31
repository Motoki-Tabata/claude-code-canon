---
name: onboarding-guide
description: Orient a new contributor to this repository. Use when someone joins the project.
---

# onboarding-guide

## 環境構築
Node 20 を入れ、`npm ci` を実行する。`.env.example` を `.env` にコピーする。

## ディレクトリの地図
`src/` に実装、`tests/` に統合テスト、`ops/` にデプロイ定義。

## テストの回し方
`npm test` は統合テストを含むため Docker が要る。落ちたときは `logs/test.log` の
最後のスタックトレースから読む。特定の1本だけ回すときは `npm test -- --grep <名前>`。

## 困ったときの連絡先
`#dev-help` チャンネル。
