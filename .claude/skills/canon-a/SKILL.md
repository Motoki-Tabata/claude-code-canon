---
name: canon-a
description: Start a claude-canon run for a target project and drive Phase A — create the run skeleton, investigate the target (existing and profile in parallel), interview the user for requirements (P1), run the focused investigation, and have the spec written (P2). Use only when the user invokes /canon-a with the target project path, or with a run timestamp to continue an interrupted Phase A.
disable-model-invocation: true
argument-hint: "<target_project_path> | <ts>"
---

# canon-a（Phase A: 調査①・要件ヒアリング・調査②・spec）

Phase A は「何を作るか」を確定する。工程1〜4 を進め、P1（要件承認）と P2（spec 承認）を取ったら止まる。推奨モデルは opus（ヒアリングと spec の精査に判断の精度が要る）。

あなたは inline のメイン Claude としてオーケストレーターを務める。ヒアリングは人間との往復そのものなので、Subagent に任せず自分で行う。調査と spec の執筆はワーカーに任せ、成果物はワーカー自身がファイルに書く。

## 0. run を作る（または再開する）

このセッションは canon のルートで起動している。以降、canon のルートの絶対パスを `<root>` と書く（`pwd` で確かめる）。成果物は `<root>/work/<ts>/`・`<root>/output/<ts>/` に置く。git では追跡しない。

`$ARGUMENTS` が `YYYYMMDD_hhmmss` の形なら、中断した Phase A の**再開**である。次の手順で再開し、進捗の印が付いていない最初の工程から続ける。

1. `work/<ts>/handoff.md` があることを確かめる。無ければ ts の誤りなので、`ls work/` の一覧を示して止まる。
2. **canon の版の確認**: handoff の `canon_commit` と `git log -1 --format=%H` を比べる。違えば `git diff --stat <canon_commit> HEAD -- .claude lib gates tools docs design guide` を示す。`git status --short -- .claude lib gates tools docs design guide` に未コミットの改修があれば、それも示す。どちらかがあれば、run の途中で canon 本体が変わったことを伝え、続けてよいかを尋ねる。
3. handoff の進捗・承認・差し戻しを確かめる。承認行があれば `npm run approvals -- <ts> check` で照合する。
4. ヒアリングの途中で切れていたら、会話は失われている。調査サマリの提示からやり直す。

それ以外は、`$ARGUMENTS` は対象プロジェクトのパスである。

1. `npm run new-run -- <target>` を実行する。stdout の `ts`・`mode`・`handoff`・`canon_commit` を控える。
   - exit 1（対象が無い・同じ ts の run が既にある）なら、stderr をそのまま示して止まる。
2. handoff.md（`work/<ts>/handoff.md`）を開き、frontmatter の `mode` を確かめる。new-run は対象の管理パス集合に既存ファイルがあれば `refactor`、無ければ `new` を初期値にする。工程2で確かめて直す。

claude-canon 本体の欠陥・浪費・規律の穴に気づいたら、その場で `tasks/lessons.md` の末尾に書く（書式は同ファイル冒頭）。見出しの出典欄は `run <ts>・Phase A` とする。

## ワーカーの起動規則

- ワーカーは登録済みの `subagent_type`（`investigator`・`session-analyst`・`spec-writer`）で起動する。公式仕様の確認には組込みの `claude-code-guide` を使う（工程3）。`model` 引数は渡さない（frontmatter の指定より優先されてしまう）。`general-purpose` に定義を読ませて代行させない（コマンド実行系ツールを持つので、書込先の制限が崩れる）。
- 独立したワーカーは**1つのメッセージで並列に**起動し、`run_in_background: false` にして全員の結果がそろうまで待つ。待つために ScheduleWakeup や loop を使わない。同じワーカーから重複した通知が来ても応答しない。
- プロンプトには ts・対象のルート・入力ファイルと書込先の**絶対パス**を書く。定義に書いてあることを繰り返さない。
- ワーカーの応答は「書いた旨」の短い報告である。報告を受けても完了とみなさず、成果物ファイルの実在と中身を自分で確かめる。
- ワーカーに直させるときは、SendMessage で再開しない。指摘を handoff.md の「差し戻し」に逐語で書き（直す箇所・直さない箇所）、同じ種類のワーカーを**新しく**起動して、そのブロックと入力一式を渡し、指示された箇所だけを Edit させる。再開は蓄積した文脈の読み直しになり、新規起動より重い。

## 工程1 調査①（existing・profile を並列）

1. investigator を2体、1つのメッセージで起動する。
   - `mode: existing`、書込先 `<root>/work/<ts>/investigation/existing.md`
   - `mode: profile`、書込先 `<root>/work/<ts>/investigation/profile.md`
   - どちらにも `target`（handoff の `target`）と ts を渡す。
2. 両ファイルの実在を確かめる。existing.md の `## サマリ` の総数と層ごとの内訳を、`## レコード` の `- path:` の行数と**数え直して**照合する。合わなければ差し戻しの手順で investigator（existing）を新しく起動して直させる。
3. handoff の進捗の「工程1」に印を付ける。

## 工程2 要件ヒアリング → P1

