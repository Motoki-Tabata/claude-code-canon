---
name: investigation
description: 対象プロジェクトの調査結果（findings.md・profile.md）を書くときのテンプレートと値の語彙。investigator が要件の主張を対象の実物で確かめて確度付きの事実を書くとき、profiler が言語・テスト・CI・規約を書くとき、メインが公式の確認（official-check.md）を書くときに参照する。調査は事実の抽出に徹し、要件にするか・どのファイルを変えるかといった判断はしない。
user-invocable: false
---

# investigation（調査結果の書き方）

調査は、対象プロジェクトの現物から**事実だけ**を取り出して `work/<ts>/investigation/` に書く仕事である。判断（要件にするか・どのファイルを変えるか・正典に適合するか）は、要件を固めるメインが行う。既存のカスタマイズの一覧・frontmatter・参照のグラフは、ワーカーが書き写さずに `npm run inventory` が決定論で作る。

## まず確かめること

- 調べてよいのは、プロンプトで渡された対象の worktree（読み取り専用）の配下だけ。claude-canon 自身のリポジトリは調べない。
- 書込先は、渡された1ファイルだけ。対象には何も書かない。
- 「無い」「不在」と書く前に、Glob または Grep で確かめる。不在は、探した範囲に対してしか成り立たない。確かめた範囲を添える。

## 書くものと読むファイル

書く前に、該当する1つだけを Read する。テンプレートと値の語彙が載っている。

| 誰が | 書く | 読む |
|---|---|---|
| investigator | `findings.md`（要件の主張を実物で確かめた事実と、その確度） | [references/findings.md](references/findings.md) |
| profiler | `profile.md`（言語・ビルド・テスト・CI・規約の骨格） | [references/profile.md](references/profile.md) |
| メイン | `official-check.md`（公式のドキュメントで確かめた主張） | [references/official-check.md](references/official-check.md) |

## 共通の規律

- 書式は機械が読む。キー名・字下げ・1行1エントリの形を崩さない。
- 件数は、本文を書き終えてから数えて書く。先に見積もらない。書いた直後に自分の出力を Read し直して数え合わせる。
- 大量の生ファイルを本文に展開しない。要点をレコードにする。
- 根拠のパスを示せない事実は書かない（推測で埋めない）。
