---
name: canon-b
description: Drive Phase B of a claude-canon run — verify the Phase A approvals, have the designer select features and write the design-map from the approved spec, and take the P3 design-map approval. Use only when the user invokes /canon-b with the run timestamp, in a session started at the claude-canon root.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-b（Phase B: 機能選定と設計）

Phase B は承認済みの spec だけを入力に、工程5 で design-map を確定し、P3（design-map 承認）を取ったら止まる。推奨モデルは opus（keep と retire の議論に判断の精度が要る）。designer 自身は frontmatter で opus に固定されている。

あなたは inline のメイン Claude としてオーケストレーターを務める。設計の判断は designer に任せ、あなたは入力をそろえ、結果を確かめ、人間に提示する。

## 0. 開始手順

`$ARGUMENTS` は run の ts である。

1. `work/<ts>/handoff.md` を読む。frontmatter の `target`・`mode` を控える。
2. **canon の版の確認**: handoff の `canon_commit` と `git log -1 --format=%H` を比べる。違えば `git diff --stat <canon_commit> HEAD -- .claude lib tools design guide` を示す。`git status --short -- .claude lib tools design guide` に未コミットの改修があれば、それも示す。どちらかがあれば、run の途中で canon 本体が変わったことを伝え、続けてよいかを尋ねる。
3. **承認の照合**: `npm run approvals -- <ts> check --expect P1,P2` を実行する。exit 1 なら、どのゲートのどのファイルが承認後に変わったか（または承認行が無いか）を示し、Phase A のそのゲートで承認を取り直すまで先へ進まない。
4. **申し送り**: handoff の「申し送り」のうち Phase B 向けのものを先に実施する。実施した結果は P3 の提示に含める。実施しなかったものは理由を添えて示す（黙って落とさない）。
5. `npm run handoff -- <ts> set phase=B status=in_progress` で frontmatter を直し、`npm run handoff -- <ts> session B` でこのセッションを記録する。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で `tasks/lessons.md` の末尾に書く（書式は同ファイル冒頭）。見出しの出典欄は `run <ts>・Phase B` とする。

## ワーカーの起動規則

- designer は登録済みの `subagent_type: designer` で起動する。`model` 引数は渡さない。`general-purpose` に定義を読ませて代行させない。
- `run_in_background: false` にして結果を待つ。待つために ScheduleWakeup や loop を使わない。
- 応答は「書いた旨」の短い報告である。報告を受けても完了とみなさず、design-map.md の実在と中身を自分で確かめる。
- 直させるときは SendMessage で再開しない。指摘を handoff の「差し戻し」に逐語で書き（直す箇所・直さない箇所）、designer を**新しく**起動して、そのブロックと入力一式を渡し、指示された箇所だけを Edit させる。

## 工程5 機能選定と設計

1. designer を起動する。渡すもの（すべて絶対パス）:
   - `output/<ts>/spec.md`（P2 承認済み）
   - `work/<ts>/requirements.md`（`## 参照元` があれば、designer は `path` の配下も読む）
   - `work/<ts>/investigation/existing.md`・`profile.md`・`focused.md`
   - `work/<ts>/investigation/official-check.md`（あれば）
   - handoff の「申し送り」のうち Phase B 向けのもの（逐語でプロンプトに写す。要約しない）
   - `mode`（handoff の値）と、書込先 `output/<ts>/design-map.md`
