---
title: Claude Code 正典リファレンス 一次ソース一覧
description: docs/ 配下の正典リファレンス本体9ファイル（SOURCES.md 自身を除く）の根拠となる公式ドキュメントURLおよび調査状況の管理ファイル。
  /update-docs 実行時に canon-updater Subagent が最初に読み込む。
last_verified: 2026-08-29
maintained_by: canon-updater（/update-docs 実行時に自動更新）
---

## 概要

このファイルは `docs/` 配下の正典リファレンス本体9ファイル（`SOURCES.md` 自身を除く）の根拠となる一次ソース URL を管理する。
`/update-docs` を実行すると `canon-updater` Subagent がこのファイルを読み込み、
各 URL を WebFetch/WebSearch で調査して変更差分を検出し、対応する正典ファイルを更新する。

**調査の優先順位**: 各エントリの `priority` に従う。`high` は毎回必ず調査、`medium` は変更の可能性があるとき、`low` は構造変更時のみ。

---

## L1_CONTEXT_MANAGEMENT.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/memory | Memory（CLAUDE.md・Rules・Skills・Auto Memory） | high |
| https://code.claude.com/docs/en/settings | Settings（settings.json・permissions） | medium |
| https://code.claude.com/docs/en/context-window | Context window（コンテキスト予算・自動圧縮） | low |
| https://code.claude.com/docs/en/prompt-caching | Prompt caching（キャッシュ挙動） | low |
| https://code.claude.com/docs/en/sessions | Sessions（セッション永続化・resume） | low |
| https://code.claude.com/docs/en/checkpointing | Checkpointing（変更の巻き戻し） | low |
| https://code.claude.com/docs/en/claude-directory | `.claude/` ディレクトリ構造の全体像 | low |

---

## L2_SKILLS.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/skills | Skills（SKILL.md frontmatter・context:fork・preload） | high |
| https://code.claude.com/docs/en/commands | Slash Commands（/name・arguments・disable-model-invocation） | high |
| https://code.claude.com/docs/en/code-review | `/code-review` の引数仕様（low/medium/high/xhigh/max/ultra・--fix・--comment） | low |
| https://code.claude.com/docs/en/ultrareview | `/code-review ultra` のクラウドレビュー詳細 | low |

---

## L3_AGENTS.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/sub-agents | Subagents（frontmatter・tools・delegation・nesting既定3階層可変・fork） | high |
| https://code.claude.com/docs/en/agent-view | Agent View（バックグラウンドセッション一覧・引き続きResearch Preview） | medium |
| https://code.claude.com/docs/en/agent-teams | Agent Teams（Experimental・複数インスタンス協調） | low |
| https://code.claude.com/docs/en/worktrees | Worktrees（git worktree・isolation・bgIsolation） | medium |
| https://code.claude.com/docs/en/workflows | Dynamic Workflows（Claude 生成の .js スクリプトで Subagent を大規模制御・/workflows・ultracode・自動生成対象外） | medium |
| https://code.claude.com/docs/en/env-vars | 環境変数一覧（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`・`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`・`CLAUDE_CODE_FORK_SUBAGENT`・`CLAUDE_CODE_SUBAGENT_MODEL` 等の正式定義） | high |
| https://code.claude.com/docs/en/cross-session-messaging | Cross-session messaging（他セッションへの直接メッセージ送信・L3新規パターン候補） | low |
| https://code.claude.com/docs/en/model-config | Model config（`ANTHROPIC_DEFAULT_MODEL` 等モデル選択の詳細） | low |
| https://code.claude.com/docs/en/agent-sdk/subagents | Agent SDK の Subagent 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## L4_AUTOMATION.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/hooks | Hooks（31イベント・5ハンドラー・matcher・exit code・settings.json配線） | high |
| https://code.claude.com/docs/en/mcp | MCP Servers（transport・scope・OAuth・.mcp.json） | high |
| https://code.claude.com/docs/en/managed-mcp | Managed MCP（組織による固定server set配布・allowedMcpServers/deniedMcpServers） | medium |
| https://code.claude.com/docs/en/channels | Channels（Research Preview・リモート連携） | low |
| https://code.claude.com/docs/en/channels-reference | Channels 詳細リファレンス（Permission Relay のサニタイズ/マスキング仕様） | low |
| https://code.claude.com/docs/en/hooks-guide | Hooks ガイド（hooks.md とは別立ての導入ガイド） | low |
| https://code.claude.com/docs/en/routines | Routines（クラウド常駐スケジュール実行。scheduled-tasksの主要後継） | low |
| https://code.claude.com/docs/en/scheduled-tasks | Scheduled tasks（`/loop` のリファレンス） | low |
| https://code.claude.com/docs/en/agent-sdk/hooks | Agent SDK の Hooks 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## L5_DISTRIBUTION.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/discover-plugins | Plugins 概要・インストール | medium |
| https://code.claude.com/docs/en/plugins-reference | Plugin 仕様（manifest・.claude-plugin/・plugin root・Agent制約） | high |
| https://code.claude.com/docs/en/plugin-marketplaces | Marketplace 配布（archive/commandソース・GitLab対応・owner wildcard） | low |
| https://code.claude.com/docs/en/plugin-dependencies | Plugin依存関係解決（semver範囲・gitタグ解決） | medium |
| https://code.claude.com/docs/en/statusline | Status Line（Plugin UI拡張） | low |
| https://code.claude.com/docs/en/output-styles | Output Styles（Themes・Experimental） | low |
| https://code.claude.com/docs/en/plugins | Plugin作成ガイド（discover-plugins/plugins-referenceとは別立て） | low |

