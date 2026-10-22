# handoff: canon-lessons

## 現在地
段階3 完了（2026-10-22）
T1〜T17 が完了した。C の run は 20261021_185834（G3 承認・振り返りまで）。T16・T17 の変更（`tasks/lessons.md`・`design/architecture.md`・plan のチェック）は未コミット。

## 次のセッション
- Opus（effort high）・`/flow-review tasks/20261021-canon-lessons`

## 判断ログ
- 2026-10-21 段階2: 正典 canon-reference を最初に引く役は investigator にする。claude-code-guide は正典で確かめられない論点だけに使う（理由: 過去2回の run の公式確認の3論点が正典に書いてあり、メインの文脈を増やさずに済む）。
- 2026-10-21 段階2: 観測でしか片付かない項目は、skillweave-mhwilds のカスタマイズ一式のリファクタリングを大の経路で通して片付ける（理由: ユーザーの指定。大の経路・依存の導入・対話の許可画面を1回で通せる）。
- 2026-10-21 段階2: `git -C` は allow 規則を足さず、`npm run worktree` のサブコマンドに寄せる（理由: `Bash(npm run *)` に当たる。`*` をサブコマンドの前に置く allow は、公式が警告の対象にしている）。
- 2026-10-21 段階2: change-plan の `## 参照元の扱い` は別ファイルに分けず、読み手を Grep に変える（理由: `check`・`approvals`・V6 の読む位置を変えずに済む）。
- 2026-10-21 段階3: T1 は4範囲を8本の Explore に分けて行った（(a)(b)(d) は範囲が広く、コンテキストあふれで1回失敗したので、それぞれ2〜3本に狭めて再実行した）。報告に書かれた件数は、(a1) 0・(a2) 6（要確認を含む）・(a3) 21（うち1件は食い違い無しの確認項目）・(b1) 4・(b2) 1（ほかに表記の注意2）・(c) 1・(d1) 0（注意1）・(d2) 5（注記1）。合計は出していない（重複や誤検出を含み、確定件数と別なので）。実物で裏取りして直したもの: CHANGELOG の v3 の項と `package.json` 3.0.0・`tests/self_application.test.js:2`・`lib/artifact.js:5`・`lib/markdown.js:5`・`lib/handoff.js:2,84`・`tools/handoff.js:3` の存在しない §参照・`canon-build/SKILL.md:43` の advisor の条件・`architecture.md` の preflight の `--expect`・旧 V7・V8 の語・`guide/setup.md` の小の条件と `CANON_WT_ROOT`。
- 2026-10-21 段階3: 直さなかったもの（理由つき）: `CHANGELOG.md` の旧 [Unreleased] の本文（v2 の語彙で `review-bundle`・`keep-reviewer` などを現行のように書く。リリースされなかった履歴なので「v2.1.0 以降 v3 までの間の変更（未リリース）」の小見出しに下げて残した）／`CHANGELOG.md` の [2.0.0] の `## 1.x` 見出しと版のリンク定義が無い点（過去の版の書式で、今回の目的の外）／`.claude/README.md:54` と `guide/setup.md:32` の「skills §4」（`skills.md` に「## 4. 設計の指針」があり、誤検出）／`architecture.md:143` の `eval/haiku/profile.md`（実在し、誤検出）／`canon-update/scripts/checks.js` の id 5・11 が2か所に出る点（同じ検査の早期 return と本体で、重複ではない）／`/claude-api` を `example-skills` に含める記述（環境に依存し、リポジトリからは確かめられない）／`.claude/settings.local.json` を README が書かない点（追跡外の個人設定）／`WARN canon` の書き方（preflight の出力 `WARN  canon: …` の短縮で、Skill の読み手には通じる）／`design/references/change-plan-large.md` の見出し `## \`## 機能と責務\``（節名をコードで示す意図した書き方）／`architecture.md` の impact の行の「コマンド」（`/name` の形で語として渡すので正しい）／`session-analyst.md:14` の `npm run tokens`（用法でなく名詞句）／`output/`（追跡外。ユーザーの判断）。
- 2026-10-21 段階3 T8: 2回の run の実測（要件1件の最大 1302 バイト／constraints 652／requirements 全体 16.0KB／ファイル1件の最大 1532／参照元の扱い1件の最大 241／change-plan 全体 38.1KB）は、どの上限も超えていない。小の経路の上限は変えない。大の経路の `機能と責務`・`モデル割当`・全体は実測が無いので、最終の値は T16 で決める。
- 2026-10-21 段階3 T3〜T12: investigator の正典先引き・`worktree status|diff`・`impact --from-plan`・`impact-ids.txt`・`check` の影響の語の検査・V6 の「変える」行の照合・`tokens --turns`・reviewer の Grep の読み方・workflow.md の写しの規則を実装した。台帳から消した項目は、各コミットの差分で確かめる。
- 2026-10-21 段階3 T14: investigator の Write 拒否の条件は、**書込先のベース名が `findings.md` であること**だった。Agent ツールで investigator を5通りで起動した結果: `investigation/findings.md`＝拒否、`probe-c/findings.md`（別ディレクトリ）＝拒否、`investigation/probe-a.md`・`probe-b/facts.md`・`investigation/probe-findings-r1.md`＝成功。拒否文は「Subagents should return findings as text, not write report files」。そこで書込先を `investigation/facts.md` に改め、investigator・investigation・requirements・canon-plan・README の参照を揃えた（過去の `work/<ts>/investigation/findings.md` は読む側のコードが無いので影響しない）。canon-plan の「Write が拒否されたら本文を保存する」は、原因が分かったので足していない。
- 2026-10-21 段階3 T14・T15 の手段: 入れ子の `claude -p` は OAuth の期限切れで認証できなかった（`Failed to authenticate`）ため、実験は Agent ツール（この会話の権限モード）で行った。T15（builder が使い捨ての worktree に `.claude/rules/probe-new.md` を新規に Write）は成功したが、`Edit(~/.claude-canon/wt/**)` の allow 規則が効いたのか、会話の権限モードで通ったのかは区別できていない。`.claude/settings.json` は変えていない。台帳の「未通過の経路」に書き、C の run で builder の `op: new` に許可の画面が出るかを見る。
- 2026-10-21 段階3 検証の逸脱: plan の `npm run tokens -- 1b1a6954 --turns` は短い id では exit 1 になる（`resolveSessionPath` は完全な session-id を取る）。完全な id で通し、1セッションは「約50行」でなく 64行（1b1a6954）・60行（4c0e6f27）だった（メインのターン表1ターン1行に、サブエージェントの要約が加わるため）。数値は 4c0e6f27 の1ターン目 53,936・48ターンが台帳と一致した。`npm run worktree -- diff` は実際の worktree（skillweave-mhwilds-r2base-20261020_192336、`--base` は run の handoff の base）で通した: 29ファイルで `git diff` と一致し、status は空。
- 2026-10-21 段階3: V6 の判定の追加（「変える」と答えた行の照合）に合わせて、builder.md・review/SKILL.md の表・perspectives.md の記述を揃えた（`.claude/rules/worker-definitions.md`）。

