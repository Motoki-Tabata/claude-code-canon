# handoff: canon-v3

## 現在地
段階3 完了（2026-10-17）
`verify`（`tools/verify.js`・`lib/verify/`）・`check`（requirements・change-plan）・`approvals`（G1〜G3）と lib・テストを実装し、`npm test` 365件が通った。実経路（canon 自身を対象にした worktree で `npm run inventory`・`impact`・`check`・`verify`・`approvals`）も通した。コミットはユーザーの了承待ち。次は段階4（Skill と Agent）。未確認が1点ある（下の「未確認」）。

## 次のセッション
- 推奨モデル: Sonnet（effort medium。設計判断が出たら Opus）
- 最初の指示: 「`tasks/20261016-canon-v3/plan.md` の段階4 を実装する。brief.md・handoff.md・`design/architecture.md` を先に読む」
- 起動: canon のルートで `claude --model sonnet --effort medium`
- 段階4で使うもの（書式の契約。テンプレートは `check` の書式に合わせる）:
  - requirements.md: `## 確定要件`（`- id:`・`want`・`confidence`〔実物で確認／公式で確認／文言のみ〕・`evidence`・`files: [..]`・`accept`・任意で `strength_needed`）、`## 未確定`（同じ書式。「文言のみ」はここ）、`constraints:` と `conflicts:` のキー行（節の見出しは問わない）、任意で `confirmed_at: YYYY-MM-DD hh:mm`
  - change-plan.md: `## ファイル`（`- path:`・`op: modify|new|delete`・`reqs: [R1]`・`instruct:`）、`## 影響の語`（バッククォートの箇条書き）、`## 参照元の扱い`（`- <path>:<line>:<term>: 変える|変えない（理由）` か、ファイル単位の `- <path>: 変える|変えない（理由）`）、`## 検証コマンド`、大の経路だけ `## 機能と責務`・`## モデル割当`
  - `work/<ts>/` に置くもの: `handoff.md`（frontmatter に `route: small|large`・`worktree`・`branch`・`base`）、`inventory.json`・`impact.json`（`npm run inventory`・`impact` の `--out work/<ts>`）、`verify-report.md`（`npm run verify -- <ts>` が書く）
  - ゲート: 小は G1（requirements.md＋change-plan.md）・G2（コミット sha）、大は G1（requirements.md）・G2（change-plan.md）・G3（コミット sha）。`npm run approvals -- <ts> record|check|hash`。差分のゲートは、未コミットの変更が無く、verify が現在の HEAD を検査して合格していることが前提
  - `npm run check -- <ts> requirements|change-plan`、`npm run verify -- <ts>`（exit 0 合格・1 違反か入力不在・2 引数不正）
- 段階4で直すもの（段階3では直していない。`worker-definitions.md` の規律に従い、v3 の語彙で書き直す）: 下の「段階4に回したもの」

## 段階4に回したもの
- V1〜V9・V7・V8・P1〜P5・spec・design-map・keep の語彙が残るワーカー定義と知識 Skill: `.claude/skills/generation/SKILL.md`・`design/SKILL.md`・`review/SKILL.md`・`requirements/references/spec-template.md`・`design/references/existing-disposition.md`・`design/references/design-map-template.md`・`review/references/keep-review.md`。verify の番号は新しい番号（V7=計画との一致、V8=constraints、V9=trust の前提）に変わった
- `canon-a`〜`canon-d` の SKILL.md。`canon-d/SKILL.md` は、廃止した `npm run deploy`・`pre-deploy`・`run-manifest` を呼ぶ記述のまま残している。`tests/self_application.test.js` の「npm scripts が実在する」検査に、この3つだけを canon-d に限って許す暫定の許可リストを入れた（段階4で canon-d を置き換えたら外す）。`.claude/README.md`・`README.md`・`guide/setup.md` にも `/canon-d`・配置の記述が残る（段階5）
- `canon-a/scripts/new-run.js` は `canon-d/scripts/self-target-guard.js` を import しているので、後者は残した（`tests/self_target_guard.test.js` も、廃止したスクリプトを呼ぶ CLI のケースだけ消して残した）。new-run を置き換えるとき（段階4）に一緒に消す
- `tools/handoff.js`・`lib/handoff.js` の雛形・進捗の行は v2 のまま（Phase・P1〜P5）。v3 の frontmatter のキー（route・worktree・branch・base・stage）は読み取りだけ足した。書き換えは段階4（`new-run` と `preflight`）
- 古い番号・パスが残る箇所（段階4か5で直す）: `README.md` 32行・`guide/setup.md` 153行（V1〜V9 と verify-report の説明。V7〜V9 の意味が変わった）、`canon-c/SKILL.md`（verify の再入・keep の V7・P4 のハッシュ照合の手順）、`review-bundle.js`・`copy-keep.js` のコメント（V7）。常時ロードされる rules が名指ししていた検査の置き場（`checks-and-tests.md`・`worker-definitions.md` の `canon-c/scripts/verify/`）は `lib/verify/` に直した
- 残る v2 の部品（`copy-keep`・`emit-manifest`・`review-bundle`・`slice`・`lib/design-map.js`・`lib/managed-paths.js`・`lib/tree-hash.js` など）は段階5で消す。いま `npm test` が通るのは、これらが verify・approvals に依存しないため

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

## レビュー記録
- 2026-10-17 段階1: draft PR #27 の上で、設計書 `design/architecture.md`（033e80d）をユーザーが承認した

## 未確認
- 対話のセッションで `Read(~/.claude-canon/wt/**)`・`Edit(~/.claude-canon/wt/**)` の規則（`~/` 起点）が効くか。`claude -p` では効いた（builder の Edit が通り、規則に当たらないパスは拒否された）。対話の許可の画面は通っていない。確かめるまでは「動く」と書かない

## メモ
- この計画の「段階」は本フォルダの段階0〜6で、flow-workflow の段階1〜4 とは別物である。/flow-* はこのリポジトリでは開始時に止まる（`.claude/skills/canon-a/SKILL.md` があるため）。canon-a を置き換えた後（段階4）は、この制約は無くなる。
- 台帳の項目のうち、R2 で別セッションの実経路を通った L23（2026-10-10 の1件目）は、v2 については大半が解消している。v2 の残りを消す段階5で台帳から消す。
