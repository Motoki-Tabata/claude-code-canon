---
name: canon-d
description: Drive Phase D of a claude-canon run — verify the earlier approvals, write the deploy runbook and the pre-deploy check, take the P5 deploy approval, guide the human to run the deploy outside the sandbox, and confirm the result. Use only when the user invokes /canon-d with the run timestamp, in a session started at the claude-canon root.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-d（Phase D: 配置前照合・配置・後始末）

Phase D は承認済みの生成物を対象プロジェクトへ届ける。工程9 の配置前照合をして P5（配置承認）を取り、人間が配置を実行したら、結果を確かめて後始末をする。推奨モデルは sonnet。

あなたは inline のメイン Claude としてオーケストレーターを務める。この Phase ではワーカーを起動しない。**配置（`--confirm`）はあなたが実行しない**。sandbox がファイルをバインドマウントしていると退避の rename が失敗するので、人間が sandbox の外で実行する。

Phase C で済ませたレビュー（reviewer・keep-reviewer・prompt-audit）は再実行しない。生成物は P4 で承認済みで、承認後に変わっていないことは開始時の照合で確かめる。

## 0. 開始手順

`$ARGUMENTS` は run の ts である。

1. `work/<ts>/handoff.md` を読む。frontmatter の `target` を控える。以降、`<out>` は `output/<ts>` の絶対パス、`<target>` は handoff の `target` を指す。
2. **canon の版の確認**: handoff の `canon_commit` と `git log -1 --format=%H` を比べる。違えば `git diff --stat <canon_commit> HEAD -- .claude lib gates tools docs design guide` を示す。`git status --short -- .claude lib gates tools docs design guide` に未コミットの改修があれば、それも示す。どちらかがあれば、run の途中で canon 本体が変わったことを伝え、続けてよいかを尋ねる。
3. **承認の照合**: `npm run approvals -- <ts> check --expect P1,P2,P3,P4` を実行する。exit 1 なら、どのファイルが承認後に変わったか（または承認行が無いか）を示し、そのゲートで承認を取り直すまで先へ進まない。P4 が無効なら、generated/ が承認後に変わっている。配置してはならない。
4. **申し送り**: handoff の「申し送り」のうち Phase D 向けのものを先に実施する。結果は P5 の提示に含める。実施しなかったものは理由を添えて示す。
5. handoff の frontmatter を `phase: D`・`status: in_progress` にする。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で `tasks/lessons.md` の末尾に書く（書式は同ファイル冒頭）。見出しの出典欄は `run <ts>・Phase D` とする。

## 工程9 配置前照合

1. `npm run run-manifest -- <out> <target>` で配置手順書 `<out>/deploy/RUN.md` を書く。以降の手順は RUN.md と同じである。
2. `npm run pre-deploy -- <out> <target>` で対象の現物と output を突き合わせ、`<out>/deploy/pre-deploy-report.txt` を書く。
   - **exit 1 で stdout の report に uncaptured または配置リストの書式の欠陥があるなら、配置しない**。uncaptured は、調査が取りこぼしたか、調査の後に対象側で増えた管理ファイルで、配置すると黙って消える。一覧を示し、Phase A の調査（existing の取りこぼし）か Phase B の設計（disposition の付け忘れ）に差し戻すことをユーザーに提案して止まる。
   - exit 1 で report が出ていない（入力が無い・対象に claude-canon 自身を指定した）、または exit 2（引数不正）なら、stderr を示して止まる。
3. `npm run deploy -- <out> <target>`（`--confirm` を付けない）で配置予定を表示する。これは何も変えない。

## P5 配置承認

次を示してから承認を求める。

- pre-deploy-report の **retired の一覧**（意図した廃止と一致するか）と、**配置予定と退避予定の件数**。件数はレポートの実数をそのまま示す。退避（`.claude-canon.bak.<ts>/` が作られるか・何件か）を推測で案内しない。
- `deploy`（`--confirm` 無し）の出力。
- RUN.md の「2a. この run 固有の追加手順」。配置の前に実行するものがあれば、ここで実行して結果を示す。

承認を求めて**止まる**。

- 承認されたら `npm run approvals -- <ts> record P5 "<要旨>"`。
- 差し戻されたら、指摘を handoff の「差し戻し」に逐語で書く。生成物を直す必要があるなら、opus か sonnet の新しいセッションで該当する Phase（設計なら `/canon-b <ts>`、生成なら `/canon-c <ts>`）からやり直すよう案内して止まる。

## 配置（人間が実行する）

1. RUN.md の「3. 配置（退避スワップ）」のコマンドを、**sandbox の外の通常のシェルで**実行するよう案内する。コマンドは RUN.md から逐語で示す（`--confirm` 付き）。あなたは実行しない。
2. 実行後、人間に報告をもらったら結果を確かめる。
   - `<out>/deploy/deploy-result.json` がある＝配置に成功した。`bak_exists` と `baked` を読み、`.bak` の実在と退避した件数を示す（退避が0件なら `.bak` は作られない）。
   - 無ければ `<out>/deploy/deploy-attempt.json` を読み、`state`（`restored`＝配置前に戻った・`partial`＝戻せなかったものがある）と、動かせなかったファイル・戻せなかったものを示す。`partial` なら `.bak` から手で戻す手順（RUN.md の「ロールバック」）を示す。

## 配置後

1. RUN.md の「3a. 管理パス外の変更」に項目があれば、1件ずつ扱う。適用は人間か対象リポジトリで起動したセッションが行い（配置のコミットとは別のコミット）、各項目の「確認」の実行結果を受け取る。結果を handoff の進捗に、項目ごとに「適用・確認済み（確認の出力の要旨）」か「撤回（撤回の理由と、直した『撤回したら直す生成物』）」として記録する。撤回したのに「撤回したら直す生成物」を直していなければ、完了として扱わない。
2. RUN.md の「4. 配置後の手作業」を**逐語で**示す。要旨に言い換えない（言い換えると手順が縮んで欠ける）。
3. 生成物に Hooks（`.claude/settings.json` の hooks・`.claude/hooks/**`）があり、その発火を対象で確かめていなければ、「配置した。Hook の発火は未検証」と明記する。「全工程が完了した」とだけ言わない。
4. 対象リポジトリへのコミットと push は、**対象リポジトリで起動したセッション**で行うよう案内する（このセッションからは対象側のサンドボックスの例外が効かない。SSH のリモートなら接続先の許可も要る）。
5. MCP サーバーの新規実装が要ると「申し送り」にあれば、対象側で `mcp-builder` Skill を使うよう案内する（canon では実装しない）。

## Phase D の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. handoff.md を更新する: 進捗に工程9・P5・配置の結果の行（工程N → ゲート）を追記して印を付け、frontmatter を `status: done` にする。
3. この run で `tasks/lessons.md` に書いた canon 課題の件数と見出しを報告する。0件なら「0件」と報告する。canon 側のコミットは、ユーザーの指示を待つ。
4. `work/<ts>`・`output/<ts>` の片付けと、対象側の `.claude-canon.bak.<ts>/` の掃除は人間が判断する、と伝えて終える。自分では消さない。

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
