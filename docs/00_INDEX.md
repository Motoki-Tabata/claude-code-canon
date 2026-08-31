# Claude Code カスタマイズ機能 正典リファレンス - 全体INDEX

> **このリファレンスの第一読者は Claude Code 自身です。**
> ユーザー要件を受け取った際、「どの機能をどう使うか」を判断するための根拠ドキュメントとして機能します。
> 第二読者は人間の開発者（運用・保守担当）です。

---

## メタ情報

| 項目 | 値 |
|---|---|
| 確認した Claude Code バージョン | **v2.1.251**（2026年8月時点） |
| 調査日 | 2026-08-29 |
| 一次ソース（英語） | https://code.claude.com/docs/en/ |
| 一次ソース（日本語） | https://code.claude.com/docs/ja/ |
| 全体ドキュメント目次 | https://code.claude.com/docs/llms.txt |
| GitHub リポジトリ | https://github.com/anthropics/claude-code |
| 補助参考（独自整理） | Zenn: ino_h/2026-05-15-claude-code-skills-orchestration, Qiita: dai_chi/63b15050cc1280c45f86 |

> 本リファレンスは v2.1.251 時点の Claude Code の仕様に基づきます。

---

## 1. このリファレンスの使い方

### Claude Code（自身）が読む場合

ユーザー要件を受け取ったら、次の手順で進めること:

1. **§4 機能選択フローチャート** を最初に参照し、要件を該当レイヤー（L1〜L5）に分類する
2. 該当する `L?_*.md` ファイルを読み、「採用すべき状況 / 採用すべきでない状況」を確認する
3. 2つ以上のレイヤー機能を組み合わせる場合は [ORCHESTRATION.md](./ORCHESTRATION.md) を参照する
4. 実装着手前に [BEST_PRACTICES.md](./BEST_PRACTICES.md) の対応原則を確認する

### 人間の開発者が読む場合

- まず本INDEXで全体像を把握 → 関心レイヤーの個別ファイルを精読 → 実装前にBEST_PRACTICESで原則確認、の順を推奨

---

## 2. 機能レイヤー全体図

> **L1〜L5は本リファレンス独自の整理用語**です。公式ドキュメントは "Core Features" / "Agent SDK & Development" / "Advanced Topics" 等の章立てで構成されています（§9 用語集 参照）。

```
Claude Code カスタマイズ機能
│
├── [L1] コンテキスト管理（常時ロード・静的指示）           → L1_CONTEXT_MANAGEMENT.md
│   ├── CLAUDE.md
│   ├── Rules（.claude/rules/）
│   └── Auto Memory（MEMORY.md）
│
├── [L2] スキル（オンデマンドロード・動的実行）              → L2_SKILLS.md
│   ├── Skills（SKILL.md）
│   ├── Slash Commands
│   └── context:fork（フック内フック相当 / agent handler）
│
├── [L3] エージェントと並列処理                              → L3_AGENTS.md
│   ├── Subagents（単一セッション内代理実行 / nesting 既定3階層・可変 / fork既定ON / 既定 background 実行）
│   ├── Agent View（バックグラウンドセッション管理）
│   ├── Agent Teams（複数インスタンス協調 / 実験機能・暗黙1チーム/セッション）
│   ├── Worktree（Git隔離）
│   └── /batch（大規模並列リファクタリング）
│
├── [L4] 自動化・外部連携                                    → L4_AUTOMATION.md
│   ├── Hooks（31イベント / 5ハンドラー種）
│   ├── MCP（Model Context Protocol）
│   └── Channels（外部イベント注入）
│
└── [L5] 配布・拡張                                          → L5_DISTRIBUTION.md
    ├── Plugins（Skill/Agent/Hook/MCP/LSP/Command を一括配布）
    ├── Plugin Marketplaces（Official / Community / Custom）
    ├── LSP Servers
    ├── Status Lines
    ├── Output Styles
    └── Channels（外部イベントトリガー）
```