---

## ORCHESTRATION.md の一次ソース

> ORCHESTRATION.md は複数の公式ドキュメントを横断して整理したファイル。
> 以下は特にオーケストレーション設計に関係する URL。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/sub-agents | Subagent delegation パターン | high |
| https://code.claude.com/docs/en/skills | Skill inline 実行・context:fork パターン | high |
| https://code.claude.com/docs/en/agent-teams | 多層オーケストレーション（Agent Teams 経由） | low |
| https://code.claude.com/docs/en/commands | Slash Command 実行モデル | medium |

---

## BEST_PRACTICES.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/best-practices | 公式ベストプラクティス（コンテキスト管理・Subagent採用判断） | high |
| https://code.claude.com/docs/en/how-claude-code-works | Claude Code の動作原理 | medium |
| https://code.claude.com/docs/en/security | セキュリティアーキテクチャ（Manual/Auto権限・sandbox・プロンプトインジェクション対策） | high |
| https://code.claude.com/docs/en/permission-modes | Permission modes（default/acceptEdits/auto/dontAsk/bypassPermissions/plan/manual の全値集合・auto modeの既定化） | high |
| https://code.claude.com/docs/en/features-overview | 機能比較・トリガー表（00_INDEX §4フローチャートの一次ソース候補） | medium |
| https://code.claude.com/docs/en/common-workflows | 実践ワークフローレシピ集（scheduled実行4択比較表等） | low |
| https://code.claude.com/docs/en/sandboxing | Sandbox 設定の一次ソース候補（§7.5 の設定キー群がこのページか settings-reference のいずれに属すか未確認・要継続調査） | medium |
| https://code.claude.com/docs/en/sandbox-environments | Sandbox 実行環境の詳細 | low |
| https://code.claude.com/docs/en/auto-mode-config | Auto mode の設定詳細（`disableAutoMode` 等） | medium |
| https://code.claude.com/docs/en/large-codebases | 大規模コードベース向けワークフロー | low |
| https://code.claude.com/docs/en/agent-sdk/permissions | Agent SDK の Permission 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## 00_INDEX.md の一次ソース

> 00_INDEX.md は docs/ 全体の索引・用語集・機能選択フローを整理したファイル。
> 以下は全体構造の把握に必要な URL。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/ | 公式ドキュメントトップ（全体目次） | high |
| https://code.claude.com/docs/llms.txt | 機械読取用ドキュメント一覧 | high |
| https://code.claude.com/docs/en/changelog | Changelog（新機能・仕様変更の検知） | high |
| https://code.claude.com/docs/en/agents | Subagent/Agent View/Agent Teams/Dynamic Workflows横断ハブページ（§8対応表への追加候補） | medium |
| https://code.claude.com/docs/en/settings-reference | settings.json 全フィールドの横断リファレンス（`extraKnownMarketplaces`・`claudeMdExcludes`・`disableCommandPluginSources` 等の一次ソース） | medium |
| https://code.claude.com/docs/en/cli-reference | CLI フラグの横断リファレンス | low |
| https://code.claude.com/docs/en/interactive-mode | 対話モードの操作リファレンス | low |
| https://code.claude.com/docs/en/errors | エラーメッセージ・トラブルシューティングの横断リファレンス | low |
| https://code.claude.com/docs/en/glossary | 用語集 | low |