2. `npm run check -- <ts> design-map` を実行する。次の項目を機械で判定し、NG が出た項目は差し戻しの手順で直させる。全文を読むのは、P3 の要旨を作るときだけにする。ただし `## Write Scopes` は、役割分担がある設計で共有する構成ファイルの扱いまで書かれているかを、その節を読んで確かめる（`check` は節が空でないことだけを見る）。
   - `## Used Features` があり、`builder を起動する機能: …` の行で、使う機能（12機能）が決まっている。Phase C はこの行で builder を起動する担当を決める。
   - 使うと宣言した機能に `## <機能>` の節があり、生成物が1件ずつ宣言されている。
   - refactor モードでは、existing.md の全レコードが `## 既存判定` に現れる。件数を数え直して照合する（取りこぼした既存ファイルは配置時に消える）。
   - keep のレコードは `keep_conditions` の K1〜K5 がそろい、retire と merge のレコードは `manifest_note` を持つ。
   - `## Write Scopes` が役割分担のある設計で空でない（共有する構成ファイルの扱いを含む）。
   - spec §8 の `[mandatory]` の受入基準が、すべて `## 要件→生成物の対応` に現れる。
   - requirements.md で `allowed: false` にした機能を使う生成物を宣言していない。
   - `## 管理パス外の変更` の各項目の対象パスが、requirements.md の要件の `outside_managed:` の範囲に収まっている。
3. **管理パス外の変更を対象で試す**: `## 管理パス外の変更` に `根拠: 試行待ち` の項目があれば、P3 の前にあなたが試す。以下、`<target>` は handoff の `target`、`<root>` は canon のルートの絶対パス（`pwd`）を指す。
   1. `git -C <target> worktree add --detach <root>/work/<ts>/trial HEAD` で対象の一時 worktree を作る（対象のブランチと作業ツリーには触れない）。
   2. 試行待ちの項目をすべて worktree に適用し、各項目の「確認」のコマンドを worktree で実行する。依存の取得が要るなら worktree の中で行う。
   3. 各項目の `根拠: 試行待ち` を、実行したコマンドと結果（通った・落ちた件数と代表的なエラー）の1〜2行に書き換える。design-map で書き換えてよいのはこの欄だけである。
   4. `git -C <target> worktree remove --force <root>/work/<ts>/trial` で片付ける。
   5. 落ちた項目があれば、結果を「差し戻し」に逐語で書き、designer を新しく起動して設計を直させる（撤回するか・別の変更にするか、と「撤回したら直す生成物」）。直した項目が再び試行待ちなら、この手順をやり直す。

## P3 design-map 承認

全件の精査は負荷が高いので、注意を要するものに絞って示す（artifacts.md §6.5）。

- **retire の全件**: 対象から消えるファイル。1件ずつ、理由（`manifest_note`）と後継（`superseded_by`）を添えて示す。取り消せない操作なので最優先で確かめてもらう。
- **merge の統合先**: 何をどこに寄せたか。
- **K2・K4 に疑いがある keep**: designer が判断に迷ったもの。これらは Phase C で keep-reviewer が独立に判定し、疑いありとされたものは P4 で必ず示す、と添える。
- 5条件を明らかに満たす keep は件数と一覧の要約だけにする。
- 構成と責務・使う機能・組み合わせの型（patterns）・モデル割当の要点。
- **管理パス外の変更の全件**: 対象パス・変更内容の要旨・試した結果（根拠）・撤回したら直す生成物。

件数は示す前に数え直す。design-map.md のパスを示し、承認を求めて**止まる**。

- 承認されたら `npm run approvals -- <ts> record P3 "<要旨>"`。
- 差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き、designer を新しく起動して直させ、P3 を取り直す。指摘が要件や spec に及ぶ（何を作るかが変わる）なら、design-map で吸収せず、Phase A の該当ゲートに戻すことをユーザーに提案する。

## Phase B の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. handoff.md を `npm run handoff` で更新する: `mark 工程5` で印を付け、`set phase=C status=waiting_approval` で frontmatter を直し、`note 申し送り "<文>"` で Phase C 以降でやること（例: P4 で特に見る生成物）を書く。
3. `npm run approvals -- <ts> check --expect P1,P2,P3` が exit 0 であることを確かめる。
4. SKILL.md の手順の外で行った操作（手順に無い Write・Edit・sed・コマンド、承認の前に進めたこと）を列挙し、あれば `tasks/lessons.md` に起票する。無ければ「無し」と報告する。
5. 次のように案内して止まる。
   > Phase B が完了しました。次は新しいセッションで Phase C を実行してください。
   > `claude --model sonnet`（canon のルートで起動）→ `/canon-c <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
