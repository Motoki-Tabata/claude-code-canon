---
name: canon-c
description: Drive Phase C of a claude-canon run — copy keep files and slice the design-map, spawn one builder per layer in parallel to generate the customizations, run verify (V1-V9), run the quality review (reviewer, keep-reviewer, /claude-api prompt-audit), loop fixes until done, and take the P4 approval. Use only when the user invokes /canon-c with the run timestamp, in a session started at the claude-canon root.
disable-model-invocation: true
argument-hint: "<ts>"
---

# canon-c（Phase C: 生成・検証・品質検査）

Phase C は承認済みの design-map から生成物を作り、工程6〜8 と修正ループを終えて、P4（生成物とレビューの承認）を取ったら止まる。推奨モデルは sonnet（委譲と機械的な手順が中心）。意味の判断が要る keep-reviewer は frontmatter で opus に固定されている。

あなたは inline のメイン Claude としてオーケストレーターを務める。生成とレビューはワーカーに任せ、スクリプトの実行・標準 Skill のレビュー・結果の照合と提示は自分で行う。ワーカーはコマンド実行系ツールを持たないので、実行を要することはすべてあなたが行う。

## 0. 開始手順

`$ARGUMENTS` は run の ts である。

1. `work/<ts>/handoff.md` を読む。frontmatter の `target`・`mode` を控える。
2. **canon の版の確認**: handoff の `canon_commit` と `git log -1 --format=%H` を比べる。違えば `git diff --stat <canon_commit> HEAD -- .claude lib gates tools docs design guide` を示す。`git status --short -- .claude lib gates tools docs design guide` に未コミットの改修があれば、それも示す。どちらかがあれば、run の途中で canon 本体が変わったことを伝え、続けてよいかを尋ねる。
3. **承認の照合**: `npm run approvals -- <ts> check --expect P1,P2,P3` を実行する。exit 1 なら、どのファイルが承認後に変わったか（または承認行が無いか）を示し、そのゲートで承認を取り直すまで先へ進まない。
4. **再入**: handoff の「差し戻し」に Phase D からの差し戻し（P4 の後で生成物を直す指示）があれば、これは再入である。「準備」は済んでいるので飛ばし、「修正ループ」の 2 から始める（builder を新しく起動 → manifest → verify → 変更分の再レビュー）。直し終えたら P4 を取り直す（`record P4` は、verify-report のハッシュが現在の generated/ と一致しないと拒否される）。P4 が変わると P5 も無効になるので、Phase D を `/canon-d <ts>` からやり直してもらう。
5. **申し送り**: handoff の「申し送り」のうち Phase C 向けのものを先に実施する。結果は P4 の提示に含める。実施しなかったものは理由を添えて示す。
6. `npm run handoff -- <ts> set phase=C status=in_progress` で frontmatter を直し、`npm run handoff -- <ts> session C` でこのセッションを記録する。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で `tasks/lessons.md` の末尾に書く（書式は同ファイル冒頭）。見出しの出典欄は `run <ts>・Phase C` とする。

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

2. 使う層の builder を、**1つのメッセージで並列に**起動する。渡すもの: `layer`・ts・`output/<ts>/` と `work/<ts>/slices/` の絶対パス。`work/<ts>/requirements.md` に `## 参照元` があれば、その `path` の一覧も渡す（読み取り専用の移植の基準。`npm run check -- <ts> requirements` で確かめられる）。
3. 全員が終わったら、層ごとに宣言一覧の各パスが `generated/` に実在するかを確かめる。欠けていれば、その層の builder を新しく起動し、欠けたパスを渡して書かせる。`targets-other.txt` が空でなければ、どの層にも属さない宣言があるので、内容を示して扱いを決める。 `.claude/README.md` は層に属さず工程6-4 の emit-manifest が書くので、`targets-*.txt` に出ず存在確認の対象にもしない（design-map が modify と宣言していても `disposition-other.md` にレコードが入るだけ）。層に属さない modify・merge のレコードも `disposition-other.md` に入る。
4. **管理パス外の変更の変更後のファイルを作る**: `common.md` の `## 管理パス外の変更` に項目があれば、項目ごとに次を行う（項目が無い、または「なし」ならこの手順は飛ばす）。変更後のファイルは `output/<ts>/outside-managed/<対象パス>` に置き、P4 の承認が generated/ と一緒に束縛する（承認後に変わると P4 が無効になる）。
   1. 項目の見出しの対象パスが対象に実在するなら、現物を `output/<ts>/outside-managed/<対象パス>` にコピーする（`mkdir -p` してから `cp`。書き写させない）。実在しない新規ファイルはコピーしない。
   2. `l1` の builder の起動に、そのパスと項目を渡して、「変更内容」どおりに直させる（上の 2 の `l1` の builder と同じ起動に含めてよい）。
   3. 実在を確かめる。
