---
name: requirements
description: 要件ヒアリングの質問セットと用語の誤マッピング一覧、requirements.md と change-plan.md のテンプレート。/canon-plan と /canon-design のメインがユーザーと対話して requirements.md を、change-plan.md を書くときに参照する。
user-invocable: false
---

# requirements（要件の聞き方と書き方）

要件は、ユーザーとの往復で固まる。ヒアリングは Subagent や `context: fork` に任せない。段階 Skill のメイン（inline の Claude）が調査結果を示しながら直接聞き、合意した内容を自分で `work/<ts>/requirements.md` に書く。そのあと、変えるファイルと指示を `work/<ts>/change-plan.md` に書く（小の経路は `/canon-plan`、大の経路は `/canon-design`）。中間文書はこの2つだけで、前の段の内容は再掲せず、要件の ID（R1…）とパスで参照する。

## 読み分け

| いつ | 読む |
|---|---|
| ヒアリングの前 | [references/interview.md](references/interview.md)（質問の順序と掘り方）・[references/terminology.md](references/terminology.md)（ユーザーの用語を正す） |
| 合意したあと | [references/requirements-template.md](references/requirements-template.md)（requirements.md の書式・根拠の確度・`allowed: false` の意味） |
| 変更計画を書く | [references/change-plan-template.md](references/change-plan-template.md)（change-plan.md の書式・`impact` の該当への答え方） |

## 共通の規律

- 書式はスクリプト（`npm run check`）が機械で読む。テンプレートのキー名・見出し・字下げを崩さない。書いた直後に `npm run check -- <ts> requirements`（change-plan は `change-plan`）を実行する。
- 承認状態は成果物の中に書かない。承認は `handoff.md` の承認行に記録する。
- 「文言のみ」の要件は確定させない（`## 未確定` に置く）。実物か公式で確かめてから確定する。