- 2026-10-22 段階3 T16: C の実測で台帳を閉じた。消した項目: 10-12（設計の段のメインは 56k→212k・47ターンで、designer の 12k→313k より小さい。change-plan を節ごとに書く直しは入れない）／10-17「git -C」（ユーザーが許可の画面は出なかったと確認）／10-20「check の上限」（大の run の change-plan 56.2KB・機能と責務 5.6KB・モデル割当 1.3KB・ファイル1件の最大 1.4KB はどの上限も超えず、値は変えない）。書き直したもの: 10-20「増分」は1ターン目の総入力の増加（46,972→53,936→59,062）だけに、10-20「未通過の経路」は依存の導入だけに（許可の画面・builder の op: new・大の経路は通った）。impact-ids.txt の効果は、読む字数を直接は測っていないが、plan のメイン全体が 7.55M→6.43M に減ったので項目から外した。architecture の §4.1・§6.2 に実測を追記した。C の振り返りで起票された5件は範囲外として台帳に残した。
- 2026-10-22 段階3 T16 受け入れ条件2: この run の investigation に official-check.md は無い（facts.md の unverified 6件はすべて transcript 由来の挙動の主張で、仕様の主張ではないため、claude-code-guide を使わなかった）。
- 2026-10-22 段階3: 台帳の15件のうち、今回の run で新しく起票された5件（transcript の選び方・提案依頼の手順・canon-design の入力・session-analyst の消費・verify 誤検出の経路）は範囲外で残る。

## メモ
- 一括の Explore での整合性の洗い出しは、コンテキストがあふれて止まった。T1 は必ず4範囲に分ける。
- `tasks/lessons.md` の15件の対応表は、plan.md の各タスクの末尾にある。
- このフォルダは `.gitignore` の `!/tasks/20261021-canon-lessons/` で追跡している。卒業させて消すときは、その行（と直前のコメント）も消す。
- ブランチは `chore/canon-lessons`（main 5b8cb45 から切った）。
