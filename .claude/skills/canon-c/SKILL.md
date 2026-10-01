---
name: canon-c
description: Drive Phase C of a claude-canon run — copy keep files and slice the design-map, spawn one builder per layer in parallel to generate the customizations, run verify (V1-V9), run the quality review (reviewer, keep-reviewer, /claude-api prompt-audit, /security-review, /code-review), loop fixes until done, and take the P4 approval. Use only when the user invokes /canon-c with the run timestamp, in a session started inside the run worktree.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-c（Phase C: 生成・検証・品質検査）

Phase C は承認済みの design-map から生成物を作り、工程6〜8 と修正ループを終えて、P4（生成物とレビューの承認）を取ったら止まる。推奨モデルは sonnet（委譲と機械的な手順が中心）。意味の判断が要る keep-reviewer は frontmatter で opus に固定されている。

あなたは inline のメイン Claude としてオーケストレーターを務める。生成とレビューはワーカーに任せ、スクリプトの実行・標準 Skill のレビュー・結果の照合と提示は自分で行う。ワーカーはコマンド実行系ツールを持たないので、実行を要することはすべてあなたが行う。

## 0. 開始手順

`$ARGUMENTS` は run の ts である。

1. **worktree の確認**: `git branch --show-current` が `run/<ts>` であることを確かめる。違えば、`cd ../canon-runs/<ts> && claude --model sonnet` で起動し直すよう案内して止まる。
2. `work/<ts>/handoff.md` を読む。frontmatter の `target`・`mode` を控える。
3. **承認の照合**: `npm run approvals -- <ts> check --expect P1,P2,P3` を実行する。exit 1 なら、どのファイルが承認後に変わったか（または承認行が無いか）を示し、そのゲートで承認を取り直すまで先へ進まない。
4. **申し送り**: handoff の「申し送り」のうち Phase C 向けのものを先に実施する。結果は P4 の提示に含める。実施しなかったものは理由を添えて示す。
5. handoff の frontmatter を `phase: C`・`status: in_progress` にする。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で handoff の「canon 課題候補」に書く（書式は `tasks/lessons.md` 冒頭と同じ）。

## ワーカーの起動規則

- ワーカーは登録済みの `subagent_type`（`builder`・`reviewer`・`keep-reviewer`）で起動する。`model` 引数は渡さない（frontmatter の指定より優先されてしまう）。`general-purpose` に定義を読ませて代行させない（コマンド実行系ツールを持つので、書込先の制限が崩れる）。
- 独立したワーカー（各層の builder、reviewer と keep-reviewer）は**1つのメッセージで並列に**起動し、`run_in_background: false` にして全員の結果がそろうまで待つ。待つために ScheduleWakeup や loop を使わない。同じワーカーから重複した通知が来ても応答しない。
- プロンプトには ts と、入力・書込先の**絶対パス**を書く。定義に書いてあることを繰り返さない。
- ワーカーの応答は「書いた旨」の短い報告である。報告を受けても完了とみなさず、成果物の実在を自分で確かめる。
- 直させるときは SendMessage で再開しない。指摘を handoff の「差し戻し」に逐語で書き（直す箇所・直さない箇所）、同じ種類のワーカーを**新しく**起動して、そのブロックと入力一式を渡し、指示された箇所だけを Edit させる。再開は蓄積した文脈の読み直しになり、新規起動より重い。

## 準備

1. `npm run slice -- <ts>` で design-map を `work/<ts>/slices/` に切り出す。
2. refactor モードなら `npm run copy-keep -- <ts>` で keep の原本を `output/<ts>/generated/` にバイト単位でコピーする。exit 1（原本が無い・管理パス集合の外・sha256 の不一致）なら止めて、出力を示す。design-map か調査の誤りなので、P3 へ戻すことをユーザーに提案する。keep を LLM に読ませて書き写させない（写し違いは V7 の違反になる）。

## 工程6 生成

