# handoff: canon-v3

## 現在地
段階4 完了（2026-10-17）
`/canon-plan`・`/canon-design`・`/canon-build` の SKILL.md、知識 Skill 5件の v3 化、Agent 6体（`profiler` を新設し、`designer`・`spec-writer`・`keep-reviewer` を削除）、`new-run`・`preflight`（`tools/`）、`worktree rm`、`lib/handoff.js` の v3 化、自己適用テストの追従を入れた。`npm test` 365件が通った。実経路（scratch の git の対象で `new-run` → `preflight` → `inventory` → `impact` → `check` → `approvals record G1` → 編集 → `worktree commit` → `verify` → `approvals record G2` → 承認後のコミットで承認が無効になること）を通した。コミットはユーザーの了承待ち。次は段階5（v2 の残りの撤去）。段階の Skill 自体は別セッションで通していない（未確認。下の「未確認」）。

## 次のセッション
- 推奨モデル: Sonnet（effort medium）
- 最初の指示: 「`tasks/20261016-canon-v3/plan.md` の段階5 を実装する。brief.md・handoff.md・`design/architecture.md` を先に読む」
- 起動: canon のルートで `claude --model sonnet --effort medium`
- 段階5で消す・直すもの（下の「段階5に回したもの」）。消す前に、消すパスへの参照を、import とテストと docs まで横断 grep する（段階3では `new-run.js` の import を見落とした）

## 段階5に回したもの
- `.claude/skills/canon-c/scripts/`（`copy-keep`・`emit-manifest`・`review-bundle`・`slice`）と、依存する `lib/design-map.js`・`lib/design-slices.js`・`lib/managed-paths.js`・`lib/tree-hash.js`・`lib/manifest.js`・`lib/interface-signature.js` など、そのテスト（`copy_keep`・`emit_manifest`・`review_bundle`・`slice`・`managed_paths`・`exit_codes` のうち該当、`tests/helpers/keep-review-cases.js` など）。`package.json` の scripts（`slice`・`copy-keep`・`manifest`・`review-bundle`）も消す。`canon-c/` は SKILL.md を段階4で消したので、scripts を消せばフォルダが無くなる
- `design/artifacts.md`（v2 の書式と検査。段階5まで残す）。`design/architecture.md` の §10 の「段階5までは artifacts.md に残る」の文
- 語彙の追従: `README.md`・`.claude/README.md`・`guide/setup.md`（`/canon-a`〜`/canon-d`・Phase A〜D・P1〜P5・spec・V1〜V9 の説明。V7〜V9 の意味が変わった）、`.claude/rules/worker-definitions.md`・`workflow.md`（design-map・Write Scopes・V9 の語）、`.claude/settings.json` の `$comment`、`package.json` の description と `comments`、`tests/helpers/paths.js` の `scriptsDir` のコメント、`tasks/lessons.md` 冒頭（書式の `Phase <A〜D>`・「設計書2冊」・`design/architecture.md` §6.4 への参照→§8）
- `tests/self_application.test.js` の「Phase Skill の scripts/ は skill パッケージの supporting files として扱われる」: canon-c/scripts を消すと対象が0件になる。v3 に scripts/ を持つ Skill が無ければ、このテストごと消す
- 台帳（`tasks/lessons.md`）のうち、v3 で解消した項目（予定欄が「v3 刷新で」のもの。K5・README の管理境界・keep の P2/P3 の取り直し・canon-d の apply／作業ブランチ）
- `tests/helpers/sample-repos.js` の `expected-work/` は v2 の書式のまま（investigation/existing.md など）。使うテストが消えるときに一緒に整理する

