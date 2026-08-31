# L4: 自動化・外部連携

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md)（advisory vs deterministic） / [L2_SKILLS.md](./L2_SKILLS.md)（Hooks との対比） / [L3_AGENTS.md](./L3_AGENTS.md)（agent handler） / [L5_DISTRIBUTION.md](./L5_DISTRIBUTION.md)（Plugin MCP） / [BEST_PRACTICES.md](./BEST_PRACTICES.md)

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース（Hooks） | https://code.claude.com/docs/en/hooks |
| 一次ソース（MCP） | https://code.claude.com/docs/en/mcp |
| 一次ソース（Managed MCP） | https://code.claude.com/docs/en/managed-mcp |
| 一次ソース（Channels） | https://code.claude.com/docs/en/channels |
| 一次ソース（Channels リファレンス） | https://code.claude.com/docs/en/channels-reference |
| 調査日 | 2026-08-29 |

---

## 1. 概要レイヤー（What & When）

### 1.1 機能の目的

L4 は **イベント駆動の自動化 / 外部システム連携** を扱うレイヤーです。L1〜L3 が「Claude にどう振る舞わせるか」を制御するのに対し、L4 は **ライフサイクルイベントへ自動応答** したり、**外部サービス（GitHub・Jira・Slack・DB等）とプログラム連携** したり、**外部からセッションへイベントを注入** する仕組みを提供します。

### 1.2 含まれる機能一覧

| 機能名 | 一言説明 | 主な用途 |
|---|---|---|
| **Hooks** | ライフサイクルイベント（31種）で自動実行（5種のhandler） | コマンドブロック、自動lint、検証、通知 |
| **MCP**（Model Context Protocol） | 外部ツール・サービスをClaudeのツールとして接続 | GitHub/Jira/Slack/DB等の連携、社内API |
| **Channels** | 外部から既存セッションへイベントPush（MCP push model） | Telegram/Discord/iMessage 経由のチャットブリッジ、Webhook受信 |

### 1.3 いつ使うか（採用判断基準）

#### 採用すべき状況（DO）
- 危険なコマンド（`rm -rf` 等）を**確実にブロック**したい → **Hook PreToolUse**（exit code 2）
- ファイル編集後に **自動 lint/format** したい → Hook PostToolUse
- セッション開始時に **動的に context を投入**（git branch、open issues 等） → Hook SessionStart
- **同じデータを毎回チャットに貼り付けている** → **MCP**（GitHub/Jira/Sentry/DB）
- 外出中に **モバイルから Claude を呼びたい** → **Channels**（Telegram/Discord/iMessage）
- CI/モニタリングのイベントを **既に開いているセッションに通知** → Channels（webhook receiver）

#### 採用すべきでない状況（DON'T）
- **行動指針として優しくお願いしたい** → L1 CLAUDE.md（advisory）が適切
- **ユーザー/Claude が能動的に発動する手順** → L2 Skills が適切
- **専門役割の継続的委譲** → L3 Subagents が適切
- **Hook 内で長時間処理を直接実行** → `async: true` または別プロセス委譲
- **本番運用で実験機能に依存** → Channels は Research Preview なので注意

#### 他レイヤーとの使い分け

| 比較対象 | L4 を選ぶ基準 | 他レイヤーを選ぶ基準 |
|---|---|---|
| **L1 CLAUDE.md** | 確実に実行/ブロックしたい（deterministic） | 助言的指針で十分（advisory） |
| **L2 Skill** | イベントで自動発火 | ユーザー/Claude が能動的に発動 |
| **L3 Subagent** | イベント駆動の自動検証 | 専門役割の継続的代理 |

