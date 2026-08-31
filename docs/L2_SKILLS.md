# L2: スキル（オンデマンドロード・動的実行）

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md)（静的指示との対比） / [L3_AGENTS.md](./L3_AGENTS.md)（subagent詳細） / [ORCHESTRATION.md](./ORCHESTRATION.md)（オーケストレーション詳細） / [BEST_PRACTICES.md](./BEST_PRACTICES.md)

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース（Skills） | https://code.claude.com/docs/en/skills |
| 一次ソース（Commands） | https://code.claude.com/docs/en/commands |
| 一次ソース（Subagents参考） | https://code.claude.com/docs/en/sub-agents |
| 公式標準 | Agent Skills（オープン標準）/ agentskills.io |
| 調査日 | 2026-08-29 |

---

## 1. 概要レイヤー（What & When）

### 1.1 機能の目的

L2 は **オンデマンドにロードされる動的ワークフロー** を扱うレイヤーです。L1（CLAUDE.md）が「毎セッション常時ロードされる静的指示」であるのに対し、L2 のスキルは **必要なときだけ context に注入** され、トリガー条件にマッチしたときに発火する再利用可能なワークフローパッケージです。

公式定義（[skills](https://code.claude.com/docs/en/skills)）:
> "Skills extend what Claude can do. Create a SKILL.md file with instructions, and Claude adds it to its toolkit. Claude uses skills when relevant, or you can invoke one directly with /skill-name."

### 1.2 含まれる機能一覧

| 機能名 | 一言説明 | 主な用途 |
|---|---|---|
| **Skills**（`.claude/skills/<name>/SKILL.md`） | 動的に発動するワークフローパッケージ | 多段手順・チェックリスト・繰り返し作業の再利用 |
| **Slash Commands**（組み込み + Bundled Skills） | `/name` で明示呼び出すコマンド | 標準操作（`/init` `/memory` `/code-review` ほか） |
| **context:fork**（SKILL.md frontmatter `context: fork`） | スキルをサブエージェントで隔離実行 | 副作用ある操作・長大な探索・メインコンテキスト保護 |
| **Custom Commands**（`.claude/commands/*.md`）⚠ 廃止予定 | 旧形式のカスタムコマンド | 既存ファイルは動作するが、新規は Skills へ統合 |

### 1.3 いつ使うか（採用判断基準）

#### 採用すべき状況（DO）
- 同じ指示・チェックリストを **繰り返しチャットに貼り付けている** → Skill 化
- CLAUDE.md の一部が **「事実」ではなく「手順」** に成長した → Skill に切り出す
- ユーザーが明示的に呼び出したい標準操作がある → `/skill-name` で公開
- 副作用ある処理（deploy / commit / 外部API呼び出し）を **タイミング制御したい** → `disable-model-invocation: true` を伴う Skill
- メイン会話のコンテキストを汚さず、長大な探索を別走で実行したい → `context: fork`

#### 採用すべきでない状況（DON'T）
- **常時必要な静的知識**（コード規約・環境変数等）→ L1 CLAUDE.md（[L1_CONTEXT_MANAGEMENT.md](./L1_CONTEXT_MANAGEMENT.md)）
- **強制的にブロック/遮断したい処理** → L4 Hooks（[L4_AUTOMATION.md](./L4_AUTOMATION.md)）が決定的（Skill は本質的に advisory + on-demand）
- **複数の独立並列処理**（5〜30件の同一パターン変換）→ L3 `/batch` または独自 Subagent
- **アクション無しのガイドラインのみ** → `context: fork` した場合に subagent が何もせず終わる（公式警告あり）

#### 他レイヤーとの使い分け

| 比較対象 | L2 Skill を選ぶ基準 | 他レイヤーを選ぶ基準 |
|---|---|---|
| **L1 CLAUDE.md** | 多段手順・繰り返しワークフロー | 常時前提となる静的事実 |
| **L3 Subagent（独自定義）** | スキル発動者がメイン Claude（一時的・呼び出し駆動） | 専門担当の継続的役割（タスク委譲が主） |
| **L4 Hook (agent handler)** | ユーザー/Claudeが明示的に呼ぶ | イベント駆動で自動発火させたい |
| **L4 MCP Tool** | プロンプトベースの指示で十分 | 外部サービスとプログラム連携が必要 |

公式引用:
> "Create a skill when you keep pasting the same instructions, checklist, or multi-step procedure into chat, or when a section of CLAUDE.md has grown into a procedure rather than a fact. Unlike CLAUDE.md content, a skill's body loads only when it's used, so long reference material costs almost nothing until you need it."

---

## 2. 詳細レイヤー（How）

### 2.1 Skills（SKILL.md）

#### 仕組み

1. セッション開始時、全 Skill の **description のみ**がコンテキストに事前ロードされる（コンテキスト予算の約1%）
2. ユーザー要求の意図が description と一致すると Claude が自動発動、または `/skill-name` でユーザーが明示発動
3. 発動時、SKILL.md の **markdown body 全体が単一メッセージとして注入** される
4. body 内で参照される supporting files（`template.md`, `examples/`, `scripts/` 等）は Claude が必要判断時に Read/Glob で取得（**Progressive Disclosure Loading**）

`${CLAUDE_PROJECT_DIR}` 置換は skill 本文・`allowed-tools` の両方で有効。

公式引用:
> "Progressive Disclosure Loading: 参照ファイルは bash で読み込み"

#### 配置場所とスコープ階層（4階層 + 廃止予定）

| 階層 | 配置場所 | スコープ | 優先度 |
|---|---|---|---|
| **Enterprise** | 管理設定ディレクトリ参照 | 組織全体 | 1（最高） |
| **Personal** | `~/.claude/skills/<skill-name>/SKILL.md` | ユーザー全体 | 2 |
| **Project** | `.claude/skills/<skill-name>/SKILL.md` | このプロジェクトのみ | 3 |
| **Plugin** | `<plugin>/skills/<skill-name>/SKILL.md` | プラグイン有効範囲 | 4 |
| ⚠ Custom Commands（廃止予定） | `.claude/commands/<name>.md` | 旧仕様、Skills に統合済 | - |

> **順位の読み方**: 公式が順位として述べるのは「enterprise overrides personal, and personal overrides project」の**3段階のみ**である。上表の「優先度」列の 1〜3（Enterprise / Personal / Project）はこれに対応するが、Plugin の「4」は**順位の外**——Plugin skills は `plugin-name:skill-name` という名前空間を使うため、そもそも他レベルと衝突しない（"so they can't conflict with other levels"）。

**同名時の解決規則**:

- **enterprise > personal > project** の3段階が公式が述べる順位。
- **Plugin skills は `plugin-name:skill-name` 名前空間を使うため、他レベルと衝突しない**（順位比較の対象外）。
- 任意レベルの skill は**同名の bundled skill を上書きする**が、**その bundled skill のエイリアスは上書きしない**。
- **skill と `.claude/commands/` に同名がある場合は skill が優先**する。
- **claude.ai から同期した skill は他のどのソースにも負ける**。

#### ネストした `.claude/skills/` のディレクトリ修飾名

- ネストした skill は**ディレクトリ修飾名**を持つ: `apps/web/.claude/skills/deploy/SKILL.md` → **`/apps/web:deploy`**。
- **非修飾名（`/deploy`）で invoke したときは、作業対象ディレクトリの variant も併せて適用される。**
- **ネスト skill は起動時にはロードされない**——そのサブディレクトリ内のファイルを Claude が**最初に読み書きした時点**でロードされる（それまでは補完にも出ない）。

#### skills-dir plugin

skill フォルダに `.claude-plugin/plugin.json` を置くと、そのフォルダは **`<name>@skills-dir`** という plugin としてロードされ、**agents・hooks・MCP server を同梱できる**。プロジェクトの `.claude/skills/` に置く場合は **workspace trust 承認が必要**（出典: `skills` ／ `plugins-reference#skills-directory-plugins`。[L5_DISTRIBUTION.md §2.2 / §3.1](./L5_DISTRIBUTION.md) にも収録）。

#### claude.ai 同期 skill

| 項目 | 仕様 |
|---|---|
| 保存先 | `~/.claude/skills/synced/` |
| ダウンロード条件 | **`CLAUDE_CODE_SYNC_SKILLS` を非対話実行で設定したときのみ**DLされる |
| 予約名 | **`synced` はフォルダ名として予約**されている |
| frontmatter | **サニタイズされる** |
| 変数・コマンド展開 | **ローカル以外のセッションでは `!` コマンド／`@` 参照／`${CLAUDE_PROJECT_DIR}`・`${CLAUDE_SESSION_ID}` が展開されずリテラルで届く** |
| 優先順位 | 他のどのソースにも負ける（上記「同名時の解決規則」参照） |
| 読まないコンテキスト | **Cowork / cloud session は `~/.claude/skills/` を読まない** |

公式引用:
> "Custom commands have been merged into skills. A file at .claude/commands/deploy.md and a skill at .claude/skills/deploy/SKILL.md both create /deploy and work the same way. Your existing .claude/commands/ files keep working."

→ **新規作成は必ず `.claude/skills/<name>/SKILL.md` 形式**を採用すること。

#### ディレクトリ構造

```
my-skill/
├── SKILL.md           # メイン指示（必須）
├── template.md        # テンプレート（任意）
├── examples/
│   └── sample.md      # 期待形式の出力例（任意）
└── scripts/
    └── validate.sh    # 実行可能スクリプト（任意）
```

> **文字コードの運用注意**: `.md` ファイルは **BOM なし UTF-8** で生成すること。BOM 付きファイルは読み込まれない（エラーも出ない失敗様式）。

#### `--add-dir` 系と設定ソースの取り扱い

| 機構 | skills / commands のロード |
|---|---|
| `--add-dir` / `/add-dir` / SDK の `additionalDirectories`・`add_dirs` | **`.claude/skills/` と `.claude/commands/` を自動ロードする** |
| `settings.json` の `permissions.additionalDirectories` | **ファイルアクセス許可のみ。ロードしない**（TS オプションと同名だが挙動が違う） |

- **`--setting-sources` に `project` を含めないと skills / commands / subagents はロードされない。**
- **`--safe-mode` では3種とも非ロード。**
- **`strictPluginOnlyCustomization` と bare mode は3種を別々に扱う**: skills はポリシーで無効化されるが bare mode ではロードされる／commands は同じ skills ロックで無効化され bare mode ではスキップ／subagents は `agents` エントリで無効化され bare mode では `.claude/agents/` を全スキップ。
- **追加ディレクトリ内の `.claude/agents/` と `.claude/commands/` は監視されない**ため、編集後は再起動が必要（[L1_CONTEXT_MANAGEMENT.md §3.3](./L1_CONTEXT_MANAGEMENT.md) も参照）。

#### SKILL.md frontmatter 完全リファレンス

```yaml
---
# === 識別 ===
name: my-skill                          # 表示名（既定: ディレクトリ名）
description: What this skill does and when to use it  # 推奨。Claudeのトリガー判定で使用
when_to_use: Additional trigger hints    # 任意。descriptionに追加

# === トリガー制御 ===
disable-model-invocation: false          # true でClaudeの自動発動を禁止（/name のみ）
user-invocable: true                     # false で /メニューから非表示（参考知識用）

# === 引数 ===
argument-hint: "[issue-number]"          # オートコンプリート時のヒント
arguments: [issue, branch]               # 名前付き引数（位置順マップ）

# === 権限・ツール ===
allowed-tools: Read Grep                 # スペース/カンマ/YAMLリスト
disallowed-tools: Write, Edit            # deny list

# === モデル・コンテキスト ===
model: sonnet                            # sonnet, opus, haiku, fable, full ID, inherit
effort: high                             # low, medium, high, xhigh, max
context: fork                            # forkでsubagent隔離実行
agent: Explore                           # fork時のagent type
background: true                         # context:fork 専用。既定 true（バックグラウンド実行が既定）
                                         # false にすると呼び出しターン内で結果を待つ

# === シェル設定 ===
shell: bash                              # bash (既定) or powershell

# === パス制限 ===
paths:
  - "src/**/*.ts"
  - "tests/**/*.test.ts"

# === ライフサイクル ===
hooks:
  PreToolUse: [...]

# === メタデータ ===
version: "1.0"                           # ⚠ 公式 frontmatter 表には存在しない（下記注記参照）
license: MIT                             # 公式 frontmatter 表に存在する
author: name                             # ⚠ 公式 frontmatter 表には存在しない（下記注記参照）
compatibility: "Requires Node 20+"       # Agent Skills 仕様の環境要件（string・最大500文字）
metadata:                                # 自前ツール用の自由形式 YAML マップ
  entitlement: pro
---
```

> **メタデータ欄の要検討事項**: 上記例が「メタデータ」として挙げている `version: "1.0"` / `license: MIT` / `author: name` のうち、**公式 frontmatter 表に存在するのは `license` のみで、`version` / `author` は表に無い**。要検討（本リファレンスは現時点で例からの削除は行わず、事実のみを記録する）。

**必須フィールド**: 実質なし（`description` 推奨だが技術的には任意）。最小構成は `---` frontmatter マーカーのみでも動作。

**真偽値フィールド**（`disable-model-invocation`・`user-invocable` 等）は `true`/`false` に加え、`yes`/`no`/`on`/`off`/`1`/`0`（大文字小文字不問）も受理される。

**主要フィールド詳細**:

| フィールド | 値 | 用途 |
|---|---|---|
| `name` | string | 表示名（既定: ディレクトリ名） |
| `description` | string | Claudeのトリガー判定。`when_to_use` と合算で **1536文字制限**（超過分は切り詰め） |
| `when_to_use` | string | description への補足。トリガー条件追加 |
| `disable-model-invocation` | bool | true で `/name` のみ発動（副作用ある操作向け） |
| `user-invocable` | bool | false で `/メニュー` から非表示（参考知識用） |
| `allowed-tools` | list/string | 発動中に approval なし許可するツール |
| `disallowed-tools` | list/string | 発動中に禁止するツール。**deny ルールと同じく、他のツールが1件でも残っている状態では `EndConversation` を除去できない**（公式: *"Like deny rules, the field can't remove `EndConversation` while any other tool remains."*。[TOOLS.md §2.1](./TOOLS.md) の permission rule 例外と同型） |
| `model` | string | モデル override（`sonnet`/`opus`/`haiku`/`fable`/full ID/`inherit`）。`fable`=Claude Fable 5。**`context: fork` と併用したときは意味が異なり、値は fork された subagent のモデルを指定する**（公式: *"With `context: fork`, the value sets the forked subagent's model instead"*）。**組織の `availableModels` allowlist で除外された値は使われず、セッションは現行モデルを維持する** |
| `effort` | string | 推論努力レベル（`low`/`medium`/`high`/`xhigh`/`max`） |
| `context` | `fork` | 値が `fork` のとき subagent 隔離実行 |
| `agent` | string | `context: fork` 時の agent type（既定: `general-purpose`） |
| `background` | bool | `context: fork` 専用。既定 `true`。`false` で呼び出しターン内の結果待ちに戻す |
| `shell` | `bash`/`powershell` | dynamic context injection で使うシェル |
| `paths` | glob list | 該当パスのファイル操作時のみ自動発動 |
| `hooks` | object | この Skill のライフサイクルフック |
| `arguments` | list | `$ARG1` 形式で参照される名前付き引数 |
| `argument-hint` | string | オートコンプリートヒント |
| `compatibility` | string（≤500文字） | Agent Skills 仕様の環境要件 |
| `metadata` | map | **自前ツール用の自由形式 YAML マップ**。公式: *"Free-form YAML map for your own key-value data, such as entitlement or catalog fields, read by your own tooling from `SKILL.md`. Claude Code doesn't act on its contents, and drops a value that isn't a map. Don't reuse frontmatter field names such as `paths` as keys."* |

#### Claude Code 外での frontmatter 利用（"Using skill frontmatter outside Claude Code"）

公式に専用節が存在する。Claude Code 外（**claude.ai へのアップロード・Skills API・`package_skill.py`**）で使えるのは次の**6フィールドのみ**である:

`name` / `description` / `license` / `compatibility` / `metadata` / `allowed-tools`

**それ以外のフィールドを含めると、無視されるのではなく packaging / upload が「ハードエラー」で失敗する。** 公式が示すエラー例:

```
Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name
```

肝: Claude Code 内でのみ意味を持つフィールド（`argument-hint`・`context`・`agent`・`paths`・`hooks` 等）を残したまま外部へ持ち出すと**失敗する**。Claude Code 専用の skill と外部配布する skill は frontmatter を作り分けること。

#### トリガー方式

##### Model Invocation（Claudeが自動発動）
- デフォルト動作（`disable-model-invocation: false` のとき）
- 動作機序:
  1. 全 Skill の description が事前ロード（コンテキスト予算 ~1%、溢れると name のみに縮退）
  2. ユーザー発話が description にマッチすると Claude が該当 Skill を発動
  3. SKILL.md の markdown body が単一メッセージで注入

##### User Invocation（ユーザーが明示発動）
- `/skill-name` 形式（オートコンプリート対応）
- `disable-model-invocation: true` でも実行可
- `user-invocable: false` の場合のみ不可（メニューから隠れる）

##### 両モードの設計マトリクス

| Frontmatter | Claudeが発動 | ユーザーが発動 | 用途 |
|---|---|---|---|
| デフォルト | ✅ | ✅ | 通常のスキル |
| `disable-model-invocation: true` | ❌ | ✅ | 副作用ある操作（deploy, commit, send-message） |
| `user-invocable: false` | ✅ | ❌ | 参考知識（legacy-system-context など） |

#### Progressive Disclosure Loading の仕組み

```
[Session開始時]
  └─ 全Skillのdescription をロード（~1% context budget）

[ユーザー発話 → Skill発動]
  └─ SKILL.md body を単一メッセージで注入
      └─ Claudeが参照ファイル（template.md / examples/）を必要時にRead

[セッション中]
  └─ Skill content は会話履歴に残存（再ロードなし）
  └─ Auto-compaction時: 要約後に各 Skill の最新1回の invocation を re-attach。
     各 Skill は先頭5,000トークンまで保持し、re-attach される Skill 全体で
     25,000トークンの共有予算を分け合う（トークン予算で絞られるのであって個数固定ではない）
```

#### Dynamic Context Injection

SKILL.md 内で ` !`command` ` 構文を用いると、**Skill 注入前にシェルでコマンドを実行**し、出力を inline 置換する。

実装例:
```yaml
---
name: pr-summary
description: Summarize pull request changes
allowed-tools: Bash(gh *)
---

## PR Context
- Diff: !`gh pr diff`
- Comments: !`gh pr view --comments`

## Task
Summarize this PR in 3 bullets, then list risks (missing tests, hardcoded values, etc.).
```

- 構文: `` !`<command>` ``（inline）または `` ```! ``（コードフェンスブロック）
- 1パス展開のみ（再帰展開なし）
- 出力は plain text として置換（再パースされない）
- `settings.json` の `"disableSkillShellExecution": true` で全体禁止可能

#### Skill 完全実装例（公式）

```yaml
---
name: summarize-changes
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
---

## Current changes

!`git diff HEAD`

## Instructions

Summarize the changes above in two or three bullet points, then list any risks you notice such as missing error handling, hardcoded values, or tests that need updating. If the diff is empty, say there are no uncommitted changes.
```

#### 引数渡しの構文

呼び出し:
```
/skill-name argument1 "argument with spaces" argument3
```

SKILL.md 内のプレースホルダー:

| 変数 | 説明 |
|---|---|
| `$ARGUMENTS` | 全引数（生文字列） |
| `$1`, `$2`, ... | 位置引数（0-based index は `$ARG[N]` 形式） |
| `$ARG[N]` | 0-based 位置引数 |
| `$<name>` | `arguments:` frontmatter で定義した名前付き引数 |
| `$SESSION_ID` | 現在のセッションID |
| `$EFFORT` | 現在の effort レベル |
| `$SKILL_DIR` | Skill ディレクトリの絶対パス |

実装例:
```yaml
---
name: fix-issue
description: Fix a GitHub issue
arguments: [issue, branch]
---

Fix GitHub issue $issue on branch $branch...
```

呼び出し: `/fix-issue 123 feature/auth`

---

### 2.2 context:fork（Skill Isolation）

#### 公式正式名称

- **英語表記**: `context: fork`（SKILL.md frontmatter キー）
- **日本語の正式表記**: なし [要確認: 公式日本語ドキュメント参照]
- 参考記事の「フック内フック」は本リファレンス独自整理ではなく、Zenn記事由来の独自呼称。公式は `context: fork` または "forked subagent context" / "Skill isolation" と表現

#### 仕組み

通常の Skill は **メインの会話コンテキスト** に inline で注入されるが、`context: fork` を指定した Skill は **独立した subagent コンテキスト** で実行される。

| 観点 | 通常実行（fork なし） | `context: fork` 実行 |
|---|---|---|
| 会話履歴の継承 | ✅ そのまま継承 | ❌ 非継承 |
| CLAUDE.md ロード | ✅ 全階層 | agent type 依存（Explore/Plan はスキップ） |
| git status snapshot | ✅ | agent type 依存 |
| 過去のツール呼び出し履歴 | ✅ | ❌ |
| 実行環境 | メイン Claude | 独立 subagent |
| 結果の返却 | 会話履歴に追加 | summary のみメインへ |
| コンテキスト消費 | メイン側で増加 | 独立した window |

#### 関連 frontmatter

```yaml
context: fork           # 値は fork のみ（指定しないとデフォルト= inline）
agent: Explore          # fork時のagent type。既定: general-purpose
background: true        # 既定 true。false で呼び出しターン内の結果待ちに戻す
```

> **既定実行モード**: `context: fork` は**バックグラウンド実行が既定**である——メインはブロックされず、fork の結果が完了時に会話へ届く。フォアグラウンドに戻したい場合は `background: false` を明示する。ただし以下のケースは `background: false` を指定しなくても常にフォアグラウンドで待機する: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 設定時、その他 background 機能全体が無効化されている場合。
>
> **バックグラウンド fork への追加制約**: fork の subagent は通常の subagent 型として扱われるため、**background subagent に適用される狭いツールセット**（[L3_AGENTS.md §2.1](./L3_AGENTS.md) / [TOOLS.md §2.3](./TOOLS.md)）の対象になる（＝会話全体を継承する fork 固有の免除は適用されない）。手順が対象外のツールに依存する場合は `background: false` でフルツールセットを維持すること。
>
> **checkpoint 非対象**: バックグラウンドで実行された forked skill の編集はセッションの checkpoint 管理外にあり、`/rewind` では取り消せない。取り消しには git を使う。

agent type の代表値:
- `Explore`: 読み取り専用エージェント。CLAUDE.md/gitスキップ。コードベース探索用
- `Plan`: プランモード。CLAUDE.md/gitスキップ。実装方針の設計用
- `general-purpose`: 全ツール許可。CLAUDE.md ロード
- 任意のカスタム subagent 名（[L3_AGENTS.md](./L3_AGENTS.md) で定義）

#### 動作仕様（fork時の詳細）

1. 新しい isolated context window を作成
2. agent type のシステムプロンプトをロード
3. Skill の markdown body がタスクプロンプトとして渡される
4. agent type のデフォルトツールセットを使用
5. subagent が独立してツール呼び出しを実行
6. 完了後、summary のみメインに返却（詳細は subagent context に残留）

#### 採用ケース・非採用ケース

##### `context: fork` を採用すべきケース（DO）
- 長時間の探索/分析（codebase analysis）で大量の中間出力が出る
- 副作用ある操作（deploy / commit）でメインを汚さずに完結したい
- ツールアクセスを制限したい（`agent: Explore` で読み取り専用強制）
- メイン会話をクリーンに保ち、結果サマリーだけ受け取りたい

##### `context: fork` を採用すべきでないケース（DON'T）
- **ガイドラインのみで実行タスクがない**スキル → subagent が何もせず終了
- 短く対話的なタスク（頻繁な back-and-forth が必要）
- メインの会話履歴が前提となる Skill

公式警告:
> "context: fork only makes sense for skills with explicit instructions. If your skill contains guidelines like 'use these API conventions' without a task, the subagent receives the guidelines but no actionable prompt, and returns without meaningful output."

---

### 2.3 Slash Commands（組み込み + Bundled Skills）

公式の `/slash-command` 群は **3 種類**に分類される:

| 種別 | 例 | 仕組み |
|---|---|---|
| **Built-in Commands** | `/help`, `/clear`, `/config`, `/model` | CLI に hard-coded。Prompt ベースではない |
| **Bundled Skills** | `/code-review`, `/batch`, `/run` | Skill mechanism で実装。Anthropic 配布 |
| **User/Project Skills** | `/<your-skill>` | `.claude/skills/<name>/SKILL.md` で定義 |

#### Bundled Skills（主要）

`https://code.claude.com/docs/en/commands` より。**「完全一覧」ではない**: 同ページの bundled skills 表は取得のたびに可視範囲が変わり、WebFetch 経由での全件列挙が安定しないことを複数回の再取得で実測した（§5 の方針と同旨）。**完全な一覧は公式 `commands` ページを直接参照すること。**

| Slash | 用途 |
|---|---|
| `/run` | プロジェクトのアプリを起動・操作 |
| `/verify` | 変更を実際に動かして動作確認。**ユーザー起動のみ**（Claude は自発起動できない） |
| `/run-skill-generator` | `/run` 実行レシピを per-project スキル化 |
| `/code-review` | 差分のバグ・整理候補・効率改善レビュー（引数仕様は下記） |
| `/simplify` | 変更コードの reuse / simplification / efficiency 観点の整理を**適用まで行う**（品質のみ。バグ探索は `/code-review` の責務） |
| `/batch` | 大規模並列リファクタリング（5〜30件の同パターン変換） |
| `/debug` | デバッグログ有効化・トラブルシュート |
| `/doctor` | 設定・スキル・コンテキスト予算の診断 |
| `/loop` | プロンプト／スラッシュコマンドを定期実行（下記） |
| `/schedule` | クラウド上でルーチン作成 |
| `/claude-api` | Claude API リファレンス参照・モデル移行（サブコマンドは下記） |
| `/dataviz` | チャート・グラフ・ダッシュボードの設計指針 |
| `/deep-research` | 多段のリサーチワークフロー |
| `/design-sync` | デザイン資産との同期 |
| `/fewer-permission-prompts` | 過去トランスクリプトからallowlist候補抽出 |
| `/workflow-authoring` | Dynamic Workflows のスクリプト記述リファレンス（**dynamic workflows が有効なときのみ利用可能**） |

**関連する設定・挙動**:

- `disableBundledSkills` 設定は **`/doctor` を除く全 bundled skill を無効化**する。`skillOverrides` は `"off"` / `"user-invocable-only"` / `"name-only"` を取る。
- `/doctor` は built-in command ではなく **bundled skill** である（`disableBundledSkills` の対象外。`DISABLE_DOCTOR_COMMAND` で非表示にできる）。
- `/verify` は**自身のレシピを `.claude/skills/verify/SKILL.md` に記録**でき、リポジトリルートでは bundled `/verify` を置換する。
- `/claude-api` は `cost-optimize`（既存プロジェクトの Claude API 支出プロファイリング）を持つほか、organization members / invites / workspaces / API keys / rate limit reports / workload identity federation / CMEK を含む Admin API カバレッジを持つ。
- `/loop` は自己ペース dynamic モードと no-prompt autonomous 既定を Bedrock/Vertex/Foundry を含め常時利用でき、Claude が何もすることがない連続 wake-up は1行に畳まれる。`/usage` には Loops の内訳（実行回数・総トークン・回あたりトークン・最終実行）が出る。
- `/code-review` は Claude 自身が Bedrock/Vertex/Foundry・Claude apps gateway・テレメトリ無効環境でも起動できる。

**`/code-review` の引数仕様**:

```
/code-review [low|medium|high|xhigh|max|ultra] [--fix] [--comment] [pr#|branch|path]
```

| 要素 | 意味 |
|---|---|
| effort 引数 | `low`/`medium` は高確度の少数指摘、`high`〜`max` は網羅重視（不確実な指摘も含む）、**`ultra` はクラウド上の多エージェント深掘りレビュー**。省略時は前回指定した水準を再利用 |
| `--fix` | レビュー後、指摘をワーキングツリーへ適用する |
| `--comment` | 指摘を PR のインラインコメントとして投稿する |
| 対象 | PR 番号 / ブランチ / パス。省略時は現在の差分 |
| `--post` | `ultra` × GitHub.com の PR 対象時、完成したレビューを PR へ単一コメントとして投稿するか確認する（`--no-post` で抑止） |
| エイリアス | `/review` |

**`/claude-api` のサブコマンド**: `migrate` / `upgrade` / `managed-agents-onboard` / `prompt-audit`。

**`/loop` の詳細**: エイリアスは **`/proactive`**。`/loop 5m /foo` のように interval とプロンプト（スラッシュコマンド可）を与える。**interval / prompt を省略するとモデルが自己ペースで反復**する。反復内容は **`.claude/loop.md`** に記述できる。

#### 組み込みコマンド主要一覧（カテゴリ別）

> 公式は総数を明記しておらず、かつ**長大な表の網羅列挙は取得のたびに結果が変動し実在しないコマンド名が混入する**ことを実測した（WebFetch は要約用の小型モデルを介するため、この種の厳密な列挙には不向き）。以後は総数を数え値としても記載しない。カテゴリ別一覧は代表的なコマンドの例示に留め、完全な一覧は公式ページへのリンクのみを案内する。
>
> **`/fork` と `/subtask` は目的の異なる別々の現存コマンド**（改称元・改称先の関係ではない）。`/fork` は会話をバックグラウンドセッションへコピーし自分は元セッションで作業継続、`/subtask` はサブエージェントへ側作業を委託し結果を本会話へ回収する。
>
> **コマンド名のあいまい一致は廃止**: タイポしたスラッシュコマンド名や、当該セッションでは使えないコマンドを入力した場合、**あいまい一致で別のコマンドが実行されることはなくなり、エラーとして報告される**。プレフィックス一致とエイリアスは引き続き動作する。
>
> **`/reload-skills` は非実在**（§5参照）。公式 `skills` ページは代わりに「Claude Code は skill ディレクトリの変更をファイル監視で自動検知し、再起動なしにセッション中へ反映する（Live change detection）」と説明している。プラグイン由来の skill のみ `/reload-plugins` が必要な場合がある。

**セッション管理**: `/clear`, `/resume`, `/subtask`, `/fork`, `/branch`, `/rename`, `/background`, `/exit`
**コンテキスト・メモリ**: `/memory`, `/context [all]`, `/compact`
**設定**: `/config` (`/settings`), `/model`, `/effort`, `/permissions`, `/init`, `/mcp`, `/plugin`, `/hooks`
**コード作業**: `/code-review`, `/verify`, `/run`, `/review [PR]`, `/security-review`, `/diff`
**並列処理**: `/batch`, `/agents`, `/tasks`
**スキル**: `/skills`, `/loop`, `/schedule`
**診断**: `/doctor`, `/debug`, `/rewind`
**その他**: `/help`, `/copy [N]`, `/export`, `/plan`, `/btw`, `/goal`

完全な一覧は [公式 Commands リファレンス](https://code.claude.com/docs/en/commands) を参照。

#### カスタム Slash Command の作成方法（現在の推奨）

> ⚠ 旧仕様の `.claude/commands/<name>.md` は廃止予定。**新規は必ず Skills 形式で作成すること。**

新規作成手順:
```
.claude/skills/<command-name>/
└── SKILL.md
```

frontmatter で `disable-model-invocation: true` を指定すれば、`/command-name` での明示呼び出し専用になる。

---

## 3. オーケストレーションパターン（L2が関与する範囲）

> 詳細な実装パターン・複数レイヤー連携の完全例は [ORCHESTRATION.md](./ORCHESTRATION.md) を参照。本セクションは L2 固有の関与範囲のみ。

### 3.1 2層パターン: メイン + Skill

```
Main Conversation
  ↓ (/skill-name または自動発動)
Skill invocation
  ├─ inline実行    → Skill body + tool results が会話履歴に残る
  └─ context:fork  → Subagent spawn → summary のみ返却
```

| パターン | 適用条件 | 例 |
|---|---|---|
| Inline Skill | 短時間・メイン文脈を活用 | `/code-review` 即時レビュー |
| Forked Skill | 長時間・メイン文脈不要 | `/run` でアプリ起動・サブエージェントで探索 |

### 3.2 Skill チェーン（Skill から Skill）

- 公式に明示的な "skill chaining" ガイダンスはない [要確認: 公式ドキュメント参照]
- 実装上、Skill 本文内で Claude が別の `/skill` を呼び出すことは可能だが、再帰呼び出しの context lifecycle は文書化されていない

### 3.3 Skill から Subagent への呼び出し

- 公式記述:
  - Skill は `context: fork` で **暗黙の subagent spawn** が可能
  - **Subagent nesting は許可されている**: Subagent から別の subagent を spawn できる（**既定3階層**・`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で可変）。ただし `context: fork` で生成された **fork は別の fork を spawn できない**（fork は named subagent は spawn 可で、それは深さに数える）
  - 明示的に「Skill から custom subagent を delegate する」フローは公式に未文書化だが、subagent 内からの spawn 自体は許可された
- 結論: 「Skill 単発 + `context: fork`」を起点に、生成された subagent がさらに subagent を spawn する多階層構成が**既定3階層まで**（設定で調整可能）可能。詳細は [L3_AGENTS.md §2.1 nesting](./L3_AGENTS.md) の subagent 仕様を参照。

### 3.4 Hook agent handler との関係

| 観点 | Skill `context: fork` | Hook `type: agent` |
|---|---|---|
| 発火方法 | ユーザー or Claude が明示発動 | ライフサイクルイベントで自動発火 |
| 用途 | タスク委譲 | 検証・自動チェック |
| 共通基盤 | どちらも subagent 実行モデル | 同上 |

詳細は [L4_AUTOMATION.md](./L4_AUTOMATION.md) を参照。

---

## 4. L2 固有のベストプラクティス

> 横断原則は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。

### 4.1 推奨される使い方（Do）

- **description は最重要キーワードを冒頭に**: 1536文字制限で truncate されるため
- **具体的なトリガーフレーズを含める**: 「when the user asks what changed」など自然な表現
- **副作用ある操作は `disable-model-invocation: true`**: deploy/commit/send-message 等のタイミング制御
- **長大な参考資料は supporting files に分離**: SKILL.md body は 500行以下推奨、参照は Progressive Disclosure に委ねる
- **`context: fork` は actionable task を持たせる**: ガイドラインのみのスキルでは `fork` 禁止
- **`/doctor` で description budget overflow を確認**: コンテキスト圧迫の早期発見
- **Custom Commands（`.claude/commands/`）の新規作成は禁止**: 既存は維持、新規は Skills へ

### 4.2 避けるべき使い方（Don't）

- 単純な参考資料を `context: fork` するスキル化（subagent が何もしない）
- description を曖昧にする（"Helpful skill" など）→ Claude が発動しない
- `allowed-tools` で過剰権限を与え、プロジェクトに git commit してチーム配布する → セキュリティリスク
- 500行超の SKILL.md body（auto-compaction 時に切り詰められる）
- Supporting files を「手動で Read してください」と指示する（Claude は忘れる）→ SKILL.md 本文に直接 `[xxx.md](./xxx.md)` 形式で参照する

### 4.3 description budget overflow 対策

- `/doctor` で全 Skill description のサイズを確認
- `settings.json` の `skillListingBudgetFraction` で予算拡大
- 低優先度 Skill を `skillOverrides` で "name-only" モードに

### 4.4 パフォーマンス・安定性

- Auto-compaction 時、要約後に各 Skill の最新1回の invocation が re-attach される。各 Skill は先頭5,000トークンまで保持され、re-attach 対象の Skill 全体で25,000トークンの共有予算を分け合う（トークン予算による絞り込みであり、個数固定の「最新5個」ではない）
- Skill 呼び出し後の content は会話履歴に残るため、同セッション内で Skill を再呼び出ししても **古い content が見える**
- ファイル変更は Claude Code が skill ディレクトリのファイル監視で自動検知し、再起動なしにセッション中へ反映される（Live change detection）。**`/reload-skills` という明示コマンドは存在しない**（§5 参照）。プラグイン由来の skill のみ `/reload-plugins` が必要な場合がある

---

## 5. このファイルの `[要確認]` 項目

| 項目 | セクション | 検証方法 |
|---|---|---|
| `context: fork` の日本語公式表記 | 2.2 | 日本語版 https://code.claude.com/docs/ja/skills 精読 |
| Skill から Skill 呼び出しの公式ガイダンス | 3.2 | 公式skillsドキュメント全文検索 |
| Skill (`context: fork`) → custom subagent の連携 | 3.3 | sub-agents/skills 両ドキュメント精読 |
| `disable-model-invocation: true` な Skill の preload 可否 | 4 | 公式記述 "You cannot preload skills that set disable-model-invocation: true" は確認済み、要追記検証 |
| Agent hook と Skill `context: fork` の重複発火動作 | 3.4 | hooks ドキュメント精読、L4 Phase で再確認 |
| Cross-boundary skill / subagent communication | - | sub-agents ドキュメント精読、L3 Phase で再確認 |

---

## 6. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Skills | https://code.claude.com/docs/en/skills |
| Commands（slash commands 全リスト） | https://code.claude.com/docs/en/commands |
| Subagents（context:fork関連） | https://code.claude.com/docs/en/sub-agents |
| Hooks（agent handler関連） | https://code.claude.com/docs/en/hooks |
| Plugins（Skill配布関連） | https://code.claude.com/docs/en/discover-plugins |
| 日本語版（Skills） | https://code.claude.com/docs/ja/skills |
