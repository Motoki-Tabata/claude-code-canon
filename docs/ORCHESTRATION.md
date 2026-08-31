# オーケストレーション専用リファレンス（2層・3層パターン）

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L2_SKILLS.md](./L2_SKILLS.md) / [L3_AGENTS.md](./L3_AGENTS.md) / [L4_AUTOMATION.md](./L4_AUTOMATION.md) / [BEST_PRACTICES.md](./BEST_PRACTICES.md)

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース | Subagents / Skills / Agent Teams / Hooks / Worktrees の公式ドキュメント群（[00_INDEX.md §8](./00_INDEX.md)） |
| 調査日 | 2026-08-29 |

> 📌 **Subagent nesting**: 既定3階層まで自身の subagent を spawn できる（`1` で無効化を含め `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可能）。並行実行数にも既定20の上限がある（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`）。詳細は [L3_AGENTS.md §2.1 nesting](./L3_AGENTS.md) を参照。
>
> 📌 **Agent Teams**: セッションごとに暗黙の1チーム。nested team（teammate が teammate を spawn）は不可。
>
> 📌 **Subagent は既定でバックグラウンド実行**される（foreground はメインが結果を即必要とするときのみ）。オーケストレーション設計上、委譲した subagent は非同期に並走し得る前提で扱うこと（結果は完了時にメイン会話へ返る）。詳細は [L3_AGENTS.md §2.1](./L3_AGENTS.md)。

> ⚠ **重要**: 「2層」「3層」は本リファレンス独自の整理用語です。公式の "Claude Code" ドキュメント内に "two-tier" / "three-tier" / "2層" / "3層" / "orchestration hierarchy" 等の表記は **見当たりません**。公式は **Subagents**（単一セッション内 delegation）と **Agent Teams**（複数インスタンス協調）という分類を使用します（[L3_AGENTS.md](./L3_AGENTS.md) 参照）。

---

## 1. オーケストレーションの基本概念

### 1.1 何を解決するのか

ユーザー要件を Claude Code が実装するとき、しばしば **「単一の Claude セッション」では非効率／不可能** な状況が生じます:

1. **メイン会話のコンテキスト汚染**: 大量の探索結果・ログ・grep出力がメイン履歴を埋め尽くす
2. **役割の混在**: 設計・実装・レビュー・テストを一人で抱えると判断が混線する
3. **並列性の不足**: 5〜30ファイルの同一パターン変換を逐次やると時間がかかる
4. **ツール権限の過剰**: 全ての処理がフルツール権限を持つ必要はない（読み取り専用で十分なタスクも）
5. **再利用性**: 同じワークフローを何度も口頭で指示している

オーケストレーションは、**これらを「複数の独立した実行単位を組み合わせる」ことで解決する設計手法** です。Claude Code は L2 Skill / L3 Subagent / L4 Hook / L5 Plugin を組み合わせて、ユーザー要件に応じた構成を実現できます。

### 1.2 構成要素（L1〜L5 のオーケストレーション関与）

| レイヤー | オーケストレーションでの役割 |
|---|---|
| **L1 CLAUDE.md / Rules** | 全実行単位に共通の前提知識を渡す（Subagent agent type により非ロード可） |
| **L2 Skills** | 一時的・呼び出し駆動のワークフロー。`context: fork` で subagent 化可能 |
| **L3 Subagents** | 専門役割の継続的代理。独立 context window |
| **L3 Worktree** | ファイル衝突を物理隔離する基盤 |
| **L3 `/batch`** | 5〜30件のワークユニット並列実行 |
| **L3 Agent Teams** | 複数 Claude Code インスタンスの協調 |
| **L4 Hooks** | ライフサイクルイベントで自動発火する制御層 |
| **L4 MCP** | 外部サービスをツールとして接続 |
| **L5 Plugins** | オーケストレーション一式を配布パッケージ化 |

### 1.3 「2層」「3層」の本リファレンス独自定義

| 用語 | 本リファレンスでの定義 |
|---|---|
| **2層オーケストレーション** | メイン Claude + 1段下の専門実行単位（Skill または Subagent）の構成 |
| **3層オーケストレーション** | メイン Claude + Subagent + さらに下の Skill/Tool/別Subagent（公式制約あり） |
| **多層オーケストレーション** | Agent Teams を中間層に挟む、または `/batch` + Subagent の並列構成 |