公式引用（[best-practices](https://code.claude.com/docs/en/best-practices) "Set up hooks" 節）:
> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

---

## 2. 詳細レイヤー（How）

### 2.1 Hooks

#### 仕組み
セッション中のライフサイクルイベント（プロンプト送信、ツール呼び出し前後、サブエージェント起動など）に対し、`settings.json` で定義した handler（command/http/mcp_tool/prompt/agent のいずれか）を発火させる。Handler の **stdout JSON または exit code** によって Claude の動作を制御できる。

#### 全 Hook イベント（31種）

現在31種のイベントが定義されている（公式 hooks ページの列挙と一致）。`MessageDisplay` は表示専用イベントで、`hookSpecificOutput.displayContent` により画面表示テキストを差し替え可能（transcript と Claude が見る内容は元のまま）。

**セッション層（2種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `SessionStart` | セッション開始・再開 | ❌ |
| `SessionEnd` | セッション終了時 | ❌ |

> **`SessionStart` のペイロード拡張**: resume 時の `SessionStart` hook は、セッションの staleness（陳腐化度）と再キャッシュ推定コストを受け取る（matcher `resume` に紐づくペイロード拡張。`hooks` ページ本文での裏取りは未了）。

**セットアップ層（2種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `Setup` | `--init-only`/`--init`/`--maintenance` 起動時 | ❌ |
| `InstructionsLoaded` | CLAUDE.md/`.claude/rules/*.md` ロード時 | ❌ |

**ターン層（4種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `UserPromptSubmit` | ユーザープロンプト送信時 | ✅ |
| `UserPromptExpansion` | スラッシュコマンド展開時 | ✅ |
| `Stop` | Claude応答完了時 | ✅（連続8回 block でターン強制終了。`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で変更可） |
| `StopFailure` | APIエラーでturn終了時 | ❌ |

**エージェンティックループ層（9種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `PreToolUse` | ツール呼び出し前 | ✅ |
| `PostToolUse` | ツール呼び出し成功後 | ❌ |
| `PostToolUseFailure` | ツール呼び出し失敗後 | ❌ |
| `PostToolBatch` | 並列ツール呼び出し全体完了後 | ✅ |
| `PermissionRequest` | パーミッションダイアログ時 | ❌（exit code 2 は honored されず、パーミッションフローはそのまま進行する。deny するには `decision` オブジェクトを使う） |
| `PermissionDenied` | auto modeで拒否時 | ❌（retry可） |
| `SubagentStart` | サブエージェント起動時 | ❌ |
| `SubagentStop` | サブエージェント終了時 | ✅ |
| `TaskCreated` | TaskCreate でタスク作成時 | ✅ |

**その他エージェント関連（3種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `TaskCompleted` | タスク完了マーク時 | ✅ |
| `TeammateIdle` | Agent Teams teammate idle直前 | ✅ |
| `Notification` | 通知送信時 | ❌ |

**ファイル・環境監視層（6種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `FileChanged` | 監視ファイル変更時 | ❌ |
| `CwdChanged` | 作業ディレクトリ変更時 | ❌ |
| `DirectoryAdded` | `/add-dir` や SDK `register_repo_root` でmid-session時にディレクトリが追加されたときに発火 | ❌ |
| `ConfigChange` | 設定ファイル変更時 | ✅ |
| `WorktreeCreate` | `--worktree` で worktree 作成時 | ✅ |
| `WorktreeRemove` | worktree 削除時 | ❌ |

**UI・コンテキスト層（5種）**

| イベント | 発火タイミング | Block可 |
|---|---|---|
| `MessageDisplay` | アシスタントメッセージ表示中 | ❌ |
| `PreCompact` | コンテキスト圧縮前 | ✅ |
| `PostCompact` | コンテキスト圧縮後 | ❌ |
| `Elicitation` | MCP serverがユーザー入力要求時 | ✅ |
| `ElicitationResult` | ユーザー応答後 | ✅ |

> **合計**: 2+2+4+9+3+6+5 = 31種。`MessageDisplay` は UI・コンテキスト層の5種に含まれており、`DirectoryAdded` はファイル・環境監視層の6種に含まれる（31種のうちの1つ）。

> **[要確認: changelog v2.1.251 は `PreModelSwitch`／`PostModelSwitch` の追加を宣言するが、`hooks` リファレンスページは3回の独立取得すべてで31件のまま両名が確認できていない。次回再検証]**
>
> - **`changelog` v2.1.251**: "Added `PreModelSwitch` and `PostModelSwitch` hook events (block, confirm, or annotate a model switch)" と**追加を明記**。
> - **`hooks` リファレンスページ**: 独立した3回の取得（それぞれ別プロンプト）すべてで **`SessionStart` から `SessionEnd` までの同一の31件のみ**を列挙し、`PreModelSwitch`／`PostModelSwitch` は一度も現れない。うち2回は「両名は存在しない」と明示的に否定した。3回目でモデル切替に言及する文として返ったのは無関係な一文（"A hook process inherits the parent environment, so it can read `$ANTHROPIC_MODEL` if you set it in your shell, but that value doesn't change when you switch models with `/model` during a session."）のみ。
> - 補足: `hooks-guide` ページも取得したが、応答が大きすぎて要点抽出に至らなかったため**この観点での裏取りは未了**である。
>
> したがって「hooks ページに無い」ことは**取得できた範囲についてのみ**成立し、イベントが存在しないことの証明ではない。**本正典は上表のイベント総数を31のまま変更せず、両イベントを表へ追加しない**（次回 `/update-docs` で再検証する）。

#### Handler 5種

##### 共通フィールド
```json
{
  "type": "command|http|mcp_tool|prompt|agent",
  "if": "Bash(git *)",        // permission rule構文（toolイベントのみ）
  "timeout": 600,             // 秒
  "statusMessage": "string",  // カスタムスピナーメッセージ
  "once": true                // skill frontmatterのみ
}
```

##### Type 1: `command`（シェル実行）
```json
{
  "type": "command",
  "command": "string",
  "args": ["array (optional)"],
  "async": false,
  "asyncRewake": false,
  "shell": "bash",
  "timeout": 600
}
```
- **exec form** (`args` フィールドが**存在**する場合。空配列 `[]` を含む): `command` を
  実行ファイル名として直接プロセス起動する。シェルを介さない＝**語分割・引用符除去・
  リダイレクト/パイプ・シェル変数展開は行われない**（`${CLAUDE_PROJECT_DIR}` 等の Claude Code
  テンプレート変数の置換は起動前に行われるが、置換結果は「単一の実行ファイル名」として扱われる）。
- **shell form** (`args` フィールドを**省略**): `sh -c`（Unix）/ PowerShell（Windows）経由。
  引用符・スペース・シェル変数展開が効く。`command` にコマンド行を書くならこちら。
- `UserPromptSubmit` のみ既定 timeout 30秒

> **⚠️ 落とし穴（実測・配線の生存検証に関連）**: `"args": []` は「引数なし」ではなく
> **「exec form を ON にする」**を意味する。ここに `"command": "node \"${CLAUDE_PROJECT_DIR}/gates/x.js\""`
> のような**シェル用コマンド行（プログラム名＋引数・スペース・引用符）**を書くと、`node "..."`
> 全体が1個の実行ファイル名として spawn され失敗する。hook は**黙って落ち**、PreToolUse なら
> **ツールがそのまま素通り（silent allow）**する——npm test（ロジック）は緑のまま配線だけが
> 沈黙する典型（§11.5 の vacuous pass）。実際に決定論ゲート全 hook がこの書式で沈黙していた。
> **規則**: node スクリプトを回すなら次の**どちらか**にし、混在させない。
> - shell form: `"command": "node \"${CLAUDE_PROJECT_DIR}/gates/x.js\""`（`args` を書かない）← 本プロジェクトの採用形
> - exec form : `"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/gates/x.js"]`（実行ファイルと引数を分離）

##### Type 2: `http`（HTTPエンドポイント）
```json
{
  "type": "http",
  "url": "string",
  "headers": { "Authorization": "Bearer $TOKEN" },
  "allowedEnvVars": ["TOKEN"],
  "timeout": 600
}
```
- 2xx 空応答: success
- 2xx プレーンテキスト: context へ追加
- 2xx JSON: JSON output としてパース
- 非2xx / timeout: non-blocking error
- ブロックする: 2xx で `{"decision": "block"}` または `{"hookSpecificOutput": {"permissionDecision": "deny"}}`

##### Type 3: `mcp_tool`（MCP ツール呼び出し）
```json
{
  "type": "mcp_tool",
  "server": "string",
  "tool": "string",
  "input": { "file_path": "${tool_input.file_path}" },
  "timeout": 600
}
```

##### Type 4: `prompt`（Claudeへ追加プロンプト）
```json
{
  "type": "prompt",
  "prompt": "Should Claude execute: $ARGUMENTS",
  "model": "haiku",
  "timeout": 30
}
```
既定モデル: fast model（Haiku class）。timeout 既定 30秒

##### Type 5: `agent`（Subagent を spawn）
```json
{
  "type": "agent",
  "prompt": "Review for security issues: $ARGUMENTS",
  "model": "sonnet",
  "timeout": 60
}
```
既定 timeout 60秒。L3 Subagent と同じ実行モデル。

#### Exit code セマンティクス（command handler）

| Exit code | 動作 |
|---|---|
| **0** | 成功。stdout を JSON としてパース |
| **2** | **Blockingエラー**。stderr が Claude へフィードバックされる。効果はイベント依存 |
| 1/その他 | Non-blocking error。stderr は transcript 表示のみ |

> hook の stdout に「`{…}` に見えるが妥当な JSON ではない文字列」がある場合、パースメッセージ付きの hook エラーとして報告される。
>
> バックグラウンドセッションで `PermissionRequest` / `PreToolUse` hook が不正な応答を出力したときは、無言で待ち続けず `claude agents` の行に hook 名とスキーマエラーが表示される。

#### Matcher 構文

```json
"matcher": "*"                   // 全マッチ
"matcher": "Bash"                // 完全一致
"matcher": "Edit|Write"          // OR
"matcher": "^Notebook.*"         // 正規表現
"matcher": "mcp__memory__.*"     // MCP tool パターン
"matcher": ""                    // 全マッチ
```

イベント別マッチ対象:
- `PreToolUse`/`PostToolUse`: ツール名
- `SessionStart`: `startup`/`resume`/`clear`/`compact`/`fork`（`fork` は `/subtask` 由来の fork セッション起動時にマッチ）
- `SessionEnd`: `clear`/`resume`/`logout`/`prompt_input_exit`
- `Notification`: `permission_prompt`/`idle_prompt`/`auth_success`
- `SubagentStart`/`SubagentStop`: agent type
- `PreCompact`/`PostCompact`: `manual`/`auto`
- `ConfigChange`: `user_settings`/`project_settings`/`local_settings`
- `CwdChanged`, `FileChanged`, `WorktreeCreate`/`Remove`: **マッチャー非対応**（常に発火）

`if` 条件（tool イベントのみ）:
```json
"if": "Bash(git *)"     // Bash サブコマンド "git *"
"if": "Edit(*.ts)"      // Edit で .ts ファイルのみ
"if": "Bash(rm *)"      // rm コマンド
```

#### JSON Output 共通フィールド
```json
{
  "continue": true,
  "stopReason": "...",
  "suppressOutput": false,
  "systemMessage": "...",
  "terminalSequence": "...",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "...",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "...",
    "retry": true
  }
}
```

**`terminalSequence`**: ターミナルエスケープシーケンスを直接出力するフィールド。`/dev/tty` 不使用環境でのデスクトップ通知・ウィンドウタイトル・ベル音に使用。許可されるシーケンス: OSC 0/1/2（タイトル）、OSC 9（通知）、BEL など。CSI シーケンス（カーソル・色）は禁止。

**`Stop`/`SubagentStop` での additionalContext**: `hookSpecificOutput.additionalContext` を返すと、ターンを継続してそのコンテキストを会話に追加できる。

#### スコープ階層（解決優先順）
1. **Managed policy settings**（組織、最優先）
2. **Plugin hooks**
3. **Project**（`.claude/settings.json`）
4. **Local**（`.claude/settings.local.json`）
5. **User**（`~/.claude/settings.json`）

> **プロジェクトレベル settings の制約**:
> - プロジェクトレベル `.claude/settings.json` の `env` は `CLAUDE_CONFIG_DIR` / `CLAUDE_CODE_TMPDIR` / `TMPDIR` / `TMP` / `TEMP` を設定できない（shell・user・managed settings で設定すること）。
> - managed / project settings 由来の `ANTHROPIC_CUSTOM_HEADERS` が資格情報・org/tenant・ルーティング・API 挙動系ヘッダー（`Authorization`・`Host` 等）を設定する場合、承認が必要になる。
>
> （前者は [L1_CONTEXT_MANAGEMENT.md §2.3](./L1_CONTEXT_MANAGEMENT.md) の Auto Memory カスタム保存先にも波及する）

#### Path Placeholder
- `${CLAUDE_PROJECT_DIR}` — プロジェクトルート
- `${CLAUDE_PLUGIN_ROOT}` — プラグインインストール先
- `${CLAUDE_PLUGIN_DATA}` — プラグイン永続データ

#### Skill/Subagent frontmatter内 Hooks
```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

