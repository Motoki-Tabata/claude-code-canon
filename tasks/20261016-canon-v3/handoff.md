# handoff: canon-v3

## 現在地
段階2 完了（2026-10-17）
`inventory`・`impact`・`worktree` と lib・テストを実装し、`npm test` 447件が通った。コミットはユーザーの了承待ち。次は段階3（検査）。未確認が1点ある（対話のセッションでの `~/` 起点の規則。下の「未確認」）。

## 次のセッション
- 推奨モデル: Sonnet（effort medium）
- 最初の指示: 「`tasks/20261016-canon-v3/plan.md` の段階3 を実装する。brief.md・handoff.md・`design/architecture.md` を先に読む」
- 起動: canon のルートで `claude --model sonnet --effort medium`
- 段階3で使うもの: `npm run impact` の該当 ID は `<path>:<line>:<term>`。`check` が change-plan の「参照元の扱い」と照合する鍵にする。`inventory` の参照の分類は exists・missing・placeholder・external・outside-repo
- 段階3の参考: canon 自身に1ファイルと2語で `impact` をかけると、該当が 219 件（64 ファイル）あった。change-plan の「参照元の扱い」は1件1行（300バイト）なので、件数の多い語は、行ごとでなくファイル単位でまとめて答える書式を段階3で決める

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

## レビュー記録
- 2026-10-17 段階1: draft PR #27 の上で、設計書 `design/architecture.md`（033e80d）をユーザーが承認した

## 未確認
- 対話のセッションで `Read(~/.claude-canon/wt/**)`・`Edit(~/.claude-canon/wt/**)` の規則（`~/` 起点）が効くか。`claude -p` では効いた（builder の Edit が通り、規則に当たらないパスは拒否された）。対話の許可の画面は通っていない。確かめるまでは「動く」と書かない

## メモ
- この計画の「段階」は本フォルダの段階0〜6で、flow-workflow の段階1〜4 とは別物である。/flow-* はこのリポジトリでは開始時に止まる（`.claude/skills/canon-a/SKILL.md` があるため）。canon-a を置き換えた後（段階4）は、この制約は無くなる。
- 台帳の項目のうち、R2 で別セッションの実経路を通った L23（2026-10-10 の1件目）は、v2 については大半が解消している。v2 の残りを消す段階5で台帳から消す。