公式の対応概念:
- 2層 ≒ "Subagent delegation"（公式: "Subagents work within a single session and can only report back to the main agent"）
- 3層（Subagent→Subagent）≒ **公式裏付けあり**（"a subagent can spawn its own subagents"、既定3階層・可変）。次節「公式制約」参照

### 1.4 公式が明示する制約

| 制約 | 公式記述 | 影響 |
|---|---|---|
| **Subagent nesting は既定3階層・可変** | "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. [...] To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`." | 純粋な多階層（Subagent→Subagent）は**既定3階層まで可**（環境変数で調整可）。深度上限で `Agent` tool が外れる |
| **fork は fork を spawn 不可** | "A fork still cannot spawn another fork" | fork からは named subagent のみ spawn 可（深さに数える） |
| **`context: fork` の actionable task 必須** | "context: fork only makes sense for skills with explicit instructions" | guideline-only skill を fork すると subagent が何もせず終了 |
| **Plugin Agent の `hooks`/`mcpServers`/`permissionMode` 非対応** | セキュリティ上の制約 | Plugin agent は通常 subagent より制約が厳しい |
| **Agent Teams の nested team 不可** | "No nested teams: teammates cannot spawn their own teammates" | teammate は teammate を作れない（lead のみ管理） |
| **`disable-model-invocation: true` skill の preload 不可** | "You can't preload skills that set `disable-model-invocation: true`, since preloading draws from the same set of skills Claude can invoke." | Subagent の `skills:` フィールドで指定不可 |

**結論**: Subagent 内から別 Subagent を呼ぶ多階層は許可されており、**既定3階層まで**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可）が上限。既定を超える深さが必要なとき、または各実行単位を独立プロセス・相互通信させたいときは環境変数を上げるか **Agent Teams 経由**（teammate 各自がフル Claude Code セッション。ただし team の入れ子は不可）または **`/batch` 経由**（同 phase 内での並列）を用いる。

---

## 2. 2層オーケストレーション

### 2.1 構成図

```
┌─────────────────────────────┐
│  [Layer 1] Main Claude Code │
│  - CLAUDE.md (全階層ロード) │
│  - Git status               │
│  - Tool access (フル)       │
└──────────────┬──────────────┘
               │ 呼び出し / 委譲
               ▼
┌─────────────────────────────┐
│  [Layer 2] 専門実行単位     │
│   ┌─────────────────────┐   │
│   │ L2 Skill            │   │   ← inline実行 or context:fork
│   │ または              │   │
│   │ L3 Subagent         │   │   ← 独立context window
│   └─────────────────────┘   │
└──────────────┬──────────────┘
               │ summary / tool結果
               ▼
       Layer 1 へ返却
```

### 2.2 適用条件

#### 採用すべき状況
- **単一の専門タスクを委譲したい**: コードレビュー、セキュリティ監査、テスト実行
- **メインの context を汚染したくない**: 大量の探索結果・grep結果がでる調査
- **ツール権限を制限したい**: 読み取り専用で実行させたい検証タスク
- **再利用したい**: 何度も実行する同一ワークフロー

#### 採用すべきでない状況
- 単発の短時間処理 → メイン Claude で inline 実行で十分
- 複雑な多段制御 → 多層構成（§4）または `/batch` を検討
- メインの会話履歴に強く依存するタスク → Subagent/Skill は履歴非継承

### 2.3 実装パターン

#### パターン A: メイン + L2 Skill（inline実行）

```
ユーザー → メイン Claude → /code-review 発動
                    ↓ (inline: skill content を会話履歴に注入)
                Skill body 実行 (メイン文脈で tool calls)
                    ↓
                結果が会話履歴に残る
```

- メイン会話の文脈を継承
- skill body は会話履歴に残存
- 短時間・対話的タスク向け

#### パターン B: メイン + L2 Skill（`context: fork`）

```
ユーザー → メイン Claude → /skill (context: fork) 発動
                    ↓ (subagent spawn: 独立context)
                Subagent が agent type で実行
                    ↓
                summary のみメインに返却
```

