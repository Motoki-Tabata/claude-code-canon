---
name: canon-build
description: Drive the build stage of a claude-canon run — edit and delete the files of change-plan.md in the target worktree with builders, run the target's own checks, commit, run verify, have reviewers and the prompt auditor judge the diff, get the diff gate approved, and run the retrospective. Use only when the user invokes /canon-build with a run timestamp whose planning gates (small route G1, large route G1 and G2) are approved.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-build（構築の段: 編集・検証・レビュー・差分のゲート・振り返り）

この段は、承認済みの change-plan.md を対象の worktree（ブランチ `canon/<ts>`）の上で実現する。差分のゲート（小は G2・大は G3）の承認を取り、振り返りを書いたら止まる。反映は人間のマージで行う（この Skill は対象のブランチをマージも push もしない）。推奨の起動は `claude --model sonnet --effort medium`。

あなたは inline のメイン Claude として、編集・検査・コミットを自分で行い、ファイルの編集と意味の判定をワーカーに任せる。ワーカーはシェルを持たないので、コマンドの実行（対象のテスト・`git rm`・コミット）はあなたが行う。

## 0. 開始する

canon のルートの絶対パスを `<root>` と書く。handoff の `worktree`・`branch`・`base`・`route` を控える（`<worktree>`・`<base>`）。`$ARGUMENTS` は run の `<ts>` である。

1. `npm run preflight -- <ts> --stage build` を実行する。NG（route が無い・入力が無い・計画のゲートの承認が無効・worktree が違う）があれば、出力をそのまま示して止まる。`WARN canon` が出たら、変更の要約を示して続けてよいかを尋ねる。
2. `npm run handoff -- <ts> set stage=build status=in_progress` と `npm run handoff -- <ts> session build` を実行する。
3. handoff の進捗・差し戻しを確かめ、印の付いていない最初の工程から続ける。差し戻しがあれば、指摘が指すファイルだけを直す（全体を作り直さない）。

起票するとき、`tasks/lessons.md` の見出しの出典欄は `run <ts>・build` とする。

## ワーカーの起動規則

- ワーカーは登録済みの `subagent_type`（`builder`・`reviewer`・`prompt-auditor`・`session-analyst`）で起動する。`model` 引数は渡さない（定義の frontmatter が正）。`general-purpose` に定義を読ませて代行させない。
- 独立したワーカーは1つのメッセージで並列に起動し、`run_in_background: false` にして全員の結果がそろうまで待つ。
- プロンプトには ts と、入力・書込先の絶対パスを書く。定義に書いてあることを繰り返さない。
- ワーカーの応答は「書いた旨」の短い報告である。完了とみなさず、成果物の実在と中身を自分で確かめる。
- 直させるときは SendMessage で再開しない。指摘を handoff の「差し戻し」に逐語で書き、同じ種類のワーカーを新しく起動して、そのブロックと入力一式を渡す。
- advisor は、同じエラーが2回出たときと、差分のゲートの前だけに呼ぶ（メインが Sonnet のとき）。

## 構築1 編集と削除

1. `work/<ts>/change-plan.md` の `## ファイル` を読む。`op: delete` のファイルは、あなたが `npm run worktree -- rm --worktree <worktree> <ファイル…>` で消す。
2. `modify`・`new` のファイルを、機能ごとの担当（unit）に分ける。対応は `.claude/skills/generation/SKILL.md` の表（CLAUDE.md＝claude-md、`.claude/rules`＝rules、`.claude/skills`・commands＝skills、`.claude/agents`＝subagents、settings・hooks・permissions・statusline＝settings、`.mcp.json`＝mcp、plugin＝plugins、出力スタイル＝output-styles）。担当のファイルの集合は互いに重ならない。
3. `builder` を unit ごとに、1つのメッセージで並列に起動する。渡すもの: `unit`・worktree の絶対パス・`work/<ts>/change-plan.md`・`requirements.md`・`impact.json` の絶対パス・担当のファイルのパスの一覧・（あれば）参照元の `path`。
4. 各 builder の応答（書いたファイルの一覧）を、change-plan の担当の件数と突き合わせる。欠けや、担当外のファイルが書かれていれば、差し戻しの手順で直す。実行権限が要ると報告されたスクリプトには、あなたが権限を付ける。
5. `npm run handoff -- <ts> mark 構築1`。

## 構築2 検証とコミット

1. change-plan の `## 検証コマンド` を、worktree で実行する（`cd <worktree>` してから。対象のテスト・ビルド・lint）。worktree には追跡中のファイルしか無い（`node_modules`・`.venv`・ビルド出力・`.env` は入っていない）ので、依存の導入が `## 検証コマンド` の先頭に無ければ、先に導入する（profile の `package_manager` に従う）。導入できない対象は、change-plan に書いた代わりの確認方法で確かめる。失敗は原因を直す。同じエラーが2回出たら advisor を呼ぶ。
2. `npm run worktree -- commit --worktree <worktree> --message "<変更の要約>"` でコミットする。
3. `npm run verify -- <ts>` を実行する（変えたファイルだけを検査し、`work/<ts>/verify-report.md` を書く）。違反があれば、report の指摘を読んで直し（コマンドで直せるものはあなたが、ファイルの内容は差し戻しの手順で builder に）、再びコミットして verify を回し直す。verify が不合格のまま次に進まない。
4. warning（特に V9 の trust の前提）は、差分のゲートの提示に載せる。
5. `npm run handoff -- <ts> mark 構築2`。