> **[要確認: changelog v2.1.251 は `PreModelSwitch`／`PostModelSwitch` の追加を宣言するが、`hooks` リファレンスページは3回の独立取得すべてで31件のまま両名が確認できていない。次回再検証]**
>
> 上図 L4 の「Hooks（**31イベント** / 5ハンドラー種）」の数値は、この矛盾が未解決のため **31 のまま変更していない**（33 への更新可否は判定しない）。詳細な矛盾の内容と3回の取得結果は [L4_AUTOMATION.md §2.1 全 Hook イベント](./L4_AUTOMATION.md) の同名注記を参照。

---

## 3. 各レイヤーの一覧表

| レイヤー | ファイル | 含まれる機能 | 1行説明 |
|---|---|---|---|
| L1 | [L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md) | CLAUDE.md, Rules, Auto Memory | セッション開始時に **常時ロード**される静的指示・知識 |
| L2 | [L2_SKILLS.md](./L2_SKILLS.md) | Skills, Slash Commands, context:fork | **オンデマンド**にロードされる動的ワークフローパッケージ |
| L3 | [L3_AGENTS.md](./L3_AGENTS.md) | Subagents, Agent View, Agent Teams, Worktree, /batch | **コンテキスト分離・並列処理**のための代理エージェント |
| L4 | [L4_AUTOMATION.md](./L4_AUTOMATION.md) | Hooks, MCP, Channels | **イベント駆動の自動化** と **外部システム連携** |
| L5 | [L5_DISTRIBUTION.md](./L5_DISTRIBUTION.md) | Plugins, Marketplaces, LSP, Status Lines, Output Styles | 機能群を **配布・再利用** するパッケージング |
| 横断 | [ORCHESTRATION.md](./ORCHESTRATION.md) | 2層・3層パターン | 複数レイヤーを組み合わせる **オーケストレーション設計** |
| 横断 | [BEST_PRACTICES.md](./BEST_PRACTICES.md) | 全体設計原則 | レイヤー横断の **推奨パターンとアンチパターン** |
| 横断 | [TOOLS.md](./TOOLS.md) | 正規ツール名45種 | L1〜L4 から参照される **ツール名の同定リファレンス** |

---

## 4. 機能選択フローチャート

### 4.1 入口の判定（YES/NO ツリー）

```
ユーザー要件を受け取った
        │
        ▼
[Q1] その指示・知識は「毎セッションで必ず必要」か？
        │
        ├─ YES → [Q1a] プロジェクト固有 / ユーザー固有 / ルール（パス別）か？
        │         │
        │         ├─ 固定の指示 / コード規約     → L1: CLAUDE.md
        │         ├─ パス別に適用したいルール    → L1: .claude/rules/
        │         └─ Claude自身に学習させたい    → L1: Auto Memory (MEMORY.md)
        │
        └─ NO → [Q2] 特定のタスク発動時にだけ呼ばれれば良いか？
                  │
                  ├─ YES → [Q2a] ワークフローを Claude が自動選択 or ユーザー明示呼び出し？
                  │         │
                  │         ├─ Claude自動選択（description で判定）  → L2: Skills
                  │         ├─ ユーザー `/name` で明示呼び出し       → L2: Slash Commands
                  │         └─ メイン文脈を汚さず実行したい           → L2: context:fork / agent handler
                  │
                  └─ NO → [Q3] 「実装作業」を伴うか？
                            │
                            ├─ YES → §4.2「並列性・隔離」サブツリーへ
                            └─ NO  → §4.3「自動化・外部連携」サブツリーへ
```

> **補足**: Subagent は別 Subagent を spawn できる。上限は**既定3階層**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で調整可、`1` で無効化）。深度上限の Subagent は Agent tool を受け取らず、それ以上は spawn できない。詳細は [L3_AGENTS.md §2.1](./L3_AGENTS.md)。

### 4.2 サブツリー: 並列性・隔離（L3への分岐）

```
[Q3-YES] 実装作業を伴う
        │
        ▼
[Q4] 並列実行が必要か？
        │
        ├─ NO（逐次・専門タスク） → L3: Subagents（単一セッション内代理）
        │
        └─ YES → [Q4a] 何を並列化したいか？
                  │
                  ├─ ファイル編集の衝突回避が主眼      → L3: Worktree（Git隔離）
                  ├─ 同一パターンの大量変換（5〜30件） → L3: /batch
                  ├─ 多段の専門サブタスクに分割        → L3: Subagent nesting（既定3階層・可変）
                  ├─ 複数の Claude Code 協調作業       → L3: Agent Teams（実験機能 ⚠）
                  └─ バックグラウンドで放流して監視    → L3: Agent View
```

