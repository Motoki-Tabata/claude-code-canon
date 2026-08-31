# L3: エージェントと並列処理

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L2_SKILLS.md](./L2_SKILLS.md)（context:fork との対比） / [L4_AUTOMATION.md](./L4_AUTOMATION.md)（Hook agent handler 連携） / [ORCHESTRATION.md](./ORCHESTRATION.md) / [BEST_PRACTICES.md](./BEST_PRACTICES.md)

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース（Subagents） | https://code.claude.com/docs/en/sub-agents |
| 一次ソース（Agent View） | https://code.claude.com/docs/en/agent-view |
| 一次ソース（Agent Teams） | https://code.claude.com/docs/en/agent-teams |
| 一次ソース（Worktrees） | https://code.claude.com/docs/en/worktrees |
| 一次ソース（環境変数） | https://code.claude.com/docs/en/env-vars |
| 一次ソース（/batch） | https://code.claude.com/docs/en/commands |
| 調査日 | 2026-08-29 |

---

## 1. 概要レイヤー（What & When）

### 1.1 機能の目的

L3 は **コンテキストの分離・並列実行・専門タスクの委譲** を扱うレイヤーです。L1（静的）／L2（動的単発）に対し、L3 は「メイン Claude とは別の context window / 別プロセスで実行される代理エージェント」を構築・運用するための機構群です。

