# plan: canon-v3

## 方針
決定事項は brief.md にある。この計画では、それを6つの段階に分ける。v3 は1本のブランチ `refactor/canon-v3` で作り、1本の PR で main に入れる。段階ごとにコミットを分ける。段階1で v3 の設計書を書いてユーザーの承認を取り、それからコードに進む。v2 と並べて作らず、その場で置き換える（互換を取らないので、新しい名前で並べる必要が無い）。各段階は新しいセッションで「`tasks/20261016-canon-v3/plan.md` の段階 N を実装する」と指示して始める。このリポジトリには `.claude/skills/canon-a/SKILL.md` があるので、/flow-* は開始時に止まる。

## ブランチと PR
- `refactor/canon-v3` は、本フォルダを入れた PR（段階0）をマージした後の main から切る。
- 段階1の設計書のコミットを push し、draft PR を作る。設計書の承認は、この draft PR の上でユーザーから取る。
- 段階の終わりには、そのコミットの内容をユーザーに示し、了承を得てからブランチにコミットする。push と PR の更新はユーザーの指示を待つ。
- `npm test` は、段階の区切りのコミットで通すことを目安にする。最後のコミットでは必ず全部通す。置き換えで不要になった v2 のテストは、置き換えたのと同じ段階で消す。
- ブランチがあるあいだ、main の canon 本体は変えない。v2 で run を回さない。見つけた問題は `tasks/lessons.md` に起票するだけにする（起票はこのブランチに積む）。
- 段階6のベンチマークは、このブランチの上で回す。受け入れ条件を満たしたら draft を外して、マージを判断する。満たさなければ、ブランチの上で直すか、PR ごとやめるかをユーザーが決める。
- 最後のレビューは、段階のコミットを順に見る（`git log --oneline main..refactor/canon-v3` の段階ごと）。

## 段階

| 段階 | 名前 | 推奨モデル | 内容 |
|---|---|---|---|
| 0 | 台帳と計画 | Opus | `tasks/lessons.md` の書式の改良と誤記の訂正、本フォルダの作成（済。これだけは別の PR #26 で main に入れる） |
| 1 | v3 設計書 | Opus（effort medium） | brief の未決事項を決め、`design/architecture.md` を v3 で書き直す |
| 2 | 決定論の土台 | Sonnet（effort medium） | `inventory`・`impact`・`worktree` と lib・テスト |
| 3 | 検査 | Sonnet（effort medium） | verify v3・check（requirements・change-plan）・approvals の G 表記 |
| 4 | Skill と Agent | Sonnet（設計判断が出たら Opus） | `/canon-plan`・`/canon-design`・`/canon-build`、知識 Skill の改訂、Agent 6体 |
| 5 | v2 の残りの撤去 | Sonnet | 段階2〜4 で置き換えなかった v2 のファイルの削除と、語彙の追従 |
| 6 | ベンチマーク | Opus / Sonnet | skillweave-mhwilds で R2 の13要件を v3 の小の経路で実行し、測る |

## タスク

### 段階1 v3 設計書
- [ ] T1-1 worktree の置き場所を実験で決める。canon のルートの下に置いたときに、サブディレクトリの CLAUDE.md と Skill が読み込まれるか、外に置いたときに必要な権限は何か、を小さな git リポジトリで確かめる。結果を設計書に書く。
- [ ] T1-2 小の経路の閾値と「新しい機能種別」の定義を決める。R1・R2 の要件を当てはめて、両方が小に入ることを確かめる。
- [ ] T1-3 model と effort を確定する（brief の案の「段階1で確定」の行）。単価は `claude-api` Skill の価格表から引き、R1 の `tokens-*.txt` の役ごとの入力に掛けて、案ごとの概算を出す。
- [ ] T1-4 `requirements.md`・`change-plan.md`・handoff の書式の骨子と、節ごとのサイズの上限を決める。
- [ ] T1-5 `design/architecture.md` を v3 で書き直す（目安20KB以下。旧版の内容は段階5まで `design/artifacts.md` に残り、その後は git の履歴に残る）。`tasks/lessons.md` 冒頭の「設計書2冊」の扱いを決める（段階5で直す）。
- [ ] T1-6 `refactor/canon-v3` に設計書をコミットして push し、draft PR を作る。draft PR の上でユーザーの承認を取る。承認されるまで段階2に進まない。

### 段階2 決定論の土台
- [ ] T2-1 `inventory`: 対象のカスタマイズ（canon-reference の `data/paths.json` が示す配置パス）の一覧・frontmatter・参照のグラフを JSON とその要約に書く。プレースホルダ（`<...>`・`NNN`）は実在の参照と区別する。既存の `lib/investigation.js`・`lib/markdown.js`・V6 の参照抽出（`.claude/skills/canon-c/scripts/verify/v6-ref-integrity.js`）を再利用できるか先に確かめる。
- [ ] T2-2 `impact`: 変えるファイルの一覧と語・コマンドの一覧を受け取り、触らないファイルのうち、それらを参照・言及するものを、行番号付きで列挙する。
- [ ] T2-3 `worktree`: 作成（`canon/<ts>` ブランチ）・コミット・片付け。対象が git でなければ exit 1。canon 自身が対象のときも動くこと。
- [ ] T2-4 テスト: 各スクリプトに、故意に注入した入力で発火することを示すテストを付ける。対象がゼロ件のときを合格にしない。

