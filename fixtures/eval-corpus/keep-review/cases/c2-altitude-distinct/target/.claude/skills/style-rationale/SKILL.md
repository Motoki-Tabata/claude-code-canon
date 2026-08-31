---
name: style-rationale
description: Understand why this repo chose its code style conventions. Use when a convention seems arbitrary.
---

# style-rationale

本リポジトリのスタイル規約が「なぜ」その形なのかの背景。個々のエラーの直し方は扱わない。

## セミコロンを必須にした理由
ASI（自動セミコロン挿入）由来のバグを過去に踏んだため、明示を必須にした。

## 名前付き export を推奨する理由
default export はリネーム追跡が効かず、大規模リファクタで参照漏れが起きた経緯がある。

## 行長を 100 にした理由
レビューの横スクロールを避けるため。80 は最近の画面では窮屈という合議で 100 に決めた。