5. `npm run manifest -- <ts>` で `generated/.claude/README.md`・`MANIFEST.md`・`deploy/managed-paths.list`・`deploy/retired.list` を決定論で生成する。これらは builder にも自分にも書かせない。

## 工程7 検証

1. `npm run verify -- <ts>` を実行する。`output/<ts>/verify-report.md` が書かれる。
2. exit 1 なら、report の違反を層ごとに分け、handoff の「差し戻し」に逐語で書き、該当する層の builder を新しく起動して直させる。直したら `npm run manifest -- <ts>` → `npm run verify -- <ts>` をやり直す。違反がなくなるまで繰り返す。
3. warning は exit code に影響しないが、P4 で示す。種別ごとの件数と代表例を示す（全件は `verify-report.md` にある。パス様トークンの warning は1ファイルにつき1件にまとまっている）。
4. 違反が keep のファイルにある（V7）なら、builder では直せない。keep は design-map が正なので、下の「keep に及ぶ修正」の手順で P3 に戻す。

## 工程8 品質検査

1. `npm run review-bundle -- <ts>` で判定入力を作る。reviewer 用は常に `work/<ts>/review-bundle/reviewer/` に、keep-reviewer 用は refactor モードのときだけ `work/<ts>/review-bundle/keep-review/` に書かれる（どちらも designer の `keep_conditions` と rationale は機械的に除かれている）。
2. **reviewer と keep-reviewer を1つのメッセージで並列に**起動する。keep-reviewer は、review-bundle が keep または merge のケースを1件以上作ったときだけ起動する（new モード、またはケースが0件なら reviewer だけ）。
   - reviewer: `work/<ts>/review-bundle/reviewer/`・`output/<ts>/generated/`・対象のルートの絶対パス。書込先は `output/<ts>/review/review.md`。
   - keep-reviewer: `work/<ts>/review-bundle/keep-review/` のケースファイル一式と `output/<ts>/` の絶対パス。書込先は `output/<ts>/review/keep-review.md`。
3. **標準 Skill のレビュー**を自分で実行し、報告を**要約せずにそのまま**書き出す。
   - Skill `claude-api` に `prompt-audit output/<ts>/generated/` を渡す。報告と diff 案だけを求め、編集は適用させない。報告を `output/<ts>/review/prompt-audit.md` に書く。
   - Skill が使えない環境なら、そのファイルに「実行できなかった」と理由を書き、P4 で明示する。実行していないレビューを「指摘なし」と書かない。
4. **不在を根拠にした指摘を裏取りする**: 「〜が無い」「〜への言及が無い」を根拠にした指摘は、提示の前に Grep で `generated/` を横断して確かめる。見つかったら、その事実（`file:line`）を指摘に添えて示す。指摘そのものは書き換えない。
   - コマンドの挙動や実行結果を根拠にした指摘（「このコマンドは〜になる」「この引数は禁止側に倒れる」など）も、提示の前にあなたが一時ディレクトリ（`mktemp -d` で作る。対象や canon の作業ツリーでは試さない）で実行して確かめる。reviewer は Bash を持たず、挙動を推測で書くことがある。コマンド行と実際の出力を指摘に添え、指摘と食い違えばその旨を示す。
5. **実行を要する受入基準**: spec §8 の受入基準や design-map が、生成物に含まれるテストやスクリプトの実行を求めているなら、あなたが Bash で実行し、コマンド行と実際の出力を P4 に含める。実行できない環境なら「実行して確かめていない」と明記する。読んだだけで「動作を確認した」と言わない。
6. **生成したスクリプトを現物で動かす**: 生成物に CLI・スクリプト（Hook のハンドラを含む）があるなら、受入基準が求めていなくても、`generated/` にあるそれを**対象の現物に向けて**1回実行し、コマンド行と実際の出力を P4 に含める（対象のファイルを書き換えるものは、書き換えない引数か dry-run で動かす）。`node --test` や `bash -n` は書式とロジックしか示さず、対象の実データでの偽陽性・偽陰性は現物に当てて初めて出る。出力が受入基準と食い違えば、修正ループで扱う。