- メイン context は綺麗に保たれる
- agent type で CLAUDE.md/git ロード制御
- 長時間・verbose な探索向け

#### パターン C: メイン + L3 Subagent（delegation）

```
ユーザー → メイン Claude → ユーザー要求分析
                    ↓
                Subagent description と照合
                    ↓ (delegation)
                Subagent が独立context で task 実行
                    ↓
                summary をメインに返却
```

- 専門役割を継続的に持たせる
- Project / User / Plugin スコープで再利用
- `description` の精度が delegation の的中率を決める

#### Custom Subagent の起動方式（`subagent_type` と本システムのワークアラウンド）

カスタム Subagent は、公式 Claude Code CLI では `Agent` tool の `subagent_type` に**カスタム agent 名**（frontmatter の必須 `name`）を直接指定して起動できる（自動 delegation / @メンション / `--agent` も同じ識別子を使う。詳細は [L3_AGENTS.md §2.1](./L3_AGENTS.md)）。`subagent_type` がビルトイン型に限定されるわけではない。

ただし**本システムの運用環境（Claude Agent SDK / harness）では、`.claude/agents/` 配下のファイル定義 agent が `subagent_type` として登録されない**（ビルトイン型のみ露出）。そのため canon の orchestrator・メンテナンス Skill は、各専門 agent を次の方式で起動して同等動作を得る:

```
Agent(subagent_type="general-purpose", model=<タスクに応じて opus/sonnet>)
  ↓ プロンプトに明示注入
  「.claude/agents/<name>/<name>.md を Read して、その定義（手順・制約・返却形式）に従うこと」
  + 定義が preload する Skill があれば Skill 内容も読ませる
```

| 観点 | 公式 CLI ネイティブ | 本システム（SDK/harness） |
|---|---|---|
| 呼び出し | `subagent_type: design-architect` | `subagent_type: general-purpose` + 定義ファイル Read 注入 |
| 識別子 | frontmatter 必須 `name` | ディレクトリ名（`<name>/<name>.md`）を注入パスで指定 |
| Skill preload | frontmatter `skills:` で自動 | プロンプトで明示的に読ませる |
| model | frontmatter `model:` | Agent 起動時の `model` 引数で指定 |

⚠ この方式は「`subagent_type` がビルトイン型しか受け付けない」ためではなく、**当該環境で canon agent が `subagent_type` 未登録**であるための回避策。CLI ネイティブで `subagent_type` 起動するには frontmatter 必須 `name:` の付与が要る（`.claude/agents/**` は人間の実装作業で直す。機能X の `canon-updater` は `docs/` のみを更新し `.claude/` は書き換えない——波及の**検出**は G15 が担うが、修正の実行は人間の仕事のまま・`/update-system` 相当の自動反映は実装しない）。

### 2.4 完全な実装例

#### 実装例 1: Pattern A — `/code-review` Skill による即時レビュー

`.claude/skills/code-review/SKILL.md`:
```yaml
---
name: code-review
description: Review the current git diff for bugs, missing tests, hardcoded values, and security issues. Use when the user asks for a code review, wants to check changes before commit, or asks "is this ready to merge?".
allowed-tools: Read Grep Bash(git *)
---

## Context

!`git diff HEAD`

!`git status --short`

## Instructions

Review the diff above and report:

1. **Bugs**: Any logic errors, off-by-one, null/undefined risks
2. **Tests**: Missing test coverage for changed code paths
3. **Security**: Hardcoded credentials, SQL injection risk, unsafe input
4. **Style**: Inconsistent with surrounding code

For each finding, cite the file and line number. If the diff is empty, say there are no uncommitted changes.
```

呼び出し:
```
/code-review
```

実行モデル: メイン会話の継続として、diff/status を含む skill body が注入され、Claude が分析結果を返す。

---

#### 実装例 2: Pattern B — `context: fork` による隔離探索

