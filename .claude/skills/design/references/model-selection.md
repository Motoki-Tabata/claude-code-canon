# モデル割当

各 Subagent・Skill の `model:` を、コストと品質の釣り合いで決め、change-plan の `## モデル割当`（大の経路）に書く。canon 自身の割当の根拠は `design/architecture.md` §6.2 にある。

## 語彙

`opus`・`sonnet`・`haiku`・`fable`（公式のエイリアス）・完全なモデル ID・`inherit`。各エイリアスの解決先（プロバイダごとに違う）は `canon-reference/data/models.json`（`models:aliases`）と `canon-reference/references/features/subagents.md` §3 が出典なので、ここには写さない。既定は `inherit`。

モデルの解決順序（呼び出しの `model` 引数、frontmatter の `model`、`CLAUDE_CODE_SUBAGENT_MODEL`、メインのモデルの順）の出典は `canon-reference/references/features/subagents.md` §3 である。その帰結として、frontmatter で指定したモデルは、メインのモデルより上位のティアでもそのまま使われる。

## ティアの選び方

| ティア | 使う場面 |
|---|---|
| `opus` | 設計判断・広い文脈の把握・整合性の維持を伴う（アーキテクチャ設計、複数ファイルにまたがる更新判断、意味の判断を要するレビュー） |
| `sonnet` | 文脈の推論・文章の合成・正典の参照を伴う標準的な生成とレビュー。**迷ったらこれ** |
| `haiku` | 下の3条件をすべて満たす事実の抽出だけ |
| `fable` | 公式のエイリアスとして指定できるが、既定では採用しない。必要なときだけ明示して選ぶ |

## haiku を使える3条件（すべて満たすとき）

1. 事実の抽出に徹し、判断・解釈・要件の取捨をしない（一覧の抜き出し・テンプレートの充填・固定書式の出力）。
2. 正典（`canon-reference`）を参照した判断を要さない。書式と語彙を与える知識 Skill の preload は妨げない。
3. 出力が後段の工程かレビューで検証される。

1つでも欠ければ `sonnet` 以上にする。条件を満たすかは、役の入力と出力の実物で確かめる。例: 対象の言語・テスト・CI・規約を読んで書く profile は、haiku の出力が sonnet とほぼ同じ質だった（版の情報は多く、数えられない項目は「数えられなかった」と書き、ファイル数などの数え上げは `inventory` のスクリプトが行う）。transcript から事実を拾う振り返りも、観点と行の参照を渡せば同じ型で足りる。要件の主張を実物と照らして食い違いを見つける調査は、解釈を要するので sonnet にする。

haiku を選んだときは `effort: high` を明示する（Haiku 5.5 は effort の `low`〜`max` に対応し、既定は `medium`）。

## effort

Subagent・Skill の `effort`（`low`・`medium`・`high`・`xhigh`・`max`）は次の方針で決める。

- 必ず明示する。省略するとセッションの effort を継承する。
- Opus 5.5・Sonnet 5.5・Haiku 5.5 の既定は `medium`。
- `opus` は `medium` で足りる。`high` は、出力の検証が品質を決める役（独立した判定者）に限る。独立した判定者は、`sonnet` でも `high` にしてよい（見落としのコストが判定のコストより大きい）。opus の `high` との比較は、実測してから決める。
- `sonnet` で、人間の承認ゲートに直接かかる成果物を1回で仕上げる役は `high` にしてよい。`haiku` は `high`。機械的な役割は `low`。

## 記録

割当の結果と、その根拠を1行ずつ、change-plan の `## モデル割当` に書く。