#### 完全な設定例（複数イベント）

`.claude/settings.json`:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/load-context.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh",
            "args": ["${tool_input.file_path}"],
            "timeout": 60
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "npm test",
            "shell": "bash",
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

#### 公式コード例 1: 危険な `rm` をブロック

`.claude/hooks/block-rm.sh`:
```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive command blocked by hook"
    }
  }'
else
  exit 0
fi
```

入力（stdin）:
```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "rm -rf /tmp/build" },
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

出力（stdout、exit 0）:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Destructive command blocked by hook"
  }
}
```

#### 公式コード例 2: SessionStart で開発コンテキスト注入

`.claude/hooks/load-context.sh`:
```bash
#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
ISSUES=$(gh issue list --state open --limit 3 2>/dev/null | cut -f1,2 || echo "")

jq -n \
  --arg branch "$BRANCH" \
  --arg uncommitted "$UNCOMMITTED" \
  --arg issues "$ISSUES" \
  '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: ("Current branch: \($branch)\nUncommitted changes: \($uncommitted)\nOpen issues:\n\($issues)"),
      sessionTitle: $branch
    }
  }'

exit 0
```

#### 公式コード例 3: Agent handler によるセキュリティレビュー

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "agent",
            "prompt": "Review this command for security issues: $ARGUMENTS. Return JSON with {\"decision\": \"allow\" or \"deny\"}",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