## 判断ログ
- 2026-10-16 段階0: 骨格から作り直し、互換は取らない（理由: 全量スナップショット方式そのものがコストと手戻りの元）
- 2026-10-16 段階0: 生成物は対象の git ブランチで渡す。spec は廃止。canon-reference は中身を残す（理由: brief.md の「決めたこと」）
- 2026-10-16 段階0: 承認ゲートは規模で変える（小: G1 計画・G2 差分、大: G1 要件・G2 設計・G3 差分。どちらも最後は人間のマージ）
- 2026-10-16 段階0: model と effort の見直しを範囲に含める（ユーザーの追加指示）
- 2026-10-16 段階0: 段階1〜6 は1本のブランチ `refactor/canon-v3` と1本の PR にまとめる。段階ごとにコミットを分け、v2 はその場で置き換える。設計書は draft PR の上で承認を取り、マージはベンチマークの後に決める（理由: 互換を取らないので並べて作る意味が薄く、main が一部だけ v3 の状態を避けられる）
- 2026-10-17 段階1: worktree は canon のルートの外 `~/.claude-canon/wt/<対象名>-<ts>/` に置き、`Read`・`Edit` の allow 規則（`~/` 起点）で書かせる。`--add-dir` は使わない（理由: 実験で、ルートの下では対象の CLAUDE.md が混入し、`--add-dir` では対象の Skill が混入した。architecture.md §3.1）
- 2026-10-17 段階1: 小の経路の条件は、既存がある・新しい機能種別を足さない・構成を変えない、の3つにした。ファイルの件数は条件にしない（理由: R1・R2 は31件・32件で、件数で切ると両方とも大に入る）
- 2026-10-17 段階1: designer を廃止して `/canon-design` は inline にし、profile 用に haiku・high の `profiler` を足す。Agent は6体のまま（brief の「designer〔大の経路だけ〕」からの変更。理由: architecture.md §6.1）
- 2026-10-17 段階1: brief の model・effort の案は、上の変更を除いてそのまま確定した（reviewer の opus・high との比較は段階6）
- 2026-10-17 段階1: 受け入れ条件1の基準値を、R2 の Phase A〜C の約41M から、Phase A〜D の 46.3M（40%で約18.5M）に改めた（理由: v3 は振り返りを `/canon-build` に含むので、D も数えないと釣り合わない。ユーザーの了承済み）
- 2026-10-17 段階1: 設計書は 24.7KB で目安の20KB を超えるが、実験とコストの根拠を残すために許容した（ユーザーの了承済み）
- 2026-10-17 段階1: `tasks/lessons.md` 冒頭の「設計書2冊」は、段階5で「`design/` には `architecture.md` 1冊だけを置く」に直す。同じ冒頭の `design/architecture.md` §6.4 への参照は、新版で節番号が変わったので古くなっている。これも段階5で §8（canon の課題の起票）に直す
- 2026-10-17 段階2: `lib/refs.js` を新設し、V6 の抽出器は流用しない（理由: `<`・`$` を含むトークンを捨てるので、プレースホルダを区別できない。export もされておらず段階5で消える）。`lib/investigation.js` と `lib/managed-paths.js` も使わない
- 2026-10-17 段階2: `inventory` は paths.json の project・local スコープだけを展開し、`.claude/` 配下で配置パスに当たらないものは「分類外」に残す。カスタマイズ 0 件は exit 0（新規の構築で正常）
- 2026-10-17 段階2: `impact` は追跡テキスト全体（変えるファイルを除く）を走査し、該当に `<path>:<line>:<term>` の ID を付ける。走査 0 件は exit 1
- 2026-10-17 段階2: `worktree cleanup` は worktree と空の置き場所だけを消す。ブランチは `--delete-branch`（マージ済みのときだけ）か `--discard` のときだけ消す。マージ後に消す手順は段階4で `/canon-build` の案内に書く（ユーザー指示: 作業後に置き場所を残したくない）
- 2026-10-17 段階2: `ask` に `Bash(npm run worktree * --discard*)` を足した（ユーザー了承。deploy の `--confirm` の前例）
- 2026-10-17 段階2: `.claude/settings.json` に `Read(~/.claude-canon/wt/**)`・`Edit(~/.claude-canon/wt/**)` を足した。`claude -p` で builder の Edit が通ること、規則に当たらないパスは拒否されることを確かめた
- 2026-10-17 段階2: canon 自身の `.claude/agents/<name>/<name>.md`（入れ子）は、`claude -p` で builder が実際に起動したので、読み込まれている。paths.json の `.claude/agents/*.md` には当たらず、`inventory` は subagents を 0 件と数える。`tasks/lessons.md` に起票した。`inventory` の分類外に、`lib/features.js` のパスの規則から `feature_hint` を付けることにした（ユーザー了承。paths.json は補わない）。条件2の判定は機能別の件数に分類外のヒントの件数を足す（段階3の `check`）

