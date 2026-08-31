---
name: layer-design
description: Decide the orchestration tier count (2-tier vs 3-tier) and produce the responsibility map for a customization design. Use when designer is generating design-map.md and must choose the layering and assign one-sentence responsibilities. Preloaded by designer.
user-invocable: false
---

# layer-design（層数選定と責任分担マップ）

層数（2層/3層）選定と責任分担マップを生成する判断系 Skill。`designer` に preload されるため `context: fork` は付与しない（Builder 境界で分離が完結するため不要）。

## 参照正典
- `ORCHESTRATION.md §2`（2層）・`§3`（3層）・`§5`（要件別手法選択マトリクス）・`§6`（意思決定フロー）

## 層数選定フロー（`ORCHESTRATION.md §6`）
```
Q1 単発 or 繰り返し？  単発→単層(inline)／繰り返し→Q2
Q2 ワークフロー or 役割？  ワークフロー→L2 Skill(2層)／役割→L3 Subagent(2層)
Q3 Subagent 内で多段処理が必要？  NO→2層確定／YES→Q4
Q4 何を呼ぶ？  Skill→3層 Pattern D／MCP→3層 Pattern E／Hook→3層 Pattern F／別Subagent→✅ 可（既定3階層・可変）。既定超や独立プロセスは Agent Teams or /batch
```

## 公式制約（`ORCHESTRATION.md §1.4`・§3.2）
- **Subagent nesting は既定3階層**。深度上限で Agent tool が外れ打ち止め。**`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可**。
- **fork は別の fork を spawn 不可**（named subagent は spawn 可で深さに数える）。
- **nested team 不可**: Agent Teams の teammate は teammate を spawn できない。
- 3層は **Subagent → preloaded Skill / MCP Tool / Hook / 別 Subagent（既定3階層以内・可変）** へ拡大。
- `disable-model-invocation: true` の Skill は `skills:` で preload 不可。
- `context: fork` には actionable task が必須（ガイドラインのみは禁止）。

## 要件別の推奨層数（`ORCHESTRATION.md §5.1`）
| 要件 | 推奨 |
|---|---|
| 単発短時間 | 単層（inline） |
| 専門レビュー1回 | 2層 Pattern A |
| 長大探索 | 2層 Pattern B（context:fork） |
| 専門役割の継続利用 | 2層 Pattern C |
| 多段専門処理 | 3層 Pattern D（Subagent + Skill） |
| 外部サービス連携 | 3層 Pattern E（Subagent + MCP） |
| 監査・遮断 | 3層 Pattern F（Subagent + Hook） |
| 大規模・複雑なオーケストレーション | Dynamic Workflows。自動更新範囲外のため選択時は手動対応項目として明記する。 |

## 出力（design-map への反映）
- `## Layer Pattern`: 採用層数（2層/3層）と根拠。
- `## Responsibility Map`: 各カスタマイズの**1文責任**。
- `## Interface Contracts`: カスタマイズ間の入出力・依存方向。