1. `work/<ts>/slices/common.md` の `## Used Features` を読み、使う層を決める。層と builder の引数の対応は次のとおり。

   | Used Features | builder の `layer` | 宣言一覧 |
   |---|---|---|
   | L1（CLAUDE.md・Rules） | `l1` | `targets-l1.txt` |
   | L2（Skills） | `skills` | `targets-l2.txt` |
   | L3（Subagents） | `agents` | `targets-l3.txt` |
   | L4（Hooks・MCP） | `l4` | `targets-l4.txt` |
   | L5（Plugin） | `l5` | `targets-l5.txt` |

2. 使う層の builder を、**1つのメッセージで並列に**起動する。渡すもの: `layer`・ts・`output/<ts>/` と `work/<ts>/slices/` の絶対パス。
3. 全員が終わったら、層ごとに宣言一覧の各パスが `generated/` に実在するかを確かめる。欠けていれば、その層の builder を新しく起動し、欠けたパスを渡して書かせる。`targets-other.txt` が空でなければ、どの層にも属さない宣言があるので、内容を示して扱いを決める。
4. `npm run manifest -- <ts>` で `generated/.claude/README.md`・`MANIFEST.md`・`deploy/managed-paths.list`・`deploy/retired.list` を決定論で生成する。これらは builder にも自分にも書かせない。

## 工程7 検証

1. `npm run verify -- <ts>` を実行する。`output/<ts>/verify-report.md` が書かれる。
2. exit 1 なら、report の違反を層ごとに分け、handoff の「差し戻し」に逐語で書き、該当する層の builder を新しく起動して直させる。直したら `npm run manifest -- <ts>` → `npm run verify -- <ts>` をやり直す。違反がなくなるまで繰り返す。
3. warning は exit code に影響しないが、P4 で全件を示す。
4. 違反が keep のファイルにある（V7）なら、builder では直せない。keep は design-map が正なので、下の「keep に及ぶ修正」の手順で P3 に戻す。

## 工程8 品質検査

1. **チェックポイントのコミット**: `/security-review`・`/code-review` は run ブランチと main の差分を見るので、先に生成物をコミットする。
   ```sh
   git add -f work/<ts> output/<ts>
   git commit -m "run <ts>: Phase C 生成と verify"
   ```
2. refactor モードなら `npm run review-bundle -- <ts>` で keep-reviewer の判定入力を `work/<ts>/review-bundle/keep-review/` に作る（designer の `keep_conditions` と rationale は機械的に除かれている）。
3. **reviewer と keep-reviewer を1つのメッセージで並列に**起動する（new モードなら reviewer だけ）。
   - reviewer: `output/<ts>/generated/`・`output/<ts>/spec.md`・`work/<ts>/slices/`・`work/<ts>/investigation/`・`work/<ts>/requirements.md`・対象のルートの絶対パス。書込先は `output/<ts>/review/review.md`。
   - keep-reviewer: `work/<ts>/review-bundle/keep-review/` のケースファイル一式と `output/<ts>/` の絶対パス。書込先は `output/<ts>/review/keep-review.md`。
4. **標準 Skill のレビュー**を自分で実行し、各 Skill の報告を**要約せずにそのまま**書き出す。
   - Skill `claude-api` に `prompt-audit output/<ts>/generated/` を渡す。報告と diff 案だけを求め、編集は適用させない。報告を `output/<ts>/review/prompt-audit.md` に書く。
   - Skill `security-review` を実行する（run ブランチの main との差分が対象）。報告を `output/<ts>/review/security-review.md` に書く。
   - Skill `code-review` に、run ブランチと main の差分（`main...HEAD`）を対象として渡す。報告を `output/<ts>/review/code-review.md` に書く。
   - Skill が使えない環境なら、そのファイルに「実行できなかった」と理由を書き、P4 で明示する。実行していないレビューを「指摘なし」と書かない。