## 構築3 レビュー

1. `git -C <worktree> diff <base>..HEAD > <root>/work/<ts>/review/diff.patch`（`work/<ts>/review/` が無ければ作る）。
2. `reviewer` と `prompt-auditor` を1つのメッセージで並列に起動する。
   - reviewer: worktree・変えたファイルの一覧（`git -C <worktree> diff --name-only <base>..HEAD`）・`diff.patch`・`requirements.md`・`change-plan.md`・`impact.json` の絶対パスと、書込先 `<root>/work/<ts>/review/review-1.md`。変えたファイルが多いときは、機能のまとまりで分けて複数起動してよい（`review-<k>.md`）。分けるときは、change-plan の `## 参照元の扱い` の「変えない」の全件を、どれか1体に割り当てて、担当の参照元の一覧としてプロンプトに書く（該当の語やファイルが担当のファイルに当たるものはその reviewer へ、どれにも当たらないものは1体に寄せる）。割り当てた一覧の和が全件と一致することを、起動の前に数えて確かめる。
   - prompt-auditor: プロンプトとして読まれるファイル（Skill・Subagent・CLAUDE.md・rules・出力スタイル）が差分にあるときだけ。変えたそのファイルの絶対パスと、書込先 `<root>/work/<ts>/review/prompt-audit.md`。小さな修正では起動しない。
3. 指摘を読む。`## 未判定の対象` が「なし」でなければ、その分の reviewer を追加で起動する。`high`・`medium` の指摘は、直す（差し戻しの手順で builder を新しく起動 → 再コミット → verify → 変更のあった対象だけ再レビュー）。再レビューの前に `git -C <worktree> diff <前回レビューした HEAD>..HEAD > <root>/work/<ts>/review/diff-<n>.patch`（n は2から）を書き、`diff.patch` の代わりに渡す。直さない指摘は、理由を差分のゲートの提示に載せる。
4. `npm run handoff -- <ts> mark 構築3`。

## 構築4 差分のゲート

1. 前提を確かめる: worktree に未コミットの変更が無い（`git -C <worktree> status --porcelain` が空）・最後のコミットの後に verify が合格している。承認の後で新しいコミットを積むと、承認は無効になる。
2. advisor を呼ぶ（メインが Sonnet のとき）。
3. ゲートは、ほかの問いと混ぜずに**単独の問い**として取る。提示するもの:
   - 差分 `git -C <worktree> diff --stat <base>..HEAD` と、承認の対象（ブランチ `canon/<ts>` の HEAD のコミット）。
   - verify の結果（合格・warning の内容。hooks か `permissions` を含むときは、対象のリポジトリでワークスペースの trust を承認しないと効かないこと）。
   - reviewer・prompt-auditor の指摘の件数と、直した指摘・直さなかった指摘とその理由。
   - 配置後の手作業（change-plan の「配置後の手作業」・実行権限・環境変数）。
4. 承認を求めて**止まる**。承認されたら `npm run approvals -- <ts> record <G2|G3> "<要旨>"`（小は G2・大は G3）。差し戻されたら、指摘を `npm run handoff -- <ts> note 差し戻し "<指摘>"` で逐語に書き、直して再コミット → verify → 再レビュー → 差分のゲートを取り直す。
5. **承認の記録のあとは、ブランチに何もコミットしない**（振り返りの成果物は `work/<ts>/` に書く）。
6. `npm run handoff -- <ts> mark 構築4`。

## 構築5 振り返り

1. handoff の `## セッション` に記録された session-id ごとに `npm run tokens -- <session-id>` で区分別の消費を出す。
2. `session-analyst` を、`## セッション` の行の数だけ（plan・design と、このセッション自身の build を含む）1つのメッセージで並列に起動する。渡すもの: transcript の jsonl の絶対パス・tokens の集計結果・観点（手戻り・承認で止まった箇所・時間やトークンを使った工程）・書込先 `<root>/work/<ts>/retro/session-analysis-<stage>-<session-id の先頭8桁>.md`（同じ段を再開して session-id が複数あっても上書きしない）。
3. 分析を読み、canon 本体の改修要求（欠陥・浪費・規律の穴）は、メインが確度（実物で確認か文言のみか）を確かめてから `tasks/lessons.md` に起票する。session-analyst の記述を転記しない。無ければ「無し」と報告する。
4. `work/<ts>/retro/` の分析のファイルの数が `## セッション` の行の数と一致することを数えて確かめてから、`npm run handoff -- <ts> mark 構築5`。

## 終わりに

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. `npm run approvals -- <ts> check --expect <小は G1,G2／大は G1,G2,G3>` が exit 0 であること（差分のゲートはコミットの sha と照合される）。`npm run handoff -- <ts> set stage=build status=done`。
3. この SKILL.md の手順の外で行った操作を列挙し、あれば `tasks/lessons.md` に起票する。無ければ「無し」と報告する。
4. 次のように案内して止まる。
   > 構築が完了しました。対象のリポジトリで、ブランチ `canon/<ts>` を人間がレビューしてマージします（PR にするなら push も人間が行います）。
   > マージしたら、canon のルートで `npm run worktree -- cleanup --worktree <worktree> --delete-branch` を実行すると worktree とブランチを片付けられます。マージしないで捨てるなら `--discard` です（未コミットの変更ごと消えます）。