---

### 2.2 MCP（Model Context Protocol）

#### 仕組み
**MCP は AI-tool 統合のオープン標準**。MCP server を Claude Code に登録すると、その server の tools / resources / prompts が Claude のツールとして利用可能になる。

公式定義（引用）:
> "MCP servers give Claude Code access to your tools, databases, and APIs."

#### 採用判断（公式）
> "Connect a server when you find yourself copying data into chat from another tool, like an issue tracker or a monitoring dashboard. Once connected, Claude can read and act on that system directly instead of working from what you paste."

#### Transport（4種）

##### HTTP（推奨）
```bash
claude mcp add --transport http <name> <url>

# 実例: Notion
claude mcp add --transport http notion https://mcp.notion.com/mcp

# Bearer token 付き
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"
```
JSON設定では `type: "streamable-http"` も `type: "http"` のエイリアス。

##### SSE（**廃止予定**）
```bash
claude mcp add --transport sse asana https://mcp.asana.com/sse
```
> "The SSE (Server-Sent Events) transport is deprecated. Use HTTP servers instead, where available."

##### Stdio（ローカル）
```bash
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable \
  -- npx -y airtable-mcp-server
```
- `--` 以降がコマンド本体
- `CLAUDE_PROJECT_DIR` 環境変数が自動セットされる

##### WebSocket（`type: "ws"`）

```json
{
  "mcpServers": {
    "ws-server": {
      "type": "ws",
      "url": "wss://mcp.example.com/ws",
      "headers": { "Authorization": "Bearer ${API_KEY}" }
    }
  }
}
```

