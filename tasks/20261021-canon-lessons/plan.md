# plan: canon-lessons

## 方針
`tasks/lessons.md` の未反映の15件を片付ける。あわせて、investigation の公式確認と canon-reference の役割の重なりを解き（正典を investigator が最初に引く）、ドキュメントを含む全体の整合性を直す。机上の改修（A）と `claude -p` の単独の実験（B）を先にコミットする。その canon で `~/work/skillweave-mhwilds` のカスタマイズ一式のリファクタリングを大の経路で1回通し（C、ユーザーが対話で実行）、実測で残りを閉じる。台帳の規則どおり、項目を直したコミットの中でその項目を `tasks/lessons.md` から消す（一部だけ直したときは、残りの部分だけに書き直す）。

重なりの根拠: 過去2回の run の `official-check.md` の3論点は、どれも正典にほぼ書いてあった（`canon-reference/references/features/hooks.md:78`・`subagents.md:58`・`subagents.md:94`・`permissions.md:63`）。原因は手順にある。`canon-plan/SKILL.md:54` は正典を引かずに `claude-code-guide` へ行き、`investigator.md` は「claude-canon 自身は調べない」「仕様の主張は unverified に載せる」としている。

## 変更するファイル
- `.claude/agents/investigator/investigator.md`
  - 読み取りの例外として `.claude/skills/canon-reference/` を足す。
  - 仕様の主張を正典で確かめる手順を足す。
  - Grep を `files_with_matches`・`head_limit` から始める制約を足す。
- `.claude/skills/investigation/SKILL.md`・`references/findings.md`・`references/official-check.md`
  - 正典で確かめたときの根拠の書き方を足す。
  - official-check は、正典で確かめられなかった論点だけを扱う。
  - 正典に無かった事実を `tasks/lessons.md` に起票する手順を足す。
- `.claude/skills/canon-plan/SKILL.md`
  - 計画2 の3・ワーカーの起動規則を直す。
  - 計画3 の1 に、検証コマンドの変更前の基準を取る手順を足す。
  - 計画3 の2 に、要件ごとに影響の語を置く手順を足す。
  - 計画3 の3 で `impact-ids.txt` を読むようにする。
- `.claude/skills/requirements/references/interview.md:13`・`requirements-template.md:15,42`・`change-plan-template.md`
  - 正典の根拠を書けるようにする。
  - 影響の語と要件の対応の書式 `- \`語\`（R1,R3）` を定める。
- `.claude/skills/canon-build/SKILL.md`
  - `git -C <worktree> …` を `npm run worktree -- …` に置き換える。
  - change-plan は `## ファイル` と担当の行だけを Grep で読む、と書く。
- `.claude/agents/reviewer/reviewer.md`
  - impact.json は path ごとに `"id": "<path>:` で Grep する（`builder.md:26` と同じ書き方）。
  - change-plan は Grep で読む。
- `.claude/skills/review/references/perspectives.md:8`: 参照先の実在を、担当の参照元のファイルの中の参照にも広げる。
- `.claude/agents/session-analyst/session-analyst.md`: 手順1 で、先に `npm run tokens -- <id> --turns` を読む。
- `.claude/rules/workflow.md`: 評価などで run の作業ディレクトリを使う作業は、本番の `work/<ts>/` を動かさず写しで行う。
- `.claude/skills/canon-reference/data/paths.json`・`lib/inventory.js`（・`tools/check.js` の feature_hint の加算）: `.claude/agents/<name>/<name>.md` の入れ子を subagents に数える。
- `tools/worktree.js`（再利用: `lib/worktree.js`）: `status`・`diff [--name-only] [--stat] --out <file>` を足す。
- `tools/impact.js`・`lib/impact.js`（再利用: `lib/change-plan.js` のパーサ）
  - `--from-plan <change-plan.md>` を足す。
  - `impact-ids.txt`（1行1件の ID と行の抜粋）を書く。
- `tools/check.js`
  - 要件ごとの影響の語の対応の検査を足す。
  - `LIMITS` を見直し、`:24` の古い一文を消す。
- `lib/verify/ref-integrity.js`（V6）: 「変える」と答えた `scope: changed` の ID の行が、diff のそのファイルの変更行に無ければ error にする。
- `tools/token-usage.js`: `--turns` を足す（ターンごとの総入力・ツール呼び出しの要約・tool_result の字数・持ち越し）。
- `design/architecture.md`: 公式確認の記述、§4.1 の表、§6.2 の実測（C の後）。
- `README.md`・`.claude/README.md`・`guide/setup.md`・`CHANGELOG.md`（v3 の項）・`package.json`（`3.0.0`）・`tests/self_application.test.js:2`（存在しない §9.2）: 整合性の直し。
- テスト: `tests/inventory.test.js`・`impact.test.js`・`check_cli.test.js`・`verify_ref_integrity.test.js`・`token_usage.test.js`・`worktree.test.js`。新しく実 `work/<ts>` を作るテストは、`tests/helpers/ts.js` の `tsFor`／`tsSeq` を使う。
- `tasks/lessons.md`: 直した項目を同じコミットで消す。

