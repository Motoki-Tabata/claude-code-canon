---
name: canon-b
description: Drive Phase B of a claude-canon run — verify the Phase A approvals, have the designer select features and write the design-map from the approved spec, and take the P3 design-map approval. Use only when the user invokes /canon-b with the run timestamp, in a session started inside the run worktree.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-b（Phase B: 機能選定と設計）

Phase B は承認済みの spec だけを入力に、工程5 で design-map を確定し、P3（design-map 承認）を取ったら止まる。推奨モデルは opus（keep と retire の議論に判断の精度が要る）。designer 自身は frontmatter で opus に固定されている。

あなたは inline のメイン Claude としてオーケストレーターを務める。設計の判断は designer に任せ、あなたは入力をそろえ、結果を確かめ、人間に提示する。

## 0. 開始手順

`$ARGUMENTS` は run の ts である。

1. **worktree の確認**: `git branch --show-current` が `run/<ts>` であることを確かめる。違えば、`cd ../canon-runs/<ts> && claude --model opus` で起動し直すよう案内して止まる（main のチェックアウトで run を進めると、成果物が追跡されない）。
2. `work/<ts>/handoff.md` を読む。frontmatter の `target`・`mode` を控える。
3. **承認の照合**: `npm run approvals -- <ts> check --expect P1,P2` を実行する。exit 1 なら、どのゲートのどのファイルが承認後に変わったか（または承認行が無いか）を示し、Phase A のそのゲートで承認を取り直すまで先へ進まない。
4. **申し送り**: handoff の「申し送り」のうち Phase B 向けのものを先に実施する。実施した結果は P3 の提示に含める。実施しなかったものは理由を添えて示す（黙って落とさない）。
5. handoff の frontmatter を `phase: B`・`status: in_progress` にする。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で handoff の「canon 課題候補」に書く（書式は `tasks/lessons.md` 冒頭と同じ）。

## ワーカーの起動規則

- designer は登録済みの `subagent_type: designer` で起動する。`model` 引数は渡さない。`general-purpose` に定義を読ませて代行させない。
- `run_in_background: false` にして結果を待つ。待つために ScheduleWakeup や loop を使わない。
- 応答は「書いた旨」の短い報告である。報告を受けても完了とみなさず、design-map.md の実在と中身を自分で確かめる。
- 直させるときは SendMessage で再開しない。指摘を handoff の「差し戻し」に逐語で書き（直す箇所・直さない箇所）、designer を**新しく**起動して、そのブロックと入力一式を渡し、指示された箇所だけを Edit させる。

## 工程5 機能選定と設計

1. designer を起動する。渡すもの（すべて絶対パス）:
   - `output/<ts>/spec.md`（P2 承認済み）
   - `work/<ts>/requirements.md`
   - `work/<ts>/investigation/existing.md`・`profile.md`・`focused.md`
   - `mode`（handoff の値）と、書込先 `output/<ts>/design-map.md`
2. design-map.md を読み、次を確かめる。足りなければ差し戻しの手順で直させる。
   - `## Used Features` があり、使う層（L1〜L5）が決まっている。Phase C はこの節で builder を起動する層を決める。
   - 使うと宣言した層に `## L1`〜`## L5` の節があり、生成物が1件ずつ宣言されている。
   - refactor モードでは、existing.md の全レコードが `## 既存判定` に現れる。件数を数え直して照合する（取りこぼした既存ファイルは配置時に消える）。
   - keep のレコードは `keep_conditions` の K1〜K5 がそろい、retire と merge のレコードは `manifest_note` を持つ。
   - `## Write Scopes` が役割分担のある設計で空でない（共有する構成ファイルの扱いを含む）。
   - spec §8 の `[mandatory]` の受入基準が、すべて `## 要件→生成物の対応` に現れる。
   - requirements.md で `allowed: false` にした機能を使う生成物を宣言していない。

## P3 design-map 承認

全件の精査は負荷が高いので、注意を要するものに絞って示す（artifacts.md §6.5）。

- **retire の全件**: 対象から消えるファイル。1件ずつ、理由（`manifest_note`）と後継（`superseded_by`）を添えて示す。取り消せない操作なので最優先で確かめてもらう。
- **merge の統合先**: 何をどこに寄せたか。
- **K2・K4 に疑いがある keep**: designer が判断に迷ったもの。これらは Phase C で keep-reviewer が独立に判定し、疑いありとされたものは P4 で必ず示す、と添える。
- 5条件を明らかに満たす keep は件数と一覧の要約だけにする。
- 層の構成・使う機能・モデル割当の要点。

件数は示す前に数え直す。design-map.md のパスを示し、承認を求めて**止まる**。

- 承認されたら `npm run approvals -- <ts> record P3 "<要旨>"`。
- 差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き、designer を新しく起動して直させ、P3 を取り直す。指摘が要件や spec に及ぶ（何を作るかが変わる）なら、design-map で吸収せず、Phase A の該当ゲートに戻すことをユーザーに提案する。

## Phase B の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. handoff.md を更新する: 進捗に「工程5 → P3」の行を追記して印を付け、frontmatter を `phase: C`・`status: waiting_approval` に、「申し送り」に Phase C 以降でやること（例: P4 で特に見る生成物）を書く。
3. `npm run approvals -- <ts> check --expect P1,P2,P3` が exit 0 であることを確かめる。
4. コミットする（パスを明示する。push しない）。
   ```sh
   git add -f work/<ts> output/<ts>
   git commit -m "run <ts>: Phase B（P3 承認）"
   ```
5. 次のように案内して止まる。
   > Phase B が完了しました。次は新しいセッションで Phase C を実行してください。
   > `claude --model sonnet`（この worktree で起動）→ `/canon-c <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