### 段階3 検査
- [ ] T3-1 verify v3: 入力は worktree の変更されたファイル（`git diff --name-only`）。系統は、配置パス・frontmatter・ツール名・secret・書式片・参照整合・constraints と trust の前提の警告。番号は1から振る。canon-update が使う判定と1系統にまとめる。
- [ ] T3-2 `check`: requirements.md（根拠の確度、「文言のみ」が確定要件に無いこと、サイズの上限）と change-plan.md の検査。
- [ ] T3-3 approvals: G1・G2（大の経路は G3 まで）。差分のゲートはブランチのコミット sha に束縛する。

### 段階4 Skill と Agent
- [ ] T4-1 `/canon-plan`・`/canon-design`・`/canon-build` の SKILL.md。開始時の照合は1コマンドで行う。ゲートは別々の問いで取る。終わりに、次のセッションの `--model`・`--effort` を案内する。
- [ ] T4-2 知識 Skill の改訂（requirements・investigation・design・generation・review）。spec と keep の語彙を除く。canon-reference は、節単位で参照させる。
- [ ] T4-3 Agent 6体の定義（段階1で確定した model と effort）。spec-writer と keep-reviewer を作らない。
- [ ] T4-4 `.claude/skills/design/references/model-selection.md` の見直し（haiku の3条件に profile の評価の実例を足す。独立した判定者の Sonnet を high にしてよい）。
- [ ] T4-5 自己適用テスト（`tests/self_application.test.js`）を v3 の構成に追従させる。

### 段階5 v2 の残りの撤去
- [ ] T5-1 消す前に、消すパスへの参照を横断 grep する。gitignore されたものの扱いを確かめる。
- [ ] T5-2 段階2〜4 で置き換えなかった v2 のもの（canon-a〜d・廃止するスクリプト・lib・テスト・`design/artifacts.md` のうち残っているもの）を消す。README・`.claude/README.md`・`guide/setup.md`・rules・`tasks/lessons.md` の冒頭を v3 の語彙に直す。
- [ ] T5-3 台帳のうち、v3 で解消した項目を、このコミットの中で消す（項目の「予定」欄を見る）。

### 段階6 ベンチマーク
- [ ] T6-1 skillweave-mhwilds の R2 の前のコミットを特定する（main の `bc0c63f` か、R2 の配置ブランチ `chore/canon-deploy-20261014_232320` の分岐点を確かめる）。
- [ ] T6-2 R2 の13要件（`work/20261014_232320/requirements.md`）を入力にして、v3 の小の経路を別セッションで通す（`/canon-plan` → `/canon-build`）。
- [ ] T6-3 `npm run tokens` で役ごとの model・effort・トークンを集め、R2 と比べる。振り返りを台帳に起票する。
- [ ] T6-4 受け入れ条件の結果を draft PR の本文に書き、マージの判断をユーザーに求める。

## 受け入れ条件
1. 段階6の総入力が、R2 の約41M の40%以下（約16M 以下）。
2. 確かめていない主張が原因で、ゲートを取り直していない。
3. R2 の13要件の受入基準を満たす差分がブランチにある。R2 で keep-review と prompt-audit が見つけた指摘（triage.md と R10 の K2、README の「管理境界」節の参照）の種類を、reviewer が見逃していない。
4. `/canon-plan` と `/canon-build` を、別セッションの実際の経路で通している。
5. 役ごとの model・effort・トークンの表があり、段階1で確定した割当と比べている。
6. 段階5の後、v2 の語彙（K1〜K5・P1〜P5・spec.md・design-map・MANIFEST）がリポジトリに残っていない（`tasks/lessons.md` の履歴的な記述と CHANGELOG を除く）。

## 検証コマンド
- `npm test`: 全テスト（各段階）。
- `npm run <新しいスクリプト> -- <args>`: 実際の起動経路での exit code と出力先（段階2・3）。
- `npm run tokens -- <ts>`: トークンの集計（段階6）。使い方は `tools/token-usage.js` で確かめる。

## 範囲外
- `.claude/skills/canon-reference/` の references と data の中身、`.claude/skills/canon-update/`。
- 対象側の課題（skillweave の canon-boundary.md、生成物 lessons-ledger の監査行）。

## 実装の最後の手順
- 各段階は、タスクを [x] にして検証コマンドを通したら、handoff.md の現在地を「段階N 完了」にする。コミットの内容をユーザーに示し、了承を得て `refactor/canon-v3` にコミットしてから止まる。push と PR の更新はユーザーの指示を待つ。
