# モデル割当

各 Subagent・Skill の `model:` を、コストと品質の釣り合いで決め、design-map の `## Model Assignments` に書く。

## 語彙

`opus`・`sonnet`・`haiku`・`fable`（公式のエイリアス）・完全なモデル ID・`inherit`。各エイリアスの解決先（プロバイダごとに違う）は `canon-reference/data/models.json`（`models:aliases`）と `canon-reference/references/features/subagents.md` §3 が出典なので、ここには写さない。既定は `inherit`。Subagent は、親のコストティアを超えない。

## ティアの選び方

| ティア | 使う場面 |
|---|---|
| `opus` | 設計判断・広い文脈の把握・整合性の維持を伴う（アーキテクチャ設計、複数ファイルにまたがる更新判断、意味の判断を要するレビュー） |
| `sonnet` | 文脈の推論・文章の合成・正典の参照を伴う標準的な生成とレビュー。**迷ったらこれ** |
| `haiku` | 下の3条件を**すべて**満たす機械的な作業だけ |
| `fable` | 公式のエイリアスとして指定できるが、既定では採用しない。必要なときだけ明示して選ぶ |

## haiku を使える3条件（すべて満たすとき）

1. 設計判断や文脈の推論を伴わない（テンプレートの機械的な充填・固定書式の出力に限る）。
2. `canon-reference` を参照せずに完結する（生成や判断の Skill を preload しない）。
3. 失敗のコストが低い（後段の工程かレビューが出力を検証する）。

1つでも欠ければ `sonnet` 以上にする。安易に haiku へ落とすと、文脈の推論を要する作業で品質が下がり、手戻りのほうが高くつく。

## effort

Subagent・Skill の `effort`（`low`・`medium`・`high`・`xhigh`・`max`）は必ず明示する。省略するとセッションの effort を継承し、高い effort が意図せず伝播する。設計判断を担う役割は `high`、標準の生成・レビューは `medium`、機械的な役割は `low`。

## 記録

割当の結果と、その根拠を1行ずつ、`## Model Assignments` に書く。