### 4.3 サブツリー: 自動化・外部連携（L4・L5への分岐）

```
[Q3-NO] 実装作業を伴わない（自動化・連携）
        │
        ▼
[Q5] イベント駆動か / 外部システム連携か / 配布か？
        │
        ├─ ライフサイクルイベントで自動実行     → L4: Hooks
        │   （PreToolUse / PostToolUse / Stop / UserPromptSubmit 等）
        │
        ├─ 外部サービス（GitHub/Jira/Slack等）と直接連携  → L4: MCP
        │   採用基準: 同じデータをチャットへコピペしている場合
        │
        ├─ 外部イベントを Claude に投入したい   → L4/L5: Channels
        │
        └─ 上記を「他プロジェクトでも再利用」したい → L5: Plugins
            配布手段: Official / Community / Custom Marketplace
```

### 4.4 権限・許可制御の必要性（横断分岐）

公式が明示する **3段階の制御強度** の選択基準:

| 強度 | 機能 | 用途 |
|---|---|---|
| Advisory（助言的） | CLAUDE.md | "Behavioral guidance" - Claudeの判断を信用しつつ方向付け |
| Deterministic（決定的） | Hooks | "Enforced regardless of Claude's decision" - イベントで確実に発火 |
| Enforced（強制） | settings.json `permissions` | "Enforced by the client regardless of what Claude decides" - ツール禁止/許可 |
| OS-level（OS隔離） | Sandbox / Worktree | 物理的隔離 |

