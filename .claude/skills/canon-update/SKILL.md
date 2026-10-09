---
name: canon-update
description: Rebuild the canon-reference knowledge skill (.claude/skills/canon-reference/) from the official Claude Code documentation, check it, and prepare the pull request. Use only when the maintainer invokes /canon-update in a session started at the claude-canon root.
disable-model-invocation: true
---

# canon-update（正典 `canon-reference` の更新）

`canon-reference` を公式ドキュメントから**全ファイル作り直し**、検査を通して PR に載せる保守用の Skill。run（Phase A〜D）の外で、保守者が起動する。

## 方針

- 更新は差分の修正ではなく、**すべてのファイルの作り直し**である。`data/*.json`・`references/`・`SKILL.md`・`sources.json` を build.md とテンプレートに従って新しく書く。前の版を部分的に直さない。
- 前の版は、食い違いを確かめる（手順8）ための参照にだけ使う。履歴・日付の注記・「解決済」は残さない。時点を表す情報は `sources.json` の `generated_at` と `claude_code_version` だけが持つ。
- 規則・スキーマ・テンプレート・各手順の詳細は [references/build.md](references/build.md) が正である。本書は進め方と関門だけを書く。
- 規律（出典の扱い・WebFetch の限界・取りこぼしの防ぎ方）は `.claude/rules/canon-reference.md` に従う。

## 手順

build.md §2 の手順1〜8を順に行う。人に見せる関門は2つで、飛ばさない。

1. ソースを取得する（build.md §3.1）。取得物は scratchpad に置き、リポジトリに入れない。
2. 全ページを分類し、`sources.json` の `pages`・`placeable_files` を作る（§3.2）。**分類の結果を人に見せ、承認を得てから先へ進む**。新しい機能ファイルを作るときは、構築を始める前に別途承認を取る（§1.1）。
3. 時点の情報（`generated_at`・`claude_code_version`）を決める（§3.3）。
4. 機能ごとに `data/*.json` → `features/*.md` の順で書く（§4・§5）。機能ごとにサブエージェントを1ターンで並列に起動する（§7）。
5. 件数を持つコレクションを、書いた担い手とは別のサブエージェントに独立して取り直させ、突き合わせる（§6）。検査10の結果になる。
6. 横断の文書（`selection.md`・`patterns.md`・`quality.md`・`SKILL.md`）を書く（§5.4）。
7. 検査する。**結果を人に見せ、承認を得てから先へ進む**。

   ```bash
   npm run reference-check -- --online
   ```

   `--online` で 1〜9・11 を実行する（2・4・5 はネットワークを使う）。検査10は手順5の結果、検査12は `npm test` で確かめる。`reference-check` は、対象が0件の検査と、実行しなかった検査を合格に数えない。
8. 前の版（作り直す前の `canon-reference/`。`git show HEAD:<パス>` で取り出す）と主要な事実を突き合わせ、食い違いを公式の `.md` 版で裏取りして新しい版に反映する（§9）。一覧と解決の仕方は人への報告に書く。

## 終わり方

1. `npm test` を通す。canon の検査（verify・知識 Skill・設計書の参照）が新しい `data/` に追随していることを確かめる。
2. `git diff` で変更が `canon-reference` と、それに追随した canon 側に限られることを確かめる。
3. PR で main に入れる。PR 本文に、検査1〜12 の結果と、実行しなかった検査があればその理由を書く。