## 修正ループ

1. 工程8の直後、P4 の前に、指摘の振り分けを**1問でユーザーから取る**（指摘ごとに直すかをあなたが先に決めて P4 にまとめない。「直さない」を既定にして P4 に持ち込むと、差し戻しで作り直しになる）。既定は**全件を直す**。「直さない」の候補があれば、その指摘だけを理由付きで示す。返答に従い、直すものと、直さないもの（理由付き）を handoff の「差し戻し」に逐語で書く。
2. 直す対象の層ごとに builder を**新しく**起動し、「差し戻し」のブロックの位置と入力一式を渡す。
3. `npm run manifest -- <ts>` → `npm run verify -- <ts>` を実行する。
4. 変更したファイルだけを再レビューする。先に `npm run review-bundle -- <ts>` を作り直し、reviewer にはバンドルと、変更した対象と前回の指摘を渡す。keep・merge の対象が変わったときだけ keep-reviewer も再判定させる。標準 Skill のレビューは、変更が大きいときだけやり直す。
5. 直す指摘が尽きるまで繰り返す。

**keep に及ぶ修正**: 直す対象のパスが `work/<ts>/slices/disposition-other.md` の keep に含まれていたら、生成物や MANIFEST だけを直しても V7（keep の非回帰）が止める。keep の正は design-map である。先に P3 を差し戻す: 指摘を「差し戻し」に書き、designer を新しく起動して disposition を keep から modify に直させ、P3 の承認を取り直す（`npm run approvals -- <ts> record P3 "<要旨>"`）。そのあと「準備」の slice と copy-keep からやり直す。変更が設計の組み直しに及ぶなら、状態を handoff に書いて止め、opus のセッションで `/canon-b <ts>` をやり直すよう案内する。

## P4 生成物とレビューの承認

1. **verify の回し忘れを確かめる**: `verify-report.md` の「generated/ のハッシュ」と、`npm run approvals -- <ts> hash P4` の値（先頭12桁）が一致することを確かめる。違えば、最後の修正の後に verify を回していないので、`npm run manifest -- <ts>` → `npm run verify -- <ts>` をやり直す。
2. 次を**1回の提示にまとめる**（生成物だけでは判断材料がそろわないので、レビューと分けない）。件数は示す前に数え直す。
   - 生成物の一覧（新規・改修・維持・廃止。`MANIFEST.md` から）と `generated/.claude/README.md` のパス
   - verify-report の結果（違反0件であること・warning の全件）
   - review.md・keep-review.md の指摘の全件（重大度別）。K2・K4 に疑いありとされた keep は必ず示す
   - prompt-audit の要点、または実行できなかったこと
   - 修正ループで直した指摘と、直さないとユーザーが決めた指摘とその理由。**未決の指摘（「ご指示があれば直します」など）を残さない**。振り分けを取っていない指摘があれば、P4 の前に取る
   - 実行を要する受入基準の実行結果、または「未実行」
3. 承認を求めて**止まる**。
   - 承認されたら `npm run approvals -- <ts> record P4 "<要旨>"`。
   - 差し戻されたら、指摘を「差し戻し」に逐語で書き、修正ループに戻る。直した後は P4 を取り直す。

## Phase C の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める。
2. handoff.md を `npm run handoff` で更新する: `mark 工程6`・`mark 工程7`・`mark 工程8` で印を付け、`set phase=D status=waiting_approval` で frontmatter を直し、`note 申し送り "<文>"` で Phase D でやること（例: 配置前に人間が行う手作業）を書く。
3. `npm run approvals -- <ts> check --expect P1,P2,P3,P4` が exit 0 であることを確かめる。
4. 次のように案内して止まる。
   > Phase C が完了しました。次は新しいセッションで Phase D を実行してください。
   > `claude --model sonnet`（canon のルートで起動）→ `/canon-d <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