---

## TOOLS.md の一次ソース

> TOOLS.md は Claude Code の正規ツール名45種を同定する横断リファレンス。
> ツール名は L1（settings `permissions`）・L2（Skill `allowed-tools`）・L3（Subagent `tools`）・
> L4（Hook matcher・MCP）の4レイヤーから参照されるため、単一レイヤーに属さない。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/tools-reference | Tools reference（正規ツール名の網羅表・Permission required 列）**総数は公式が宣言しないため毎回再計数する** | high |
| https://code.claude.com/docs/en/sub-agents | Subagents（`Task`→`Agent` 改名・Subagent 非提供ツール・`tools` 省略時の全継承） | high |
| https://code.claude.com/docs/en/permissions | Permissions（MCP 命名規約 `mcp__<server>__<tool>`・glob の可否） | high |

---

## 調査手順（canon-updater 向け・機能X 実装契約・詳細設計書 §13.1）

`/update-docs` 実行時、`canon-updater` は2フェーズに分けて調査・更新を行う（更新ゲートの人間承認を挟む）。

**フェーズ1（調査・差分提案）**:
1. このファイル（`docs/SOURCES.md`）を Read で読み込む
2. `priority: high` の URL から順に WebFetch（失敗時は WebSearch で補う）で内容を取得する
3. 対応する `docs/` ファイルの現在の内容と比較し、変更差分**候補**を特定する（採否は判定しない）
4. `work/<ts>/canon-diff-proposal.md`（固定フォーマット・`.claude/agents/canon-updater/canon-updater.md` 参照）を書く。**この時点では `docs/` を書き換えない**（`canon-update-scope-guard` が更新ゲート承認前の `docs/` 書込を機械的に deny する）

**更新ゲート（人間承認・唯一の関門）**: `npm run approve -- <ts> canon-update` で採否と breaking 判定を確定する。

**フェーズ2（承認差分の反映）**:
5. 承認された差分のみを正典ファイルへ反映し、`last_verified`／確認バージョン欄を今日の日付・値に書き換える
6. このファイルの更新履歴に investigated_at の行を追記する
7. `npm run build:tables` で照合表を再生成する

**注意事項**:
- **WebFetch は長大な公式ページの網羅列挙で不安定**（実在しないコマンド名の混入を複数回観測済み）。単発の結果を鵜呑みにせず、複数回突合するか公式が総数を明記するページを優先する
- ツール総数・Hook イベント数・`[要確認]` マーカー総数などの**数え値は毎回再計数する**（前回の値をそのまま転記しない）
- WebFetch が失敗した URL は `[要確認]` 注記を対応する正典ファイルに追記し、スキップする
- 正典ファイルの構造（セクション番号・メタ情報）は維持したまま内容のみ更新する
- Experimental/Preview の区分変更（GA昇格等）は特に重点的に確認する

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-08-29 | 初版（v2.1.251 時点の一次ソース調査） |
| 2026-09-04 | `subagent_type` の登録可否に関する論点のみを調査（部分更新）。ファイル定義 agent が `subagent_type` として登録されるかは実行環境の種別ではなく `settingSources` の指定・ディレクトリ監視の状態・frontmatter の妥当性・programmatic 定義との名前衝突で決まる、という一次ソースの記述を確認。これに伴い `L3_AGENTS.md §2.1`（運用ノート2箇所）・`00_INDEX.md §9`（用語集 `subagent_type` 行）・`ORCHESTRATION.md §2.3` の「SDK/harness 環境では未登録」という環境種別による断定を、ネイティブ `subagent_type` 優先＋未登録環境に限るフォールバックの両対応表現へ改めた。あわせてフォールバック時に `general-purpose` の `tools: *` が G13 のコマンド実行系ツール剥奪を無効化する旨の明示を4箇所へ追加。調査した一次ソース: https://code.claude.com/docs/en/agent-sdk/claude-code-features ／ https://code.claude.com/docs/en/agent-sdk/subagents ／ https://code.claude.com/docs/en/agent-sdk/typescript ／ https://code.claude.com/docs/en/sub-agents ／ https://code.claude.com/docs/en/changelog 。**確認バージョンは v2.1.251 のまま据え置き**（本 run は本論点に限定した部分調査であり、v2.1.252〜259 の全変更を突合していないため） |
