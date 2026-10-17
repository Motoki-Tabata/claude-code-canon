---
name: canon-plan
description: Start a claude-canon run for a target project and drive the planning stage — create the run and the target worktree, take the inventory, check the requirement claims against the real target, interview the user for requirements, and get G1 approval. For the small route (a change to an existing set), also write change-plan.md and take G1 on both documents. Use only when the user invokes /canon-plan with the target project path, or with a run timestamp to continue an interrupted planning stage.
disable-model-invocation: true
argument-hint: "<target_project_path> | <ts>"
---

# canon-plan（計画の段: 調査・要件ヒアリング・G1）

この段は「何を変えるか」を確定する。要件を固めて G1 の承認を取ったら止まる。経路は2つある。

- 小（改修）: `/canon-plan`（このセッション）→ `/canon-build`。G1 は requirements.md と change-plan.md を合わせて取る。
- 大（新規・作り直し）: `/canon-plan` → `/canon-design` → `/canon-build`。G1 は requirements.md だけで取る。

推奨の起動は `claude --model opus --effort medium`。あなたは inline のメイン Claude として、ヒアリングを自分で行う。調査はワーカーに任せ、成果物はワーカー自身がファイルに書く。

## 0. 開始する

このセッションは canon のルートで起動している。以降、canon のルートの絶対パスを `<root>` と書く（`pwd` で確かめる）。中間文書は `<root>/work/<ts>/` に置く（git では追跡しない）。生成物は対象の worktree に置く。

`$ARGUMENTS` が `YYYYMMDD_hhmmss` の形なら、中断した計画の段の**再開**である。

1. `npm run preflight -- <ts> --stage plan` を実行する。NG があれば出力をそのまま示して止まる。`WARN canon` が出たら、run の途中で canon 本体が変わったことと変更の要約を示し、続けてよいかを尋ねる。
2. handoff の進捗・承認・差し戻しを確かめ、印の付いていない最初の工程から続ける。承認行があれば `npm run approvals -- <ts> check` で照合する。
3. `npm run handoff -- <ts> session plan` でこのセッションを記録する。ヒアリングの途中で切れていたら、会話は失われている。調査サマリの提示からやり直す。

それ以外は、`$ARGUMENTS` は対象プロジェクトのパスである。

1. `npm run new-run -- <target>` を実行する。stdout の `ts`・`worktree`・`branch`・`base` を控える。exit 1（対象が無い・git でない・同じ ts がある）なら、stderr をそのまま示して止まる。stderr に「未コミットの変更がある」という警告が出たら、worktree にその変更が入らないことをユーザーに伝える。
2. `npm run handoff -- <ts> session plan` でこのセッションを記録する。

起票するとき（規則は `.claude/rules/workflow.md`）、`tasks/lessons.md` の見出しの出典欄は `run <ts>・plan` とする。

## ワーカーの起動規則

- ワーカーは登録済みの `subagent_type`（`investigator`・`profiler`・`session-analyst`）で起動する。公式仕様の確認には組込みの `claude-code-guide` を使う。`model` 引数は渡さない（定義の frontmatter が正）。`general-purpose` に定義を読ませて代行させない。
- 独立したワーカーは1つのメッセージで並列に起動し、`run_in_background: false` にして全員の結果がそろうまで待つ。
- プロンプトには ts と、入力・書込先の絶対パスを書く。定義に書いてあることを繰り返さない。
- ワーカーの応答は「書いた旨」の短い報告である。完了とみなさず、成果物の実在と中身を自分で確かめる。
- 直させるときは SendMessage で再開しない。指摘を handoff の「差し戻し」に逐語で書き、同じ種類のワーカーを新しく起動して、そのブロックと入力一式を渡す。

## 計画1 照合と調査

1. `npm run inventory -- --root <worktree> --out <root>/work/<ts>` を実行する。標準出力の要約（カスタマイズの件数・機能別の内訳・警告）だけを読み、一覧の全文を会話に載せない。対象の作業ツリーにあって worktree に現れないカスタマイズ（未追跡・gitignore）の警告が出たら、そのファイルを変える要件は扱えないことをユーザーに伝える。
2. profile が要るとき（既存が0件の新規の構築、または要件が主に未知の領域に触れるとき）は、`profiler` を起動する。渡すもの: worktree の絶対パス・ts・書込先 `<root>/work/<ts>/investigation/profile.md`。profile の `learning_history` に所在があれば、後の工程で「文言のみ」の根拠として扱う。
3. `npm run handoff -- <ts> mark 計画1`。

## 計画2 要件を固める