- `http` と**同じフィールド**（`url` / `headers` / `headersHelper` / `timeout` / `alwaysLoad`）を受け付ける
- **認証はヘッダーのみ**（OAuth フローは対象外）
- **`claude mcp add --transport` フラグは `ws` を受け付けない** → `.mcp.json` / `claude mcp add-json` で定義する

#### Scope（3種 + Plugin + claude.ai）

| Scope | Loads in | Shared with team | 保存先 |
|---|---|---|---|
| **local**（既定） | 現プロジェクトのみ | ❌ | `~/.claude.json` |
| **project** | 現プロジェクトのみ | ✅ via VCS | `.mcp.json` |
| **user** | 全プロジェクト | ❌ | `~/.claude.json` |

**優先順位（同名サーバー）**: Local > Project > User > Plugin > claude.ai connectors

#### 設定ファイル（`.mcp.json`）の例

##### HTTP server with OAuth
```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

##### Stdio local
```json
{
  "mcpServers": {
    "local-weather": {
      "type": "stdio",
      "command": "/path/to/weather-cli",
      "args": ["--api-key", "abc123"],
      "env": { "CACHE_DIR": "/tmp" }
    }
  }
}
```

##### Plugin MCP（`.mcp.json` at plugin root）
```json
{
  "mcpServers": {
    "database-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_URL": "${DB_URL}" }
    }
  }
}
```

#### 環境変数展開（`.mcp.json` 内）
- `${VAR}`: **未設定かつ既定値なしでも config はロードされる**。`claude mcp list` に missing-variable の警告が出て、**未展開の `${VAR}` がそのまま値として使われる**——接続は当然失敗するが、失敗の仕方は「パースエラー」ではなく「変な値で接続を試みる」である点に注意
- `${VAR:-default}`: デフォルト値
- 展開対象: `command`, `args`, `env`, `url`, `headers`

#### サーバー管理コマンド
```bash
claude mcp list
claude mcp get <name>
claude mcp remove <name>
claude mcp add-json <name> '<json>'
claude mcp add-from-claude-desktop
claude mcp reset-project-choices
claude mcp serve              # Claude Code自身を MCP server として提供

# セッション中
/mcp                          # サーバー一覧、認証フロー、トラブルシュート
```

**一覧表示の状態表記**: `claude mcp list` / `claude mcp get` は**無効化されたサーバーへ接続を試みず**、状態のみを表示する。

| 表示 | 意味 |
|---|---|
| `⊘ Disabled` | 無効化されたサーバー（接続を試みない） |
| `⏸ Pending approval` | `.mcp.json` 由来で、まだ承認していないサーバー |
| `✘ Rejected (see disabledMcpjsonServers in settings)` | 拒否済みのサーバー |

**trust ダイアログを要する定義**: project `.mcp.json` の `headersHelper`、および project ／ `--add-dir` 由来の agent ファイル内に**インラインで書かれた MCP サーバー**は、当該フォルダの trust ダイアログ承認を要する（`claude -p` でも同様）。また plugin / project / agent 由来の helper は、**継承した資格情報系の環境変数なしで**実行される。

#### OAuth 2.0 認証フロー
1. `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`
2. セッション内で `/mcp`
3. ブラウザで login
4. トークンは自動的に安全に保存・リフレッシュ

**手動オプション**:
- `--callback-port 8080`: 固定ポート（事前登録 redirect URI 用）
- `--client-id` / `--client-secret`: Dynamic Client Registration 非対応サーバー向け
- `authServerMetadataUrl`: メタデータ発見URLを上書き
- `oauth.scopes`: スコープを固定
- `headersHelper`: Kerberos / 短期トークン等の動的ヘッダー生成（**詳細は次項**）

#### `headersHelper`（動的ヘッダー生成）

公式 MCP ページの "Use dynamic headers for custom authentication" 節が根拠。

**実行モデル**:

| 項目 | 仕様 |
|---|---|
| 出力形式 | helper は **stdout に「文字列 key-value の JSON」**を書く。そのマップが HTTP ヘッダーになる |
| 実行方法・timeout | **シェル経由**で実行し、**10秒**で打ち切る |
| 実行頻度 | **接続ごと**（セッション開始・再接続のたび）に毎回実行し、**結果をキャッシュしない** |
| 静的 `headers` との関係 | 動的ヘッダーは**同名の静的 `headers` を上書き**する |
| 401/403 時 | ツール呼び出しが 401/403 を返すと **helper を再実行して1回だけリトライ**する |

**helper に渡される環境変数**:

| 変数 | 内容 |
|---|---|
| `CLAUDE_CODE_MCP_SERVER_NAME` | 対象サーバー名 |
| `CLAUDE_CODE_MCP_SERVER_URL` | 対象サーバー URL |
| `CLAUDE_PLUGIN_ROOT` | **plugin 由来のサーバーのときのみ**設定される |

**作業ディレクトリ**:

| 宣言元 | 作業ディレクトリ |
|---|---|
| plugin | plugin root |
| project `.mcp.json` / local scope / プロジェクト内の agent ファイル / SDK / `--mcp-config` | **起動ディレクトリ** |
| user scope / managed MCP / claude.ai connector / プロジェクト**外**の agent ファイル | **config ディレクトリ** |

**信頼と資格情報の扱い**:
- **project `.mcp.json` / local scope の helper は、フォルダの trust ダイアログを承認したあとにのみ実行される**。未 trust の間は**静的 `headers` のみで接続**し、`-p` / SDK では `headersHelper not run` を stderr に出力する
- **自分で書いていない helper には資格情報系の環境変数を渡さない**: 変数名に `TOKEN` / `SECRET` / `PASSWORD` / `KEY` / `AUTH` / `COOKIE` / `PAT` / `DSN` / `CREDENTIAL(S)` 等を含むものは除去される。`url` がそれらを展開している場合は `CLAUDE_CODE_MCP_SERVER_URL` 側も `REDACTED` になる
- **plugin 由来の `headersHelper` は `${user_config.*}` を参照できない**。plugin の設定値を渡すには `${CLAUDE_PLUGIN_OPTION_<KEY>}` 環境変数を使う（[L5_DISTRIBUTION.md §2.1](./L5_DISTRIBUTION.md) の shell-form 制約も参照）

#### Tool 命名規約
```
mcp__<server>__<tool>
例: mcp__memory__create_entities
    mcp__github__search_repositories

