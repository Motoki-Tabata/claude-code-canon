---
name: investigation
description: 対象プロジェクトの調査結果（existing.md・profile.md・focused.md）を書くときのテンプレートと値の語彙。investigator が mode（existing・profile・focused）ごとに成果物を書く前に参照する。調査は事実の抽出に徹し、keep にするか・参照が健全かといった判定はしない。
user-invocable: false
---

# investigation（調査結果の書き方）

調査は、対象プロジェクトの現物から**事実だけ**を取り出して `work/<ts>/investigation/<mode>.md` に書く仕事である。判定（keep にするか・参照が健全か・正典に適合するか）は design-map を作る designer が一か所でまとめて行う。調査が判定まで踏み込むと、判定の根拠が2か所に分かれ、食い違ったときにどちらが正しいか分からなくなる。

## まず確かめること

- 調べてよいのは、プロンプトで渡された `target`（対象プロジェクトのルート）の配下だけ。claude-canon 自身のリポジトリは調べない。
- 書込先は、渡された mode に対応する1ファイルだけ。対象リポジトリには何も書かない。
- 「無い」「不在」と書く前に、Glob または Grep で確かめる。確かめていない不在は事実ではない。

## mode ごとに読むファイル

書く前に、該当する1つだけを Read する。テンプレートと値の語彙が載っている。

| mode | いつ | 読む | 書く |
|---|---|---|---|
| `existing` | 要件の前。既存カスタマイズの棚卸し | [references/existing.md](references/existing.md) | `existing.md` |
| `profile` | 要件の前。プロジェクトの実態を浅く広く | [references/profile.md](references/profile.md) | `profile.md` |
| `focused` | 要件の確定後。要件に関係する箇所を深く | [references/focused.md](references/focused.md) | `focused.md` |

## 共通の規律

- 書式は機械が読む。キー名・字下げ・1行1エントリの形を崩さない。散文に崩すと、下流の検査が対象を0件と読み、keep の判定がすべて落ちる（0件は合格ではなく「読めなかった」である）。
- 件数（総数・機能ごとの内訳）は、本文を書き終えてから数えて書く。先に見積もらない。書いた直後に自分の出力を Read し直して数え合わせる。
- 大量の生ファイルを本文に展開しない。要点をレコードにする。
- 書き終えたら、応答には「書いた旨」と総数だけを返す。本文を会話に再掲しない（成果物はファイルにある）。