`.claude/skills/explore-codebase/SKILL.md`:
```yaml
---
name: explore-codebase
description: Investigate how a feature is implemented across the codebase. Use when the user asks "how does X work" or "where is Y defined" and a thorough multi-file investigation is needed.
context: fork
agent: Explore
argument-hint: "<feature-or-symbol>"
---

Investigate the implementation of: $ARGUMENTS

Steps:
1. Find all files referencing this feature using Grep
2. Read the most relevant 3-5 files in full
3. Trace the call hierarchy from entry point to lowest level
4. Identify the data structures, error handling, and edge cases
5. Note any related tests

Report:
- Summary of how it works (3-5 sentences)
- Key files and line ranges (use file:line format)
- Dependencies and integration points
- Potential issues or technical debt
```

呼び出し:
```
/explore-codebase user authentication flow
```

実行モデル: 独立 subagent（`Explore` agent type）が CLAUDE.md/git status 非ロードで起動し、探索を実施。メインには summary のみ返却される（大量の grep 結果はメイン会話に残らない）。

---

#### 実装例 3: Pattern C — Custom Subagent によるセキュリティレビュー

`.claude/agents/security-reviewer/security-reviewer.md`:
```yaml
---
description: Review code for security vulnerabilities including SQL injection, XSS, hardcoded credentials, unsafe deserialization, and authentication/authorization flaws. Delegate when the task involves security audit, vulnerability assessment, or code review with security focus.
tools: Read Grep Bash(git *)
disallowedTools: Write Edit
model: sonnet
isolation: worktree
---

You are a security-focused code reviewer. Your role is to identify vulnerabilities without modifying code.

## Analysis approach

1. **Threat model first**: What inputs cross trust boundaries? What sensitive data is at risk?
2. **Pattern scan**: Search for known anti-patterns:
   - String concatenation in SQL queries
   - innerHTML / dangerouslySetInnerHTML with user input
   - Hardcoded API keys, tokens, passwords
   - Unsafe deserialization (pickle, eval, YAML.load)
   - Missing authentication on protected endpoints
3. **Flow analysis**: Trace user-controlled input to sensitive sinks
4. **Configuration review**: Check secrets management, env var leaks

## Report format

For each finding:
- **Severity**: Critical / High / Medium / Low
- **File**: `path/to/file.ext:LINE`
- **Issue**: One-sentence description
- **Reproduction**: Minimal example or attack vector
- **Mitigation**: Specific code-level fix

Never modify code yourself; only report.
```

メインから自動 delegation:
```
ユーザー: 「このAPIエンドポイントに脆弱性がないかチェックして」
  ↓ Claude が description に基づき delegation 判断
Subagent (security-reviewer) が isolation: worktree で起動
  ↓ 独立 context で grep/read 実行
レポートをメインに返却
```

### 2.5 2層オーケストレーションの選択基準

| 要件 | 推奨パターン |
|---|---|
| 短時間・対話的タスク（即レビュー） | Pattern A（inline Skill） |
| 長時間探索・verbose 出力 | Pattern B（Skill `context: fork`） |
| 専門役割の継続的利用 | Pattern C（Custom Subagent） |
| ツール制限が必要 | Pattern B（agent type）または Pattern C（`disallowedTools`） |
| ファイル衝突回避が必要 | Pattern C（`isolation: worktree`） |

---

## 3. 3層オーケストレーション

### 3.1 構成図

```
┌─────────────────────────────────────┐
│  [Layer 1] Main Claude Code         │
└──────────────┬──────────────────────┘
               │ delegation
               ▼
┌─────────────────────────────────────┐
│  [Layer 2] Subagent (中間制御層)    │
│  - 独立 context window               │
│  - 専用 system prompt                │
│  - 限定 tool access                  │
└──────────────┬──────────────────────┘
               │ 呼び出し（公式制約あり）
               ▼
┌─────────────────────────────────────┐
│  [Layer 3] Skill / MCP Tool / Hook  │
│           / 別 Subagent             │
│  - Skill: 一時的ワークフロー         │
│  - MCP Tool: 外部サービス            │
│  - Hook: ライフサイクル自動化        │
│  - 別 Subagent: 可（既定3階層）      │
└─────────────────────────────────────┘
```

### 3.2 公式制約の再確認

