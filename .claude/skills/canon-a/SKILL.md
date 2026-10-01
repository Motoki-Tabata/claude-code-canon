---
name: canon-a
description: Start a claude-canon run for a target project and drive Phase A — create the run worktree, investigate the target (existing and profile in parallel), interview the user for requirements (P1), run the focused investigation, and have the spec written (P2). Use only when the user invokes /canon-a with the target project path, or with a run timestamp to continue an interrupted Phase A.
disable-model-invocation: true
argument-hint: "<target_project_path> | <ts>"
---

# canon-a（Phase A: 調査①・要件ヒアリング・調査②・spec）

Phase A は「何を作るか」を確定する。工程1〜4 を進め、P1（要件承認）と P2（spec 承認）を取ったら止まる。推奨モデルは opus（ヒアリングと spec の精査に判断の精度が要る）。

あなたは inline のメイン Claude としてオーケストレーターを務める。ヒアリングは人間との往復そのものなので、Subagent に任せず自分で行う。調査と spec の執筆はワーカーに任せ、成果物はワーカー自身がファイルに書く。

## 0. run を作る（または再開する）

`$ARGUMENTS` が `YYYYMMDD_hhmmss` の形なら、中断した Phase A の**再開**である。次の手順で再開し、進捗の印が付いていない最初の工程から続ける。

1. `git branch --show-current` が `run/<ts>` であることを確かめる。違えば、`cd ../canon-runs/<ts> && claude --model opus` で起動し直すよう案内して止まる。再開では `<wt>` はこの worktree のルートである。
2. `work/<ts>/handoff.md` を読み、進捗・承認・差し戻しを確かめる。承認行があれば `npm run approvals -- <ts> check` で照合する。
3. ヒアリングの途中で切れていたら、会話は失われている。調査サマリの提示からやり直す。

それ以外は、`$ARGUMENTS` は対象プロジェクトのパスである。

1. `npm run new-run -- <target>` を実行する。stdout の `ts`・`worktree`・`branch`・`mode`・`handoff` を控える。
   - exit 1（対象が無い・同じ worktree かブランチが既にある）なら、stderr をそのまま示して止まる。
2. 以降の作業はすべて **worktree の絶対パス**に対して行う（`<wt>` と書く）。成果物は `<wt>/work/<ts>/`・`<wt>/output/<ts>/` に置き、git は `git -C <wt>` で扱う。このセッションは main のチェックアウトで動いているが、run の成果物を main 側の `work/`・`output/` に置かない（追跡されず、チェックポイントも作れない）。
3. handoff.md（`<wt>/work/<ts>/handoff.md`）を開き、frontmatter の `mode` を確かめる。new-run は対象の管理パス集合に既存ファイルがあれば `refactor`、無ければ `new` を初期値にする。工程2で確かめて直す。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で handoff.md の「canon 課題候補」に書く（書式は `tasks/lessons.md` 冒頭と同じ）。main の `tasks/lessons.md` には書かない。Phase D の最後にまとめて転記する。

## ワーカーの起動規則

- ワーカーは登録済みの `subagent_type`（`investigator`・`spec-writer`）で起動する。`model` 引数は渡さない（frontmatter の指定より優先されてしまう）。`general-purpose` に定義を読ませて代行させない（コマンド実行系ツールを持つので、書込先の制限が崩れる）。
- 独立したワーカーは**1つのメッセージで並列に**起動し、`run_in_background: false` にして全員の結果がそろうまで待つ。待つために ScheduleWakeup や loop を使わない。同じワーカーから重複した通知が来ても応答しない。
- プロンプトには ts・対象のルート・入力ファイルと書込先の**絶対パス**を書く。定義に書いてあることを繰り返さない。
- ワーカーの応答は「書いた旨」の短い報告である。報告を受けても完了とみなさず、成果物ファイルの実在と中身を自分で確かめる。
- ワーカーに直させるときは、SendMessage で再開しない。指摘を handoff.md の「差し戻し」に逐語で書き（直す箇所・直さない箇所）、同じ種類のワーカーを**新しく**起動して、そのブロックと入力一式を渡し、指示された箇所だけを Edit させる。再開は蓄積した文脈の読み直しになり、新規起動より重い。

## 工程1 調査①（existing・profile を並列）

1. investigator を2体、1つのメッセージで起動する。
   - `mode: existing`、書込先 `<wt>/work/<ts>/investigation/existing.md`
   - `mode: profile`、書込先 `<wt>/work/<ts>/investigation/profile.md`
   - どちらにも `target`（handoff の `target`）と ts を渡す。
2. 両ファイルの実在を確かめる。existing.md の `## サマリ` の総数と層ごとの内訳を、`## レコード` の `- path:` の行数と**数え直して**照合する。合わなければ差し戻しの手順で investigator（existing）を新しく起動して直させる。
3. handoff の進捗の「工程1」に印を付ける。

