# handoff: canon-lessons

## 現在地
段階2 完了（2026-10-21）
plan.md を書いた。段階1（壁打ち）は、計画と同じセッションで行った。A・B の実装、C の大の経路の実 run、その後の後始末が残っている。

## 次のセッション
- 推奨モデル: Sonnet（effort medium）
- 最初に打つコマンド: `/flow-build tasks/20261021-canon-lessons`
- 長い作業なら: `/goal Skill flow-build で tasks/20261021-canon-lessons を実装する。完了条件: plan.md の T1〜T15 がすべて [x]、npm test が exit 0、npm run reference-check が exit 0、plan.md の「範囲外」を変えていない、handoff.md の現在地が「段階3 途中（C 待ち）」。または 60 ターンで停止`

## 判断ログ
- 2026-10-21 段階2: 正典 canon-reference を最初に引く役は investigator にする。claude-code-guide は正典で確かめられない論点だけに使う（理由: 過去2回の run の公式確認の3論点が正典に書いてあり、メインの文脈を増やさずに済む）。
- 2026-10-21 段階2: 観測でしか片付かない項目は、skillweave-mhwilds のカスタマイズ一式のリファクタリングを大の経路で通して片付ける（理由: ユーザーの指定。大の経路・依存の導入・対話の許可画面を1回で通せる）。
- 2026-10-21 段階2: `git -C` は allow 規則を足さず、`npm run worktree` のサブコマンドに寄せる（理由: `Bash(npm run *)` に当たる。`*` をサブコマンドの前に置く allow は、公式が警告の対象にしている）。
- 2026-10-21 段階2: change-plan の `## 参照元の扱い` は別ファイルに分けず、読み手を Grep に変える（理由: `check`・`approvals`・V6 の読む位置を変えずに済む）。
- 2026-10-21 段階3: T1 は4範囲を8本の Explore に分けて行った（(a)(b)(d) は範囲が広く、コンテキストあふれで1回失敗したので、それぞれ2〜3本に狭めて再実行した）。食い違いの報告は計 約35件。実物で裏取りして直したもの: CHANGELOG の v3 の項と `package.json` 3.0.0・`tests/self_application.test.js:2`・`lib/artifact.js:5`・`lib/markdown.js:5`・`lib/handoff.js:2,84`・`tools/handoff.js:3` の存在しない §参照・`canon-build/SKILL.md:43` の advisor の条件・`architecture.md` の preflight の `--expect`・旧 V7・V8 の語・`guide/setup.md` の小の条件と `CANON_WT_ROOT`。
- 2026-10-21 段階3: 直さなかったもの（理由つき）: `CHANGELOG.md` の旧 [Unreleased] の本文（v2 の語彙で `review-bundle`・`keep-reviewer` などを現行のように書く。リリースされなかった履歴なので「v2.1.0 以降 v3 までの間の変更（未リリース）」の小見出しに下げて残した）／`CHANGELOG.md` の [2.0.0] の `## 1.x` 見出しと版のリンク定義が無い点（過去の版の書式で、今回の目的の外）／`.claude/README.md:54` と `guide/setup.md:32` の「skills §4」（`skills.md` に「## 4. 設計の指針」があり、誤検出）／`architecture.md:143` の `eval/haiku/profile.md`（実在し、誤検出）／`canon-update/scripts/checks.js` の id 5・11 が2か所に出る点（同じ検査の早期 return と本体で、重複ではない）／`/claude-api` を `example-skills` に含める記述（環境に依存し、リポジトリからは確かめられない）／`.claude/settings.local.json` を README が書かない点（追跡外の個人設定）／`output/`（追跡外。ユーザーの判断）。
- 2026-10-21 段階3 T8: 2回の run の実測（要件1件の最大 1302 バイト／constraints 652／requirements 全体 16.0KB／ファイル1件の最大 1532／参照元の扱い1件の最大 241／change-plan 全体 38.1KB）は、どの上限も超えていない。小の経路の上限は変えない。大の経路の `機能と責務`・`モデル割当`・全体は実測が無いので、最終の値は T16 で決める。
- 2026-10-21 段階3 T3〜T12: investigator の正典先引き・`worktree status|diff`・`impact --from-plan`・`impact-ids.txt`・`check` の影響の語の検査・V6 の「変える」行の照合・`tokens --turns`・reviewer の Grep の読み方・workflow.md の写しの規則を実装した。台帳から消した項目は、各コミットの差分で確かめる。

## メモ
- 一括の Explore での整合性の洗い出しは、コンテキストがあふれて止まった。T1 は必ず4範囲に分ける。
- `tasks/lessons.md` の15件の対応表は、plan.md の各タスクの末尾にある。
- このフォルダは `.gitignore` の `!/tasks/20261021-canon-lessons/` で追跡している。卒業させて消すときは、その行（と直前のコメント）も消す。
- ブランチは `chore/canon-lessons`（main 5b8cb45 から切った）。