公式が **許可**:
- ✅ Subagent から別 Subagent を spawn（"a subagent can spawn its own subagents"）。**既定3階層**まで（深度上限で Agent tool が外れ打ち止め、`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可）
- ✅ Subagent が preloaded Skill（frontmatter `skills:`）を参照
- ✅ Subagent が許可された MCP Tool を呼び出し
- ✅ Subagent 内で発生するイベントが Hook を発火

公式が **依然禁止/制限**:
- ❌ 既定の深度上限（3階層）を超える Subagent ネスト（環境変数で引き上げは可能）
- ❌ fork から別の fork を spawn（named subagent は可）
- ❌ Agent Teams の nested team（teammate は teammate を spawn 不可）

**結論**: 3層構成は **Subagent → Skill / Tool / Hook / 別 Subagent（既定3階層・可変）** まで可能である。深いネストや独立プロセス・相互通信が必要なら環境変数を上げるか Agent Teams / `/batch` を併用する。

### 3.3 適用条件

#### 採用すべき状況
- Subagent 自身に **多段の専門処理** を実行させたい
- Subagent から **外部サービス**（MCP）を呼ばせたい
- Subagent の動作を **Hook で監視・制御**したい

#### 採用すべきでない状況
- 単純なタスク → 2層で十分
- 既定の深度上限（3階層）を超えるネストや、各実行単位の独立プロセス・相互通信が必要 → `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` を上げるか Agent Teams / `/batch` を検討

### 3.4 実装パターン

#### パターン D: Subagent + Preloaded Skill

Subagent が **frontmatter で Skill を preload** し、内部で呼び出す:

`.claude/agents/refactor-helper/refactor-helper.md`:
```yaml
---
description: Refactor a function or module while preserving behavior. Delegate when the user asks to refactor, simplify, extract, or rename code at a non-trivial scope.
tools: Read Edit Grep Bash(npm test*)
skills: [code-review, write-tests]
model: sonnet
---

You are a refactoring specialist. Your workflow:

1. **Analyze**: Use Grep/Read to map the current structure
2. **Plan**: Identify the minimal change to achieve the refactor goal
3. **Execute**: Edit files in small steps
4. **Validate**: Run tests after each step (npm test)
5. **Self-review**: Invoke `/code-review` skill to verify quality
6. **Test coverage**: If tests are missing, invoke `/write-tests`

Always preserve existing behavior. If you cannot, report the conflict.
```

⚠ **制約**: `skills:` で preload できるのは `disable-model-invocation: true` でない Skill のみ。

#### パターン E: Subagent + MCP Tool（外部サービス連携）

Subagent の `tools` フィールドで MCP tool を許可:

`.claude/agents/issue-resolver/issue-resolver.md`:
```yaml
---
description: Investigate, fix, and PR a GitHub issue end-to-end. Delegate when the user gives an issue number and asks to "fix this", "resolve issue #N", or "implement the ticket".
tools: Read Edit Grep Bash(git *) mcp__github__get_issue mcp__github__create_pull_request mcp__github__add_comment
model: sonnet
isolation: worktree
---

You are an issue-resolution specialist. Workflow:

1. Use `mcp__github__get_issue` to fetch issue details
2. Investigate the codebase to identify required changes
3. Implement the fix in worktree
4. Run tests
5. Use `mcp__github__create_pull_request` to open PR
6. Use `mcp__github__add_comment` to link PR back to the issue

Report the PR URL and a brief summary.
```

`.mcp.json` 側で `github` MCP server を設定済みであることが前提:
```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GITHUB_PAT}" }
    }
  }
}
```

#### パターン F: Subagent + Hook 監視

Subagent 内のツール呼び出しを Hook で監視:

`.claude/settings.json`:
```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "issue-resolver",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/log-subagent-start.sh",
            "args": []
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
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm-in-subagent.sh"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "issue-resolver",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/log-subagent-stop.sh"
          }
        ]
      }
    ]
  }
}
```

→ Subagent 起動/終了の監査ログ、Subagent 内の危険コマンド遮断を実現。

### 3.5 完全な実装例: 「Issue 解決 Subagent + MCP + Hook」3層構成

#### Layer 1: メイン Claude
ユーザーが「GitHub issue #4521 を解決して」と依頼。

#### Layer 2: `issue-resolver` Subagent
description にマッチし delegation。`isolation: worktree` で独立 worktree 起動。

#### Layer 3: MCP Tool + Hook

```
[Subagent issue-resolver]
   │
   ├─ Hook PreToolUse 発火 (毎ツール呼び出し前にチェック)
   │
   ├─ mcp__github__get_issue を呼び出し → issue 詳細取得
   ├─ Read / Grep でコード調査
   ├─ Edit で修正実装
   ├─ Bash で `npm test` 実行
   ├─ mcp__github__create_pull_request で PR 作成
   └─ mcp__github__add_comment で issue にコメント
   │
   └─ Hook SubagentStop 発火 → 終了ログ記録