# plugin 同梱の MCP サーバー
mcp__plugin_<plugin-name>_<server-name>__<tool-name>
```
- リソース: `mcp://...`
- プロンプト: `/mcp__<server>__<promptname>`
- **plugin 同梱サーバーのツール名**は `mcp__plugin_<plugin-name>_<server-name>__<tool-name>` 形式。`A-Z a-z 0-9 _ -` 以外の文字は `_` に置換される（permission rule / hook matcher で指定するときはこの変換後の名前を使う。[TOOLS.md §2.2](./TOOLS.md) にも反映済み）

#### Tool Search（既定 ON）
MCP tool を起動時にロードせず、Claude が必要時に `ToolSearch` で検索する仕組み。コンテキスト圧迫を回避。

| `ENABLE_TOOL_SEARCH` | 動作 |
|---|---|
| 未設定 | 全 MCP tool 遅延（Vertex/proxyでは fallback で upfront） |
| `true` | 強制有効 |
| `auto` | 10%閾値内で upfront、超過分のみ defer |
| `auto:N` | カスタム閾値（N%） |
| `false` | 完全無効 |

個別サーバー除外: `alwaysLoad: true`
```json
{
  "mcpServers": {
    "core-tools": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "alwaysLoad": true
    }
  }
}
```

#### 出力制限
- 警告閾値: **10,000 tokens**
- 既定上限: **25,000 tokens**（`MAX_MCP_OUTPUT_TOKENS` で変更）
- ツール側で `_meta["anthropic/maxResultSizeChars"]` 設定可（最大 500,000 文字）

#### その他制御
- `MCP_TIMEOUT`（ms）: サーバー起動timeout
- サーバー `timeout` フィールド: ツール呼び出しtimeout（ms）
- `list_changed` notification: 動的ツール更新対応
- 自動再接続: HTTP/SSE 5回（指数バックオフ）、初回接続 3回
- **2分超のツール呼び出しは自動的にバックグラウンド化**: `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS` で閾値変更・無効化可
- **診断表示のシークレットマスキング**: MCP診断はスコープ競合警告で解決済みシークレットではなく設定済みの `${VAR}` 形式のまま表示し、接続失敗の詳細もサーバーのオリジンのみを表示する

#### MCP の挙動

- **`requiresUserInteraction` の許可プロンプト**: `requiresUserInteraction` マークの MCP ツールの許可プロンプトから「Yes, and don't ask again」は表示されない（当該オプションはツールが無視する allow ルールを書いてしまうため）。
- **SDK MCP のハンドシェイク喪失**: SDK MCP サーバーのハンドシェイク応答が失われた場合、70秒でタイムアウトし当該サーバーのみ failed 扱いにする（全体をハングさせない）。
- **中断された MCP ツール呼び出し**: headless/remote セッションで受信メッセージに中断された MCP ツール呼び出しは「completed with no output」ではなく明示的な interrupted エラーとしてモデルへ報告される。

（`mcp` ページ本文での裏取りは未了）

#### MCP elicitation（サーバーがユーザー入力要求）
- Form mode: フィールドダイアログ
- URL mode: ブラウザ認証フロー
- Hook `Elicitation` で auto-respond 可