## タスク

### A 机上の改修
- [x] T1 整合性の洗い出し（1回目）
  - 範囲を4つに分け、Explore（very thorough）を1つのメッセージで並列に起動する。
    - (a) README・`.claude/README.md`・guide・CHANGELOG・package.json
    - (b) `design/architecture.md` と段の Skill 3件
    - (c) 知識 Skill 5件・agents・rules
    - (d) lib・tools と、文書が書くコマンド・オプション・検査 ID の照合
  - 見る種類: 存在しないパス・節・見出し・コマンドへの参照、件数と名前、文書間の矛盾、frontmatter と本文の食い違い。
  - 結果は scratchpad のファイルに書かせ、件数を数え直して handoff のメモに要約する。
  - 一括の Explore は、範囲が広すぎてコンテキストがあふれて止まった。範囲は必ず分ける。
- [x] T2 T1 の食い違いと、既知の4件を直す。
  - `CHANGELOG.md` の `[Unreleased]` が v2 の内容のまま。v3 の項を立て、`package.json` を `3.0.0` にする。
  - `tests/self_application.test.js:2` が、存在しない §9.2 を指している。
  - `tools/check.js:24` に古い一文が残っている（T8 で消す）。
  - `output/` は追跡外。消さずに報告だけにする。
  - 直さないものは、理由を handoff に書く。
- [x] T3 正典を先に引く（investigator・investigation・canon-plan 計画2・requirements の該当）。
  - 直す前に `official-check` と `claude-code-guide` で横断 grep して、漏れを拾う。
  - `check.js` の `CONFIDENCES` は変えない。正典の `[仕様]` で確かめたものは `公式で確認` にする。`[知見]` と canon の規律は、公式の根拠にしない。
  - 正典に記述が無いもの、`complete: false` のコレクションに名前が無いもの、`sources.json` の `unverified` に載っているものは、`unverified` に残す。
- [x] T4 paths.json と inventory の入れ子の配置。`.claude/rules/canon-reference.md` に従い、`git diff` の範囲を確かめ、`npm test`・`npm run reference-check` を通す。台帳の 10-17「paths.json」を消す。
- [x] T5 `worktree` の `status`・`diff` を足し、canon-build を置き換える。台帳の 10-17「git -C」は、C で許可の画面が出ないことを確かめるまで「残り」に書き直す。
- [x] T6 `impact` の `--from-plan` と `impact-ids.txt`、canon-plan 計画3 の1・3。台帳の 10-19「計画3」を消す。10-20「増分」の (a) は、C で測るまで残す。
- [x] T7 要件ごとの影響の語（template・canon-plan 計画3 の2・`check`）。台帳の 10-20「影響の語」を消す。
- [x] T8 `check` の上限の見直し。
  - `work/20261019_190415`・`work/20261020_192336` の requirements.md・change-plan.md を節ごとに数え、§4.1 と比べる。数えるときは `lib/requirements.js`・`lib/change-plan.js` の `bytes` を使う。
  - 結果を handoff の判断ログに書く。
  - 最終の値は C の後に決める（T16）。
- [x] T9 reviewer の読み方（impact.json と change-plan を Grep で読む）と perspectives の参照先の実在。canon-build の構築1 の1 も直す。台帳の 10-20「impact.json を全文 Read」「参照元の扱いが膨らむ」「参照先の実在」を消す。
- [x] T10 V6 の「変える」の行の照合。台帳の 10-20「「変える」行が直っていなくても検出しない」を消す。
- [x] T11 `tokens --turns` と session-analyst の手順1。investigator の Grep の制約も入れる。台帳の 10-20「session-analyst」を消し、10-20「増分」を、残りの (a) と C の実測だけに書き直す。
- [x] T12 `.claude/rules/workflow.md` に評価の写しの規則を足す。台帳の 10-15 を消す。
- [x] T13 整合性の洗い出し（2回目）。T3〜T12 で変えたファイルと語を起点に、参照を横断 grep する。README・`.claude/README.md`・architecture の記述を、変更に合わせる。`npm test` を通してコミットする。