```

メインへの返却:
> "Issue #4521 を解決しました。PR: https://github.com/.../pull/4523 — テスト全通過、レビュー待ち。"

---

## 4. 多層オーケストレーション（公式制約の回避手法）

### 4.1 Agent Teams 経由の多層構成

Agent Teams は **各 teammate がフル Claude Code セッション** であるため、teammate が独自に Subagent を spawn できる。これにより実質的な多層構成が可能。

```
[Main Claude / Team Lead]
   │
   ├─ Teammate 1 (フル Claude Code session)
   │    ├─ Subagent A (専門レビュー)
   │    └─ Subagent B (テスト実行)
   │
   ├─ Teammate 2 (フル Claude Code session)
   │    ├─ Subagent C (探索)
   │    └─ /batch で 5 件並列リファクタ
   │
   └─ Shared Task List + Mailbox（teammate間メッセージング）
```

#### 適用例
- **複雑な機能実装**: 設計担当 teammate + 実装 teammate + テスト teammate が協調
- **コードレビューの専門分業**: Security teammate + Performance teammate + Style teammate が並行レビューし、Lead が統合

⚠ 実験機能（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 必須）。本番依存は慎重に。セッションごとに暗黙の1チームで、teammate は Agent tool で直接 spawn する。**nested team 不可**（teammate は teammate を spawn できない）。詳細は [L3_AGENTS.md §2.3](./L3_AGENTS.md)。

### 4.2 `/batch` 経由の並列多層構成

`/batch` は **3 フェーズ（Explore → Parallel Execute → Summary）** で、Phase 2 では複数の Subagent が独立 worktree で並列実行する。

```
[Main Claude]
   │
   ├─ /batch refactor TypeScript imports
   │   │
   │   Phase 1 (Explore)
   │   ├─ codebase 分析
   │   └─ 5〜30 work unit に分割
   │
   │   Phase 2 (Parallel Execute)
   │   ├─ Subagent 1 (worktree A) → 各々が必要なら Skill 呼び出し
   │   ├─ Subagent 2 (worktree B)
   │   ├─ ... (並列)
   │   └─ Subagent N (worktree Z)
   │
   │   Phase 3 (Summary)
   │   └─ 各 PR 結果を統合
