# Claude Code ベストプラクティス（横断原則）

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: 全てのL?ファイルから参照される横断原則集
> 一次ソース: https://code.claude.com/docs/en/best-practices

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース | https://code.claude.com/docs/en/best-practices |
| 関連 | https://code.claude.com/docs/en/how-claude-code-works |
| 関連（Security） | https://code.claude.com/docs/en/security |
| 関連（Permission modes） | https://code.claude.com/docs/en/permission-modes |
| 関連（`/goal`） | https://code.claude.com/docs/en/goal |
| 調査日 | 2026-08-29 |

---

## 0. このリファレンスの位置づけ

本ファイルは **全レイヤー（L1〜L5）に共通する横断原則** を集約します。各L?ファイルからは「→ 詳細: [BEST_PRACTICES.md#...]」形式で参照されます。

公式の "Best practices" ページが扱う原則を、本リファレンスの構造（L1〜L5 / Orchestration）に対応させて整理しています。

---

## 1. 全体を貫く設計原則

### 1.1 大原則: コンテキストウィンドウは最も貴重な資源

公式引用:
> "Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills."

これが Claude Code 利用の **すべてのベストプラクティスの根本** です。コンテキスト消費を抑え、必要な情報だけを保持する設計を常に意識します。

#### 実践原則
- 大量の探索結果・ログ・grep 出力を**メイン会話に残さない**（Subagent / `context: fork` を使う）
- 不要になった文脈は**早めにクリア**（`/clear` を躊躇なく使う）
- 長文の参考資料は **L1 CLAUDE.md に置かない**（L2 Skill の Progressive Disclosure に切り出す）
- ステータスラインで **context 残量を常時表示**（カスタム status line で `/context` 相当を可視化）

### 1.2 強度の3段階を意識する

| 強度 | 機構 | 用途 | 公式引用 |
|---|---|---|---|
| **Advisory（助言的）** | CLAUDE.md / Rules / Output Styles | 行動指針 | "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic..."（下記引用） |
| **Deterministic（決定的）** | Hooks（exit code 2） | 必ず実行/ブロックしたい | "...hooks are deterministic and guarantee the action happens" |
| **Enforced（強制）** | settings.json `permissions` / Sandbox | tool 全体の許可/拒否 | 引用なし。`permissions` ページの tiered permission system が裏付け（下記注記） |

→ 用途に応じた強度の機構を選ぶこと。**助言で済むものを Hook 化しない、強制が必要なものを CLAUDE.md に書かない**。

公式引用（[best-practices](https://code.claude.com/docs/en/best-practices) "Set up hooks" 節）:
> "Hooks run scripts automatically at specific points in Claude's workflow. Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

**Enforced（settings）の強制性**の根拠は `permissions` ページ冒頭の "Claude Code uses a tiered permission system to balance power and safety"（引用符なしの事実参照）。

> **Auto mode の既定化**: 公式引用（`best-practices`/`how-claude-code-works`）:
> "On Pro, Max, and Team plans, auto mode is the built-in starting permission mode for interactive terminal and VS Code sessions: a separate classifier model reviews most actions instead of you and blocks only what looks risky [...] In Manual mode, the built-in starting permission mode on other plans, Claude Code asks before actions that might modify your system."
> つまり Manual（旧 `default`）は**もはや全プラン共通の既定ではない**。Pro/Max/Team では classifier モデル（既定 Claude Sonnet 5）が大半のアクションを自動審査し、スコープ逸脱・未知インフラ・悪意あるコンテンツ由来の操作のみブロックする。Permission allowlist・Sandboxing は Manual/Auto 双方に効く。組織側は `permissions.disableAutoMode: "disable"` で既定化そのものを無効化できる。

### 1.3 検証可能性の担保

公式引用:
> "Include tests, screenshots, or expected outputs so Claude can check itself. This is the single highest-leverage thing you can do."
> "Claude performs dramatically better when it can verify its own work."

#### 実践原則
- タスク依頼時に **検証基準を明示**（テストケース、期待出力、スクリーンショット）
- UI 変更は **スクリーンショット比較**（Claude in Chrome 拡張で自動化可能）
- ビルド/テスト失敗は **根本原因を直す**（エラー抑制ではなく）
- Claude には **証拠を示させる**（成功を主張するのではなく、テスト出力・コマンド結果・スクリーンショットを提示）

**公式が提示する検証手段は4段階**:
1. **1プロンプト内での指示**: 依頼に検証手順まで含める（上記の実践原則）
2. **セッション横断の `/goal` 条件**: 目標を宣言すると、毎ターン別の評価器（evaluator）が達成度を再判定する。単発の Stop hook と異なり複数セッションをまたいで効く（詳細は下記）
3. **決定的な検証ゲートとしての Stop hook**: スクリプトが pass するまでターン終了を block。ただし Claude Code は **連続8回 block でターンを強制終了**する（`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で上限変更可）
4. **第二意見としての verification subagent・dynamic workflow**: 実装した本人でない主体に検証させ、確認バイアスを避ける

```
❌ Before: "implement a function that validates email addresses"
✅ After:  "write a validateEmail function. example test cases:
            user@example.com is true, invalid is false, user@.com is false.
            run the tests after implementing"
```

#### `/goal` の仕様

公式が明示する要点:

| 項目 | 仕様 |
|---|---|
| ゴール数 | **1セッション1ゴール** |
| 条件の長さ | 最大 **4,000文字** |
| 評価器 | **設定済みの small fast model**（Claude API 既定は Haiku）。**ツールを呼ばず、会話に現れた内容のみで判定**する |
| 判定値 | **Not yet met / Met / Impossible の3値** |
| 解除 | `/goal clear`（`stop` / `off` / `reset` / `none` / `cancel` がエイリアス） |
| ゴールを解除する失敗 | **認証失敗・クレジット枯渇・auto-compaction で解消できない context overflow・モデル利用不可**の4種 |

best-practices 側の記述「If Claude stalls, Claude Code eventually stops the run with the goal still set」も同ページで詳述されている——**ツール未使用が数ターン続くとループを止め、警告を出し、ゴールを残したまま制御を返す**。

**`/goal` の前提条件**:

- `/goal` は**セッションスコープの prompt ベース Stop hook のラッパー**であり、**hooks と同じ workspace trust ルール**の下で提供される。
- **`disableAllHooks: true`（設定優先順位適用後）または managed settings の `allowManagedHooksOnly` が設定されていると利用不可**になる（[L4_AUTOMATION.md §2.2](./L4_AUTOMATION.md) にも収録。いずれのケースも黙って何もしないのではなく理由を表示する）。
- **バックグラウンド作業中は評価がスキップ**され、**30分待機後に check-in が発生**（以後は2倍ずつ最大4倍まで延伸）。
- **対話セッションでの idle check-in はゴールあたり最大3回**。**`CLAUDE_CODE_GOAL_CHECKIN_MINUTES` で調整・`0` で無効**。

---

## 2. ワークフロー原則

### 2.1 Explore → Plan → Code → Commit（4フェーズ）

公式引用:
> "Separate research and planning from implementation to avoid solving the wrong problem."

| Phase | モード | 内容 |
|---|---|---|
| **Explore** | plan mode | Claude がファイルを読み、質問に答え、変更しない |
| **Plan** | plan mode | 詳細な実装プランを作成。`Ctrl+G` でエディタ編集可 |
| **Implement** | default mode | プランに沿って実装、検証 |
| **Commit** | default mode | 説明的メッセージで commit、PR 作成 |

#### 採用判断
- **Plan モードを使うべき**: アプローチが不明確 / 複数ファイル変更 / 不慣れなコード
- **Plan モードを使わなくてよい**: 1文で diff が説明できる小さな変更（typo修正、log追加、リネーム）

公式注記:
> "If you could describe the diff in one sentence, skip the plan."

### 2.2 具体的なプロンプト（Specific Context）

公式引用:
> "The more precise your instructions, the fewer corrections you'll need."

| 戦略 | Before | After |
|---|---|---|
| **タスクを限定** | "add tests for foo.py" | "write a test for foo.py covering the edge case where the user is logged out. avoid mocks." |
| **情報源を指す** | "why does ExecutionFactory have such a weird api?" | "look through ExecutionFactory's git history and summarize how its api came to be" |
| **既存パターンを参照** | "add a calendar widget" | "look at how existing widgets are implemented on the home page. HotDogWidget.php is a good example. follow the pattern to..." |
| **症状を述べる** | "fix the login bug" | "users report that login fails after session timeout. check src/auth/, especially token refresh. write a failing test that reproduces the issue, then fix it" |

#### Rich Content の活用
- **`@` でファイル参照**: `@README.md`（説明より直接参照）
- **画像を直接貼る**: コピペ・ドラッグ＆ドロップ
- **URL を渡す**: `/permissions` で頻用ドメインを allowlist
- **データを pipe**: `cat error.log | claude`
- **Claude に取得させる**: Bash / MCP / Read を駆使して自力収集

### 2.3 Course-correct Early and Often

公式引用:
> "Correct Claude as soon as you notice it going off track."

| 操作 | 用途 |
|---|---|
| `Esc` | Claude を中断（context 保持） |
| `Esc + Esc` または `/rewind` | rewind メニュー（会話/コード復元、要約） |
| "Undo that" | 直前の変更を取り消し |
| `/clear` | 完全リセット |

公式の判断基準:
> "If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run `/clear` and start fresh with a more specific prompt."

---

## 3. レイヤー別ベストプラクティス（横断原則）

### 3.1 L1: コンテキスト管理（CLAUDE.md / Rules / Auto Memory）

→ レイヤー固有の詳細は [L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md) を参照。

#### CLAUDE.md の原則
- **`/init` で初回生成**してから手作業で精錬
- **200行以下を厳守**（公式: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"）
- **削除テスト**: 各行に「これを削除したら Claude がミスするか？」を問う。NO なら削除
- 強調記法（"IMPORTANT" / "YOU MUST"）で重要度を上げる
- 矛盾する複数指示を同居させない
- 頻繁に変わる情報を書かない（リリース日程・進行中バグ）

#### Include / Exclude の表（公式）

| ✅ Include | ❌ Exclude |
|---|---|
| Bash commands Claude can't guess | コードから自明な情報 |
| 言語デフォルトと異なるコードスタイル規則 | 言語の標準的慣習 |
| テスト実行方法・推奨ランナー | 詳細な API ドキュメント（リンクで代替） |
| リポジトリ作法（branch命名、PR規約） | 頻繁に変わる情報 |
| プロジェクト固有の設計判断 | 長文の説明・チュートリアル |
| 開発環境の癖（必要な環境変数） | ファイルごとの逐次説明 |
| よくある罠・非自明な振る舞い | "clean code を書け" など自明な原則 |

#### `@import` の活用
```markdown
See @README.md for project overview and @package.json for npm commands.

# 詳細指示
- Git: @docs/git-instructions.md
- 個人補助: @~/.claude/my-project-instructions.md
```

#### Auto Memory の原則
- Claude が「次回も役立つ」と判断したものだけ記録
- ユーザーが `/remember` で明示追加可
- MEMORY.md は **索引**（200行/25KB制限）として運用、本体は topic files へ

---

### 3.2 L2: スキル

→ 詳細は [L2_SKILLS.md](./L2_SKILLS.md)。

#### Skill 作成原則
- **同じ指示・チェックリスト・多段手順を繰り返し貼り付けている** → Skill 化のシグナル
- **CLAUDE.md の一部が「事実」ではなく「手順」に成長した** → Skill に切り出す
- 副作用ある操作（deploy / commit / send-message）は **`disable-model-invocation: true`** + 明示呼び出し
- description は最重要キーワードを冒頭に（1536文字 truncate 制限）
- 長大な参考資料は supporting files に分離（Progressive Disclosure）
- `context: fork` は **actionable task を持たせる**（ガイドラインのみは禁止）

#### Skill description の書き方
- ❌ "Helpful skill"（曖昧で発動しない）
- ✅ "Summarizes uncommitted changes and flags risks like missing error handling"
- 自然な発話（「when the user asks ...」）を含める
- `/doctor` で description budget overflow を確認

---

### 3.3 L3: エージェントと並列処理

→ 詳細は [L3_AGENTS.md](./L3_AGENTS.md)。

#### Subagent 採用原則
- **メイン会話を大量出力で汚染するタスク** → Subagent
- **ツール制限が必要なワーカー** → Subagent（`tools` / `disallowedTools`）
- **専門ドメインの継続的役割** → Subagent
- **複数プロジェクトで再利用** → User-level Subagent
- **Subagent から Subagent を spawn** → ✅ **可**。**既定3階層まで**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可）。既定超や独立プロセス・相互通信が必要なら環境変数を上げるか Agent Teams / `/batch`（fork は別の fork を spawn 不可、Agent Teams は nested team 不可）

#### モデルティア選択（Opus / Sonnet / Haiku の3段階）
Subagent の `model:` は、タスクの性質に応じて3段階から選ぶ（`model:` の取りうる値は [L3_AGENTS.md §2.1](./L3_AGENTS.md)）。Subagent は親のコストティアを超えないことを前提とする。

| ティア | 採用するタスク | 例 |
|---|---|---|
| `opus` | 設計判断・広範な文脈把握・整合性維持を伴う | アーキテクチャ設計、複数ファイル横断の更新判断 |
| `sonnet` | 文脈推論・文章合成・正典参照を伴う標準タスク（**既定**） | 仕様準拠の生成、コードレビュー、コードベース探索 |
| `haiku` | 下記3基準を **すべて満たす** 機械的タスクに限る | 収集済み回答の固定フォーマットへの構造化 |

> **Haiku 採用基準（以下をすべて満たす場合にのみ採用）**:
> 1. 設計判断・文脈推論を伴わない（テンプレートの機械的充填・固定フォーマット出力に限る）
> 2. 正典ファイル（`docs/`）を参照せずに完結できる（生成/判断 Skill を preload しない）
> 3. 失敗コストが低い（後続エージェントまたはレビュー機構が出力内容を検証する）

3基準のいずれか1つでも欠ければ `sonnet` 以上を選ぶ。迷う場合の既定は `sonnet`。コスト最適化のために安易に `haiku` へ落とすと、文脈推論を要するタスクで品質が低下し、かえって手戻りコストが増える点に注意する。

> **モデルエイリアスの補足**: `model:` は `opus`/`sonnet`/`haiku` に加え `fable`（Claude Fable 5, Mythos クラス）も指定可能。本システムの canon フローでは `fable` を既定採用しないが、公式エイリアスとして利用できる。**`opus` の既定モデルは Claude Opus 5（`claude-opus-5`、1M context）**（Bedrock/Vertex/Claude Platform on AWS の既定は引き続き Opus 4.8）。

#### Subagent for Investigation（探索の隔離）
公式引用:
> "Use subagents to investigate how our authentication system handles token refresh..."

→ コードベース探索は **subagent に委譲** することで、メイン会話の context を保護する。

#### Adversarial Review（敵対的レビュー）
公式引用:
> "Before treating a task as done, have a subagent review the diff in a fresh context and report gaps."

→ 実装した同じ Claude にレビューさせず、**fresh context の Subagent** に diff と criteria だけを渡してレビューさせる。

注意:
> "A reviewer prompted to find gaps will usually report some, even when the work is sound."
> "Tell the reviewer to flag only gaps that affect correctness or the stated requirements, and treat the rest as optional."

#### Parallel Sessions の使い分け
| 方法 | 用途 |
|---|---|
| **Worktree** | git worktree で分離。ファイル衝突回避 |
| **Desktop app** | 視覚的に複数ローカルセッションを管理 |
| **Claude Code on the web** | Anthropic クラウドで隔離 VM 実行 |
| **Agent view**（research preview） | 複数セッションを一覧・横断管理する UI（research preview 段階） |
| **Cross-session messaging** | 公式の "Run multiple Claude sessions" 一覧に含まれる（"let the sessions you run yourself pass findings to each other"）——自分で走らせているセッション同士に findings を渡させる（[L3_AGENTS.md §2.2](./L3_AGENTS.md) 参照） |
| **Agent Teams** | 複数セッション協調。公式は "experimental and disabled by default" と明記（既定無効の実験機能） |

#### Writer/Reviewer パターン
```
Session A (Writer):   Implement a rate limiter
Session B (Reviewer): Review @src/middleware/rateLimiter.ts for edge cases
Session A:            Address these issues: [Session B output]
```

---

### 3.4 L4: 自動化・外部連携

→ 詳細は [L4_AUTOMATION.md](./L4_AUTOMATION.md)。

#### Hook 採用原則
公式引用:
> "Use hooks for actions that must happen every time with zero exceptions."
> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

- 危険操作（`rm -rf`、本番変更、シークレット出力）は **PreToolUse + exit 2** で確実にブロック
- 長時間処理は `async: true` または別プロセス委譲
- Claude に hook を書かせる: "Write a hook that runs eslint after every file edit"
- `/hooks` で現在の hook 設定を確認

#### Permission Configuration
公式引用:
> "After the tenth approval you're not really reviewing anymore, you're just clicking through."

| 方法 | 用途 |
|---|---|
| **Auto mode** | 分類器がリスクの高いコマンドのみブロック。タスクの大筋を信頼するとき |
| **Permission allowlist** | `/permissions` で `npm run lint`, `git commit` など個別許可 |
| **Sandbox** | OS-level 隔離。filesystem / network 制限 |

**Auto mode の設定・挙動**: `/permissions` の **Auto mode タブ**で classifier ルールを閲覧・編集できる。

**`/goal` の前提条件**: `/goal` は hooks 系設定の影響を受ける（`disableAllHooks: true` / `allowManagedHooksOnly` で利用不可）。詳細は §1.3 の「`/goal` の前提条件」を参照。

公式引用:
> "Tell Claude Code to use CLI tools like `gh`, `aws`, `gcloud`, and `sentry-cli` when interacting with external services."

→ MCP を使わずとも CLI tool でカバーできる場合が多い。

#### MCP 採用原則
公式引用:
> "Connect a server when you find yourself copying data into chat from another tool."

- 採用判断: **同じデータを何度も貼り付けている** ときに導入
- HTTP transport 推奨（SSE は廃止予定）
- 認証情報は `${VAR}` 環境変数経由
- 信頼できないサーバーは追加しない（prompt injection リスク）

---

### 3.5 L5: 配布・拡張

→ 詳細は [L5_DISTRIBUTION.md](./L5_DISTRIBUTION.md)。

#### Plugin 化のシグナル
- 複数プロジェクトで同じ Skill/Agent/Hook/MCP を使っている
- チームに配布したい
- 第三者に公開したい（official / community marketplace）

#### Plugin 設計原則
- `version` を semver で明記（ユーザーの意図したタイミングで更新）
- 永続データは `${CLAUDE_PLUGIN_DATA}` へ（`${CLAUDE_PLUGIN_ROOT}` は更新で消える）
- 機微情報は `userConfig` の `sensitive: true`
- `claude plugin validate --strict` を CI に組み込む
- LSP plugin はチーム必須言語のみ（メモリ消費大）

#### Code Intelligence Plugin
公式引用（[discover-plugins](https://code.claude.com/docs/en/discover-plugins)）:
> "If you work with a typed language, install a code intelligence plugin to give Claude precise symbol navigation and automatic error detection after edits."

→ TypeScript / Python / Rust / Go 等を扱うプロジェクトでは **必ず該当 LSP plugin を導入**。

---

## 4. オーケストレーション原則

→ 詳細は [ORCHESTRATION.md](./ORCHESTRATION.md)。

### 4.1 機構選択の判断軸
- **強度**: advisory（CLAUDE.md）/ deterministic（Hook）/ enforced（settings）
- **発火**: イベント駆動（Hook） / 呼び出し駆動（Skill, Subagent）
- **隔離**: 同 context（Skill inline） / 独立 context（Skill `context:fork`, Subagent）/ 独立プロセス（Background, Team）
- **並列性**: 単独 / Worktree 隔離 / `/batch` 並列 / Agent Teams 協調

### 4.2 公式制約の遵守
- Subagent ネストは **既定3階層**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で可変）。既定超や独立プロセスが必要なら環境変数を上げるか Agent Teams / `/batch`
- fork は別の fork を spawn しない（named subagent のみ可）／ Agent Teams の nested team は不可（teammate は teammate を spawn できない）
- Plugin Agent には `hooks` / `mcpServers` / `permissionMode` を指定しない（**非対応**）
- ガイドラインのみの Skill を `context: fork` しない（actionable task が必要）

---

## 5. 会話・セッション管理

### 5.1 Codebase 質問は senior engineer へ聞くように

公式引用:
> "You can ask Claude the same sorts of questions you would ask another engineer:
> - How does logging work?
> - How do I make a new API endpoint?
> - What does `async move { ... }` do on line 134 of `foo.rs`?
> - What edge cases does `CustomerOnboardingFlowImpl` handle?"

→ 新コードベースのオンボーディングに Claude Code を活用。特殊なプロンプト不要、自然に質問する。

### 5.2 Let Claude Interview You

公式引用:
> "For larger features, have Claude interview you first. Start with a minimal prompt and ask Claude to interview you using the AskUserQuestion tool."

```
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.

Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have considered.

Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

→ spec ができたら新セッションで実装に集中する。

### 5.3 Context Management

| 操作 | 用途 |
|---|---|
| `/clear` | 無関係タスク間で完全リセット |
| `/compact` | 自動圧縮（auto-compaction） |
| `/compact <instructions>` | 圧縮時の重点指定（例: `/compact Focus on the API changes`） |
| `Esc + Esc` または `/rewind` | チェックポイント復元 / 部分要約 |
| `/btw` | 一時的な質問（履歴に残さない） |

CLAUDE.md でカスタム圧縮指示も可:
```markdown
When compacting, always preserve the full list of modified files and any test commands.
```

### 5.4 Checkpoint と Rewind

公式引用:
> "Every prompt you send creates a checkpoint."

- Claude はファイル変更前に自動 snapshot
- `Esc + Esc` または `/rewind` で会話/コード/両方を復元、または「Summarize from here / up to here」で部分要約
- ⚠ Checkpoint は **Claude の変更のみ追跡**、外部プロセスは含まない（git の代替ではない）

### 5.5 Resume Conversations
- `claude --continue` で直近セッション再開
- `claude --resume` で一覧から選択
- `/rename` で descriptive な名前（例: `oauth-migration`）

---

## 6. 自動化・スケール

### 6.1 Non-interactive Mode（`claude -p`）

公式引用:
> "Use `claude -p 'prompt'` in CI, pre-commit hooks, or scripts. Add `--output-format stream-json --verbose` for streaming JSON output."

```bash
# One-off
claude -p "Explain what this project does"

# JSON
claude -p "List all API endpoints" --output-format json

# Streaming
claude -p "Analyze this log file" --output-format stream-json --verbose
```

**セッション永続化**: 公式引用（`best-practices`）:
> "The run still creates a resumable session unless you pass `--no-session-persistence`."

→ `-p` の非対話実行も既定で resumable なセッションを作る（`--no-session-persistence` を渡さない限り）。CI で使い捨てにしたい場合は明示的にこのフラグを付けること。

### 6.2 Fan Out Across Files

```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from React to Vue. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)"
done
```

→ 大量ファイル変換は `--allowedTools` で権限スコープを限定して並列実行。

### 6.3 Auto Mode（無監視実行）

```bash
claude --permission-mode auto -p "fix all lint errors"
```

公式引用:
> "A classifier model reviews commands before they run, blocking scope escalation, unknown infrastructure, and hostile-content-driven actions."

**注意**: 公式引用（`best-practices`／`permission-modes`）:
> "When the classifier repeatedly blocks actions in a non-interactive run with the `-p` flag, Claude Code doesn't stop the run." "...a non-interactive `-p` run without a `--permission-prompt-tool` has no prompt to fall back to. When repeated blocks reach a threshold, the action doesn't run and Claude keeps working, in the main conversation and in its subagents alike.… Claude Code doesn't stop the run in either case."

正しくは: しきい値（**連続3回 または 通算20回**）に達すると、**対話セッションでは** auto mode が一時停止しプロンプトへ戻る。**`--permission-prompt-tool` を持たない `-p` 実行では** プロンプトに戻る先が無いため、当該アクションは実行されないまま Claude は作業を継続し、**run 自体は停止しない**（main conversation・subagent とも同様）。しきい値のカウンタは許可されたアクションでリセットされる。

---

## 7. セキュリティ原則

### 7.1 信頼境界の認識
- Prompt injection リスク: **信頼できない MCP / Channel / 外部コンテンツ** からの指示は無視する設計
- 公式: "Verify you trust each server before connecting it. Servers that fetch external content can expose you to prompt injection risk."

### 7.2 機微情報の扱い
- `.mcp.json` に API key を直書きしない → `${VAR}` 環境変数展開
- Plugin の `userConfig` `sensitive: true` でキーチェーン保存
- Worktree の `.worktreeinclude` で `.env` 等を明示制御

### 7.3 Channels の運用
- allowlist policy を必ず `allowlist` に lockdown
- Permission relay は **信頼できる sender のみ**（リモートからツール承認可能になる）
- `--dangerously-load-development-channels` は本番禁止

### 7.4 Plugin の信頼
公式引用:
> "Make sure you trust a plugin before installing it. Anthropic does not control what MCP servers, files, or other software are included in plugins."

→ 不明な marketplace / plugin は追加しない。組織では Managed Marketplace Restrictions で制限。

### 7.5 Sandbox・権限まわりの強化
- `sandbox.network.strictAllowlist`: 許可リスト外ホストへの通信をプロンプトなしで一律拒否（サンドボックス化されたコマンド向け）
- `sandbox.filesystem.disabled`: ネットワーク制御は維持したままファイルシステム隔離のみスキップ
- 資格情報マスキング拡張: `extract`/`onExtractNoMatch`（構造化env）・`decode: "jwt"`/`maskClaims`（JWT）・`awsPairs`/`sigv4`（AWS SigV4）。`network.tlsTerminate` が必要で、user/managed/`--settings` からのみ有効
- **`Write`/`NotebookEdit`/`Glob` を許可ルールに指定した場合の起動時警告**: これらは書き込み/一覧ツールであり、意図した制御には `Edit`/`Read` の方が適切な場合が多い

### 7.6 権限ルールの追加変更
- **macOS のワイルドカード read-deny ルールの優先順位**: 例えば `**/.env` のような read-deny ルールが、許可した read 領域の**内側でも優先**される。マッチしたディレクトリ配下は許可 read の対象であっても除外され、リネームによる回避もできない
- **auto mode 下での `Monitor` 審査**: auto mode 実行中は `Monitor` の allow ルールが脇に置かれ、`Bash` と同様に classifier の審査対象になる

### 7.7 Bash 権限ルールの注意点

- サブコマンドより前にワイルドカードを置く Bash allow ルール（`Bash(git * main)` 等）は、サブコマンド前に挿入されたオプションにも意図せずマッチしてしまうため、起動時に警告が出る。

### 7.8 `--restricted`（制限実行モード）

**`--restricted`（または `CLAUDE_CODE_RESTRICTED=1`）**という制限実行モードがある。

公式が挙げる挙動:
- **コマンドやコードを実行するビルトインツールと `WebFetch` を除去**（`--tools` で名指しした場合を除く）
- **ファイルツールは作業ディレクトリ内に限定**
- **`bypassPermissions` を拒否**
- **user / project / local の設定ファイルを無視**

> **出典に関する留保**: 本項は changelog を根拠とする。`env-vars` ページ本文では確認できていない（同ページの応答が毎回途中で切れるため、探索範囲自体が不完全）。`cli-reference` 側での確認は未検証。

### 7.9 サンドボックス・managed settings の承認要件

- **サンドボックスの TLS を終端する／サンドボックストラフィックを自前プロキシへ回す／資格情報を注入する／サンドボックス隔離を弱める server-managed settings は、適用前に承認が必要**である。
- **managed settings の承認ダイアログは前回承認時からの変更分のみを列挙**する。

---

## 8. アンチパターン集（公式 + 本リファレンス独自）

### 8.1 公式が明示する「Common Failure Patterns」

| パターン | 問題 | 対処 |
|---|---|---|
| **The kitchen sink session** | 1つのタスクから関係ないタスクへ移って context が無関係情報で埋まる | `/clear` で無関係タスク間をリセット |
| **Correcting over and over** | 同じ問題で2回以上修正すると context が失敗アプローチで汚染 | 2回失敗したら `/clear` + より具体的なプロンプト |
| **The over-specified CLAUDE.md** | 長すぎて重要ルールが埋没、Claude が無視 | ルーズに削る。既に正しく動作するならその行は削除 |
| **The trust-then-verify gap** | もっともらしい実装が edge case を扱わない | 必ず検証手段（テスト・スクリプト・スクリーンショット）を渡す |
| **The infinite exploration** | スコープ未指定で "investigate" させると数百ファイル読む | Subagent で隔離、または narrow scope を明示 |

### 8.2 レイヤー別アンチパターン

#### L1
- CLAUDE.md に多段手順を書く → L2 Skill 化
- 強制したいルールを CLAUDE.md に書く → L4 Hook
- Auto Memory に依存しきって CLAUDE.md を空にする

#### L2
- ガイドラインのみの Skill を `context: fork`
- Description を曖昧にする（"Helpful skill"）
- `allowed-tools` 過剰許可 → セキュリティリスク

#### L3
- Subagent を既定の深度上限（3階層）を超えてネスト → 不可（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可）
- Plugin Agent に `hooks`/`mcpServers`/`permissionMode` 指定 → セキュリティ非対応
- 逐次タスクを Agent Teams で → コスト無駄

#### L4
- Hook 内で無限ループ（PostToolUse hook が自身を発火）
- Hook で長時間同期処理（timeout超過）
- API key を `.mcp.json` 直書き
- `ENABLE_TOOL_SEARCH=false` で大量 MCP server を upfront ロード

#### L5
- plugin root より外への path 参照（`../shared-utils`）
- `${CLAUDE_PLUGIN_ROOT}` に永続データを書く → 更新で消える
- `.claude-plugin/` 配下に components 配置 → 認識されない
- 不要言語の LSP plugin を全インストール → メモリ消費

---

## 9. 直感を養う（公式 "Develop your intuition"）

公式引用:
> "The patterns in this guide aren't set in stone. They're starting points that work well in general, but might not be optimal for every situation."

ベストプラクティスは出発点であり、状況に応じて逸脱してよい:
- 深い問題で履歴が価値を持つときは context を貯める
- 探索的タスクではプランをスキップしてよい
- 制約を加える前に Claude の解釈を見たいときは曖昧プロンプトが正しい

公式の助言:
> "Pay attention to what works. When Claude produces great output, notice what you did. When Claude struggles, ask why."

---

## 10. ベストプラクティス チェックリスト

実装着手前 / セッション開始時に確認:

### コンテキスト管理
- [ ] CLAUDE.md は 200 行以下か
- [ ] 不要な文脈は `/clear` でリセットしたか
- [ ] 長大な参考資料は L2 Skill に切り出したか
- [ ] context 残量を status line で可視化しているか

### タスク設計
- [ ] 検証基準（テスト・スクリーンショット・期待出力）を渡したか
- [ ] アプローチが不明確なら plan mode を使ったか
- [ ] 既存パターンを参照させたか
- [ ] 症状ではなく具体的な「fix した状態」を指定したか

### 機構選択
- [ ] 強度（advisory/deterministic/enforced）の選択は適切か
- [ ] Subagent nesting が既定の深度上限（3階層）以内に収まっているか（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で明示的に引き上げているか）
- [ ] 必要最小限のツール権限のみ与えたか
- [ ] Worktree で衝突回避が必要か検討したか

### セキュリティ
- [ ] 信頼できない MCP / Channel / Plugin を追加していないか
- [ ] 機微情報を `${VAR}` 環境変数経由にしたか
- [ ] Allowlist policy を lockdown したか
- [ ] Sandbox 利用を検討したか

### スケール
- [ ] 大量ファイル処理は `--allowedTools` で権限スコープしたか
- [ ] 並列タスクは Worktree / Background / Agent Teams のどれが適切か
- [ ] Adversarial review を仕込んだか（fresh context での gap 検出）

---

## 11. 公式 Best Practices 全項目リスト（参照用）

公式 https://code.claude.com/docs/en/best-practices の見出しを原文のまま列挙（本リファレンス内の対応セクションを併記）:

| 公式見出し | 本リファレンス対応 |
|---|---|
| Give Claude a way to verify its work | §1.3 |
| Explore first, then plan, then code | §2.1 |
| Provide specific context in your prompts | §2.2 |
| Configure your environment | §3 全体 |
| → Write an effective CLAUDE.md | §3.1 |
| → Configure permissions | §3.4 |
| → Use CLI tools | §3.4 |
| → Connect MCP servers | §3.4 |
| → Set up hooks | §3.4 |
| → Create skills | §3.2 |
| → Create custom subagents | §3.3 |
| → Install plugins | §3.5 |
| Communicate effectively | §5 |
| → Ask codebase questions | §5.1 |
| → Let Claude interview you | §5.2 |
| Manage your session | §5 全体 |
| → Course-correct early and often | §2.3 |
| → Manage context aggressively | §5.3 |
| → Use subagents for investigation | §3.3 |
| → Rewind with checkpoints | §5.4 |
| → Resume conversations | §5.5 |
| Automate and scale | §6 |
| → Run non-interactive mode | §6.1 |
| → Run multiple Claude sessions | §3.3 |
| → Fan out across files | §6.2 |
| → Run autonomously with auto mode | §6.3 |
| → Add an adversarial review step | §3.3 |
| Avoid common failure patterns | §8.1 |
| Develop your intuition | §9 |

---

## 12. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Best practices（一次ソース） | https://code.claude.com/docs/en/best-practices |
| How Claude Code works | https://code.claude.com/docs/en/how-claude-code-works |
| Extend Claude Code（機能一覧） | https://code.claude.com/docs/en/features-overview |
| Common workflows | https://code.claude.com/docs/en/common-workflows |
| Security | https://code.claude.com/docs/en/security |
| Permission modes | https://code.claude.com/docs/en/permission-modes |
| 日本語版 | https://code.claude.com/docs/ja/best-practices |

---

## 13. このリファレンス完成にあたっての位置づけ

本ファイルは **Claude Code 正典リファレンス本体9ファイル（索引・各レイヤー・横断原則・`TOOLS.md`。一次ソース管理の `SOURCES.md` を除く）中の最終ファイル** です。L1〜L5の各レイヤー、ORCHESTRATION（2層・3層）、そして本 BEST_PRACTICES が揃ったことで、Claude Code は **ユーザー要件を受け取った際の意思決定** を以下の流れで行えます:

```
ユーザー要件
   ↓
[00_INDEX.md §4 機能選択フローチャート]
   ↓ 該当レイヤー特定
[L1〜L5_*.md] - 詳細仕様確認
   ↓ 複数機構を組み合わせる場合
[ORCHESTRATION.md] - 2層・3層パターン適用
   ↓ 設計確定
[BEST_PRACTICES.md] - 横断原則とアンチパターン確認
   ↓
実装着手
```

各ファイルから本 BEST_PRACTICES.md へ参照リンクが張られているため、Claude Code 自身が状況に応じて必要な原則を引き出すことができます。
