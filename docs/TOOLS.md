# TOOLS: Claude Code 正規ツール名リファレンス

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md)（settings `permissions`） / [L2_SKILLS.md](./L2_SKILLS.md)（Skill `allowed-tools`） / [L3_AGENTS.md](./L3_AGENTS.md)（Subagent `tools` / `disallowedTools`） / [L4_AUTOMATION.md](./L4_AUTOMATION.md)（Hook matcher・MCP）

| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 正規ツール総数 | 45種（権限要 14 ＋ 権限不要 31） |
| 一次ソース（Tools reference） | https://code.claude.com/docs/en/tools-reference |
| 一次ソース（Subagents の tools 制御・旧称） | https://code.claude.com/docs/en/sub-agents |
| 一次ソース（MCP 命名規約） | https://code.claude.com/docs/en/permissions |
| 調査日 | 2026-08-29 |

---

## 1. 概要

本ファイルは**横断リファレンス**である（`ORCHESTRATION.md`・`BEST_PRACTICES.md` と同じ位置づけで、L1〜L5 のいずれか1レイヤーに属さない）。ツール名は L1（settings `permissions`）・L2（Skill `allowed-tools`）・L3（Subagent `tools`）・L4（Hook matcher・MCP）の4レイヤーから参照されるため、特定レイヤーの下位概念として置かない。

公式引用（`tools-reference` 冒頭）:
> "Claude Code has access to a set of built-in tools that help it understand and modify your codebase. The tool names are the exact strings you use in [permission rules], [subagent tool lists], and [hook matchers]. To disable a tool entirely, add its name to the `deny` array in your [permission settings]."

肝: 公式が「ツール名は permission rules / subagent tool lists / hook matchers で使う**厳密な文字列**である」と明言している。これが本ファイルを正典に置く根拠であり、`gates/` の G5 が名前照合を行う出典になる。

**重要な留保**（公式が明示）:
> "Your exact tool set depends on your provider, platform, and settings."

肝: 45種は**「正規な名前の全集合」であって「任意の環境で利用可能な集合」ではない**。G5 はこの区別を守らねばならない。「この名前は正規か」は判定してよいが、「この環境で使えるか」は本表からは判定できない。

## 2. 正規ツール名（全45種）

#### 全ツール（45種）

「Permission required」列は公式表の値をそのまま転記したものである。各ツールの説明は一次ソース（`tools-reference`）を参照すること（本ファイルは名前の同定を責務とし、説明の複製は行わない）。

| ツール名 | Permission required |
|---|---|
| `Agent` | No |
| `Artifact` | Yes |
| `AskUserQuestion` | No |
| `Bash` | Yes |
| `CronCreate` | No |
| `CronDelete` | No |
| `CronList` | No |
| `Edit` | Yes |
| `EndConversation` | No |
| `EnterPlanMode` | No |
| `EnterWorktree` | Yes |
| `ExitPlanMode` | Yes |
| `ExitWorktree` | No |
| `Glob` | No |
| `Grep` | No |
| `ListAgents` | No |
| `ListMcpResourcesTool` | No |
| `LSP` | No |
| `Monitor` | Yes |
| `NotebookEdit` | Yes |
| `PowerShell` | Yes |
| `PushNotification` | No |
| `Read` | No |
| `ReadMcpResourceTool` | No |
| `RemoteTrigger` | No |
| `ReportFindings` | No |
| `ScheduleWakeup` | No |
| `SendFeedback` | No |
| `SendMessage` | No |
| `SendUserFile` | No |
| `ShareOnboardingGuide` | Yes |
| `Skill` | Yes |
| `TaskCreate` | No |
| `TaskGet` | No |
| `TaskList` | No |
| `TaskOutput` | No |
| `TaskStop` | No |
| `TaskUpdate` | No |
| `TodoWrite` | No |
| `ToolSearch` | No |
| `WaitForMcpServers` | No |
| `WebFetch` | Yes |
| `WebSearch` | Yes |
| `Workflow` | Yes |
| `Write` | Yes |

**自己検算**: 権限要 14 ＋ 権限不要 31 ＝ 45。この2つの直交した数がいずれも表の実測と一致しない場合、本表は破損している（`gates/build-conformance-tables.js` が検査する）。

### 2.1 旧称・非推奨・既定無効

| 名前 | 区分 | 現在の扱い | 出典 |
|---|---|---|---|
| `Task` | **旧称（改名）** | `Agent` に改名済み。`Task(...)` は現在もエイリアスとして機能する（＝エラーにはならない。ただし正規名は `Agent`） | **sub-agents**（下記公式引用） |
| `TaskOutput` | **非推奨** | ツール自体は現存（§2 の45種に含む）。公式は `Read` での代替を推奨 | tools-reference |
| `TodoWrite` | **既定無効** | ツール自体は現存（§2 の45種に含む）。既定で無効 | tools-reference |
| `EndConversation` | **permission rule の例外** | Claude が呼び出し可能な他のツールを1件以上保持している限り、`EndConversation` には deny/ask ルールが適用されない（誤って会話終了を封じられないための設計） | permission-modes |

`Task` → `Agent` の公式引用（`sub-agents` ページ）:
> "In version 2.1.63, the Task tool was renamed to Agent. Existing `Task(...)` references in settings and agent definitions still work as aliases."

`TaskOutput` の公式引用（`tools-reference`）:
> "Retrieves output from a background task. Deprecated in favor of `Read` on the task's output file path."