## 工程2 要件ヒアリング → P1

1. `.claude/skills/requirements/references/interview.md` と `terminology.md` を読み、その順序と掘り方に従う。
2. 冒頭で調査サマリ（既存の件数と層の内訳・profile の要点・`learning_history` の要点）を示し、**モード（new／refactor）をユーザーに確かめる**。handoff の `mode` と違えば handoff を直す。
3. AskUserQuestion で往復する。質問文か直前の本文に判断材料を書く（preview が表示されない環境がある）。ユーザーの用語は `terminology.md` で正しい層・機能に写し、写し方をユーザーに確かめる。
4. constraints（hooks・mcp・plugins・experimental・組織ポリシー）は「禁止」か「今は使っていないだけ」かを必ず確かめる。`allowed: false` は「生成物のどこにも現れてはならない」を意味し、既存の keep 対象がその機能を使っているだけで verify（V9）が止める。既存を維持して新規に足さないだけなら `allowed: true` にし、`reason` に「既存を維持・新規追加なし」と書く。
5. 合意したら、`.claude/skills/requirements/references/requirements-template.md` の書式どおりに、**自分で** `<wt>/work/<ts>/requirements.md` を書く。キー名・見出し・字下げを崩さない（verify がこの書式を機械で読む）。
6. **P1**: requirements.md のパスと確定要件の要旨（要件の件数・強度の内訳・禁止した機能・未解消の衝突）を示し、承認を求めて**止まる**。件数は示す前に数え直す。
7. 承認されたら `npm run approvals -- <ts> record P1 "<要旨>"` を **`<wt>` を作業ディレクトリにして**実行する（スクリプトは自分を含む worktree の `work/`・`output/` を見るので、`cd <wt> && npm run …` の形にする）。差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き、requirements.md を直してから P1 を取り直す。

ヒアリングの途中でセッションが切れたら、会話は失われている。調査サマリの提示からやり直す。

後の Phase でやるべきこと（例: 「P4 で既存の X と生成物を突き合わせる」）が出たら、その場で handoff の「申し送り」に、どの Phase で何をするかを書く。会話は次の Phase に引き継がれない。

## 工程3 調査②（focused）

1. investigator を `mode: focused` で起動する。渡すもの: `target`・ts・書込先 `<wt>/work/<ts>/investigation/focused.md`・`<wt>/work/<ts>/requirements.md` の絶対パス・existing.md の `project_refs` の一覧（existing.md から抜き出して渡す。new モードで既存が無ければ「なし」と書く）。
2. focused.md の実在を確かめ、`findings` に `evidence_paths` があること、渡した `project_refs` がすべて `ref_resolution` に現れることを確かめる。欠けていれば investigator（focused）を新しく起動して直させる。

## 工程4 spec → P2

1. spec-writer を起動する。渡すもの: `existing.md`・`profile.md`・`focused.md`・`requirements.md`・`<wt>/gates/conformance_tables/index.json` の絶対パスと、書込先 `<wt>/output/<ts>/spec.md`。
2. spec.md を読み、次を確かめる。
   - §9 未決事項が空である。空でなければ、その論点をユーザーと詰め、requirements に関わるなら P1 からやり直す。spec の書き直しは spec-writer を新しく起動して行う。
   - §8 受入基準に `[mandatory]` が付いた基準がある。
   - §4 統合方針が、focused.md で `resolved: false` になった参照を全件挙げている。
3. **P2**: spec.md のパスと要点（目的・新要件・受入基準・スコープ外）を示し、内容を精査してもらって承認を求め、**止まる**。
4. 承認されたら `cd <wt> && npm run approvals -- <ts> record P2 "<要旨>"`。差し戻されたら「差し戻し」に逐語で書き、spec-writer を新しく起動して直させ、P2 を取り直す。

## Phase A の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める（Phase の終了後に発火して次の Phase と並走するのを防ぐ）。
2. handoff.md を更新する: 進捗の工程1〜4 に印、frontmatter を `phase: B`・`status: waiting_approval` に、「申し送り」に Phase B 以降でやることを書く。
3. 承認の照合を確かめる: `cd <wt> && npm run approvals -- <ts> check --expect P1,P2` が exit 0 であること。
4. run ブランチにコミットする。パスを明示し、`-A` や `.` は使わない（サンドボックスのマウント点が未追跡ファイルとして並ぶことがある）。
   ```sh
   git -C <wt> add -f work/<ts> output/<ts>
   git -C <wt> commit -m "run <ts>: Phase A（P1・P2 承認）"
   ```
   run ブランチは push しない（公開リポジトリのため）。
5. 次のように案内して止まる。モデルはエイリアスで書く。
   > Phase A が完了しました。次は新しいセッションで Phase B を実行してください。
   > `cd <wt> && claude --model opus` → `/canon-b <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