```

各 Subagent は **`/batch` Phase 2 の制御下で独立実行** されるため、Subagent nesting 制約には抵触しない。

---

## 5. 要件別 手法選択マトリクス

ユーザー要件から **最適なオーケストレーション構成** を導出する判断表です。

### 5.1 タスクの性質別

| 要件 | 推奨構成 | 理由 |
|---|---|---|
| 単発の短時間タスク | 単層（メインで inline） | オーケストレーション不要、オーバーヘッド回避 |
| 専門レビューを 1 回 | 2層 Pattern A（Skill inline） | 即応性、メイン会話で共有 |
| 長大な codebase 探索 | 2層 Pattern B（Skill `context: fork`） | メイン context 保護 |
| 専門役割の継続的利用 | 2層 Pattern C（Custom Subagent） | 再利用、description によるトリガー |
| 多段の専門処理（探索→実装→検証） | 3層 Pattern D（Subagent + Skill） | 単一 Subagent内で完結 |
| 外部サービス連携を伴うタスク | 3層 Pattern E（Subagent + MCP） | 外部 API直接連携 |
| 監査・遮断が必要 | 3層 Pattern F（Subagent + Hook） | 決定的制御層 |
| 複雑な協調作業 | 多層（Agent Teams） | teammate 間の議論・分業 |
| 5〜30件の同パターン変換 | 多層（`/batch`） | Phase 駆動の並列リファクタ |
| 並列で複数の独立タスク | Background sessions（Agent View） | プロセス分離 |

### 5.2 制約条件別

| 制約 | 推奨手段 |
|---|---|
| ファイル編集の衝突回避 | `isolation: worktree`（Subagent または `--worktree`） |
| ツールアクセス制限 | Subagent `tools` / `disallowedTools`、Skill `allowed-tools` |
| 強制ブロック（拒否） | L4 Hook PreToolUse（exit code 2） |
| 外部システム連携 | L4 MCP（HTTP transport 推奨） |
| 機微情報の扱い | Plugin `userConfig` の `sensitive: true`、`.env` ファイル |
| チーム配布 | L5 Plugin（project scope または Marketplace） |
| 組織配布 | Managed settings + Managed marketplace |

### 5.3 強度別

| 強度 | 機構 | 用途 |
|---|---|---|
| **Advisory（助言的）** | L1 CLAUDE.md / Output Styles | 行動指針、トーン設定 |
| **On-demand（オンデマンド）** | L2 Skills / L3 Subagents | 呼び出し駆動のワークフロー |
| **Deterministic（決定的）** | L4 Hooks（exit code 2） | ライフサイクルイベントで確実発火 |
| **Enforced（強制）** | L4 settings.json `permissions` | tool 全体の許可/拒否 |
| **OS-level（OS隔離）** | Sandbox / Worktree / Managed Policy | 物理的隔離・ユーザー override 不可 |

公式引用（[best-practices](https://code.claude.com/docs/en/best-practices) "Set up hooks" 節）:
> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

### 5.4 並列性別

| 並列パターン | 機構 | 隔離レベル |
|---|---|---|
| 同一セッション内のサイドタスク | L3 Subagent | Context window 分離 |
| 複数の独立タスク | Agent View（Background） | プロセス分離 |
| 協調・議論が必要な作業 | Agent Teams | プロセス分離 + Shared task list |
| ファイル編集の物理隔離 | Worktree（`isolation: worktree`） | Git worktree |
| 大規模並列リファクタ（5〜30件） | `/batch` | Phase駆動 + worktree per unit |

---

## 6. オーケストレーション設計の意思決定フロー

### 6.1 設計開始時の判定

```
[ユーザー要件]
    │
    ▼
Q1: 単発タスクか、繰り返し利用か？
    ├─ 単発 → 単層（メインで inline）
    └─ 繰り返し → Q2 へ
        │
        ▼
Q2: 専門役割か、ワークフローか？
    ├─ ワークフロー → L2 Skill（2層 Pattern A or B）
    └─ 役割 → L3 Subagent（2層 Pattern C）
        │
        ▼
Q3: Subagent 内で多段処理が必要か？
    ├─ NO → 2層で確定
    └─ YES → Q4 へ
        │
        ▼
Q4: 何を呼び出したいか？
    ├─ Skill → 3層 Pattern D
    ├─ MCP Tool → 3層 Pattern E
    ├─ Hook 監視 → 3層 Pattern F
    └─ 別 Subagent → 可（既定3階層・可変）。既定超か独立プロセスが必要なら環境変数を上げるか Agent Teams or /batch へ
```

### 6.2 配布判断

```
[2層 / 3層 構成が確定]
    │
    ▼
Q5: 配布が必要か？
    ├─ このプロジェクトのみ → そのまま `.claude/` 配下に置く
    ├─ ユーザー全体 → `~/.claude/` 配下
    ├─ チーム共有 → `.claude/`（project scope）+ git管理
    └─ 第三者配布 → L5 Plugin 化
        │
        ▼
Q6: マーケットプレイスは？
    ├─ Official Anthropic → 審査申請
    ├─ Community → 自動審査
    └─ Custom → 自前 marketplace.json
