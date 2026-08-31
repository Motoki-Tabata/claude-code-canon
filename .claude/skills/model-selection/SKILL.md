---
name: model-selection
description: Assign a model tier (Opus / Sonnet / Haiku, plus the Fable alias) to a generated Subagent or Skill with cost optimization. Use when designer or a builder needs to decide which model a customization artifact should declare. Haiku applies only to mechanical, canon-free, downstream-verified tasks. Fable (Claude Fable 5, Mythos) is available as an official alias but is not the canon-flow default.
user-invocable: false
---

# model-selection（3段階モデルティア割当 + Fable エイリアス）

コスト最適化を考慮し、Opus / Sonnet / Haiku の3段階モデルティアを各成果物に割り当てる判定ロジック。`fable`（Claude Fable 5, Mythos クラス）も公式エイリアスとして指定可能だが、本システムの canon フローでは既定採用しない。`context: fork` は付与しない（軽量な判定ロジックのみ）。

## 参照正典
- `BEST_PRACTICES.md §3.3`（モデルティア記述・Haiku 採用3基準）
- `L3_AGENTS.md §2.1`（`model:` の取りうる値・コストティア制約）
- `TOOLS.md`（`model` の語彙。full ID の例）

## 大原則
- `model:` は `opus`（=`claude-opus-5`。既定。Bedrock/Vertex/Claude Platform on AWS は `claude-opus-4-8`）/ `sonnet`（=`claude-sonnet-5`）/ `haiku`（=`claude-haiku-4-5`）/ `fable`（Claude Fable 5, Mythos）または フル ID / `inherit`。既定は `inherit`。
- **Subagent は親のコストティアを超えない。**
- 迷う場合の既定は `sonnet`。`fable` は公式エイリアスだが canon フローでは既定採用しない（必要時のみ明示選択）。

## ティア選択
| ティア | 採用するタスク |
|---|---|
| `opus` | 設計判断・広範な文脈把握・整合性維持を伴う（アーキテクチャ設計、複数ファイル横断の更新判断） |
| `sonnet` | 文脈推論・文章合成・正典参照を伴う標準的な生成/レビュー（**既定**） |
| `haiku` | 下記3基準を**すべて満たす**機械的タスクに限る |
| `fable` | Claude Fable 5（Mythos クラス）。公式エイリアスとして指定可能だが canon フローでは既定未採用 |

## Haiku 採用基準（すべて満たす場合のみ）
1. 設計判断・文脈推論を伴わない（テンプレートの機械的充填・固定フォーマット出力に限る）
2. 正典ファイル（`docs/`）を参照せずに完結できる（生成/判断 Skill を preload しない）
3. 失敗コストが低い（後続 Subagent または決定論ゲート／eval が出力を検証する）

→ いずれか1つでも欠ければ `sonnet` 以上。安易に `haiku` へ落とすと文脈推論を要するタスクで品質が低下し手戻りコストが増える点に注意。

## 本システムでの確定割当（参考・詳細設計書 §9.4）
- `opus`（1体）: `designer`（既存4判定・keep_conditions・設計判断）
- `sonnet`（多数）: `investigator` / `existing-customization-analyzer` / `project-profiler` / `spec-writer` / `selector` / `generator` / 各 builder / `readme-writer` / eval-*
- `haiku`（1体）: `requirements-recorder`（合意済み要件の機械的直列化・3基準すべて充足）

designer は割当結果を `design-map.md` の `## Model Assignments` に記録する。
