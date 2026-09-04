---
name: agent-generation
description: Generate L3 Subagent definition files to canon schema. Use when agent-builder must produce .claude/agents/<name>/<name>.md entries — handles description (with Delegate when), minimal tools, model/effort, skills preload constraints, and isolation:worktree. Preloaded by agent-builder.
user-invocable: false
---

# agent-generation（L3: Subagents 生成）

Subagents スキーマ準拠の生成を担う。`agent-builder` に preload されるため `context: fork` は付与しない。`disable-model-invocation` も付与しない（preload 対象のため）。

## 参照正典
- `L3_AGENTS.md §2.1`（frontmatter 完全リファレンス・制約）
- `L3_AGENTS.md §4`（連携。preload Skill / MCP Tool / Hook との3層）
- `TOOLS.md`（`tools:` に書けるツール名の正規リファレンス）

## 配置（§2.1）
- `.claude/agents/<name>/<name>.md` または `.claude/agents/<name>.md`。ファイル名・ディレクトリ名は識別に無関係（識別は `name` のみ・一致は必須でない）。

## frontmatter 規約（§2.1）
- **`name` 必須**: 一意識別子（小文字+ハイフン）。`subagent_type` および Hook の `agent_type` の値になる。tree 全体で一意に。
- **`description` 必須**: 「何をするか + **Delegate when**（メインが委譲すべき条件）」を1〜2文。delegation 的中率は description の精度に依存するため、曖昧語を避け具体的トリガーを書く。
- `tools`: 最小権限集合。**本文の実操作から逆算して生成系（Write/Edit）・消費系（Read/Grep/Glob）を過不足なく宣言**する。未宣言は silent failure。**ツール名は `TOOLS.md` に実在するものだけ**。deny list は `disallowedTools`（camelCase）。
- `model` / `effort`: `model-selection` に従い割当（Subagent は親のティアを超えない）。設計判断系は `effort: high`。
- `skills`: preload する Skill のリスト。**`disable-model-invocation: true` の Skill は preload 不可**（公式制約・G7 が弾く）。
- **役割へファイル所有権を割り当てる設計**（design-map の `## Write Scopes` に当該役割の記載がある場合）:
  本文に「書込スコープ」節を設け、`## Write Scopes` の常設スコープ・宣言駆動の例外を逐語射影する。
  例外に該当する範囲外パスへの書込みが要件文書に明記されている場合のみ役割を問わず許可する設計では、
  本文の実行手順に3分岐の自己チェック（常設スコープ一致→続行／例外条件（対象表列挙 かつ 要件文書へ
  の明記）を満たす→続行し変更内容を完了報告に明記／いずれでもない→実装せず停止して報告）を明記する。
  PreToolUse hook はエージェント識別子を受け取れない設計（公式仕様）のため役割別の書込スコープを
  機構的に強制できない——この自己チェックが唯一の advisory な担保になる。
- `isolation: worktree`: ファイル衝突回避が必要な Builder に任意付与。
- `mcpServers`: 外部連携が必要な場合のみ。
- 本文で対象プロジェクトの非管理ファイル（`README.md`・`contracts/README.md` 等、canon の配置対象外）を出典として引用するときは**行番号でなく節見出しで参照する**（例:「README.md の『main への直接 push を防ぐ』節」）。行番号は対象側の編集で無言でずれ検知できない。G7 判定⑦がブロックする（詳細設計書 §11.2）。管理ファイル間（生成物同士）の行番号参照は対象外。

## 制約（§2.1・nesting）
- **Subagent nesting は既定3階層**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可）。深度上限で Agent tool が外れ打ち止め。多段委譲が不要な Subagent には本文に spawn 指示を書かない。spawn を抑止するなら `tools` から `Agent` を外す。fork は別の fork を spawn 不可。
- `context: fork` は Subagent frontmatter には存在しない（付与しない。Skill 側のキー）。
- Subagent に存在しないフィールド（`user-invocable`/`disable-model-invocation`/`handoffs`/`agents`）を付けない（G4 が未知キーとして弾く）。
- **Dynamic Workflows** は生成対象外（Claude が実行時に書く JS スクリプトで、静的スキーマが公式に存在しないため）。

## Plugin 同梱時の追加制約（`L5_DISTRIBUTION.md §2.1`）
Plugin に同梱する Subagent は `hooks`・`mcpServers`・`permissionMode` を使用不可（`isolation` は `worktree` のみ可）。

## 対象プロジェクト向け生成物と claude-canon 自身の区別（重要）
本 Skill が生成するのは**対象プロジェクト向けの Subagent**（`output/<ts>/generated/.claude/agents/**`）であり、これらが `tools:` に `Bash`/`PowerShell`/`Monitor` を持つのは正当（G13 の対象外）。claude-canon 自身のワーカー（`<canon_root>/.claude/agents/**`）のみが G13 でコマンド実行系を禁止される（詳細設計書 §11.4「G13 だけは向きが逆」）。

## 出力先
`output/<ts>/generated/.claude/agents/<name>/<name>.md`。design-map の `## Agents`・`## Model Assignments` を消費する。