5. **不在を根拠にした指摘を裏取りする**: 「〜が無い」「〜への言及が無い」を根拠にした指摘は、提示の前に Grep で `generated/` を横断して確かめる。見つかったら、その事実（`file:line`）を指摘に添えて示す。指摘そのものは書き換えない。
6. **実行を要する受入基準**: spec §8 の受入基準や design-map が、生成物に含まれるテストやスクリプトの実行を求めているなら、あなたが Bash で実行し、コマンド行と実際の出力を P4 に含める。実行できない環境なら「実行して確かめていない」と明記する。読んだだけで「動作を確認した」と言わない。

## 修正ループ

1. レビューの指摘ごとに、直すか直さないかを決める。迷うものはユーザーに尋ねる。直すものと、直さないもの（理由付き）を handoff の「差し戻し」に逐語で書く。
2. 直す対象の層ごとに builder を**新しく**起動し、「差し戻し」のブロックの位置と入力一式を渡す。
3. `npm run manifest -- <ts>` → `npm run verify -- <ts>` を実行する。
4. 変更したファイルだけを再レビューする。reviewer には変更した対象と前回の指摘を渡す。keep・merge の対象が変わったときだけ keep-reviewer も再判定させる（`npm run review-bundle -- <ts>` を作り直してから）。標準 Skill のレビューは、変更が大きいときだけやり直す。
5. 直す指摘が尽きるまで繰り返す。

**keep に及ぶ修正**: 直す対象のパスが `work/<ts>/slices/disposition-other.md` の keep に含まれていたら、生成物や MANIFEST だけを直しても V7（keep の非回帰）が止める。keep の正は design-map である。先に P3 を差し戻す: 指摘を「差し戻し」に書き、designer を新しく起動して disposition を keep から modify に直させ、P3 の承認を取り直す（`npm run approvals -- <ts> record P3 "<要旨>"`）。そのあと「準備」の slice と copy-keep からやり直す。変更が設計の組み直しに及ぶなら、状態を handoff に書いて止め、opus のセッションで `/canon-b <ts>` をやり直すよう案内する。

## P4 生成物とレビューの承認

1. **verify の回し忘れを確かめる**: `verify-report.md` の「generated/ のハッシュ」と、`npm run approvals -- <ts> hash P4` の値（先頭12桁）が一致することを確かめる。違えば、最後の修正の後に verify を回していないので、`npm run manifest -- <ts>` → `npm run verify -- <ts>` をやり直す。
2. 次を**1回の提示にまとめる**（生成物だけでは判断材料がそろわないので、レビューと分けない）。件数は示す前に数え直す。
   - 生成物の一覧（新規・改修・維持・廃止。`MANIFEST.md` から）と `generated/.claude/README.md` のパス
   - verify-report の結果（違反0件であること・warning の全件）
   - review.md・keep-review.md の指摘の全件（重大度別）。K2・K4 に疑いありとされた keep は必ず示す
   - prompt-audit・security-review・code-review の要点と、実行できなかったもの
   - 修正ループで直した指摘と、直さないと決めた指摘とその理由
   - 実行を要する受入基準の実行結果、または「未実行」
3. 承認を求めて**止まる**。
   - 承認されたら `npm run approvals -- <ts> record P4 "<要旨>"`。
   - 差し戻されたら、指摘を「差し戻し」に逐語で書き、修正ループに戻る。直した後は P4 を取り直す。

## Phase C の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. handoff.md を更新する: 進捗に工程6〜8 と P4 の印、frontmatter を `phase: D`・`status: waiting_approval` に、「申し送り」に Phase D でやること（例: 配置前に人間が行う手作業）を書く。
3. `npm run approvals -- <ts> check --expect P1,P2,P3,P4` が exit 0 であることを確かめる。
4. コミットする（パスを明示する。push しない）。
   ```sh
   git add -f work/<ts> output/<ts>
   git commit -m "run <ts>: Phase C（P4 承認）"
   ```
5. 次のように案内して止まる。
   > Phase C が完了しました。次は新しいセッションで Phase D を実行してください。
   > `claude --model sonnet`（この worktree で起動）→ `/canon-d <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