#### Managed MCP Configuration（組織）
- `managed-mcp.json` で固定 server set 配布（配置パス: macOS `/Library/Application Support/ClaudeCode/managed-mcp.json`、Linux/WSL `/etc/claude-code/managed-mcp.json`、Windows `C:\Program Files\ClaudeCode\managed-mcp.json`）
- `allowedMcpServers` / `deniedMcpServers` で制限（`serverUrl`/`serverCommand`/`serverName` マッチ・ワイルドカード対応）
- `allowManagedMcpServersOnly` / `allowAllClaudeAiMcps` の全体スイッチ
- 詳細は一次ソース [managed-mcp](https://code.claude.com/docs/en/managed-mcp) を参照

#### hooks 系設定の副作用: `/goal` の利用可否

公式に、hooks 系の組織制御が `/goal` を巻き込むことが明記された（出典: [goal](https://code.claude.com/docs/en/goal)）:

- **`allowManagedHooksOnly`（managed settings）が設定されていると `/goal` が利用不可になる**
- **`disableAllHooks: true`（設定優先順位適用後）でも同様**

いずれのケースも「黙って何もしない」のではなく**理由を表示する**。`/goal` はセッションスコープの prompt ベース Stop hook のラッパーであるため、hooks を封じる設定が `/goal` にも波及する（[BEST_PRACTICES.md §1.3 / §3.4](./BEST_PRACTICES.md) も参照）。

---

### 2.3 Channels（Research Preview）

#### 仕組み
**Channel は MCP server が「セッションへ event を push」する仕組み**。Claude が外出中・別作業中でも、外部から既存のセッションへメッセージや通知を投入できる。

公式定義（引用）:
> "A channel is an MCP server that pushes events into your running Claude Code session, so Claude can react to things that happen while you're not at the terminal."

#### 要件
- Anthropic認証（claude.ai または Console API key）
- **Bedrock / Vertex / Foundry では非対応**
- Team / Enterprise: 管理者の有効化必須（既定 OFF）
- Channel plugin は **Bun** 必須

#### 公式提供チャネル（Research Preview）

| プラットフォーム | プラグイン | 認証 |
|---|---|---|
| **Telegram** | `telegram@claude-plugins-official` | BotFather token |
| **Discord** | `discord@claude-plugins-official` | Developer Portal bot token + Message Content Intent |
| **iMessage** | `imessage@claude-plugins-official` | macOS Full Disk Access、`~/Library/Messages/chat.db` 直読 |
| **fakechat**（demo） | `fakechat@claude-plugins-official` | localhost http://localhost:8787 |

#### Telegram 設定例（完全フロー）
```bash
# 1. BotFatherで /newbot して token 取得

# 2. プラグインインストール（セッション内）
/plugin install telegram@claude-plugins-official
/reload-plugins

# 3. トークン設定（~/.claude/channels/telegram/.env に保存）
/telegram:configure <token>

# 4. チャネル有効化で再起動
claude --channels plugin:telegram@claude-plugins-official

# 5. bot にメッセージ送信 → pairing code 受領
# 6. Claude内で承認
/telegram:access pair <code>
/telegram:access policy allowlist   # ロックダウン
```

複数チャネルの同時起動:
```bash
claude --channels plugin:telegram@claude-plugins-official plugin:discord@claude-plugins-official
```

#### Security（Sender Allowlist）
- 各 channel plugin が allowlist 維持
- **allowlist に無い sender からのメッセージは silently drop**
- Telegram / Discord: pairing code でブートストラップ
- iMessage: 自分宛は自動許可、他者は `/imessage:access allow <handle>`
- **`.mcp.json` 登録だけでは push できない**: `--channels` で session ごとに opt-in 必要

#### Permission Relay
- Channel server が `claude/channel` capability に permission relay を含めると、allowlist sender がツール使用承認/拒否を **リモートから** 可能
- ⚠️ allowlist sender は実質的に Claude を遠隔操作できる → 信頼できる相手のみ allow
- **プレビュー内容のサニタイズ**: リレーされる `description`/`input_preview` はサニタイズされてから送信される
- **認証情報マスキング**: リレーされるプレビューは登録済み channel server にのみ配信され、プロバイダAPIトークン等の資格情報は `[REDACTED]` としてマスキングされる（承認者に見える範囲からコマンド/パス/宛先を隠す）
- 詳細な仕様は一次ソース [channels-reference](https://code.claude.com/docs/en/channels-reference) を参照

#### Enterprise Controls（Managed Settings）
```json
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [
    { "marketplace": "claude-plugins-official", "plugin": "telegram" },
    { "marketplace": "claude-plugins-official", "plugin": "discord" },
    { "marketplace": "acme-corp-plugins", "plugin": "internal-alerts" }
  ]
}
```

| 既定 | claude.ai Team/Enterprise | Console API key | Pro/Max個人 |
|---|---|---|---|
| Channels | 無効（管理者有効化必須） | 有効 | 有効 |

#### 開発・テスト
- `--dangerously-load-development-channels`: allowlist 回避（テスト用）
- 公式プラグインソース: https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins
- カスタムchannel構築: `/en/channels-reference` 参照

#### Channels と他の外部統合機能の比較

| Feature | 動作 | 適用例 |
|---|---|---|
| **Claude Code on the web** | フレッシュクラウドsandboxで実行 | 自己完結async work |
| **Claude in Slack** | `@Claude` メンションで新規 web session 起動 | チーム会話起点 |
| **MCP server**（push なし） | Claude がタスク中に query | 読取/問い合わせ on-demand |
| **Remote Control** | claude.ai / モバイルから操縦 | 進行中session操縦 |
| **Channels** | 既存sessionへ外部から event push | チャットブリッジ、webhook receiver |

---

## 3. L4 横断: 比較表

### 3.1 自動化機構の比較

| 機構 | 発火 | 強度 | 主用途 | スコープ |
|---|---|---|---|---|
| **Hooks** | ライフサイクルイベント | Deterministic（exit 2でブロック） | 検証、自動lint、SessionStartコンテキスト注入 | Hook hierarchy（managed/plugin/project/local/user） |
| **MCP** | Claudeが必要時に呼出 | Tool呼出ベース | 外部システム連携（GitHub/Jira/DB） | local/project/user/plugin |
| **Channels** | 外部からpush | Event injection | webhook受信、モバイルからのチャット | Plugin + `--channels` opt-in |

### 3.2 Hook vs Skill vs Subagent

| 観点 | Hook | Skill | Subagent |
|---|---|---|---|
| 発動 | ライフサイクル自動 | ユーザー/Claude能動 | Claude が delegation 判断 |
| 強度 | Deterministic | Advisory | Context 分離型委譲 |
| 適用例 | `rm -rf` ブロック | `/code-review` ワークフロー | 専門 reviewer 役 |

### 3.3 セキュリティ 3 層防御

公式が示す制御強度の階層:

1. **Permission rules**: `/permissions` / `settings.json.permissions` で tool 全体を allow/deny
2. **Hook decision**: `PreToolUse` hook の `permissionDecision: "deny"` で個別呼び出しブロック
3. **Sandbox / OS-level**: `/sandbox` / Worktree 隔離 / Managed Policy

---

## 4. L4 固有のベストプラクティス

> 横断原則は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。

### 4.1 Hooks 推奨事項（Do）
- 危険操作（`rm -rf`、本番環境への変更、シークレット出力）は **PreToolUse + exit 2** で確実にブロック
- 長時間処理は `async: true` または別プロセス委譲（hook timeout 内に終わらせる）
- `${CLAUDE_PROJECT_DIR}` を使ってプロジェクト相対パスを安全に解決
- 共有したい hook は `.claude/settings.json`（git管理）、個人用は `.claude/settings.local.json`（gitignore）
- 複雑な検証は `agent` handler で subagent に委譲
- `SessionStart` で動的コンテキスト（branch、open issues）を注入し、CLAUDE.md を肥大化させない

### 4.2 Hooks アンチパターン（Don't）
- Hook 内で **無限ループ**（PostToolUse hook が自身を発火する設計）
- Hook で **長時間の同期処理**（timeout超過）
- `PreToolUse` hook で **権限のないコマンドを勝手に実行**
- `command` handler で **未エスケープのユーザー入力をシェルへ渡す**（command injection）

### 4.3 MCP 推奨事項（Do）
- 採用判断: 「同じデータを何度も貼り付けている」を満たすときに導入
- HTTP transport を優先（SSE は廃止予定）
- 認証情報は **環境変数経由** で `.mcp.json` 内 `${VAR}` 展開
- チーム共有: `.mcp.json`（project scope、git 管理）
- 大量 MCP tool 接続時は Tool Search 既定 ON のまま運用
- 信頼できる server のみ追加（prompt injection リスク警告）

### 4.4 MCP アンチパターン（Don't）
- API key を `.mcp.json` 直書きで git にコミット
- 信頼できない server に Full Disk Access 相当の権限を与える
- `ENABLE_TOOL_SEARCH=false` で大量 MCP server を upfront ロード（context圧迫）
- `mcpServers` の name に `workspace` を使う（予約名）

### 4.5 Channels 推奨事項（Do）
- 本番自動化は **Hooks + MCP** で構成し、Channels は **対話的なリモート操作** に限定（Research Preview）
- allowlist policy を `policy allowlist` で必ずロックダウン
- Permission relay の有効化は **信頼できる sender のみ**
- 組織配布前に Enterprise Controls で `allowedChannelPlugins` を絞る

### 4.6 Channels アンチパターン（Don't）
- Allowlist policy を `open` のままにする（任意の人からプロンプト注入可）
- `--dangerously-load-development-channels` を本番運用で使う
- 機微情報の扱いを Channels 越しに行う（メッセージは外部プラットフォーム経由）

---

## 5. このファイルの `[要確認]` 項目

| 項目 | セクション | 検証方法 |
|---|---|---|
| 各 Hook イベントのペイロードJSON完全スキーマ | 2.1 | 公式 hooks リファレンスの各イベント節を精読 |
| Channels のWWW-Authenticate header詳細 | 2.3 | channels-reference を精読 |
| Hook `if` 条件のpermission rule構文完全仕様 | 2.1 | 公式 permissions ドキュメントと突合 |

---

## 6. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Hooks | https://code.claude.com/docs/en/hooks |
| MCP | https://code.claude.com/docs/en/mcp |
| Channels | https://code.claude.com/docs/en/channels |
| Channels reference（カスタム構築） | https://code.claude.com/docs/en/channels-reference |
| Managed MCP | https://code.claude.com/docs/en/managed-mcp |
| Permissions | https://code.claude.com/docs/en/permissions |
| 日本語版（Hooks） | https://code.claude.com/docs/ja/hooks |