> **permission mode の表示名**: `default` permission モードは CLI / VS Code / JetBrains 上で「**Manual**」と表示される。frontmatter・設定値としては `default` が引き続き有効で、`manual` はその**エイリアス**。
>
> **auto mode の既定化**: Pro/Max/Team プランでは auto mode が既定の起動 permission モードになる。組織側で無効化するには managed settings の `permissions.disableAutoMode: "disable"` を設定する（設定すると auto mode が選択肢から外れる）。詳細は [BEST_PRACTICES.md §1.2](./BEST_PRACTICES.md) / [permission-modes](https://code.claude.com/docs/en/permission-modes)。

公式引用（[best-practices](https://code.claude.com/docs/en/best-practices) "Set up hooks" 節）: "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."
Enforced 行の根拠は `permissions` ページの tiered permission system（詳細は [BEST_PRACTICES.md §1.2](./BEST_PRACTICES.md)）。

---

## 5. オーケストレーション概念（要約）

> **「2層」「3層」は本リファレンス独自の整理用語**です。公式は "two-tier" / "three-tier" を用いていません（公式表記との対応は [ORCHESTRATION.md §1.3](./ORCHESTRATION.md)（独自定義）および [§9 用語集](#9-用語集公式との対応)を参照）。詳細は [ORCHESTRATION.md](./ORCHESTRATION.md) を参照してください。

### 5.1 2層オーケストレーション

```
[メイン Claude Code]
        │
        ▼
[L2 Skill | L3 Subagent]
        │
        ▼
（ツール実行 / 結果返却）
```

- **適用条件**: 単一の専門タスクをメインから委譲し、コンテキストを汚染せず結果のみ受け取りたい
- **代表例**: `/code-review` Skill 呼び出し / 専門 Subagent への委譲

### 5.2 3層オーケストレーション

```
[メイン Claude Code]
        │
        ▼
[L3 Subagent（中間制御層）]
        │
        ▼
[L2 Skill | L4 MCP Tool | L4 Hook | 別の L3 Subagent]
```

- **適用条件**: Subagent 自身がさらに専門スキル/ツールを呼び出す多段制御が必要な場合
- **代表例**: コードレビュー Subagent が内部で `lint`スキル → `security-scan`スキル → MCPの`gh`ツールを順次呼ぶケース

### 5.3 使い分け要約

| 要件 | 推奨層数 | 主構成 |
|---|---|---|
| 単純な専門タスク委譲 | 2層 | メイン + Skill |
| コンテキスト分離が主眼 | 2層 | メイン + Subagent |
| 多段制御・複雑ワークフロー | 3層 | メイン + Subagent + (Skill\|Tool\|別Subagent) |
| 大量ファイル並列処理 | 別系統 | `/batch`（3フェーズ固定） |

詳細マトリクスは [ORCHESTRATION.md §要件別手法選択マトリクス](./ORCHESTRATION.md) を参照。

---

## 6. ベストプラクティス原則（見出しのみ）

公式 [best-practices](https://code.claude.com/docs/en/best-practices) を本リファレンスでは以下の5系統に再整理しています。各原則の本文は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。

1. **検証可能性の担保** - "Give Claude a way to verify its work"
2. **段階的進行** - "Explore first, then plan, then code"
3. **コンテキスト最適化** - "Provide specific context" / "Write an effective CLAUDE.md" / "Manage your session"
4. **権限と境界の設計** - "Configure permissions" / Sandbox / Hooks 強制制御
5. **機能合成と配布** - Skills / Subagents / Plugins / MCP / Hooks の組み合わせ設計

---

## 7. ファイル間参照マップ

```
00_INDEX.md（このファイル）
  ├─→ L1_CONTEXT_MANAGEMENT.md ─────┐
  ├─→ L2_SKILLS.md ─────────────────┤
  ├─→ L3_AGENTS.md ─────────────────┤
  ├─→ L4_AUTOMATION.md              ├─→ ORCHESTRATION.md
  ├─→ L5_DISTRIBUTION.md ───────────┘
  ├─→ TOOLS.md（ツール名の同定・横断。TOOLS.md → L1/L2/L3/L4 への片方向リンクのみで、L1〜L4 側から TOOLS.md への被リンクは無い）
  └─→ BEST_PRACTICES.md ← 全L?ファイルから参照される
```

相対パスは全て同一 `docs/` ディレクトリ内を前提（`./` 形式）。

---

## 8. 公式ドキュメントナビゲーション対応表

本リファレンスのレイヤー区分と、公式ドキュメントの章立ての対応:

| 本リファレンス | 公式の対応セクション | 公式 URL（英語） |
|---|---|---|
| 横断（TOOLS） | Reference → Tools reference | https://code.claude.com/docs/en/tools-reference |
| L1 | Core Features → Memory and instructions | https://code.claude.com/docs/en/memory |
| L2 | Core Features → Skills | https://code.claude.com/docs/en/skills |
| L2 | Core Features → Commands | https://code.claude.com/docs/en/commands |
| L3 | Agent SDK & Development → Subagents | https://code.claude.com/docs/en/sub-agents |
| L3 | Agent SDK & Development → Agent teams | https://code.claude.com/docs/en/agent-teams |
| L3 | Core Features → Worktrees | https://code.claude.com/docs/en/worktrees |
| L3 | Reference → Agent View | https://code.claude.com/docs/en/agent-view |
| L4 | Reference → Hooks | https://code.claude.com/docs/en/hooks |
| L4 | Configuration → MCP | https://code.claude.com/docs/en/mcp |
| L4 | Advanced Topics → Channels | https://code.claude.com/docs/en/channels [要確認: Reference vs Advanced配置] |
| L5 | Core Features → Plugins | https://code.claude.com/docs/en/discover-plugins |
| L5 | Core Features → Plugin marketplaces | https://code.claude.com/docs/en/plugin-marketplaces |
| 横断 | Learning Resources → Best practices | https://code.claude.com/docs/en/best-practices |

> `[要確認]` は本リファレンス作成時点で公式ページの厳密なパスを確定できなかった項目。実装時は WebFetch で再検証すること。

### 8.1 対応表に未収録だった公式ページ

`https://code.claude.com/docs/llms.txt` との突合で、**本リファレンスの記述が依存しているのに §8 対応表にも `docs/SOURCES.md` にも登録されていなかった**公式ページ群を検出した。以下を対応表に加える（`docs/SOURCES.md` にも登録済み）。

| 本リファレンス | 公式ページ | 公式 URL（英語） |
|---|---|---|
| 横断（設定の正典的定義） | Settings reference | https://code.claude.com/docs/en/settings-reference |
| 横断（BEST_PRACTICES §7.5） | Sandboxing / Sandbox environments | https://code.claude.com/docs/en/sandboxing ／ https://code.claude.com/docs/en/sandbox-environments |
| 横断（BEST_PRACTICES §1.2・§6.3） | Auto mode configuration | https://code.claude.com/docs/en/auto-mode-config |
| L3（モデル指定） | Model configuration | https://code.claude.com/docs/en/model-config |
| 横断（CLI/対話操作） | CLI reference ／ Interactive mode | https://code.claude.com/docs/en/cli-reference ／ https://code.claude.com/docs/en/interactive-mode |
| 横断（診断） | Errors | https://code.claude.com/docs/en/errors |
| 横断（コンテキスト経済） | Context window ／ Prompt caching | https://code.claude.com/docs/en/context-window ／ https://code.claude.com/docs/en/prompt-caching |
| 横断（セッション運用） | Sessions ／ Checkpointing | https://code.claude.com/docs/en/sessions ／ https://code.claude.com/docs/en/checkpointing |
| L1/L5（`.claude/` の構造） | The .claude directory | https://code.claude.com/docs/en/claude-directory |
| L2（`/code-review`） | Code review ／ Ultrareview | https://code.claude.com/docs/en/code-review ／ https://code.claude.com/docs/en/ultrareview |
| 横断（大規模コードベース運用） | Work with large codebases | https://code.claude.com/docs/en/large-codebases |
| §9 用語集 | Glossary | https://code.claude.com/docs/en/glossary |
| L3/L4（SDK/harness 前提） | Agent SDK: Subagents / Permissions / Hooks | https://code.claude.com/docs/en/agent-sdk/subagents ／ .../agent-sdk/permissions ／ .../agent-sdk/hooks |

> **`whats-new/<週次>` について**: changelog より粒度の粗い週次リリースノートが `https://code.claude.com/docs/en/whats-new/<週次>` に存在するが、**URL が週次で変わる**ため固定 URL としての登録は見送る。`changelog` を一次とし、必要なときに `llms.txt` から当該週のパスを解決すること。

#### `llms.txt` 突合で検出した未登録ページ（26件）

**正典本文または一次ソース間リンクから参照されているのに、§8 対応表にも `docs/SOURCES.md` にも無い**公式ページ。次回以降の `/update-docs` で本文取得のうえ収録可否を判断すること。

| ページ | 依存元・備考 |
|---|---|
| `goal` | BEST_PRACTICES §1.3 が依存 |
| `headless` | §6.1 非対話実行が依存 |
| `costs` | - |
| `managed-settings` | - |
| `server-managed-settings` | - |
| `artifacts` | TOOLS.md の `Artifact` ツール |
| `plugin-hints` | L5 関連（[L5_DISTRIBUTION.md §1.2](./L5_DISTRIBUTION.md) にも記録） |
| `plugin-relevance` | 同上 |
| `security-guidance` | L5 §2.2 の公式 marketplace plugin 一覧に登場 |
| `claude-security` | - |
| `keybindings` | - |
| `fast-mode` | - |
| `advisor` | - |
| `debug-your-config` | - |
| `feature-availability` | - |
| `settings-example` | - |
| `remote-control` | - |
| `computer-use` | - |
| `chrome` | BEST_PRACTICES §1.3 のスクリーンショット検証が参照 |
| `troubleshooting` | - |
| `troubleshoot-install` | - |
| `deep-links` | - |
| `platforms` | - |
| `third-party-integrations` | - |
| `mcp-quickstart` | - |
| `prompt-library` | - |

（出典: https://code.claude.com/docs/llms.txt ）

---

## 9. 用語集（公式との対応）

| 本リファレンスでの呼称 | 公式ドキュメントの呼称 | 備考 |
|---|---|---|
| L1〜L5（レイヤー） | （該当なし） | **本リファレンス独自の整理** |
| 2層オーケストレーション | （該当なし） | **本リファレンス独自の整理**。Zenn記事由来 |
| 3層オーケストレーション | （該当なし） | **本リファレンス独自の整理**。Zenn記事由来 |
| フック内フック | `agent` handler type | [要確認: 公式日本語表記] |
| context:fork | Skill `isolation: subagent` frontmatter / "Skill isolation" | 公式は frontmatter キーで表現 |
| Subagent | Subagent（公式同名）"Single session delegation" | - |
| fork | fork（公式同名）"A special subagent type that inherits the entire parent conversation" | `subagent_type: "fork"`。対話セッション既定ON。手動起動は `/subtask`。詳細は [L3_AGENTS.md §2.1a](./L3_AGENTS.md) |
| subagent_type | `Agent` tool の `subagent_type` パラメータ | **ビルトイン型に限らずカスタム agent 名（必須 `name`）も受付**（大文字小文字・区切り文字非依存）。ただし本システムの SDK/harness 環境では canon agent が未登録のため `general-purpose` + 定義ファイル Read 注入で起動（[L3_AGENTS.md §2.1](./L3_AGENTS.md) / [ORCHESTRATION.md §2.3 Custom Subagent の起動方式](./ORCHESTRATION.md)） |
| Agent Team | Agent Team（公式同名）"Coordinate multiple Claude Code instances" | 実験機能 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。`TeamCreate`/`TeamDelete` ツールは無く、セッションごとに**暗黙の1チーム**。teammate は Agent tool で直接 spawn する（`team_name` 入力は無視される）。nested team 不可（teammate は teammate を spawn できない） |
| Fable（モデルティア） | Claude Fable 5（Mythos クラス） | `model: fable` で指定可。従来 GA モデルを超える能力。Subagent/Skill の `model` フィールドのエイリアス `sonnet`/`opus`/`haiku`/`fable` の1つ |
| Worktree | Worktree（公式同名）"Git worktree isolation" | `.claude/worktrees/` に自動配置 |
| /batch | `/batch` Bundled Command | Anthropic保守の組み込みコマンド |
| MCP | Model Context Protocol | 公式略称 MCP |
| Plugin | Plugin（公式同名） | manifest.json で記述 |
| Marketplace | Plugin Marketplace | Official / Community / Custom |

### 公式が「Orchestration」という語を使う場面

公式の "orchestration" 用例は主に以下の文脈に限られ、エージェント階層の表現としては使われていない:
- MCP server orchestration
- Hook orchestration
- Plugin orchestration

エージェント階層は公式では **"Subagents"**（単一セッション内・既定3階層・可変の nesting 可）、**"Agent Teams"**（複数インスタンス間・nested team 不可）と区別される。

---

## 10. 既知の `[要確認]` 項目一覧

本リファレンス全体で公式裏付けを取り切れなかった項目。後続Phaseまたは利用時に追加検証が必要:

| 項目 | 所在 | 検証方法 |
|---|---|---|
| Channels ページの正規配置（Reference vs Advanced） | §8 | WebFetch: `https://code.claude.com/docs/en/channels` |
| 「フック内フック」の公式日本語表記 | §9 | 公式日本語ドキュメントの該当ページ確認 |
| context:fork の詳細実装メカニズム | §9, L2 | Skills frontmatter リファレンス精読 |
| Custom LSP plugin 作成ガイドの有無 | L5 | 公式 LSP ドキュメント精読 |

---

## 11. このINDEXの保守ルール

- 公式バージョン更新時は冒頭メタ情報のバージョン番号を更新する
- L1〜L5に新機能が追加された場合は §2 図と §3 表に反映、対応する `L?_*.md` を更新
- 公式の章立て構造が変わった場合は §8 対応表を更新
- `[要確認]` 項目が解消されたら §10 から削除し、該当箇所に追記
- 解消済みの経緯を残したい場合は行を削除せず、項目・所在の列を取り消し線（`~~...~~`）で囲み、検証方法欄を `**解決済（YYYY-MM-DD）**: <根拠>` で書き換えてよい（機能X の G16 がこの形式を照合する・`design/detailed-design.md` §11.2）
