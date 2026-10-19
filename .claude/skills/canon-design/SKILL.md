---
name: canon-design
description: Drive the design stage of the large route (new build or rebuild) of a claude-canon run — choose the features, responsibilities and model assignments inline, write change-plan.md for the files to create, change or delete, answer every impact reference, and get G2 approval. Use only when the user invokes /canon-design with a run timestamp whose G1 (requirements) is approved.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-design（設計の段・大の経路: 機能選定・変更計画・G2）

この段は、大の経路（新規の構築・作り直し）で「どの機能に何を置くか」と「どのファイルを作る・直す・消すか」を決める。change-plan.md を書いて G2 の承認を取ったら止まる。推奨の起動は `claude --model opus --effort medium`。

設計は inline のメイン Claude が行う。設計だけを担うワーカーは置かない（入力を読むのが1回で済み、G2 の差し戻しも同じ文脈で直せる）。

## 0. 開始する

canon のルートの絶対パスを `<root>`、`work/<ts>/` を `<root>/work/<ts>/` と書く。`$ARGUMENTS` は run の `<ts>` である。

1. `npm run preflight -- <ts> --stage design` を実行する。NG（route が large でない・requirements.md か inventory.json が無い・G1 の承認が無効）があれば、出力をそのまま示して止まる。`WARN canon` が出たら、変更の要約を示して続けてよいかを尋ねる。
2. `npm run handoff -- <ts> set stage=design status=in_progress` と `npm run handoff -- <ts> session design` を実行する。
3. handoff の進捗・差し戻しを確かめ、印の付いていない最初の工程から続ける。

起票するとき、`tasks/lessons.md` の見出しの出典欄は `run <ts>・design` とする。

## 設計1 機能選定・構成・モデル割当

1. 入力は `work/<ts>/` の `requirements.md`・`inventory.json`（要約の件数と、既存の一覧）・`investigation/` のファイルだけ。承認済みの G1 の要件を、勝手に増減しない。要件を直す必要が出たら、ユーザーに伝えて `/canon-plan <ts>` で G1 を取り直す。
2. `.claude/skills/design/SKILL.md` の手順に従い、段階ごとに該当の references を1つずつ読んで判断する（機能選定 → 構成と責務 → 組み合わせ → モデルと effort）。正典は `canon-reference/references/` の該当の節を読む。constraints で禁止された機能は、選ぶ前に候補から外す。
3. 既存のカスタマイズがある作り直しでは、`inventory.json` の一覧を見て、残すもの（何も書かない）・直すもの（`modify`）・消すもの（`delete`）・足すもの（`new`）を決める。
4. 判断が割れる設計判断（機能の置き場・強度・生成物の Subagent の分け方など）は、AskUserQuestion で選択肢を示して決める。質問文か直前の本文に判断材料を書く。

## 設計2 change-plan.md を書く

1. `.claude/skills/requirements/references/change-plan-template.md` と `.claude/skills/design/references/change-plan-large.md` を読み、`<root>/work/<ts>/change-plan.md` の `## ファイル`・`## 影響の語`・`## 検証コマンド`・`## 機能と責務`・`## モデル割当` を書く。`instruct` は「何を・なぜ」だけで、新しい本文は書かない。
2. 変えるファイルと影響の語を、そのまま `npm run impact -- --root <worktree> --out <root>/work/<ts> --files <ファイル,…> --terms <語,…>`（`<worktree>` は handoff の `worktree`）に渡す。要約の件数だけを読み、該当は `impact.json` を必要な範囲で読む。
3. `## 参照元の扱い` に、**該当のすべて**へ「変える」か「変えない（理由）」で答える。理由は、そのファイルのその行を実際に読んで書く。「変える」は `## ファイル` にも載せる。変えるファイルの中の該当にも答える（「変える」は1件ずつ ID で答え、その行は builder が直す）。
4. `npm run check -- <ts> change-plan` を実行し、NG を直す。サイズの上限を超えたら、前の段の再掲か新しい本文の丸写しを削る。
5. `npm run handoff -- <ts> mark 設計1`。

## G2

ゲートは、ほかの問いと混ぜずに**単独の問い**として取る。

1. 提示するもの: change-plan.md のパス・機能ごとの選定と理由の要旨・変えるファイルの件数と `op` の内訳・モデル割当・Experimental 依存・配置後の手作業・`impact` の該当の件数と「変えない」の件数（`check` の出力から写す。数え直せないときは「数えられなかった」と書く）。
2. 承認を求めて**止まる**。承認されたら `npm run approvals -- <ts> record G2 "<要旨>"`。差し戻されたら、指摘を `npm run handoff -- <ts> note 差し戻し "<指摘>"` で逐語に書き、change-plan.md の指摘が指す箇所だけを Edit して `check` を通し、G2 を取り直す。要件に及ぶ指摘は `/canon-plan <ts>` に戻す。

## 終わりに

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. `npm run handoff -- <ts> set stage=design status=done`。構築でやることがあれば、`npm run handoff -- <ts> note 申し送り "<文>"` で1件ずつ書く。
3. `npm run approvals -- <ts> check --expect G1,G2` が exit 0 であること。
4. この SKILL.md の手順の外で行った操作を列挙し、あれば `tasks/lessons.md` に起票する。無ければ「無し」と報告する。
5. 次のように案内して止まる。
   > 設計が完了しました。次は新しいセッションで構築をしてください。
   > canon のルートで `claude --model sonnet --effort medium` → `/canon-build <ts>`
