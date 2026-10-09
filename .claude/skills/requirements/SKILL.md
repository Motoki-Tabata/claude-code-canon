---
name: requirements
description: 要件ヒアリングの質問セットと用語の誤マッピング一覧、requirements.md と spec.md のテンプレート。Phase A のオーケストレーターがユーザーと対話して requirements.md を書くとき、spec-writer が spec.md を書くときに参照する。
user-invocable: false
---

# requirements（要件の聞き方と書き方）

要件は、ユーザーとの往復で固まる。ヒアリングは Subagent や `context: fork` に任せない（会話履歴が引き継がれず、往復が成立しない）。オーケストレーター（inline のメイン Claude）が調査結果を示しながら直接聞き、合意した内容を自分で `work/<ts>/requirements.md` に書く。そのあと spec-writer が、調査結果と合意済みの要件から `output/<ts>/spec.md` を書く。

## 読み分け

| 誰が | いつ | 読む |
|---|---|---|
| オーケストレーター | ヒアリングの前 | [references/interview.md](references/interview.md)（質問の順序と掘り方）・[references/terminology.md](references/terminology.md)（ユーザーの用語を正す） |
| オーケストレーター | 合意したあと | [references/requirements-template.md](references/requirements-template.md)（requirements.md の書式と、`allowed: false` の意味） |
| spec-writer | spec を書く前 | [references/spec-template.md](references/spec-template.md)（§0〜§9 と受入基準） |

## 三段の責務分離

調査は判定しない → spec は方向づけまで → design-map が確定する。spec-writer は「既存の何を残すか」「どの機能に置くか」を決めない。判定を design-map の一か所に集めるためで、spec が判定まで踏み込むと designer の判断と二重になり、食い違ったときの根拠が失われる。

## 共通の規律

- 書式はスクリプトが機械で読む。テンプレートのキー名・見出し・字下げを崩さない。
- 承認状態は成果物の中に書かない。承認は `handoff.md` の承認行に記録する。
- 書き終えたら、応答には「書いた旨」だけを返す。