公式定義（[sub-agents](https://code.claude.com/docs/en/sub-agents)）:
> "Subagents are specialized AI assistants that handle specific types of tasks. Each subagent runs in its own context window with a custom system prompt, specific tool access, and independent permissions."

### 1.2 含まれる機能一覧

| 機能名 | 一言説明 | 主な用途 |
|---|---|---|
| **Subagents**（`.claude/agents/<name>/<name>.md`） | 単一セッション内で代理実行する専門エージェント | 探索・専門レビュー・サイドタスクの context 分離 |
| **Agent View**（`claude agents` / `/background`） | バックグラウンドセッション一覧UI | 複数並走セッションの監視・dispatch |
| **Agent Teams**（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`） | 複数 Claude Code インスタンスの協調動作 | 議論・相互レビューを伴う複雑作業（実験機能） |
| **Worktree**（`--worktree` / `isolation: worktree`） | Git worktree によるファイル隔離 | 並列編集の衝突回避 |
| **`/batch`**（Bundled Skill） | 5〜30件の同パターン変換を並列リファクタ | 大規模リネーム・移行・修正の並列実行 |
| **Dynamic Workflows**（`/workflows`） | Claude が生成したスクリプトで数十〜数百の Subagent を制御 | 大規模・複雑なオーケストレーション |

> **Dynamic Workflows**: Workflow ツールのプロンプトフットプリントは約1kトークンに抑えられており、スクリプト記述リファレンスは **bundled skill `workflow-authoring`**（dynamic workflows が有効なときのみ利用可能）に分離されている。実行中に `←` / `/background` を押すと、完了済み subagent の再起動対象数を提示して確認する。

### 1.3 いつ使うか（採用判断基準）

#### 採用すべき状況（DO）
- メイン会話を **大量の探索結果やログで汚染したくない** → Subagent（または Skill `context: fork`）
- **専門ドメイン**（security review / test runner / research）を反復的に委譲したい → カスタム Subagent
- **複数の独立タスク**を並列に走らせたい（バグ修正 + 機能実装 + レビュー） → Background sessions（Agent View）
- **協調議論が必要な複雑作業**（teammates 同士のやりとり）→ Agent Teams
- **同パターンの変換を 5〜30 ファイル**に一気に展開 → `/batch`
- 並列セッションが **同一ファイル**を編集する → Worktree で衝突回避

#### 採用すべきでない状況（DON'T）
- **単発・短時間の処理** → メイン Claude で inline 実行が低コスト
- メインの **会話履歴に依存**するタスク → Subagent は履歴非継承
- **頻繁な対話**が必要なタスク → context switching コストが大きい
- **Subagent から更に Subagent** を**既定の深度上限を超えて**ネストしたい → 不可（既定は**3階層**・`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可。後述）

#### 他レイヤーとの使い分け

| 比較対象 | L3 を選ぶ基準 | 他レイヤーを選ぶ基準 |
|---|---|---|
| **L2 Skill** | 専門担当を継続役割として持たせる | 一時的・呼び出し駆動のワークフロー |
| **L2 Skill `context: fork`** | カスタムの専門 subagent を定義したい | 1回限りの fork で十分 |
| **L4 Hook (agent handler)** | ユーザー / Claude が能動的に発動 | イベント駆動で自動発火 |
| **L5 Plugin** | このプロジェクト/ユーザーに固有 | 他者にも配布したい |

公式引用:
> "Use one when a side task would flood your main conversation with search results, logs, or file contents you won't reference again: the subagent does that work in its own context and returns only the summary."

---

## 2. 詳細レイヤー（How）

### 2.1 Subagents（カスタム定義）

#### 仕組み
1. メイン Claude がユーザー要求を分析
2. 利用可能な Subagent の `description` と照合
3. マッチしたら delegation（明示呼び出しまたは自動）
4. Subagent が **独立した context window** で task を実行
5. 結果サマリーのみメイン会話へ返却（詳細は subagent context に残留）

#### 配置場所とスコープ（4階層）

| 階層 | 配置場所 | スコープ |
|---|---|---|
| **Project** | `.claude/agents/<name>/<name>.md` または `.claude/agents/<name>.md` | このプロジェクトのみ（git管理内） |
| **User** | `~/.claude/agents/<name>/<name>.md` | ユーザー全体 |
| **Plugin** | `<plugin>/agents/<name>.md` | プラグイン有効範囲 |
| **Built-in** | Anthropic 配布（後述） | 全ユーザー |

#### Built-in Subagent Types

| 名前 | 用途 | CLAUDE.md ロード | git status |
|---|---|---|---|
| **Explore** | 探索・調査（読み取り中心） | ❌ | ❌ |
| **Plan** | 設計・プランニング | ❌ | ❌ |
| **general-purpose** | 汎用（フルツール） | ✅ | ✅ |

Built-in は Skill の `context: fork` でも、Subagent delegation でも参照可能（`agent: Explore` 等）。

> **モデル継承**: `Explore` は**メイン会話のモデルを継承**する（Claude API では **Opus 上限**。Bedrock/Vertex/Foundry/AWS では継承モデルをそのまま使用）。`Plan`・`general-purpose` はメイン会話モデルを継承。低コスト固定にしたい場合は同名（`Explore`）の user/project subagent を定義し `model: haiku` を明示すると built-in を上書きできる。ヘルパー agent として `statusline-setup`（Sonnet）・`claude-code-guide`（Haiku）も存在する（通常は自動起動）。

#### Subagent の呼び出し経路と識別子（`subagent_type`）

カスタム Subagent は **ビルトイン型に限らず**、以下の経路で起動できる（公式）。いずれも識別には frontmatter の **必須 `name` フィールド**を使う。

| 経路 | 構文 | 補足 |
|---|---|---|
| 自動 delegation | （構文なし。Claude が `description` で判断） | description の精度が的中率を決める |
| 自然言語での明示 | プロンプト内で subagent 名を書く | 特別な構文不要 |
| @メンション | `@<name> <prompt>` | 起動する subagent を指定（プロンプト本文はそのまま渡る） |
| **Agent tool（プログラム的起動）** | **`subagent_type: <name>`** | メインスレッドが Agent tool で spawn |
| セッション全体 | `claude --agent <name>` / settings `agent` | 主スレッド自体が当該 subagent になる |

- **`subagent_type` はビルトイン型（`general-purpose` / `Explore` / `Plan`）だけでなく、`.claude/agents/` 配下のカスタム agent 名も受け付ける。** 値は frontmatter の **必須 `name`** で照合され、**ファイル名・ディレクトリ名・配置パスは識別に無関係**（`name` のみが識別子）。
- マッチングは **大文字小文字・セパレータ非依存**（例: `"Code Reviewer"` → `code-reviewer`）。
- Plugin agent は **スコープ付き識別子** `plugin:subfolder:name`（例: `agents/review/security.md` を含む `my-plugin` → `my-plugin:review:security`）。
- Hook（`SubagentStart` / `SubagentStop`）には `name` の値が `agent_type` として渡る（matcher で対象 agent を絞れる）。

> **⚠ 本システム運用ノート（環境依存のワークアラウンド）**
>
> 一部の実行環境（**Claude Agent SDK / harness 構成**など）では、`.claude/agents/` 配下のファイル定義 agent が `Agent` tool の `subagent_type` として**登録されない**ことがある（ビルトイン型のみが `subagent_type` に露出する）。この場合、canon の agent（例: `design-architect`）を `subagent_type: design-architect` で直接起動することは**できない**。
>
> 回避策として、本システムの orchestrator（`/canon`）およびメンテナンス Skill（`/update-docs`。機能X 実装契約により `canon-updater` を起動する。`/update-system` は実装されておらず本システムには存在しない）は、次の方式で**同等動作**を実現する:
> 1. `subagent_type: general-purpose` で起動する（`model` はタスク性質で選択。設計判断は `opus`、生成/レビューは `sonnet`）。
> 2. プロンプトに「`.claude/agents/<name>/<name>.md` を Read し、その定義（手順・制約・返却形式）に従うこと」を**明示注入**する。
> 3. その定義が preload する Skill があれば、Skill 内容も明示的に読ませる（frontmatter `skills:` preload と同等の効果を手動で得る）。
>
> これは「`subagent_type` がビルトイン型しか受け付けない」からではなく、**当該環境で canon agent が `subagent_type` として登録されていない**ための回避策である。公式 Claude Code CLI 上では、`name` 必須フィールドを満たせばカスタム名を `subagent_type` に直接指定できる。
>
> **補足**: canon の agent 定義には必須の `name:` frontmatter が付与済みで、識別子は `name` で解決される。したがって公式 Claude Code CLI 上ではカスタム名での `subagent_type` 起動が可能であり、上記ワークアラウンドが必要なのは canon agent が `subagent_type` として登録されない SDK/harness 環境に限られる。詳細は [ORCHESTRATION.md §2.3 Custom Subagent の起動方式](./ORCHESTRATION.md) を参照。

#### frontmatter 完全リファレンス

```yaml
---
# === 必須 ===
name: my-agent                           # 識別子（小文字+ハイフン）。subagent_type / agent_type の値。
                                         # ファイル名・ディレクトリ名と一致する必要はない（識別は name のみ）
description: What this agent does and when Claude should delegate to it

# === ツール制御 ===
tools: Read Grep Bash                    # スペース/カンマ/YAMLリスト
                                         # Agent(worker, researcher) で spawn 可能な subagent 型を allowlist 化（--agent 主スレッド時）
disallowedTools: Write Edit              # deny list（公式キー名は disallowedTools のみ。`disallowed-tools` は不可・後述の補足参照）

# === モデル ===
model: sonnet                            # sonnet, opus, haiku, fable, full ID（例 claude-opus-5 / claude-sonnet-5 / claude-opus-4-8）, inherit（既定: inherit）
                                         # haiku は「機械的・正典非参照・下流検証あり」を全て満たす場合のみ（後述）
                                         # fable = Claude Fable 5（Mythos クラス）
effort: high                             # low, medium, high, xhigh, max
maxTurns: 20                             # 停止までの最大エージェンティックターン数
                                         # 上限到達時は出力が partial としてマークされて返り、Claude は継続を再開できる

# === 実験オプション ===
experimental:                            # 実験オプションのマップ
  cacheTtl: 1h                           # 5m または 1h。この subagent のリクエストのプロンプトキャッシュ寿命
                                         # 他の値は無視、usage credits 利用中は 1h を無視、subagent ファイルからのみ読む

# === 権限・隔離 ===
permissionMode: default                  # default/acceptEdits/auto/dontAsk/bypassPermissions/plan（plugin agent では無視）
                                         # manual は default のエイリアス
isolation: worktree                      # 独立 worktree で実行（既定で default branch から分岐）
background: false                         # true で常に background 実行。未指定時は Claude が判断（既定 background）

# === コンポーネント preload ===
skills: [skill-name]                     # Preload Skills（disable-model-invocation:true は不可）
mcpServers: [server-name]                # MCP server アクセス（plugin agent では無視）
hooks: {...}                             # この subagent のライフサイクルフック（plugin agent では無視）

# === 永続メモリ・UI ===
memory: project                          # user/project/local。cross-session 学習を有効化
color: blue                              # task list/transcript の表示色
initialPrompt: "..."                     # --agent / agent 設定で主スレッド起動時の最初の user turn

# === メタデータ ===
version: "1.0"
license: MIT
author: name
---

（ここに Subagent のシステムプロンプト本文を書く）
```

**必須**: `name` + `description` フィールド + Markdown body（system prompt）。それ以外は任意。

> **公式キー名の補足**: deny list の公式キー名は `disallowedTools`（camelCase）。permission モードのキーは `permissionMode`（tool 全体の allow/deny は settings.json の `permissions` 側で行う）。
>
> **`disallowed-tools`（ハイフン形）の互換受理は不可**: 公式 [sub-agents](https://code.claude.com/docs/en/sub-agents) の Subagent frontmatter フィールド表は `disallowedTools` のみを列挙する（ハイフン形は現れない）。**Skill 側の `allowed-tools`（ハイフン）との混同に注意**（L2 参照）。Subagent に `disallowed-tools` と書くと**黙って未知キーとして無視され deny が効かない**——静かな失敗様式であり危険なため、G4（`gates/g4_frontmatter_schema.js`）はこのキーを Subagent の未知キーとして検出する。**Subagent には必ず `disallowedTools`（camelCase）のみを使うこと**。

**主要フィールド**:

| フィールド | 用途 |
|---|---|
| `name` | **必須**。subagent の一意な識別子。**小文字とハイフンのみ（`:` は使用不可・プラグイン名前空間 `plugin:sub:name` 用に予約）**。`subagent_type` および Hook の `agent_type` の値。**ファイル名・配置パスは識別に無関係**（識別は `name` のみ）。tree 全体で一意に保つ。**`:` を含む `name` のファイルは Claude Code がロードせず、デバッグログにエラーを出す**（＝UI 上は「その agent が存在しないだけ」に見える静かな失敗様式） |
| `description` | Claude が delegation 判断に使う。最大1536文字 |
| `tools` | 許可ツール（spaces/commas/YAMLリスト）。未指定は**subagent が使える全ツール**を継承。`Agent(type1, type2)` 構文で spawn 可能な subagent 型を allowlist 化（`--agent` 主スレッド時のみ有効）。**リスト中のどのエントリもツールに解決できない場合、subagent は通常そのエントリ名を挙げたエラーで起動に失敗する**。**Skill を context に preload する目的で `Skill` をここに列挙しないこと——preload は `skills` フィールドで行う** |
| `disallowedTools` | 禁止ツール（公式キー名。`disallowed-tools`（ハイフン形）は不可・G4 が未知キーとして検出）。`tools` と併用時は先に deny を適用 |
| `model` | モデル override。値: `sonnet`/`opus`/`haiku`/`fable`/full ID（例 `claude-opus-5`）/`inherit`。未指定時の既定は `inherit`（メイン会話と同一モデル）。**新規セッションの既定モデル自体は `ANTHROPIC_DEFAULT_MODEL` で指定できる**——`/model` でのユーザー選択が優先され、その選択は再起動をまたいで残る点が `ANTHROPIC_MODEL`（常に強制）と異なる（出典 `env-vars`）。`CLAUDE_CODE_SUBAGENT_MODEL` との解決順序は **`[要確認]`**（直後の注記を参照） |
| `effort` | 推論努力レベルの override: `low`/`medium`/`high`/`xhigh`/`max`。未指定時はセッションの effort を継承 |
| `permissionMode` | パーミッション挙動: `default`/`acceptEdits`/`auto`/`dontAsk`/`bypassPermissions`/`plan`（`manual` は `default` のエイリアス。UI 上は「default」モードが "Manual" と表示される）。plugin agent では無視。親が `bypassPermissions`/`acceptEdits`/`auto` の場合は親が優先 |
| `maxTurns` | 停止までの最大エージェンティックターン数。**上限到達時は出力が partial としてマークされて返り、Claude はそれを再開して継続できる**（公式: *"When the subagent reaches the limit, Claude Code returns its output marked as partial, and Claude can resume it to continue. The partial marking requires Claude Code v2.1.246 or later"*） |
| `experimental` | **実験オプションのマップ**。公式: *"Map of experimental options. Set its `cacheTtl` key to `5m` or `1h` to choose the prompt cache lifetime for this subagent's requests. Claude Code ignores any other value, ignores `1h` while your Claude subscription is using usage credits, and reads the field only from subagent files. Requires Claude Code v2.1.248 or later"*。YAML はネスト形（`experimental:` / `  cacheTtl: 1h`）。**セッション全体の TTL 設定（`promptCacheTtl` / `subagentPromptCacheTtl`）が未構成のときに使われる per-agent 値**と位置づけられている |
| `isolation: worktree` | 起動時に自動的に worktree を作成（既定で default branch から分岐）、変更なしなら終了時に自動クリーンアップ |
| `skills` | preload する Skill のリスト（後述制約あり）。**description だけでなく Skill の全文が context へ注入される**。列挙しなかった project / user / plugin の Skill も、subagent は `Skill` tool 経由で引き続き invoke できる（＝`skills` は「使える Skill の allowlist」ではなく「最初から読ませておく Skill の指定」） |
| `mcpServers` | アクセス可能な MCP サーバー（インライン定義または既存サーバー名参照）。plugin agent では無視 |
| `hooks` | この subagent のライフサイクルフック。plugin agent では無視 |
| `memory` | 永続メモリスコープ `user`/`project`/`local`。cross-session 学習を有効化（Read/Write/Edit が自動許可、`MEMORY.md` 先頭200行/25KB を system prompt に注入） |
| `background` | `true` で、**Claude が foreground 実行を要求した場合でも**この subagent を background に留める。公式: *"Set to `true` to keep this subagent in the background even when Claude asks to run it in the foreground. Where fork mode is on, Claude Code already runs the subagents Claude spawns in the background."*——fork mode が ON（対話セッションの既定）のときは spawn された subagent がそもそも background で走る。background subagent の permission プロンプトはメインセッションに表出する。`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` で無効化可。**フォアグラウンド subagent のツール呼び出しと結果は Remote Control クライアントへライブストリームされる（既定であるバックグラウンド subagent は状態のみ表示）** |
| `color` | task list/transcript の表示色（`red`/`blue`/`green`/`yellow`/`purple`/`orange`/`pink`/`cyan`） |
| `initialPrompt` | `--agent`/`agent` 設定で主スレッド起動時に自動送信される最初の user turn |

> **[要確認: `CLAUDE_CODE_SUBAGENT_MODEL` の優先順位——sub-agents ページ（環境変数最優先）と changelog v2.1.251（frontmatter/per-spawn が優先）が相反。次回再検証]**
>
> - **`sub-agents` ページ**は「Claude Code はこの順で subagent のモデルを解決する: (1) `CLAUDE_CODE_SUBAGENT_MODEL` 環境変数（モデルエイリアスまたはモデルID指定時）、(2) per-invocation の `model` パラメータ、(3) subagent 定義の `model` frontmatter、(4) メイン会話のモデル」と明記し、「v2.1.196 以降、`inherit` を設定することは未設定と同義」と述べる（＝**環境変数が最優先**）。
> - **`changelog` v2.1.251** は「Changed `CLAUDE_CODE_SUBAGENT_MODEL` to set the default subagent model rather than override everything: an agent definition's `model:` and an explicit per-spawn model now take precedence over it」と述べる（＝**frontmatter と per-spawn が環境変数より優先**）。
> - **`env-vars` ページ**の purpose セルは "Model ID that subagents use by default"（"by default" の語は changelog 側と整合的だが、優先順位は明示していない）。
>
> `sub-agents` ページ本文が v2.1.251 の変更に追随していない可能性と、changelog の記述が別の意味である可能性のいずれも排除できていないため、**本正典はどちらの優先順位も断定しない**。

**プロンプトキャッシュ TTL 設定2種**: `promptCacheTtl` / `subagentPromptCacheTtl` が存在する（API キー・クラウドプロバイダ利用者が、メイン会話は1時間キャッシュ・subagent は5分に保てる）。agent 単位の `experimental.cacheTtl` は「subagent の TTL 設定が未構成のときに使われる per-agent 値」と位置づけられている。

**`--agents` のエラー挙動**: `--agents` は**不正な JSON・不正な agent 定義を黙って無視せず、`--mcp-config` と同様に明確なエラーで終了する**。

**`model` のティア選択（Opus / Sonnet / Haiku の3段階）**:

`model:` には `opus` / `sonnet` / `haiku` / `fable`（またはフル ID・`inherit`）を指定する。Subagent は親のコストティアを超えないことを前提に、タスクの性質で使い分ける。詳細な選択指針は [BEST_PRACTICES.md §3.3](./BEST_PRACTICES.md) を参照。

| ティア | 採用するタスク |
|---|---|
| `opus` | 設計判断・広範な文脈把握・整合性維持を伴うタスク（アーキテクチャ設計、複数ファイル横断の更新判断など）。seat-based Enterprise 契約の既定モデルでもある |
| `sonnet` | 文脈推論・文章合成・正典参照を伴う標準的な生成/レビュータスク（既定の選択肢） |
| `haiku` | 後述の3基準を **すべて満たす** 機械的タスクに限る |
| `fable` | Claude Fable 5（Mythos クラス。従来 GA モデルを超える能力）。本システムの canon フローでは未使用だが公式エイリアスとして指定可能 |

> **`model: haiku` の採用基準（以下をすべて満たす場合にのみ採用）**:
> 1. 設計判断・文脈推論を伴わない（テンプレートの機械的充填・固定フォーマット出力に限る）
> 2. 正典ファイル（`docs/`）を参照せずに完結できる（生成/判断 Skill を preload しない）
> 3. 失敗コストが低い（後続エージェントまたはレビュー機構が出力内容を検証する）
>
> いずれか1つでも満たさない場合は `sonnet` 以上を選ぶ。判断に迷う場合は `sonnet` を既定とする。
>
> **補足**: `/tasks` および agent 詳細ダイアログには、各 subagent が動作した**モデルと effort level** が表示される。Opus 5 は effort が `xhigh`/`max` かつ thinking 無効のとき、**effort は `high` として送信される**（thinking 無効時に高 effort を拒否するのではなく降格する）。

#### 公式コード例（完全形）

**Example 1: Research subagent**
```yaml
---
description: Research a topic by exploring documentation, finding relevant examples, and summarizing findings. Delegate when Claude needs to investigate a problem or gather background information.
tools: Read Grep WebFetch
model: sonnet
---

Research the given topic thoroughly. Search documentation, read example files, and summarize your findings with links and specific details. Highlight any gaps or uncertainties.
```

**Example 2: Security reviewer with worktree isolation**
```yaml
---
description: Review code for security vulnerabilities including injection, auth issues, and data exposure. Delegate for security-focused code review.
isolation: worktree
tools: Read Grep Bash
disallowedTools: Write Edit
---

Analyze the codebase for security vulnerabilities. Check for injection, authentication/authorization issues, data exposure, cryptography misuse. Report severity ratings.
```

#### 制約事項（公式明記）

| 制約 | 公式記述 |
|---|---|
| **Nesting は既定3階層・可変** | "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the depth limit, Claude Code withholds the `Agent` tool from every subagent except a fork [...] To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`."（深さ=メイン会話より下の subagent 階層数。foreground/background を問わず数える） |
| **並行実行は既定20** | "By default, when 20 subagents are running in a session, spawning another fails with `Concurrent subagent limit reached`."（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` で変更可。ultracode セッションは除外） |
| **fork は fork を spawn 不可** | "A fork still cannot spawn another fork. It can spawn other subagent types, and those count toward the depth limit." |
| **spawn 抑止の方法** | "To prevent a specific subagent from spawning others, omit `Agent` from its `tools` list or add it to `disallowedTools`." |
| **Skill preload 制約** | "You can't preload skills that set `disable-model-invocation: true`, since preloading draws from the same set of skills Claude can invoke." |
| **`tools` の解決失敗** | "If no entry in the list resolves to a tool, the subagent usually fails to launch with an error naming the entries."（存在しないツール名だけを並べると起動しない） |
| **Skill の preload 手段** | "To preload Skills into context, use the `skills` field rather than listing `Skill` here."（`tools` に `Skill` を書いても preload にはならない） |
| **単一セッション制約** | Subagent は同一セッション内のみ。並列独立セッションは Agent View / Agent Teams を使う |
| **永続メモリスコープ** | `memory: user/project/local`（subagent 単位で `~/.claude/agent-memory/<name>/` 等に保存） |
| **name の `:` 禁止** | `name` は小文字とハイフンのみ。`:` はプラグイン名前空間（`plugin:sub:name`）に予約されている |

#### Spawn nested subagents

Subagent は自身の subagent を spawn できる。委譲タスクがさらに並列サブタスクに分割される場合（例: 各 finding ごとに verifier を派遣する reviewer subagent）に使い、中間出力をメイン会話に到達させずに済む。トップレベル subagent の summary のみがユーザーに返る。

| 項目 | 仕様 |
|---|---|
| 既定上限 | **3階層**（depth = メイン会話より下の subagent 階層数）。深度上限に達した subagent は `Agent` tool を受け取らず、それ以上 spawn 不可（**fork を除く** — fork は上限到達時も `Agent` tool 呼び出しがエラーを返す形で扱われる） |
| 上限の可変性 | **`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で変更可**（正の整数のみ受理。`1` で nesting を完全無効化） |
| 並行実行上限 | 既定20（`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`。ultracode セッションは除外） |
| foreground/background | どちらでも深さに数える |
| nested subagent の解決 | トップレベルと同じ [スコープ](#配置場所とスコープ4階層)（project/user/plugin/CLI）から解決 |
| UI | プロンプト下の subagent パネルにツリー表示（各行に `(+N)` で子孫数。行を開くと兄弟・直接の子と `main` への経路を表示） |
| 抑止 | `tools` から `Agent` を外す、または `disallowedTools` に追加すると当該 subagent は spawn 不可 |
| fork の特例 | fork は別の fork を spawn できない（named subagent は spawn 可で深さに数える） |

> ⚠ **本システム運用ノート**: nesting が解禁されても、本システムの SDK/harness 環境では canon agent が `subagent_type` 未登録のため、依然 general-purpose 経由 + 定義ファイル Read 注入で起動する方式を採る（後述の運用ノート参照）。多段委譲が必要なら、起動した general-purpose subagent のプロンプト内でさらなる subagent 起動を指示する設計が可能になった。ただし既定の深度上限は3階層である点に注意。

---

### 2.1a fork subagent（`subagent_type: "fork"`）

> 対話セッションでは**既定ON**。従来の named subagent（フレッシュな context・独立 system prompt）とは対照的な、**親会話をまるごと継承する**特別な subagent 型。

#### 仕組み

fork は通常の subagent と異なり、以下をすべて親会話から継承する:
- System prompt
- Tools（親と同一のツールプール——background subagent 向けの絞り込みは適用されない）
- Model
- 会話履歴全体

公式引用（`sub-agents`）:
> "A fork is a special subagent type that inherits the entire parent conversation instead of starting fresh. [...] The fork can work on side tasks without needing re-explanation, while its tool calls and output stay isolated from your main context—only the final result returns to you."

fork の初回リクエストは**親のプロンプトキャッシュを再利用**するため、同じ文脈が必要な場面では新規 subagent を spawn するより低コストになる。

#### 起動方法

| 方法 | 構文 | 補足 |
|---|---|---|
| 自動（Claude が判断） | Agent tool で `subagent_type: "fork"` を要求 | fork mode が ON（対話セッションの既定）のときのみ |
| 手動 | `/subtask <task>` | - |

`/fork`（会話をバックグラウンドセッションへコピーし自分は元セッションで作業継続）と `/subtask`（サブエージェントへ側作業を委託し結果を本会話へ回収する）は**別目的で共存する現存コマンド**（改称元・改称先の関係ではない）。`/fork` のエントリ自体が「サブエージェントへ委託するなら `/subtask` を、コピーへ切り替えるなら `/branch` を使うこと」と両者を明示的に区別している。

```text
/subtask draft unit tests for the parser changes so far
```

Claude Code はタスクの冒頭語から fork 名を自動生成する。fork はプロンプト下のパネルに表示され、作業を続けている間バックグラウンドで実行される。

#### fork mode の制御

fork mode は対話セッションで**既定ON**。`CLAUDE_CODE_FORK_SUBAGENT` で上書き可能:
- `1` — 全セッション種別（`claude -p`・Agent SDK 含む）でON
- `0` — 全セッション種別でOFF

fork mode ON時: Claude が `fork` subagent 型を spawn 可能・Claude Code は spawn された subagent（fork/非fork 問わず）を background 実行・Agent tool の `run_in_background` パラメータは提供されない。
fork mode OFF時: Agent tool 経由の fork spawn は不可（`/subtask` は引き続き利用可）・foreground/background は[標準ルール](#background-session-の管理)に従う。

#### fork と非fork subagent の違い

| 観点 | Fork | 非fork Subagent |
|---|---|---|
| コンテキスト | 会話履歴全体を継承 | フレッシュ（delegation prompt のみ） |
| System prompt / tools | メインセッションと同一 | subagent 定義ファイル由来 |
| Model | メインセッションと同一 | 定義ファイルの `model` 由来 |
| 権限プロンプト | 端末に直接表出 | background 実行時はメインセッションに表出 |
| プロンプトキャッシュ | メインセッションと共有（低コスト） | 独立キャッシュ |
| 別 fork を spawn できるか | 不可 | 可（nesting 許可・`Agent` を tools に持つ場合） |
| ツールの絞り込み | **なし**（親の正確なツールプールを継承） | background 実行時は[絞り込み対象](./TOOLS.md#23-subagent-の-tools-フィールド) |

---

### 2.2 Agent View（引き続き Research Preview）

> 公式は Agent View を Research Preview のまま位置づけている: "Agent view is in research preview. The interface and keyboard shortcuts may change as the feature evolves."（GA 昇格の記述は確認できず）

> **`/agents` の挙動**: `/agents` コマンドは subagent の作成/編集/削除を行う対話ウィザードではなく、「Claude に依頼するか `.claude/agents/` を直接編集せよ」という案内を表示する。subagent ファイル・frontmatter・配置場所（`.claude/agents/` / `~/.claude/agents/`）はこの案内と無関係に不変。

#### 起動方法

```bash
# CLI 起動
claude agents

# オプション
claude agents --cwd ~/projects/my-app          # 特定ディレクトリでフィルタ
claude agents --json                            # JSON 出力
claude agents --permission-mode plan            # デフォルト permission モード
claude agents --model opus                      # デフォルトモデル
claude agents --effort high                     # デフォルト effort
```

セッション内からのバックグラウンド移行:
```bash
/bg <prompt>               # 現セッションを backgrond に
/background <prompt>       # 同上（エイリアス）
```

シェルから直接:
```bash
claude --bg "<prompt>"                          # 最初から background
claude --agent code-reviewer --bg "<prompt>"    # 特定 subagent で起動
claude --name "flaky-test-fix" --bg "<prompt>"  # 表示名指定
```

> `claude --help` には **`attach` / `logs` / `stop` / `respawn` / `rm`** が掲載されており、`--resume` のメッセージが実行中のバックグラウンドセッションに対し **`claude attach <id>`** を名指しする。

#### セッション状態（6種）

| 状態 | アイコン | 意味 |
|---|---|---|
| **Working** | アニメ ✽ | Claude がツール実行中・生成中 |
| **Needs input** | 黄色 ✻ | ユーザーへの質問・許可待ち |
| **Idle** | グレー ∙ | 次プロンプト待ち |
| **Completed** | 緑 ✓ | タスク正常完了 |
| **Failed** | 赤 ✗ | エラー終了 |
| **Stopped** | 灰 ◇ | `Ctrl+X` または `claude stop` で停止 |

プロセスアイコンの追加意味:
- `✻` / アニメ `✽`: プロセス生存、即応答可
- `∙`: プロセス終了済み、peek/reply/attach 可（Claude が checkpoint から再開）
- `✢`: `/loop` セッションが反復間で休眠中

#### Background Session の管理

```
~/.claude/jobs/<id>/state.json       # セッション状態
~/.claude/daemon.log                  # Supervisor ログ
~/.claude/daemon/roster.json          # セッション一覧
```

**Supervisor process**（ユーザーごとに 1 つ）:
- 端末非依存（端末を閉じても継続）
- 初回 `/background` または `claude agents` で自動起動
- バイナリ更新時に自動再起動
- マシン sleep 時もセッション保持
- **約1時間 idle で非 pinned セッションを停止**（transcript/state は保持）
- Pinned session（`Ctrl+T` で固定）はプロセス維持

**Row summary**: 各セッションの一行サマリーを Haiku クラスのモデルで生成。アクティブ作業中は約15秒ごと + ターン終了時に更新。

#### キーボードショートカット主要

| Shortcut | Action |
|---|---|
| ↑/↓ | 行移動 |
| Enter | 選択セッションに attach（入力があれば dispatch） |
| Space | peek パネル開閉 |
| **Ctrl+Enter** | **dispatch & attach** |
| **Shift+Enter** | **改行**（プロンプト欄と同じ） |
| → | attach |
| Ctrl+S | グルーピング切替（状態 ↔ ディレクトリ） |
| Ctrl+T | Pin / Unpin |
| Ctrl+R | リネーム |
| Ctrl+X | 停止（再押下で削除） |
| Shift+↑/↓ | セッション並べ替え |
| Esc | peek 閉じる / Agent View 終了 |

#### Dispatch 構文（Agent View 入力欄）

```
<agent-name> <prompt>      # 指定 subagent をメインとして起動
@<agent-name> <prompt>     # subagent を明示メンション
@<repo> <prompt>           # 兄弟リポジトリで実行
/<skill> <args>            # スキルを推奨
#<pr-number> または PR URL  # 既存 PR セッションを選択
```

**デフォルト Agent 指定**: Agent View から dispatch するとき、`agent: <name>` 設定でデフォルトエージェントを指定できる（settings.json の `agent` フィールド）。

#### クロスセッションメッセージング

別セッションへ直接メッセージを送る `SendMessage` と、宛先を列挙する `ListAgents` について（一次ソース: `changelog` / `cross-session-messaging`）。

| 項目 | 内容 |
|---|---|
| **Windows 対応** | クロスセッションメッセージングは Windows でも利用可能で、`SendMessage` / `ListAgents` が macOS・Linux と同等に動作する |
| `SendMessage` の `notify_when_idle` | 相手セッションが**次に idle になったとき1回だけ**通知を受け取る入力。macOS / Linux |
| `ListAgents` の返却範囲 | **自セッション名**を返し、`/list-agents` と併せて **live な teammate も列挙**する |
| **プロバイダ・テレメトリ非依存** | **Bedrock / Vertex / Foundry・テレメトリ無効時でも `SendMessage`／`ListAgents` が利用可能** |
| **subagent からの送信時の返信先** | **subagent から他セッションへ `SendMessage` した場合、返信は親セッションの会話に届き subagent には届かない**旨が、ツール結果に明記される |
| **`crossSessionInbound` の不正値** | 不正値は**警告のうえ保留**（user settings）／**拒否**（managed settings）される |

---

### 2.3 Agent Teams（実験機能）

#### 有効化

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
claude
```

または `settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

> **アーキテクチャ（重要）**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` を設定すると**セッションごとに暗黙の1チーム**が存在し、teammate は Agent tool で**直接 spawn**（事前セットアップ不要、セッション終了時に自動クリーンアップ）。`TeamCreate`/`TeamDelete` ツールは存在しない。Agent tool の `team_name` 入力は受理されるが**無視**され、`TaskCreated`/`TaskCompleted`/`TeammateIdle` の hook payload の `team_name` フィールドは session 由来名を運ぶ deprecated 項目。

#### アーキテクチャ

チームは **最初の teammate が spawn された時点**で形成され、メインセッションが lead になる。spawn 方法は2つ: (1) ユーザーが並列向きのタスクで teammate を明示要求、(2) Claude が並列の利益を判断して提案（いずれもユーザー承認後に spawn）。

| 要素 | 役割 |
|---|---|
| **Team Lead** | メイン Claude セッション（生涯固定。teammate を lead に昇格・委譲不可）。teammate spawn・調整 |
| **Teammates** | 独立した Claude Code インスタンス。各自が assigned task を独立実行。**teammate は teammate を spawn できない（nested team 不可）** |
| **Shared Task List** | ワークアイテム（pending/in progress/completed）。Teammate が claim & 完了。依存関係が自動解決。claim は file locking で race 回避 |
| **Mailbox** | teammate 同士の直接メッセージング機構（auto delivery、`SendMessage` tool） |

**保存場所**（自動生成・手動編集不可。名前は `session-` + session ID 先頭8文字）:
- Team config: `~/.claude/teams/<team-name>/config.json`（**セッション終了で削除**。`members` 配列に各 teammate の name/agent ID/agent type）
- Task list: `~/.claude/tasks/<team-name>/`（ローカル永続・resume で保持。retention は `cleanupPeriodDays`）

#### subagent 定義を teammate として再利用

teammate spawn 時に任意の [subagent スコープ](#配置場所とスコープ4階層)（project/user/plugin/CLI）の subagent 型を名前指定で参照できる。teammate はその定義の `tools` allowlist と `model` を継承し、定義本文は teammate の system prompt に**追記**される（置換ではない）。`SendMessage` とタスク管理ツールは `tools` 制限下でも常時利用可。

> ⚠ **注意**: subagent 定義の `skills` / `mcpServers` frontmatter は **teammate 実行時には適用されない**。teammate は通常セッションと同様にプロジェクト/ユーザー設定から skills・MCP をロードする。

> **teammate のモデル既定値**: teammate は**既定でリーダー（メインセッション）のモデルを継承**する。spawn 時にプロンプトでモデルを名指しするか、`CLAUDE_CODE_SUBAGENT_MODEL` 環境変数（Subagent・Agent Teams・Dynamic Workflow のエージェントに横断適用）で上書きできる。専用の「Default teammate model」設定は存在しない。

#### Display Modes

**In-process mode（既定）**:
- 全 teammate がメインターミナルで動作
- `Shift+Down` で teammate を循環し直接メッセージ
- 任意の端末で動作

**Split-pane mode**（tmux または iTerm2 必須）:
- 各 teammate が独自ペインを持つ
- ペインクリックで直接対話
- 要件: tmux か iTerm2 + `it2` CLI

設定:
```json
{
  "teammateMode": "in-process"
}
```
（値: `"in-process"` / `"tmux"` / `"auto"`）

#### Inter-agent Messaging

- Teammates は名前を指定して相互にメッセージ送信
- メッセージは自動配信（Lead がポーリング/中継不要）
- タスク: Lead が assign するか、teammate が unassigned/unblocked task を self-claim
- 依存関係: dependency 完了で自動的に unblock
- teammate の最終回答は、内容のない "available" 通知ではなく **idle 通知に載って** team lead に届く
- background subagent は無名の兄弟／親エージェントからのメッセージにも返信できる

#### Subagents との使い分け

| 観点 | Subagents | Agent Teams |
|---|---|---|
| プロセス | 単一セッション内 | 独立した複数 Claude Code インスタンス |
| 通信 | メインへ結果返却のみ | teammate 同士が直接対話可 |
| Token コスト | 低（結果サマリーのみ） | 高（各 teammate が独自 context window） |
| 適用例 | 結果のみが重要な focused task | 議論・協調が必要な複雑作業 |

---

### 2.4 Worktree

#### 起動方法（3種類）

**1. CLI フラグ `--worktree`**
```bash
claude --worktree feature-auth      # 名前指定: .claude/worktrees/feature-auth/
claude --worktree                   # 自動生成名（例: bright-running-fox）
claude --worktree "#1234"           # PR ベース: .claude/worktrees/pr-1234/
```

**2. Subagent frontmatter**
```yaml
---
isolation: worktree
---
```
Subagent 起動時に一時 worktree を自動作成。変更がなければ終了時に自動削除。

**3. セッション中の `EnterWorktree` ツール（または `/worktree`）**

#### ファイル配置

```
.claude/worktrees/
├── feature-auth/         # 名前付き
│   ├── .git              # linked worktree（git worktree の参照）
│   ├── src/
│   └── ...
├── bugfix-123/
└── pr-1234/              # PR ベース
```

#### Branch 設定

- 既定: `origin/HEAD` から分岐（クリーン）
- `worktree.baseRef: "head"` 設定で **ローカル HEAD から分岐**（unpushed commits を持ち越し）
- 手動: `git worktree add .claude/worktrees/name -b branch-name`

#### Gitignored ファイルのコピー（`.worktreeinclude`）

```
.env
.env.local
config/secrets.json
```

- `.gitignore` 構文と同じ glob
- **gitignored** AND **パターンマッチ**するファイルだけがコピーされる

#### Background Session の自動隔離

- `/background`、`claude --bg`、Agent View dispatch のセッションは編集前に自動的に `.claude/worktrees/<auto-name>/` へ移動される
- 理由: 並列セッションが同一ファイル編集で衝突しないように

無効化:
```json
{
  "worktree": {
    "bgIsolation": "none"
  }
}
```

#### クリーンアップ

| 状況 | 動作 |
|---|---|
| 変更なし | 自動削除 + ブランチ削除 |
| 変更あり（対話モード） | 保存 / 破棄をプロンプト |
| 非対話モード（`-p` フラグ） | 手動クリーンアップが必要 |

#### Git worktree との対応

Claude Code は内部で native の `git worktree` コマンドを使用:
- 作成: `git worktree add`
- 一覧: `git worktree list`
- 削除: `git worktree remove`

手動で作成した worktree でも互換動作:
```bash
git worktree add ../project-feature -b feature
cd ../project-feature && claude     # 動作する
```

---

### 2.5 `/batch`（Bundled Skill）

#### 3フェーズ動作

| Phase | 内容 |
|---|---|
| **1. Explore** | Claude がコードベースを分析、対象ファイル・パターン・スコープを特定 |
| **2. Parallel Execute** | 5〜30の独立ワークユニットに分割。各ユニットを独自 worktree のバックグラウンド subagent に割当て。各 subagent が実装 + テスト + PR 作成 |
| **3. Summary** | 全 PR 結果を収集・統合・完了状況を報告 |

#### Work Unit 分割

- 目標: 5〜30 units
- 分割基準: ファイル独立性、関数スコープ、モジュール境界
- ユーザーは **Phase 2 開始前に plan を承認/修正可**

#### 引数

```bash
/batch <instruction>
# 例
/batch migrate src/ from Solid to React
/batch refactor TypeScript imports to use absolute paths
```

#### 内部実装

```
User: /batch refactor TypeScript
  ↓
/batch (Bundled Skill) → Phase 1: Explore
  ↓
/batch → Phase 2: Parallel Execute
  ├─ Subagent 1: refactor files 1-10  (in worktree A)
  ├─ Subagent 2: refactor files 11-20 (in worktree B)
  └─ Subagent 3: refactor files 21-30 (in worktree C)
  ↓
/batch → Phase 3: Collect + Summary
```

---

## 3. 並列処理機構の比較表（5機構の横断）

| 機構 | スコープ | 隔離レベル | 通信方式 | 最適な用途 | Token コスト |
|---|---|---|---|---|---|
| **Subagent** | 単一セッション内 | Context window 分離 | メインへ結果返却のみ | 単一セッション内のサイドタスク（探索・調査） | 低 |
| **Agent View / Background** | 複数独立セッション | プロセス分離 | 端末 detach、セッション独立 | 複数の独立タスクの並走（バグ修正 + 機能 + レビュー） | 中 |
| **Agent Teams** | 複数協調セッション | プロセス分離 + 共有 task list | teammate 間 direct messaging | 議論を伴う複雑作業（レビュー・アーキテクチャ検討） | 高 |
| **Worktree** | ファイル隔離（git） | git worktree 分離 | git branch | 並列編集の衝突回避 | - |
| **`/batch`** | コードベース全体 | 各 unit が独自 worktree | Phase 駆動 | 大規模並列リファクタ（5〜30件） | 中〜高 |

---

## 4. オーケストレーションパターン（L3 が関与する範囲）

> 詳細な実装パターン・要件別マトリクスは [ORCHESTRATION.md](./ORCHESTRATION.md) を参照。本セクションは L3 の関与範囲に限定。

### 4.1 コンテキスト隔離の階層（公式裏付け）

```
Main Claude Code Session
  ├─ CLAUDE.md（全階層ロード）
  ├─ Git status snapshot
  ├─ Tool access（フル）
  └─ [Subagent delegation]
       └─ Subagent context window
            ├─ CLAUDE.md（Explore/Plan は非ロード、general-purpose はロード）
            ├─ Git status（agent type 依存）
            ├─ Tool access（frontmatter `tools` で制御）
            ├─ Prior history（非継承）
            └─ Preloaded skills（frontmatter `skills:`）
            └─ ✅ さらに subagent を spawn 可能（既定3階層・可変。深度上限で打ち止め）

Background Session（独立プロセス）
  ├─ プロジェクト CLAUDE.md は同じ
  ├─ Worktree 隔離（独自の `.claude/worktrees/`）
  └─ [独自に Subagents / Agent Teams を spawn 可能]
```

### 4.2 公式の階層制約まとめ

| パターン | 公式記述 |
|---|---|
| **2層**: Main → Subagent | "Subagents work within a single session and can only report back to the main agent" |
| **多層**: Subagent → Subagent（既定3階層・可変） | ✅ **許可されている**: "a subagent can spawn its own subagents"。既定では深さ3の subagent が Agent tool を受け取らず spawn 不可（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で変更可） |
| **多層**: Lead → Teammates → 各 teammate が独自 Subagent | ✅ Agent Teams 経由でも可（各 teammate はフル Claude Code セッション）。ただし **teammate は teammate を spawn 不可**（nested team は禁止） |

**結論**: 純粋な多階層（Subagent から Subagent）は**既定3階層まで**許可され、`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可能（`1` で無効化）。既定を超える深さが必要な場合や、各実行単位を独立プロセス・相互通信させたい場合は環境変数を上げるか Agent Teams を用いる（ただし team の入れ子は不可）。

### 4.3 L1/L2 との連携

#### Subagent context startup（agent type 別）

| 項目 | Explore | Plan | general-purpose |
|---|---|---|---|
| CLAUDE.md | ❌ | ❌ | ✅ |
| Git status | ❌ | ❌ | ✅ |
| Tool access | 既定（限定的） | 既定（限定的） | 既定（フル） |
| Preload skills | frontmatter `skills:` 制御 | 同左 | 同左 |
| Prior history | ❌ | ❌ | ❌ |

#### Skill `context: fork` との対応

Skill 側で同等の指定が可能:
```yaml
---
context: fork
agent: Explore             # ← Subagent と同じ agent type 指定
skills: [other-skill]      # ← preload も同じ機構
---
```

→ **「Skill + context:fork」と「Subagent delegation」は表裏一体**。公式記述:
> "With context: fork, you write the task in your skill and pick an agent type to execute it. For the inverse, where you define a custom subagent that uses skills as reference material, see Subagents."

---

## 5. L3 固有のベストプラクティス

> 横断原則は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。

### 5.1 Subagent を作るべきケース（DO）
1. 毎回異なるトピックを扱う **反復的調査タスク**
2. メイン会話を **大量出力で汚染するタスク**（探索・grep結果・logs）
3. **ツール制限が必要なワーカー**（read-only での verification）
4. **専門ドメイン**（security review、test runner）
5. **複数プロジェクト共有**（User-level agent）

### 5.2 Subagent を作るべきでないケース（DON'T）
- 単発タスク → メインで inline 実行で十分
- 頻繁な対話が必要 → context switching コスト大
- メイン会話履歴に強く依存 → 履歴は非継承
- 既定の深度上限（**3階層**）を超えるネストが必要 → `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` を上げるか、Agent Teams を検討

### 5.3 Agent View（Background）の運用注意
- **1時間 idle で非 pinned はプロセス停止**（state は保持、再開時にチェックポイント復元）
- 長時間監視したいセッションは **`Ctrl+T` で pin**
- `--cwd` で複数プロジェクトを切り替えながら一覧管理
- `claude --bg "<prompt>"` で初動からバックグラウンド起動

### 5.4 Agent Teams の運用注意
- 実験機能のため **本番ワークフローへの組み込みは慎重に**
- Teammate ごとに独自 context window → token コストが嵩む
- Subagent で代替可能ならまず Subagent を試す
- tmux/iTerm2 がない環境では in-process モードに限定される

### 5.5 Worktree の運用注意
- **クリーンアップ忘れに注意**: `git worktree list` で定期確認
- 環境変数・シークレットファイルは `.worktreeinclude` で明示コピー
- 非対話モード（`-p`）では手動クリーンアップが必須
- Background session の自動隔離を切りたい場合は `worktree.bgIsolation: "none"`

### 5.6 `/batch` の運用注意
- Phase 1 終了時の plan を **必ず承認前にレビュー**（誤った分割で大量PRが作られると修正コスト大）
- 並列ユニット数が大きいほど Claude のコスト上昇
- 失敗ユニットは個別に再実行可

### 5.7 アンチパターン
1. **Subagent を既定の深度上限（3階層）を超えて深くネストしようとする** → 深度上限で Agent tool が外れ spawn 不可（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で引き上げ可能。それでも足りなければ Agent Teams を検討、ただし nested team 不可）
2. **`context: fork` をガイドラインのみのスキルで使う** → subagent が何もせず終了
3. **`disable-model-invocation: true` の Skill を `skills:` で preload** → エラー
4. **汎用タスクを Explore agent で実行** → CLAUDE.md 非ロードで必要情報欠落
5. **逐次タスクを Agent Teams で実行** → 単一セッションで十分、コスト無駄
6. **Worktree の溜め込み** → 大量の `.claude/worktrees/` を放置

---

## 6. このファイルの `[要確認]` 項目

| 項目 | セクション | 検証方法 |
|---|---|---|
| Subagent frontmatter `permissions` フィールドの正式仕様 | 2.1 | 公式 sub-agents/settings 精読 |
| Subagent auto memory の保存場所と persist 仕様 | 2.1 制約事項 | memory ドキュメント + sub-agents 相互参照 |
| Agent Teams の `TeammateIdle` / `TaskCreated` 等の Hook イベント | 2.3 | L4 phase で確認 |
| Agent View `--cwd` での worktree 認識仕様 | 2.2 | 実装精読 |
| `/batch` work unit 分割アルゴリズム詳細 | 2.5 | 公式記述なし、Claude 内部判断 |

---

## 7. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Subagents | https://code.claude.com/docs/en/sub-agents |
| Agent View | https://code.claude.com/docs/en/agent-view |
| Agent Teams | https://code.claude.com/docs/en/agent-teams |
| Worktrees | https://code.claude.com/docs/en/worktrees |
| Commands（/batch） | https://code.claude.com/docs/en/commands |
| 日本語版 | https://code.claude.com/docs/ja/sub-agents |
