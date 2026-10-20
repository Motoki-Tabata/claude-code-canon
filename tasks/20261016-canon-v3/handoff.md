# handoff: canon-v3

## 現在地
段階6 完了（2026-10-20）
T6-1〜T6-3 済み。測り直しの run `20261020_192336` も、受け入れ条件1（26.56M）と3の一部（管理境界の見逃し・R5 の2行）を満たさなかった。台帳に2件起票し、PR 本文の案を `work/20261020_192336/pr-body-stage6.md` に書いた。T6-4 で、ユーザーは「基準を見直してマージ」を選んだ。PR #27 の本文を案で置き換え、draft を外した。マージはユーザーが行う。

## 次のセッション
- PR #27 のマージ（ユーザー）。マージ後は flow-workflow の卒業と削除の手順で、この作業フォルダを扱う
- 1回目の worktree とブランチ `canon/20261019_190415`、2回目の `canon/20261020_192336` は残す（ユーザーの判断）

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

- 2026-10-17 段階5: 台帳（`tasks/lessons.md`）から、v3 で解消した5項目（2026-10-10 の別セッション実経路・K5・README の管理境界・keep→modify の P2/P3・canon-d の apply／作業ブランチ）を消した。別セッション実経路の未検証は、handoff の「未確認」と受け入れ条件4が持つ。README の管理境界の件は対象側（skillweave の canon-boundary.md）の課題で、対象の台帳への申し送りは未実施
- 2026-10-17 段階5: verify のテストの仮の worktree を `output/<ts>/generated/` から `work/<ts>/generated/` に移した（v3 に `output/` が無いため。テストの意味は変えていない）。`.gitignore` の `/output/` は、手元に残る v2 の run の成果物（`output/20261012_030955`・`20261014_232320`）を追跡させないために残した。消していない
- 2026-10-17 段階5: `tests/self_application.test.js` の「scripts/ は supporting files」のテストは、canon-update の scripts/（2件）が残るので消さず、下限を5から2に直した
- 2026-10-17 段階5: `tools/token-usage.js` から design-map の Read 数の列を外した（v3 に design-map が無い）。段階6の `npm run tokens` の表は、この列が無い
- 2026-10-17 段階5: 受け入れ条件6のため、`design/architecture.md` の v2 の経緯（§1.1・§3・§4・§6・§10）を、K・P の番号や旧文書名を使わない言い方に書き直した（ユーザー指示）。§7 の「判定のコードは1系統」も現状（canon-update は触らない）に直した。テスト側は、旧ゲート名を拒否する確認の値を `P1`・`design-map` から `G9`・`unknown` に替えた。残る旧語彙は `tests/self_application.test.js` の検出リスト（旧語彙を検出する仕組みそのもの）と `PLUGIN_MANIFEST`（plugin の語）だけ

- 2026-10-17 段階6: T6-1。skillweave-mhwilds の R2 の前のコミットは `bc0c63f`。10-17 の時点では R2 の配置は作業ツリーに未コミットで、main の HEAD は `bc0c63f` だった
- 2026-10-19 段階6: T6-1 の前提が崩れていた。対象の main は 10-18 に R2 の配置（PR #25・`1a656a0`）をマージして `16953c4` に進み、`new-run` は対象の HEAD から worktree を作るので、R1〜R13 が反映済みの base になる（最初に始めた run `20261019_185305` は base `16953c4` で、inventory までで止めた）。canon は変えずに、対象を `/home/motoki-tabata/work/skillweave-mhwilds-r2base` に clone して `bc0c63f` に `reset --hard` し、そこを対象にする（ユーザー了承。退けた案: `new-run` に `--base` を足す〔canon 本体の機能追加で段階6の範囲を超える〕）

- 2026-10-19 段階6: T6-2。run `20261019_190415` を `/canon-plan`（opus・medium）→ `/canon-build`（sonnet・medium）の別セッションで通した。build の構築2 で verify V1 が対象の `tasks/lessons.md` を種別不明にしたので、ユーザーの選択で `lib/non-schema.js` の `NON_SCHEMA_MD` に足した（canon 本体の修正。段階6のコミットに含め、台帳の項目は同じコミットで消す）
- 2026-10-19 段階6: T6-3。総入力は plan 9.53M＋build 16.85M＝26.38M（R2 46.35M の 56.9%）、段階1の単価での概算は $12.57（R2 $26.32 の 48%）。最大は reviewer の 8.87M（4起動）。振り返りは台帳に3件起票し（reviewer の割当、節の参照の実在、plan のセッションの分析漏れ）、investigator の Write の拒否と `git -C` の項目を実測で書き直した。reviewer の opus・high との比較は、同じ差分で reviewer を起動し直す費用（約 $5〜7 の見込み）がかかるので実施していない（PR 本文の案で判断を求める）
- 2026-10-19 段階6: 受け入れ条件6の確認では、この作業フォルダ（brief・plan・handoff）に残る v2 の語は、計画の記録として除外した