### B 単独の実験（canon のルートで `claude -p`。本番の `work/<ts>` は動かさない）
- [x] T14 investigator の Write 拒否の切り分け。
  - `work/20261020_192336` を `work/eval-…` に写し、その中で investigator を起動する。書込先を `findings.md` と別名にして、2回試す。
  - 条件が分かったら、定義か書込先を直す。分からなければ、canon-plan の起動規則に「Write が拒否されたら応答の本文を書込先に保存して続ける」を足し、台帳の項目を残りの部分に書き直す。
- [x] T15 builder の Write での新規作成。
  - `npm run worktree` で作った使い捨ての worktree に、builder で新しいファイルを Write させる。`Edit(~/.claude-canon/wt/**)` が Write に効くかを確かめる。
  - 効かなければ `.claude/settings.json` の allow を直す。
  - 結果を台帳の 10-20「未通過の経路」の (3) に反映する。
  - 終えたら handoff を「段階3 途中（C 待ち）」にして止まる。

### C 大の経路の実 run（ユーザーが対話で実行。flow-build は待つ）
- ユーザーが次の順で進める。
  1. `claude --model opus --effort medium` で `/canon-plan ~/work/skillweave-mhwilds`
  2. `/canon-design <ts>`
  3. `claude --model sonnet --effort medium` で `/canon-build <ts>`（G1〜G3 と振り返りまで）
- ユーザーが handoff のメモに書くこと: ts と、対話で許可の画面が出たか（出たならそのコマンド）。

### C の後（flow-build を再開）
- [x] T16 実測で台帳の残りを閉じる。
  - 10-12: 設計の段のメインの文脈の増え方を `npm run tokens -- <id> --turns` で見る。増えていれば、change-plan を節ごとに書く・正典の節を design の references に置く、の直しを入れる。
  - 10-17「git -C」: 許可の画面。
  - 10-20「増分」の (a): `impact-ids.txt` の効果。
  - 10-20「未通過の経路」(1)(2)(4): pnpm の依存の導入・許可の画面・大の経路。
  - §4.1 の上限の最終の値を決める。
  - architecture §6.2 の実測を更新する。
  - C の振り返りで新しく起票された項目は、範囲外として台帳に残す。
- [x] T17 全体を確かめ直す: `npm test`・`npm run reference-check`・`self_application` の旧語の検査。コミットして、handoff を「段階3 完了」にする。

## 受け入れ条件
1. `tasks/lessons.md` について:
   - 2026-10-12・10-15・10-17（2件）・10-19（2件）・10-20（9件）の15件が、すべて消えている。
   - 残るのは、C の振り返りで新しく起票された項目と、T14 で原因が分からず書き直した部分だけ（理由つき）。
2. 仕様の主張を、investigator が正典で確かめる手順になっている。`claude-code-guide` は、findings の `unverified` にだけ使う。C の run で、`official-check.md` の論点の数が、正典で確かめられなかった数と一致する。
3. T1・T13 で見つけた食い違いを、すべて直してある。直さないものは、理由が handoff にある。
4. `npm test` と `npm run reference-check` が exit 0。
5. C の run が G3 の承認まで通り、`work/<ts>/retro/` に振り返りがある。

## 検証コマンド
- `npm test`: 全テスト。T4〜T11 で足すテストと、self_application の旧語の検査を含む。
- `npm run reference-check`: paths.json を変えた後の正典の整合。
- `npm run impact -- --root <wt> --out <scratchpad> --from-plan work/20261020_192336/change-plan.md`: `--files`・`--terms` で渡したときと同じ件数になる。実際の起動経路と exit code も確かめる。
- `npm run check -- 20261020_192336 change-plan`: 新しい検査が動く。既存の計画は語と要件の対応を持たないので、NG と exit code が出るのが期待どおり。
- `npm run tokens -- 1b1a6954 --turns`: 1セッションが約50行に収まる（session-id は `work/20261020_192336/handoff.md` の `## セッション` で確かめる）。
- `npm run worktree -- diff --worktree <wt> --out <file>`: 実際の worktree で diff を書き出す。

## 範囲外
- skillweave-mhwilds の生成物そのものの品質の議論（C の run の中で G1〜G3 で扱う）。
- `output/` の削除（追跡外のため、ユーザーの判断に残す）。
- C の振り返りで新しく見つかる改修（台帳に起票するだけにする）。
- 本番の `work/<ts>/` の変更。

## 実装の最後の手順
- 段階3は、T15 の後に handoff を「段階3 途中（C 待ち）」にして一度止まる。C の後に再開し、全タスクを [x] にして検証コマンドを通したら、handoff.md の現在地を「段階3 完了」にして停止する。
