---
name: design
description: 大の経路で change-plan.md の機能選定・構成と責務・モデル割当を決めるときの判断基準とテンプレート。機能選定（12機能）・構成と責務・機能の組み合わせ方（パターン）・モデル割当を扱う。/canon-design のメインが、承認済みの requirements.md から change-plan.md を書く前に参照する。
user-invocable: false
---

# design（設計判断と change-plan の書き方・大の経路）

大の経路（新規の構築・作り直し）では、変えるファイルを決める前に、どの機能に何を置くかを決める。判断は `/canon-design` のメインが inline で行い、結果を `change-plan.md` の `## 機能と責務`・`## モデル割当` と、`## ファイル` の各件に書く。設計だけを担うワーカーは置かない（入力を読むのが1回で済み、差し戻しも同じ文脈で直せる）。

## 手順と読むファイル

上から順に判断する。各段階で、該当する1ファイルを Read する。

| 段階 | 決めること | 読む |
|---|---|---|
| 1 | 要件ごとの使用機能（12機能）と Experimental 依存 | [references/feature-selection.md](references/feature-selection.md) |
| 2 | 各カスタマイズの1文責任・書込スコープ・検証の主体 | [references/structure.md](references/structure.md) |
| 3 | 組み合わせの型（パターン）と入出力・依存の向き | [references/orchestration-patterns.md](references/orchestration-patterns.md) |
| 4 | 各実行単位のモデルと effort | [references/model-selection.md](references/model-selection.md) |
| 5 | change-plan に書く | [references/change-plan-large.md](references/change-plan-large.md) |

既存のカスタマイズがある作り直しでは、`inventory.json` の一覧を見て、残すもの（何も書かない）・直すもの（`op: modify`）・消すもの（`op: delete`）・足すもの（`op: new`）を `## ファイル` に書く。残すかどうかの判定の表は作らない。

## 読む範囲

入力は `work/<ts>/` の `requirements.md`・`inventory.json`・`investigation/` のファイルと、`canon-reference` の該当の節だけ。他の run の change-plan、検査スクリプトの実装、設計書は読まない。`rationale` は判断の根拠を1〜2文で書き、入力の内容を再掲しない。

## 差し戻しのとき

G2 で差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き、change-plan.md の指摘が指す箇所だけを Edit する。指示の無い機能の節を書き換えない。修正が機能と責務やモデル割当に波及するなら、そこも整合させる。直したら `npm run check -- <ts> change-plan` を通し、G2 を取り直す。

## 書いてはいけないもの

- 承認状態（承認は handoff.md の承認行が持つ）。
- 新しい本文（それは builder の仕事）。
- 試していない成否（「既存と衝突しない」「テストは通る」）。対象のテスト・ビルド・CI の振る舞いを変える変更は、`## 検証コマンド` で `/canon-build` のメインが worktree で試す。
- 実行を要する検証（テストの実行・スクリプトの動作確認）の主体をワーカーにすること。builder・reviewer はコマンド実行系ツールを持たない。検証の主体は「メイン」と書く。ワーカーに割り当てられるのは、ファイルを読んで確かめる検証（存在・書式・件数・参照の整合）までである。