- 2026-10-19 段階6: reviewer の opus・high との比較。1回目の修正前のコミット `d9b1eb8` を別の worktree に出し、run のファイルの写し（`work/eval-20261019_190415-opus/`）で、sonnet の1回目の2体と同じプロンプトで opus の reviewer を2体起動した。総入力は opus 9.90M・sonnet 3.19M（3.1倍）、概算は $5.63・$1.74、時間は約14分・約4分。1回目に直した5件のうち、sonnet は5件、opus は4件を挙げた（README の読込条件を落とした）。opus だけが挙げた medium は2件（guard-internals.md の `claude -p` の書き方が広すぎる・台帳の項目の削除で ui-design-standard.md の後始末の記録が無くなる〔後者は1回目の handoff の申し送りにある〕）。README の「管理境界」節への参照は両方とも見逃した。参照元は両方とも担当を自分で選び、sonnet は35件を未判定に挙げたが、opus は対象外として未判定 0 と書いた
- 2026-10-19 段階6: ユーザーの指示で台帳の3件を直した。`canon-build` の構築3（参照元の全件を reviewer に割り当てて和を数える・再レビューに `diff-<n>.patch` を渡す）と構築5（`## セッション` の行の数だけ session-analyst を起動し、分析のファイルの数を数える）、`reviewer.md`（担当の参照元の一覧・判定する参照元を自分で選び直さない）、`review` の `perspectives.md`（参照先の実在）。opus の比較が挙げた漏れの経路（`impact` が変えるファイルを走査しない）は、台帳に起票した

- 2026-10-19 段階6: reviewer は sonnet・high のままにした（ユーザーの判断。opus は総入力が3.1倍で、管理境界の見逃しも防げなかった）
- 2026-10-19 段階6: `impact` が変えるファイルの中も影響の語だけで走査し、該当に `scope: changed` を付けるようにした（変えるファイル同士のパスは V6 が見るので照合しない）。`check` はこの該当にも回答を求め、ファイル単位の「変える」では覆わない（builder が直す行を1件ずつ示すため。ファイル単位の「変えない」は覆う）。削除するファイルの中の該当は求めない。builder は `impact.json` を `"id": "<path>:` で Grep して、「変える」と答えた行を直す。1回目の入力で `npm run impact` を通すと、触らないファイルの 258件は1回目と一致し、変えるファイルの中が 97件（25ファイル）増えた。`ui-design.md:12`・`direct-edit.md:32` は挙がったが、`direct-edit.md:40` は影響の語を含まないので挙がらない

- 2026-10-20 段階6: T6-3 の測り直し。run `20261020_192336`（canon `17ed1c9`）の総入力は plan 11.22M＋build 15.34M＝26.56M（R2 の 57.3%）、概算 $11.34（43%）。reviewer は 8.87M（4体）から 5.63M（2体）に減ったが、plan のメイン（6.87M→7.55M）・investigator（1.65M→3.14M）・session-analyst（0.96M→2.59M、2体）の増分で打ち消された。G1・G2 は1回ずつ。README の「管理境界」節への参照は、canon-boundary.md が参照元（変えない）だったので reviewer も prompt-auditor も挙げなかった（`perspectives.md` の「参照先の実在」は変えたファイルだけ）。台帳に2件起票した（参照先の実在を参照元に広げる・plan と振り返りの増分）。build が起票した R5 の影響の語の項目と、2件の再発の追記もこのコミットに含める。prompt-auditor の Skill が手順書を返した件（build の分析の観点4）は、Skill の読み込みの通常の挙動なので起票しない

- 2026-10-20 段階6: T6-4。受け入れ条件1・3 は未達のまま、ユーザーの判断で基準を見直してマージする。未達の分は台帳の 2026-10-20 の項目で v3 の上で直す。比べ終わった2つの run の worktree とブランチは残す（ユーザーの判断）

## レビュー記録
- 2026-10-17 段階1: draft PR #27 の上で、設計書 `design/architecture.md`（033e80d）をユーザーが承認した

## 未確認
- 依存の導入を含む検証コマンド。run `20261019_190415` の検証コマンドは `node --test` の4本で、依存の導入が要らなかった
- 対話のセッションで `~/.claude-canon/wt/**` の allow 規則に許可の画面が出たか。build の builder の Edit・Write（既存ファイルの上書き）と、メインの `git -C` はすべて成功したが、画面が出たかは transcript に残らない（台帳の `git -C` の項目）
- builder の Write での新規作成（change-plan の `op: new`）。この run は modify だけだった
- 大の経路（`/canon-design`）は通していない

## メモ
- この計画の「段階」は本フォルダの段階0〜6で、flow-workflow の段階1〜4 とは別物である。/flow-* は、以前はこのリポジトリで開始時に止まった（`.claude/skills/canon-a/SKILL.md` があったため）。canon-a は段階4で消したので、この制約は無くなった。
- 台帳の 2026-10-10 の1件目（別セッションの実経路）は、段階5で台帳から消した。v3 の実経路は「未確認」と受け入れ条件4が持つ。
