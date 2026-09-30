---
name: design
description: 承認済みの spec から design-map.md を作るときの判断基準とテンプレート。機能選定（L1〜L5の8機能）・層数と責務・オーケストレーションのパターン・モデル割当・既存カスタマイズの処遇（keep・modify・merge・retire と K1〜K5）・design-map の書式を扱う。designer が design-map を書く前に参照する。
user-invocable: false
---

# design（設計判断と design-map の書き方）

design-map は、生成の**唯一の設計入力**であり、verify の V7・V8 と MANIFEST の宣言源でもある。判定（何を使うか・どの層に置くか・既存をどうするか）を、調査でも spec でもなくここ一か所に集める。判定が複数の場所に散ると、食い違ったときにどれが正しいか決められない。

出力は `output/<ts>/design-map.md`。既存カスタマイズがあっても**全体を引き直す**（前回の design-map を出発点にしない）。

## 手順と読むファイル

上から順に判断する。各段階で、該当する1ファイルを Read する。

| 段階 | 決めること | 読む |
|---|---|---|
| 1 | 要件ごとの使用機能（L1〜L5の8機能）と Experimental 依存 | [references/feature-selection.md](references/feature-selection.md) |
| 2 | 層数（2層・3層）と、各カスタマイズの1文責任・書込スコープ | [references/layer-design.md](references/layer-design.md) |
| 3 | 連携パターンと入出力・依存の向き | [references/orchestration-patterns.md](references/orchestration-patterns.md) |
| 4 | 各実行単位のモデル | [references/model-selection.md](references/model-selection.md) |
| 5 | 既存カスタマイズの処遇（refactor モードのみ） | [references/existing-disposition.md](references/existing-disposition.md) |
| 6 | design-map に書く | [references/design-map-template.md](references/design-map-template.md) |

new モード（既存が無い）では段階5を飛ばし、`## 既存判定` 節は置かない。

## 読む範囲

入力は、プロンプトで渡されたファイルだけ: spec・requirements・investigation の3ファイル（existing・profile・focused）。他の run の design-map、検査スクリプトの実装、設計書は読まない。design-map の書式はテンプレートに従う。読む量がそのまま下流の消費になり、design-map の肥大は全ワーカーの読み込みに跳ね返る（design-map は大きくなりやすく、実測で約96KB）。`rationale` は判断の根拠を1〜2文で書き、入力の内容を再掲しない。

## 差し戻しのとき

オーケストレーターが handoff.md の「差し戻し」（人間の指摘の逐語・直す箇所・直さない箇所）を渡して、designer を新規に起動する。design-map を全文読まず、指示が指す箇所を Grep で探し、その前後だけを Read して Edit する。指示の無い層・判定を書き換えない。修正が既存の判定（keep・modify・merge・retire）に及ぶときは、該当レコードの K1〜K5 をやり直す（指摘に合わせて結論だけを変えない）。Write Scopes・Model Assignments・Interface Contracts に波及するなら、そこも整合させる。

## 書いてはいけないもの

- 承認状態（承認は handoff.md の承認行が持つ）。
- 生成物の中身（それは builder の仕事）。
- 実行を要する検証（テストの実行・スクリプトの動作確認）の主体をワーカーにすること。designer・builder・reviewer はコマンド実行系ツールを持たない。検証の主体は「オーケストレーター」と書く。ワーカーに割り当てられるのは、ファイルを読んで確かめる検証（存在・書式・件数・参照の整合）までである。