- 2026-10-17 段階3: verify は `tools/verify.js`＋`lib/verify/`（V1〜V9）に置き、`canon-c/scripts/verify*`・V7（keep）・V8（スナップショット）は消した。canon-update は触らない（`checks.js` は正典の検査で、frontmatter・ツール名・配置パスの判定を持たず、重なるのはコードフェンスの判定と走査だけ。ユーザー了承）。report は `work/<ts>/verify-report.md`。未コミットの変更・差分が空・change-plan が無いは不合格
- 2026-10-17 段階3: V6 に、差分に無いファイルへの行番号引用（v2 の「非管理ファイル」）、変えたファイルからの missing 参照（warning。skill 定義は V6-4 が見るので除く）、削除したファイルを指す参照（`impact` と同じ走査。change-plan が「変えない（理由）」と答えていれば warning、答えが無ければ違反）を足した
- 2026-10-17 段階3: requirements の `strength_needed` は任意の欄にした（V8 の縮退の検査が使うため残した。設計書 §4 の欄の一覧にはない。省略は advisory 扱い）。`priority`・`outside_managed` は無くした
- 2026-10-17 段階3: `impact` の回答は、該当1件ごと（`<path>:<line>:<term>`）かファイル単位（`<path>`）で書ける。ファイル単位の回答はそのファイルの全該当を覆う（件数が多い語向け。canon 自身の1ファイル変更でも該当 6 件〜）。`impact.json` の入力が change-plan のファイル集合・語と違えば NG（古い impact を通さない）
- 2026-10-17 段階3: 差分のゲートの前提に「verify-report が現在の HEAD を検査して合格」「worktree が clean」「前のゲートが有効」を入れた。route に無いゲートは記録も期待も拒否する
- 2026-10-17 段階3: deploy 系（`deploy`・`pre-deploy-check`・`emit-run-manifest`）とそのテスト（`deploy_*`・`scenario3_deploy`）は、P1〜P5 の承認と v2 の verify-report に依存していたので、段階3で消した（段階5の予定を前倒し。理由: 承認の置き換えで動かなくなり、`npm test` が通らなくなるため）。消す前の横断 grep は package.json・テスト・docs まで見たが、`new-run.js` の import は見落とし、テストの失敗で気づいて `self-target-guard.js` を戻した
- 2026-10-17 段階3: `lessons.md` のうち、段階3で機械の側が入った4項目（Agent の入れ子の配置・trust の前提・impact の照合・「文言のみ」）は、残り（Skill の手順の文面、段階4）だけに書き直した