1. `.claude/skills/requirements/references/interview.md` と `terminology.md` を読み、その順序と掘り方に従う。
2. 冒頭で調査サマリ（既存の件数と層の内訳・profile の要点・`learning_history` の要点）を示し、**モード（new／refactor）をユーザーに確かめる**。handoff の `mode` と違えば handoff を直す。
3. AskUserQuestion で往復する。質問文か直前の本文に判断材料を書く（preview が表示されない環境がある）。ユーザーの用語は `terminology.md` で正しい層・機能に写し、写し方をユーザーに確かめる。
4. constraints（hooks・mcp・plugins・experimental・組織ポリシー）は「禁止」か「今は使っていないだけ」かを必ず確かめる。`allowed: false` は「生成物のどこにも現れてはならない」を意味し、既存の keep 対象がその機能を使っているだけで verify（V9）が止める。既存を維持して新規に足さないだけなら `allowed: true` にし、`reason` に「既存を維持・新規追加なし」と書く。
5. 合意したら、`.claude/skills/requirements/references/requirements-template.md` の書式どおりに、**自分で** `<root>/work/<ts>/requirements.md` を書く。キー名・見出し・字下げを崩さない（verify がこの書式を機械で読む）。書いた直後に `npm run check -- <ts> requirements` を実行し、NG が無いことを確かめる（件数・強度と優先度の内訳・constraints・conflicts の有無も出る）。
6. **P1**: requirements.md のパスと確定要件の要旨（要件の件数・強度の内訳・禁止した機能・未解消の衝突）を示し、承認を求めて**止まる**。件数は上の `check` の出力から写す。
7. 承認されたら `npm run approvals -- <ts> record P1 "<要旨>"` を実行する。差し戻されたら、指摘を handoff の「差し戻し」に逐語で書き、requirements.md を直してから P1 を取り直す。

ヒアリングの途中でセッションが切れたら、会話は失われている。調査サマリの提示からやり直す。

後の Phase でやるべきこと（例: 「P4 で既存の X と生成物を突き合わせる」）が出たら、その場で handoff の「申し送り」に、どの Phase で何をするかを書く。会話は次の Phase に引き継がれない。

## 工程3 調査②（focused）

1. investigator を `mode: focused` で起動する。渡すもの: `target`・ts・書込先 `<root>/work/<ts>/investigation/focused.md`・`<root>/work/<ts>/requirements.md` の絶対パス・existing.md の `project_refs` の一覧（existing.md から抜き出して渡す。new モードで既存が無ければ「なし」と書く）。
2. focused.md の実在を確かめ、`findings` に `evidence_paths` があること、渡した `project_refs` がすべて `ref_resolution` に現れることを確かめる。欠けていれば investigator（focused）を新しく起動して直させる。
3. **公式仕様の確認**: 確定要件のうち、成否が Claude Code 自体の仕様に依存するもの（組込み Skill をモデルから起動できるか・permissions の効き方・待ちの手段など）は、investigator では確かめられない（WebFetch を持たない）。focused.md に「確かめられなかった」と残った論点も含め、`claude-code-guide` に要件ごとの問いを渡して公式ドキュメントで確かめさせる（独立した問いは1つのメッセージで並列に）。結果を、あなたが `work/<ts>/investigation/official-check.md` に書く（書式は artifacts.md §2.5）。仕様に依存する要件が無ければ、このファイルは作らない。

## 工程4 spec → P2

1. spec-writer を起動する。渡すもの: `existing.md`・`profile.md`・`focused.md`・（あれば）`official-check.md`・`requirements.md`・`<root>/gates/conformance_tables/index.json` の絶対パスと、書込先 `<root>/output/<ts>/spec.md`。
2. `npm run check -- <ts> spec` を実行する（§9 が空か・受入基準の件数・`[mandatory]` の有無を機械で判定する）。NG が出たら、その節だけを読んで直す。全文を読むのは、P2 の要旨を作るときだけにする。確かめる中身は次のとおり。
   - §9 未決事項が空である（`check` が判定する）。空でなければ、その論点をユーザーと詰め、requirements に関わるなら P1 からやり直す。spec の書き直しは spec-writer を新しく起動して行う。
   - §8 受入基準に `[mandatory]` が付いた基準がある（`check` が判定する）。
   - §4 統合方針が、focused.md で `resolved: false` になった参照を全件挙げている。
3. **P2**: spec.md のパスと要点（目的・新要件・受入基準・スコープ外）を示し、内容を精査してもらって承認を求め、**止まる**。
4. 承認されたら `npm run approvals -- <ts> record P2 "<要旨>"`。差し戻されたら「差し戻し」に逐語で書き、spec-writer を新しく起動して直させ、P2 を取り直す。

## Phase A の終わり

1. 設定済みの ScheduleWakeup・loop があれば止める（Phase の終了後に発火して次の Phase と並走するのを防ぐ）。
2. handoff.md を更新する: 進捗の工程1〜4 に印、frontmatter を `phase: B`・`status: waiting_approval` に、「申し送り」に Phase B 以降でやることを書く。
3. 承認の照合を確かめる: `npm run approvals -- <ts> check --expect P1,P2` が exit 0 であること。
4. 次のように案内して止まる。モデルはエイリアスで書く。
   > Phase A が完了しました。次は新しいセッションで Phase B を実行してください。
   > canon のルートで `claude --model opus` → `/canon-b <ts>`

canon の Phase（A〜D）と、対象プロジェクト側のワークフローの段階は別物である。対象側の段階に触れるときは「対象側の〜」と書き分ける。