```

---

## 7. アンチパターン

### 7.1 オーケストレーション設計のアンチパターン

| アンチパターン | 問題点 | 推奨対応 |
|---|---|---|
| **Subagent を既定の深度上限（3階層）を超えて深くネスト** | 深度上限で Agent tool が外れ spawn 不可（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可） | 既定超は環境変数を上げるか Agent Teams or `/batch` を検討（nested team は不可） |
| **ガイドラインのみの Skill を `context: fork`** | subagent が actionable task なく何もせず終了 | Skill本文に具体的タスク手順を書く |
| **強制ブロックを CLAUDE.md に書く** | Advisory のみ、Claude が遵守しない可能性 | L4 Hook PreToolUse で exit code 2 |
| **頻繁な対話を要する Subagent** | Context switching コストが大きい、結果が分断される | メインで inline 実行 |
| **大量 MCP server を全 Subagent に許可** | Context 圧迫、Tool Search で軽減も限界 | 必要 MCP のみ Subagent `tools` で許可 |
| **`disable-model-invocation: true` Skill を `skills:` で preload** | エラー（公式仕様で不可） | `user-invocable: false` に変更するか別 Skill 化 |
| **逐次タスクを Agent Teams で実行** | 過剰なコスト（各 teammate が独自 context window） | Subagent または単一セッションで十分 |
| **Worktree のクリーンアップ忘れ** | `.claude/worktrees/` が肥大化 | `git worktree list` で定期確認 |
| **オーケストレーション一式を CLAUDE.md に長文記述** | 200行超過で重要ルール埋没 | L2 Skill / L3 Subagent に切り出し |

### 7.2 公式制約違反のアンチパターン

| 違反 | 公式記述 |
|---|---|
| Subagent を既定の深度上限を超えてネスト | "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the depth limit, Claude Code withholds the `Agent` tool [...] To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`."（既定3階層。nesting 自体は許可されている） |
| fork から別の fork を spawn | "A fork still cannot spawn another fork" |
| Agent Teams の nested team | "teammates cannot spawn their own teammates" |
| Plugin agent に `hooks` 設定 | セキュリティ上非対応 |
| Plugin agent に `mcpServers` 設定 | 同上 |
| Plugin agent に `permissionMode` 設定 | 同上 |
| Skill から `..` で plugin外参照 | Cache copy で動作不能 |

---

## 8. オーケストレーション設計チェックリスト

実装着手前に以下を確認:

- [ ] **公式制約の確認**: Subagent nesting が既定の深度上限（3階層）以内に収まっているか（超える場合は `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で明示的に引き上げているか）
- [ ] **強度の選択**: advisory / deterministic / enforced のどれが適切か
- [ ] **context 設計**: メイン context を保護したいか、共有したいか
- [ ] **ツール権限**: 各層に必要最小限の権限のみ与えているか
- [ ] **隔離**: ファイル衝突回避が必要か（worktree 必要か）
- [ ] **配布スコープ**: project / user / plugin のどれが適切か
- [ ] **再利用性**: description が trigger 的中率を確保しているか
- [ ] **観測性**: Hook で監査・ログ取得が設計されているか
- [ ] **テスト可能性**: 各層を独立に動作確認できるか
- [ ] **デグレ時の挙動**: Subagent 失敗時に何が起きるか定義されているか

---

## 9. 関連リファレンス

| 観点 | 参照先 |
|---|---|
| Skill の詳細仕様 | [L2_SKILLS.md](./L2_SKILLS.md) |
| Subagent / Agent Teams / Worktree / `/batch` | [L3_AGENTS.md](./L3_AGENTS.md) |
| Hook イベント31種・Handler 5種 | [L4_AUTOMATION.md](./L4_AUTOMATION.md) |
| MCP transport / scope / OAuth | [L4_AUTOMATION.md §2.2](./L4_AUTOMATION.md) |
| Plugin 配布 | [L5_DISTRIBUTION.md](./L5_DISTRIBUTION.md) |
| 横断ベストプラクティス | [BEST_PRACTICES.md](./BEST_PRACTICES.md) |
| 機能選択フローチャート | [00_INDEX.md §4](./00_INDEX.md) |

---

## 10. このファイルの `[要確認]` 項目

| 項目 | セクション | 検証方法 |
|---|---|---|
| Subagent から Hook イベントが発火される完全な振る舞い | 3.4 Pattern F | 公式 hooks ドキュメントの SubagentStart/Stop 節 |
| `/batch` の Phase 3 で並列ユニット失敗時の挙動 | 4.2 | commands ドキュメント精読 |
