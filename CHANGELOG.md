# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に、
[Semantic Versioning](https://semver.org/lang/ja/) を準拠のバージョニング規約として従います。

> **運用ルール**: 正典 `docs/` の更新履歴（Claude Code 公式仕様の確認バージョン・調査日）は
> `docs/SOURCES.md` が権威であり、本ファイルには書きません。本ファイルが記録するのは
> claude-canon 自身の変更だけです。

## [Unreleased]

### Added

- **reviewer 用の review-bundle**: `npm run review-bundle -- <ts>` が `work/<ts>/review-bundle/reviewer/` に、判定の対象の全件
  （20件ずつに分けた `INDEX-<k>.md`。reviewer は分割数だけ並列に起動し、読み切れなかった対象は未判定として報告させて追加で起動します）・rationale を除いた設計意図（`design.md`）・受入基準（`acceptance.md`）を書きます。reviewer は
  design-map の全文と slices を読まなくなりました。keep-reviewer 用は従来どおり refactor モードのときだけ作ります。
- **Subagent `session-analyst`**: ヒアリングで過去のセッション履歴を要件の材料にするとき、分析と保存
  （`work/<ts>/session-analysis-<名前>.md`）を本人が行います。メインが分析の応答を逐語で書き写す手順をやめました。
- **公式仕様の確認（Phase A 工程3）**: 要件の成否が Claude Code の仕様に依存するとき、`claude-code-guide` で確かめて
  `work/<ts>/investigation/official-check.md` に残し、spec-writer の入力に加えます。
- **管理パス外の変更**: design-map の `## 管理パス外の変更` に、管理パス集合の外のファイルの変更を1件ずつ
  （要件・変更内容・根拠・確認・撤回条件・撤回したら直す生成物）書きます。emit-manifest が欄の欠けと集合内のパスを止め、
  MANIFEST と RUN.md（「3a」）に写し、Phase D で1件ずつ適用と確認を handoff に記録します。requirements.md の要件に
  `outside_managed:` で変えてよい範囲を書けます。
- **管理パス外の変更の事前試行（Phase B）**: 対象の振る舞いを変える変更は、designer が `根拠: 試行待ち` と書き、
  オーケストレーターが P3 の前に対象の一時 worktree で適用・確認して結果に書き換えます。試行待ちが残ると emit-manifest が止まります。
- **撤回時に直す生成物**: 管理パス外の変更の成果物を前提に書く生成物を、その項目の「撤回したら直す生成物」に挙げます。
  builder は自分のファイルが挙がっているかを確かめ、漏れていれば報告します。

- **`npm run check -- <ts> requirements|spec|design-map`**: requirements・spec・design-map の点検を項目ごとの OK / NG にしました
  （exit 0 全 OK・1 NG あり・2 引数不正）。要件の件数と強度・優先度の内訳、spec の §9 と `[mandatory]`、design-map の
  Used Features・層の宣言・既存判定の件数照合・K1〜K5・Write Scopes・mandatory の対応・`allowed: false` の機能・
  `outside_managed` の範囲を機械で判定します。canon-a・canon-b は、これらを全文を読んで確かめる手順から置き換えました。
  requirements-template に、散文の小節を足してよいことを書きました。

- **`npm run handoff -- <ts> mark|set|note|session`**: handoff.md の進捗の印（`工程N`・`P<N>`。付け違いは exit 1）、frontmatter
  （phase・status・mode）、節への追記、セッションの記録を CLI にしました。sed や python の手書き換えをやめます。
  new-run は進捗を工程1〜9の全行で作り、`## セッション` 節を足します。`session <Phase>` は canon のプロジェクトで最後に
  書かれたセッションの id を記録します（run の振り返りが transcript を引くために使います）。canon-a〜d の手順を置き換えました。

- **requirements.md の `## 参照元`（任意）**: 対象とは別のプロジェクトの一式を移植の基準にするとき、`path`（絶対パス）と
  `role` を書く入力欄を足しました。focused 調査・spec-writer・designer・builder が読みます。`npm run check -- <ts> requirements`
  が実在と絶対パスを確かめます。investigator に `mode: reference` は足していません（focused が参照元も読みます）。

- **参照元からのコピー（`## 参照元からのコピー`）**: design-map に `<参照元の絶対パス> → <生成先の相対パス>` を書くと、
  `npm run copy-keep` が keep と同じ仕組み（sha256 の照合・管理パス集合の検査）でバイト単位に `generated/` へコピーします。
  コピー元は requirements.md の `## 参照元` の配下に限ります。builder は打ち直さず、コピー済みのファイルの差分だけを Edit します。
  new モード（既存判定の無い design-map）でも動きます。`npm run check -- <ts> design-map` が書式・宣言・配下を点検します。
- **skills 層の builder の分割**: L2 の宣言が20件を超えるとき、`slice.js` が skill 単位に `skills-<k>.md`・`targets-l2-<k>.txt` を足し、
  Phase C は分割数だけ builder を並列に起動します（`skills.md`・`targets-l2.txt` は全体として残ります）。

- **生成物のテストの実行（Phase C 工程7）**: 生成物に `*.test.*` があれば、対象の一時 worktree に generated/（と outside-managed/）を
  重ねて対象のテストランナーで実行し、失敗を verify の違反と同じに扱います。builder にはシェルが無く、書いたテストの失敗が
  工程8まで見つからなかったためです。

- **reviewer の分割と未判定の扱い**: reviewer の判定の対象を20件ずつの `INDEX-<k>.md` に分け（`INDEX.md` は廃止）、分割数だけ並列に
  起動します。書込先は `review/review-<k>.md`。`## 未判定の対象` に読み切れなかった対象を挙げさせ、1件でもあれば工程8は
  未完了とし、その分の reviewer を追加で起動します。1体に全件を渡すと、79件に対して Read が34回しか行われませんでした。

### Changed

- **生成物の README の「使用例」**: spec の受入基準 A1 の転記をやめ、利用者が起動する Skill の起動行
  （`/名前 <argument-hint>`）を並べます。受入基準は run の道具で、配置後の README に置くと古いパスや番号を指したまま残るためです。
- **keep の K3（依存健全）**: keep にするテストが、同じ run で変える同梱データの件数や内容を固定していないかを
  designer が原本で確かめる項目を design Skill に足しました。
- **Phase C の品質検査**: 生成物に CLI・スクリプトがあれば、受入基準が求めていなくても、対象の現物に向けて1回実行し、
  出力を P4 に含めます。
- **生成規約（Skill）**: Skill に `scripts/` などがあるとき、対象リポジトリ直下の同名パスはコマンド形（`bash scripts/x.sh`）か
  地の文で書くと定めました。パス単独のバッククォートは V6 が Skill 内の supporting file と見なして違反にします。
- **investigator の tools**: Edit を足しました。調査結果を直すときは全文を書き直さず、指示の箇所だけを Edit します
  （Edit は自分の成果物ファイルだけ）。
- **spec-writer の tools**: Grep・Glob を足しました。investigator と spec-writer の定義に、Bash が無いことと、
  glob の brace を入れ子にしないことを書きました。
- **focused の調べ方**: 語の分布は Grep の `count`・`files_with_matches` で取り、該当行の抜き出しは対象を絞ってから行うと
  investigation Skill に書きました。
- **designer の入力**: `official-check.md`（あれば）と、handoff の Phase B 向けの申し送り（逐語）を渡します。
  オーケストレーターが手でプロンプトに足していたものを、canon-b 工程5 の「渡すもの」に入れました。
- **builder の Glob**: keep のコピー済みを確かめるのは、refactor モードで keep があるときだけにしました。対象リポジトリを
  Glob するときは、依存ディレクトリを含めないよう範囲を絞ります。
- **experimental の範囲**: プレビュー段階の組込み Skill（`/design` など）への依存を含めました。V9 は生成物の本文の案内を
  検出せず、design-map の `## Experimental Dependencies` に書かれたときだけ止めます（テストで固定）。ヒアリングでは、
  既存や参照元が使っている依存を grep で示してから constraints の選択肢を作ります。
- **ヒアリングの選択肢**: ワーカーの分け方を尋ねるときは、分割軸（領域 × 実装とテストの分離）の組み合わせを網羅します。
- **工程8 の裏取り**: コマンドの挙動を根拠にした reviewer の指摘は、オーケストレーターが一時ディレクトリで実行して確かめ、
  コマンド行と出力を添えて示します。

### Fixed

- **配置先のブランチと未コミットの変更を事前に確かめる**: pre-deploy-check が、対象が既定ブランチ（`origin/HEAD`、無ければ main・master）に
  いるとき、未コミットの変更があるとき、git の状態を読めないときに、report に warning を書きます（exit には影響しません）。
  RUN.md は配置の前に作業ブランチを切る手順（`git switch -c`）を置きます。
- **管理パス外の変更の変更後のファイルを P4 が束縛**: Phase C の工程6で、変更後のファイルを `output/<ts>/outside-managed/<対象パス>` に
  作ります（対象の現物をコピーし、l1 の builder が直す）。P4 のハッシュは、このディレクトリにファイルがあるとき generated/ と
  合わせて取ります（無ければ従来と同じ値）。RUN.md の 3a に、対象へコピーするコマンドを載せます。
- **修正ループの振り分けをユーザーから取る**: 工程8の直後に、指摘を直すかを1問で取ります。既定は全件を直すこと、
  「直さない」は理由付きの候補だけを示します。P4 の提示に未決の指摘を残しません。
- **承認後の generated/ の直接編集を機械検査で止める**: `approvals record P4` は verify-report の generated/ のハッシュが現在と
  一致しないと、`record P5` は P1〜P4 が有効でないと拒否します。canon-c は Phase D の差し戻しから再入して修正ループだけを
  回せるようになり、canon-d は generated/ に書かず `/canon-c <ts>` に再入するよう案内します。
- **P5 と deploy が generated/ の中身を束縛**: pre-deploy-report に generated/ のツリーハッシュを書き、P5 の承認が中身を束縛します。
  `deploy.js --confirm` は冒頭で P1〜P5 の承認を照合し、承認後に generated/ や report が変わっていれば（P4・P5 が無効）、
  承認行や handoff.md が無ければ、対象を変えずに拒否します。
- **V6 の warning のノイズ**: 日本語の description の委譲条件（「…ときに委譲される」「…は委譲する」）を委譲トリガーとして認めます。
  パスを含まないファイル名は generated/ 全体の basename 一致でも解決とみなし、解決できないパス様トークンは
  1ファイルにつき1件の warning にまとめて件数と代表例（先頭5件）を載せます。run 20261003_033830 の generated/ に当てると
  V6 の warning は 63 件から 9 件になりました。P4 では種別ごとの件数と代表例を示します（全件は verify-report にあります）。
- **`npm run tokens -- <session-id>`**: canon 以外のプロジェクト（対象プロジェクト）のセッションも解決します。
  canon のディレクトリに無ければ `~/.claude/projects/*` を横断し、複数見つかれば候補を挙げて止まります。
- **生成物の README の冒頭**: canon のツール名（`emit-manifest.js`）を書かず、「配置のたびに作り直されます」とだけ書きます。
  配置先の読み手はツール名を解決できないためです。
- **canon の版の確認**: 各 Phase の開始時に比べるパスに `design/`・`guide/` を足しました。成果物の契約
  （`design/artifacts.md`）が run の途中で変わっても検出します。

## [2.1.0] - 2026-10-01

run の置き場所を、canon と対象プロジェクトの2フォルダだけで完結する形に戻しました。2.0.0 で始めた run は引き継げません（新しい run を始めてください）。

### Changed

- **run は canon のルートで行います**: run ごとの worktree `../canon-runs/<ts>` とブランチ `run/<ts>` をやめました。
  すべての Phase を canon のルートで起動し、成果物は `work/<ts>`・`output/<ts>` に置きます。成果物はコミットしません。
- **canon の版の確認**: `npm run new-run` が run を始めたときの canon の HEAD を handoff.md の `canon_commit` に記録し、
  各 Phase の開始時に、canon 本体（`.claude/`・`lib/`・`gates/`・`tools/`・`docs/`）が変わっていれば差分を示して確認します。
- **canon 課題の記録**: run 中に見つけた canon 本体の問題は、その場で `tasks/lessons.md` に書きます。
  handoff.md の「canon 課題候補」と、Phase D の転記の工程は廃止しました。
- **品質検査**: reviewer の correctness・security に、生成物に含まれる実行コード（Hook のスクリプト・MCP の command）と
  `permissions` の確認を足しました。
- **`.claude/settings.json`**: `additionalDirectories`（`../canon-runs/`）と `git worktree list` の許可を外しました。

### Removed

- Phase C の `/security-review`・`/code-review`。run の成果物を追跡しないので差分が無く、確認の範囲は reviewer が受け持ちます。

## [2.0.0] - 2026-10-01

構成を作り替えました。フックと完了マーカーで工程を進める方式をやめ、Phase ごとのセッションで動くオーケストレーターと、
1本にまとめた検証 CLI、Agent Skills の仕様に沿った軽い構成にしています。設計は `design/architecture.md` と
`design/artifacts.md` の2冊にまとめ直しました。1.x からの run の引き継ぎはできません（新しい run を始めてください）。

### Changed

- **Phase A〜D とセッション**: 1つの Phase を1つのセッションで行い、ユーザーが `/canon-a <target>`・`/canon-b <ts>`・
  `/canon-c <ts>`・`/canon-d <ts>` で起動します。spec は Phase A で確定し、Phase B は承認済みの spec だけを入力にします。
- **番号を振り直しました**: 工程1〜9・人間ゲート P1〜P5（要件・spec・design-map・生成物とレビュー・配置）・
  verify の検査 V1〜V9・keep の条件 K1〜K5。報告だけだったゲートは廃止しました。
- **状態と承認**: run の状態は `work/<ts>/handoff.md` だけが持ちます（進捗・承認・差し戻し・申し送り・canon 課題候補）。
  承認は対象の sha256 を付けて記録し、次の Phase の開始時に照合します。承認の後で対象が変わっていれば無効です。
- **run の git 運用**: run ごとに worktree `../canon-runs/<ts>` とブランチ `run/<ts>` を作り、Phase の終わりごとに
  `work/<ts>`・`output/<ts>` をコミットします。run ブランチは push しません。
- **検証**: 成果物の検査を `npm run verify -- <ts>`（V1〜V9）の1本にまとめ、`verify-report.md` と exit code を返します。
  検査対象がゼロなら違反にし、検査した generated/ のハッシュを記録します。
- **品質検査**: reviewer（correctness・security・正典の意図・context）と keep-reviewer（K2・K4・merge 先）に、
  標準 Skill の `/claude-api prompt-audit`・`/security-review`・`/code-review` を加えました。指摘は修正ループで
  直してから P4 に出します。
- **Agent を17体から6体に**: `investigator`（existing・profile・focused の3モード）・`spec-writer`・`designer`
  （機能選定を含む）・`builder`（層を引数で受け、層ごとに並列に起動）・`reviewer`・`keep-reviewer`。
  ワーカーを束ねる中継役は置かず、オーケストレーターが直接起動します。
- **Skill を14件から9件に**: Phase Skill `canon-a`〜`canon-d` と、知識 Skill `investigation`・`requirements`・`design`・
  `generation`・`review`。書式の実例は各 Skill の `references/` に置きました。
- **スクリプトの置き場**: 入口は各 Phase Skill の `scripts/`、共有のパーサと管理パス集合は `lib/` に置きました。
  MANIFEST・README・配置リストは `emit-manifest.js` が決定論で生成します。
- **`.claude/settings.json`**: hooks を除き、permissions だけにしました（canon のスクリプトの許可、deploy の
  `--confirm` の拒否、`git push` の確認、run の worktree へのファイルアクセス）。

### Added

- `npm run new-run`（ts の採番・worktree・骨格・handoff.md の雛形）
- `npm run approvals`（承認行の記録と照合）
- `npm run review-bundle`（keep-reviewer の判定入力。designer の主張を機械的に除く）
- 自己適用テストに、ワーカーがコマンド実行系ツールを持たないことと、Phase Skill の構成の検査を追加

### Removed

- フックによる工程制御の全体（書込ガード・前進ガード・停止時の検査・完了マーカーとリクエスト・ブロックの記録・
  配線の生存確認・セッション開始時の初期化）と、その操作用の CLI（再検査・巻き戻し・ブロック解除・状態の記録・再開）
- 正典更新と自己最適化の専用コマンドと、その世代管理
- 5軸の評価ハーネス（判定の集約・round 管理・較正）
- テスト用のサンプル入力ディレクトリ（テスト入力は `tests/helpers` でインライン生成）
- 旧設計書（基本・詳細の2冊と、運用記録の文書）

### 移行

- 1.x の run の成果物はそのまま使えません。新しい run を `/canon-a` から始めてください。
- Phase C の標準 Skill のために、プラグイン `example-skills@anthropic-agent-skills` を入れてください（`guide/setup.md`）。

## 1.x

1.x 系の変更履歴は、タグ `v1.0.0` と、2.0.0 より前の main のコミット履歴を参照してください。