1. `.claude/skills/requirements/references/interview.md` と `terminology.md` を読み、その順序と掘り方に従う。冒頭で `inventory` の要約と profile の要点を示す。AskUserQuestion で往復し、質問文か直前の本文に判断材料を書く。ユーザーの用語は `terminology.md` で正しい機能に写し、写し方を確かめる。
2. **constraints**（hooks・mcp・plugins・experimental・組織ポリシー）は「禁止」か「今は使っていないだけ」かを必ず確かめる。`allowed: false` は「差分のどこにも現れてはならない」を意味し、既存のファイルがその機能を使っているだけで verify の V8 が止める。
3. **確かめてから確定する**。lessons・README・ユーザーの記憶に由来する主張（ファイルの形・設定値・挙動）は、要件1件ごとに確かめる。
   - 実物: `investigator` を起動する。渡すもの: 主張の一覧（仮の ID・主張・確かめたいこと）・worktree の絶対パス・ts・書込先 `<root>/work/<ts>/investigation/findings.md`（参照元があればその `path`）。
   - 公式: Claude Code の仕様に依存する主張と、findings の `unverified` に残った仕様の論点は、`claude-code-guide` に要件ごとの問いを渡して公式のドキュメントで確かめる（独立した問いは1つのメッセージで並列に）。結果をあなたが `<root>/work/<ts>/investigation/official-check.md` に書く（書式は `.claude/skills/investigation/references/official-check.md`）。
   - 確かめられない主張（確度が「文言のみ」）は、`## 未確定` に置く。**G1 で確定させない**。実物や公式と食い違った主張は、ユーザーに伝えて要件を直す。
4. 合意したら、`.claude/skills/requirements/references/requirements-template.md` の書式どおりに、**自分で** `<root>/work/<ts>/requirements.md` を書く。`confirmed_at` には、合意した時点で `date '+%Y-%m-%d %H:%M'` を実行した出力を写す（推測で書かない）。キー名・見出し・字下げを崩さない。書いた直後に `npm run check -- <ts> requirements` を実行し、NG が無いことを確かめる。
5. **経路を決める**。対象に既存のカスタマイズがあり、新しい機能種別を足さず、Skill・Subagent・Plugin の新設・廃止もしないなら小、1つでも欠ければ大。見込みを `npm run handoff -- <ts> set route=<small|large>` で記録する（変えるファイルの件数は条件にしない）。`npm run handoff -- <ts> mark 計画2`。

## 小の経路: 計画3 変更計画と影響の照合 → G1

大の経路は、この節を飛ばして「G1」へ進む。

1. `.claude/skills/requirements/references/change-plan-template.md` を読む。`<root>/work/<ts>/change-plan.md` に、まず `## ファイル` と `## 影響の語` と `## 検証コマンド` を書く。変えるファイルは requirements.md の `files` と `accept` から決める。`instruct` は「何を・なぜ」だけで、新しい本文は書かない。
2. 影響の語（want が変えるコマンド名・既定の挙動・設定キー・語）と変えるファイルを、そのまま `npm run impact -- --root <worktree> --out <root>/work/<ts> --files <ファイル,…> --terms <語,…>` に渡す。要約の件数だけを読み、該当の一覧は `<root>/work/<ts>/impact.json` を必要な範囲で読む。
3. `## 参照元の扱い` に、**該当のすべて**へ「変える」か「変えない（理由）」で答える。「変えない」の理由は、そのファイルのその行を実際に読んで書く。「変える」は `## ファイル` にも載せる。件数が多い語はファイル単位で答えてよい。答えを書いたら `## ファイル` と語が変わっていないことを確かめる（変わったら `impact` を取り直す）。
4. `npm run check -- <ts> change-plan` を実行する。NG があれば直す。**小の条件（対象に既存がある・新しい機能種別を足さない・構成を変えない）が NG になったら大の経路**に切り替える: `set route=large` にして、この段で書いた `work/<ts>/change-plan.md` と `impact.json` は消し（設計の段で書き直す）、G1 は requirements.md だけで取る。
5. `npm run handoff -- <ts> mark 計画3`。

## G1

ゲートは、ほかの問いと混ぜずに**単独の問い**として取る。

1. 提示するもの: 承認の対象のパス（小は requirements.md と change-plan.md、大は requirements.md）・経路と、その理由（小の条件の判定）。
   - 要件の件数・確度の内訳・禁止した機能・未解消の衝突・`## 未確定` に置いた要件（`check` の出力から写す。数え直せないときは「数えられなかった」と書く）。
   - 小の経路だけ: 変えるファイルの件数と `op` の内訳・`impact` の該当の件数と「変えない」の件数（`check` の出力から写す）。
2. 承認を求めて**止まる**。承認されたら `npm run approvals -- <ts> record G1 "<要旨>"` を実行する。差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き（`npm run handoff -- <ts> note 差し戻し "<指摘>"`）、直してから `check` を通し、G1 を取り直す。

## 終わりに

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. `npm run handoff -- <ts> set stage=plan status=done`。後の段でやることがあれば、`npm run handoff -- <ts> note 申し送り "<文>"` で1件ずつ書く（会話は次の段に引き継がれない）。書いた項目の誤りは書き換えず、`note` で訂正の項目を足す。
3. `npm run approvals -- <ts> check --expect G1` が exit 0 であること。
4. この SKILL.md の手順の外で行った操作（手順に無い Write・Edit・sed・コマンド、承認の前に進めたこと）を列挙し、あれば `tasks/lessons.md` に起票する。無ければ「無し」と報告する。
5. 次のように案内して止まる。モデルはエイリアスで書く。
   - 小: 「計画が完了しました。次は新しいセッションで構築をしてください。canon のルートで `claude --model sonnet --effort medium` → `/canon-build <ts>`」
   - 大: 「要件が確定しました。次は新しいセッションで設計をしてください。canon のルートで `claude --model opus --effort medium` → `/canon-design <ts>`」

この Skill の段（plan・design・build）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