- 2026-10-17 段階4: builder は unit（`lib/features.js` の `UNITS`）ごとに、change-plan の担当ファイルを渡して並列に起動する。tools は Read・Write・Edit・Glob（change-plan に `op: new` があるので Write が要る。brief の「Edit だけ」からの変更）。正典 `permissions.md` §3 は、パスの規則を書けるのは `Read`・`Edit` だけで `Write(path)` は参照されないと書くので、`Edit(~/.claude-canon/wt/**)` の規則が Write にも効くはずだが、実験は Edit しか通していない（未確認）
- 2026-10-17 段階4: `op: delete` は、ワーカーがシェルを持たないのでメインが `npm run worktree -- rm --worktree <wt> <file>…` で消す。`rm` サブコマンドを `worktree` に足した（追跡中のファイルだけ・worktree の外は拒否。ユーザー了承。settings.json の permissions は変えない）
- 2026-10-17 段階4: 「公式で確認」は、メインが `claude-code-guide` で確かめて `work/<ts>/investigation/official-check.md` に書き、requirements の `evidence` から節を指す（investigator は WebFetch を持たない）。investigator の成果物は `investigation/findings.md`（旧 focused）、profiler の成果物は `profile.md`。existing の棚卸しは `inventory` に置き換え、ワーカーの書式は廃止した
- 2026-10-17 段階4: handoff の frontmatter を v3 のキー（ts・target・route・worktree・branch・base・canon_commit・stage・status）にした。`mode`・`phase` は廃止。route は `new-run` が空で作り、`/canon-plan` が要件を固めたあとに `set route=` で決める。stage は plan・design・build。進捗の行は `計画1〜3`・`設計1`・`構築1〜5` で、`mark` はこの行頭の語で引く。セッションの表の列は「段」
- 2026-10-17 段階4: `preflight --stage <plan|design|build>` は、handoff・canon の HEAD（変わっていれば WARN。続けるかは人間に尋ねる）・worktree（ブランチと base が祖先であること）・route・入力の実在・前のゲートの承認（design: G1、build: 差分のゲートより前すべて）を照合する。差分のゲートは build の開始時には要求しない
- 2026-10-17 段階4: canon-a〜d の SKILL.md と `new-run.js`・`self-target-guard.js`（とそのテスト）は、置き換えたので段階4で消した。`canon-c/scripts/` だけ段階5まで残る。自己適用テストの旧語彙の検査に v2 の語（K1〜K5・P1〜P5・spec.md・design-map・MANIFEST・Phase A〜D・output/<ts>）を足し、G4 以上だけを旧ゲートとした（G1〜G3 は v3 のゲート）
- 2026-10-17 段階4: `tasks/lessons.md` のうち、段階4で反映した5項目（haiku の investigator・trust の前提・K2・lessons の文言・P2/P3 を1つの問いで取る）を消し、2項目（designer の文脈・評価で run の作業ディレクトリを使う）を残りの部分だけに書き直した。`git -C <worktree>` が allow 規則に当たらない見込みを起票した

## レビュー記録
- 2026-10-17 段階1: draft PR #27 の上で、設計書 `design/architecture.md`（033e80d）をユーザーが承認した

## 未確認
- 段階の Skill（`/canon-plan`・`/canon-design`・`/canon-build`）を、別セッションの対話で通していない。機械の部分（`new-run`・`preflight`・`inventory`・`impact`・`check`・`worktree`・`verify`・`approvals`）は scratch の git の対象で実経路を通したが、ワーカーの起動・ヒアリング・ゲートの問いは未確認。段階6で通す
- 依存の導入を含む検証コマンド（worktree には追跡中のファイルしか無く、`node_modules` などが入っていない）を実経路で通していない。リハーサルの検証コマンドは `git diff --check` だった。段階6の skillweave で最初に当たる
- 既定の置き場 `~/.claude-canon/wt/` を `new-run` 経由では通していない。リハーサルは `CANON_WT_ROOT` を scratch に向けた（`~/` 起点の既定は、段階2の `worktree create` と `claude -p` の実験が通した範囲）
- builder の Write が `Edit(~/.claude-canon/wt/**)` の規則で通るか（正典は通ると読めるが、実験は Edit だけ）
- 対話のセッションで `Read(~/.claude-canon/wt/**)`・`Edit(~/.claude-canon/wt/**)` の規則（`~/` 起点）が効くか。`claude -p` では効いた（builder の Edit が通り、規則に当たらないパスは拒否された）。対話の許可の画面は通っていない。確かめるまでは「動く」と書かない

## メモ
- この計画の「段階」は本フォルダの段階0〜6で、flow-workflow の段階1〜4 とは別物である。/flow-* は、以前はこのリポジトリで開始時に止まった（`.claude/skills/canon-a/SKILL.md` があったため）。canon-a は段階4で消したので、この制約は無くなった。
- 台帳の項目のうち、R2 で別セッションの実経路を通った L23（2026-10-10 の1件目）は、v2 については大半が解消している。v2 の残りを消す段階5で台帳から消す。