`TodoWrite` の公式引用（`tools-reference`）:
> "Manages the session task checklist. Disabled by default as of v2.1.142 in favor of `TaskCreate`, `TaskGet`, `TaskList`, and `TaskUpdate`. Set `CLAUDE_CODE_ENABLE_TASKS=0` to re-enable"

肝: **公式が明記する改名は `Task`→`Agent` の1件のみ**である。他のツールについて公式は改名の記録を持たない。したがって「`MultiEdit` は旧称である」等の判断は正典からは導けない（§3 `[要確認]` 参照）。

### 2.2 MCP ツールの命名規約

公式引用（`permissions`）:
> "MCP rules use the server name as configured in Claude Code, optionally followed by the name of a tool from that server."

> "Deny and ask rules also accept glob patterns in the tool-name position. The pattern must match the full tool name: `"*"` matches every tool, and `"mcp__*"` matches every MCP tool across all servers."

| 形式 | 意味 |
|---|---|
| `mcp__<server>__<tool>` | 特定サーバの特定ツール |
| `mcp__<server>` | 当該サーバの全ツール |
| `mcp__<server>__*` | 当該サーバの全ツール（glob 形） |
| `mcp__*` | 全サーバの全 MCP ツール（**deny / ask のみ**） |
| `mcp__plugin_<plugin-name>_<server-name>__<tool-name>` | **plugin 同梱の MCP サーバ**（`A-Z a-z 0-9 _ -` 以外の文字は `_` に置換される） |

肝: allow ルールの glob は `mcp__<server>__` という**リテラル接頭辞の後にのみ**置ける（server セグメントに glob を書けない）。`mcp__*` を allow に書いても無視される。

### 2.3 Subagent の `tools` フィールド

公式引用（`sub-agents`）:
> "These tools are never available to any subagent, even if listed in the `tools` field:"

Subagent に提供されないツール（9種）:

| ツール名 | 条件 |
|---|---|
| `Agent` | Subagent nesting の深度上限に達した場合のみ不可（fork を除く。深度上限の fork では呼び出すとエラーを返す） |
| `AskUserQuestion` | 常に不可 |
| `EndConversation` | 常に不可 |
| `EnterPlanMode` | 常に不可 |
| `ExitPlanMode` | Subagent の `permissionMode` が `plan` の場合のみ可（それ以外は不可） |
| `ScheduleWakeup` | 常に不可 |
| `TaskOutput` | 常に不可 |
| `WaitForMcpServers` | 常に不可 |
| `Workflow` | 常に不可 |

**background Subagent への追加制限**（多くの委譲作業の既定である background 実行時のみ適用。fork は対象外）: 保持されるビルトインツールは `Read`・`Grep`・`Glob`・`Bash`・`PowerShell`・`Edit`・`Write`・`NotebookEdit`・`WebFetch`・`WebSearch`・`TodoWrite`・`Skill`・`ToolSearch`・`EnterWorktree`・`ExitWorktree`・`Monitor`・`TaskStop`・`SendMessage`・`Artifact` のみ（MCP ツールは全保持）。詳細は [L3_AGENTS.md §2.1](./L3_AGENTS.md) を参照。

公式引用（`sub-agents`・`tools` フィールド）:
> "`tools` | No | Tools the subagent can use. **Inherits every tool available to subagents if omitted.** If no entry in the list resolves to a tool, the subagent usually fails to launch with an error naming the entries. To preload Skills into context, use the `skills` field rather than listing `Skill` here"

肝: `tools` を**省略すると全ツールを継承する**（ただし継承先は「Subagent が利用可能な全ツール」であり、常にメイン会話と同一集合とは限らない）。最小権限を課すには明示列挙が要る。denylist 側は `disallowedTools`（**camelCase**）である。**列挙した名前が1件も解決できない場合、Subagent は通常エラーで起動失敗する**（該当エントリ名を報告）。Skill を preload するときは `Skill` をここに列挙せず `skills:` フィールドを使うこと（`skills:` は L3_AGENTS.md §2.1・全文が注入される）。

## 3. [要確認] 項目

| 項目 | 状況 | 検証方法 |
|---|---|---|
| ツール名の大文字小文字の厳密性 | **不明**。公式は "the exact strings" と述べるが `Read` と `read` の可否を明示していない。「exact strings」から case-sensitive を導くのは解釈であり断定しない | 実機で `tools: read` を与えた Subagent が起動するか |
| `Task` 以外の過去の改名の有無 | **不明**。公式が明記する改名は `Task`→`Agent` の1件のみ。`MultiEdit`・`NotebookRead` 等が過去に存在したかは公式から判定不能（存在した/しなかったのいずれも断定しない） | changelog の全走査 |
| 45種の網羅性の恒久性 | 公式は総数を宣言していない。**45 は本リファレンスが数えた値**である。公式が行を追加すると本表は黙って古くなり、G5 が新ツールを誤検出する。**実測**: 同一ページを複数回取得すると、要約モデル経由の**総数の集計回答**は取得のたびに値が揺れるが、**全行を列挙させた行単位照合は安定して一致する**。集計値を鵜呑みにせず行単位で照合する規律が要る（数え値は行単位列挙でのみ確定すること） | `/update-docs` のたびに再計数する（手順として固定・行単位列挙で照合すること） |

## 公式ドキュメント参照

| 節 | 一次ソース |
|---|---|
| §1・§2・§2.1 | https://code.claude.com/docs/en/tools-reference |
| §2.1（`Task`→`Agent`）・§2.3 | https://code.claude.com/docs/en/sub-agents |
| §2.2 | https://code.claude.com/docs/en/permissions |
