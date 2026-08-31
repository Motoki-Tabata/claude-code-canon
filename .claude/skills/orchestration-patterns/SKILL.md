---
name: orchestration-patterns
description: Apply the concrete orchestration patterns (2-tier A–C, 3-tier D–F, multi-tier) to a customization design. Use when designer needs to pick and document interaction patterns and their official constraints in design-map.md. Preloaded by designer.
user-invocable: false
---

# orchestration-patterns（連携パターン適用）

連携パターン（2層 A〜C / 3層 D〜F / 多層）を適用する判断系 Skill。`designer` に preload されるため `context: fork` は付与しない。

## 参照正典
- `ORCHESTRATION.md §2.3`（2層 Pattern A〜C）・`§3.4`（3層 Pattern D〜F）・`§4`（多層）・`§5`（マトリクス）
- `BEST_PRACTICES.md §4`（オーケストレーション原則）

## パターンカタログ
| Pattern | 構成 | 適用 |
|---|---|---|
| **A** | メイン + L2 Skill（inline） | 短時間・対話的タスク。メイン文脈を継承 |
| **B** | メイン + L2 Skill（context:fork） | 長大探索。`agent:` 指定必須・actionable task 必須 |
| **C** | メイン + L3 Subagent（delegation） | 専門役割の継続利用。`description` 精度が的中率を決める |
| **D** | Subagent + preloaded Skill | 単一 Subagent 内の多段処理。preload は `disable-model-invocation:false` のみ |
| **E** | Subagent + MCP Tool | 外部サービス連携。`tools:` に MCP tool を許可 |
| **F** | Subagent + Hook 監視 | SubagentStart/Stop・PreToolUse で監査/遮断 |
| **多層** | Subagent nesting（既定3階層・可変）／ Agent Teams ／ /batch | 純粋多階層は既定3階層まで可（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整）。既定超や独立プロセス・相互通信は Agent Teams（Experimental⚠・nested team 不可）／ /batch（Phase 駆動） |
| **Dynamic Workflows** | `/workflows` | 数十〜数百 Subagent を制御。自動更新範囲外のため採用時は手動対応項目として明記する。 |

## 本システムが採用するパターン（参考）
メイン Claude（Slash Command Skill `/canon`）→ ワーカー Subagent → preload 生成 Skill の **3層 Pattern D 系**。Orchestrator をメイン Claude に置くのは nesting 禁止のためではなく（nesting は既定3階層まで可能）、inline 会話履歴の継承（ヒアリング往復）・ユーザー確認による工程遷移・harness 登録事情による（基本設計書 §4.1）。

## アンチパターン（`ORCHESTRATION.md §7`）
- Subagent を既定の深度上限（3階層）を超えてネスト（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で引き上げ可・nested team 不可）。
- fork から別の fork を spawn（named subagent は spawn 可）。
- ガイドラインのみの Skill を `context: fork`（subagent が何もせず終了）。
- 強制ブロックを CLAUDE.md に記述（advisory に過ぎない → Hook へ）。
- `disable-model-invocation:true` Skill を preload（エラー）。

## 出力（design-map への反映）
`## Interface Contracts` に採用パターンと各カスタマイズ間の呼び出し方向・データ受け渡し方法を記録する。
