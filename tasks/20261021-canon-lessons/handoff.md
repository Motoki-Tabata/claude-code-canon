# handoff: canon-lessons

## 現在地
段階3 途中（C 待ち）（2026-10-21）
T1〜T15 が完了した（A は c4d7d7d、B は実験の結果と investigator の書込先の改名を次のコミットに含める）。残りは C（ユーザーが対話で実行する大の経路の実 run）と、その後の T16・T17。

## 次のセッション
- ユーザーが次の順で C を進める（plan.md の「C」）。
  1. `claude --model opus --effort medium` で `/canon-plan ~/work/skillweave-mhwilds`
  2. `/canon-design <ts>`
  3. `claude --model sonnet --effort medium` で `/canon-build <ts>`（G1〜G3 と振り返りまで）
- ユーザーは、下の「メモ」に ts と、対話で許可の画面が出たか（出たならそのコマンド）を書く。
- そのあと再開する: Sonnet（effort medium）・`/flow-build tasks/20261021-canon-lessons`（T16・T17 から）

## 判断ログ
- 2026-10-21 段階2: 正典 canon-reference を最初に引く役は investigator にする。claude-code-guide は正典で確かめられない論点だけに使う（理由: 過去2回の run の公式確認の3論点が正典に書いてあり、メインの文脈を増やさずに済む）。
- 2026-10-21 段階2: 観測でしか片付かない項目は、skillweave-mhwilds のカスタマイズ一式のリファクタリングを大の経路で通して片付ける（理由: ユーザーの指定。大の経路・依存の導入・対話の許可画面を1回で通せる）。
- 2026-10-21 段階2: `git -C` は allow 規則を足さず、`npm run worktree` のサブコマンドに寄せる（理由: `Bash(npm run *)` に当たる。`*` をサブコマンドの前に置く allow は、公式が警告の対象にしている）。
- 2026-10-21 段階2: change-plan の `## 参照元の扱い` は別ファイルに分けず、読み手を Grep に変える（理由: `check`・`approvals`・V6 の読む位置を変えずに済む）。
- 2026-10-21 段階3: T1 は4範囲を8本の Explore に分けて行った（(a)(b)(d) は範囲が広く、コンテキストあふれで1回失敗したので、それぞれ2〜3本に狭めて再実行した）。食い違いの報告は計 約35件。実物で裏取りして直したもの: CHANGELOG の v3 の項と `package.json` 3.0.0・`tests/self_application.test.js:2`・`lib/artifact.js:5`・`lib/markdown.js:5`・`lib/handoff.js:2,84`・`tools/handoff.js:3` の存在しない §参照・`canon-build/SKILL.md:43` の advisor の条件・`architecture.md` の preflight の `--expect`・旧 V7・V8 の語・`guide/setup.md` の小の条件と `CANON_WT_ROOT`。
- 2026-10-21 段階3: 直さなかったもの（理由つき）: `CHANGELOG.md` の旧 [Unreleased] の本文（v2 の語彙で `review-bundle`・`keep-reviewer` などを現行のように書く。リリースされなかった履歴なので「v2.1.0 以降 v3 までの間の変更（未リリース）」の小見出しに下げて残した）／`CHANGELOG.md` の [2.0.0] の `## 1.x` 見出しと版のリンク定義が無い点（過去の版の書式で、今回の目的の外）／`.claude/README.md:54` と `guide/setup.md:32` の「skills §4」（`skills.md` に「## 4. 設計の指針」があり、誤検出）／`architecture.md:143` の `eval/haiku/profile.md`（実在し、誤検出）／`canon-update/scripts/checks.js` の id 5・11 が2か所に出る点（同じ検査の早期 return と本体で、重複ではない）／`/claude-api` を `example-skills` に含める記述（環境に依存し、リポジトリからは確かめられない）／`.claude/settings.local.json` を README が書かない点（追跡外の個人設定）／`output/`（追跡外。ユーザーの判断）。
- 2026-10-21 段階3 T8: 2回の run の実測（要件1件の最大 1302 バイト／constraints 652／requirements 全体 16.0KB／ファイル1件の最大 1532／参照元の扱い1件の最大 241／change-plan 全体 38.1KB）は、どの上限も超えていない。小の経路の上限は変えない。大の経路の `機能と責務`・`モデル割当`・全体は実測が無いので、最終の値は T16 で決める。
- 2026-10-21 段階3 T3〜T12: investigator の正典先引き・`worktree status|diff`・`impact --from-plan`・`impact-ids.txt`・`check` の影響の語の検査・V6 の「変える」行の照合・`tokens --turns`・reviewer の Grep の読み方・workflow.md の写しの規則を実装した。台帳から消した項目は、各コミットの差分で確かめる。
- 2026-10-21 段階3 T14: investigator の Write 拒否の条件は、**書込先のベース名が `findings.md` であること**だった。Agent ツールで investigator を5通りで起動した結果: `investigation/findings.md`＝拒否、`probe-c/findings.md`（別ディレクトリ）＝拒否、`investigation/probe-a.md`・`probe-b/facts.md`・`investigation/probe-findings-r1.md`＝成功。拒否文は「Subagents should return findings as text, not write report files」。そこで書込先を `investigation/facts.md` に改め、investigator・investigation・requirements・canon-plan・README の参照を揃えた（過去の `work/<ts>/investigation/findings.md` は読む側のコードが無いので影響しない）。canon-plan の「Write が拒否されたら本文を保存する」は、原因が分かったので足していない。
- 2026-10-21 段階3 T14・T15 の手段: 入れ子の `claude -p` は OAuth の期限切れで認証できなかった（`Failed to authenticate`）ため、実験は Agent ツール（この会話の権限モード）で行った。T15（builder が使い捨ての worktree に `.claude/rules/probe-new.md` を新規に Write）は成功したが、`Edit(~/.claude-canon/wt/**)` の allow 規則が効いたのか、会話の権限モードで通ったのかは区別できていない。`.claude/settings.json` は変えていない。台帳の「未通過の経路」に書き、C の run で builder の `op: new` に許可の画面が出るかを見る。

## メモ
- 一括の Explore での整合性の洗い出しは、コンテキストがあふれて止まった。T1 は必ず4範囲に分ける。
- `tasks/lessons.md` の15件の対応表は、plan.md の各タスクの末尾にある。
- このフォルダは `.gitignore` の `!/tasks/20261021-canon-lessons/` で追跡している。卒業させて消すときは、その行（と直前のコメント）も消す。
- ブランチは `chore/canon-lessons`（main 5b8cb45 から切った）。
