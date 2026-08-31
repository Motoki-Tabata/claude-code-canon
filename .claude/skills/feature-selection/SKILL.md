---
name: feature-selection
description: Select which Claude Code layer features (L1–L5, 8 customization features) a requirement needs, following the feature-selection flowchart. Use when selector must map collected requirements to features and flag Experimental dependencies. Returns a short feature list to the parent.
user-invocable: false
---

# feature-selection（機能選定）

機能選択フローチャートに沿って使用機能を選定する判断系 Skill。判断結果を親に短く返すだけなので `context: fork` は付与しない。

## 参照正典
- `00_INDEX.md §4`（機能選択フローチャート）
- `00_INDEX.md §4.4`（権限・許可制御の3段階）

## 選定フロー（`00_INDEX.md §4`）
要件ごとに入口の YES/NO ツリーを適用する:
- **Q1 毎セッション必ず必要な指示/知識か？** → YES: 固定指示/規約=**L1 CLAUDE.md**、パス別ルール=**L1 Rules**、Claude 自身の学習=**L1 Auto Memory**。
- **Q2 特定タスク発動時だけ呼べばよいか？** → YES: Claude 自動選択=**L2 Skills**、`/name` 明示=**L2 Slash Commands**、メイン文脈を汚さない=**L2 context:fork**。
- **Q3 実装作業を伴うか？**（並列性・隔離サブツリー） → 逐次専門=**L3 Subagents**、多段の専門サブタスク=**Subagent nesting（既定3階層・可変）**、衝突回避=**Worktree**、5〜30件同パターン=**/batch**、協調=**Agent Teams（Experimental⚠・nested team 不可）**、放流監視=**Agent View**、大規模・複雑なオーケストレーション=**Dynamic Workflows**。
- **Q3-NO 自動化・外部連携か？** → イベント自動実行=**L4 Hooks**、外部サービス連携=**L4 MCP**、外部イベント注入=**Channels（Research Preview⚠）**、再利用配布=**L5 Plugins**。

## 8カスタマイズ機能（候補）
CLAUDE.md(L1) / Rules(L1) / Skills(L2) / Subagents(L3) / Hooks(L4) / MCP(L4) / Plugins(L5) / モデル選定(横串)。Auto Memory・Worktree・LSP・Status Lines・Output Styles 等は対応レイヤーの生成 Skill が同一 Builder 内で扱う（独立 Builder を増やさない）。

## 権限制御の3段階（`00_INDEX.md §4.4`）
要件が「強制」を要する場合に強度を選ぶ: Advisory（CLAUDE.md）/ Deterministic（Hooks・exit 2）/ Enforced（settings.json permissions）/ OS-level（Sandbox/Worktree）。requirements.md の constraints で禁止された強度は選べない（例: hooks 禁止なら deterministic 不可）。

## Experimental 依存の明示
選定結果に Agent Teams / Monitors / Channels / Themes / `context: fork` / Dynamic Workflows への依存が含まれる場合は、それを**明示フラグ**として親に返す（後続で `design-map.md` の `## Experimental Dependencies` に集約され、constraints で禁止なら G11 が弾く）。Dynamic Workflows は実験機能ではないが**自動生成対象外（手動対応）**のため、依存する場合は明示フラグとして扱う。

> 層数（2層/3層）の選定は本 Skill では**行わない**。それは工程6の `designer` が `layer-design` で実施する。本 Skill は「使用機能と Experimental 依存の決定」に限定する（詳細設計書 §9.1）。
