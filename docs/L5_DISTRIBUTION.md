# L5: 配布・拡張

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L2_SKILLS.md](./L2_SKILLS.md) / [L3_AGENTS.md](./L3_AGENTS.md) / [L4_AUTOMATION.md](./L4_AUTOMATION.md) / [BEST_PRACTICES.md](./BEST_PRACTICES.md)

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース（Plugins） | https://code.claude.com/docs/en/discover-plugins |
| 一次ソース（Marketplaces） | https://code.claude.com/docs/en/plugin-marketplaces |
| 一次ソース（Plugins reference） | https://code.claude.com/docs/en/plugins-reference |
| 一次ソース（Plugin dependencies） | https://code.claude.com/docs/en/plugin-dependencies |
| 一次ソース（Status Line） | https://code.claude.com/docs/en/statusline |
| 一次ソース（Output Styles） | https://code.claude.com/docs/en/output-styles |
| LSP（独立ページ無し） | plugins-reference#lsp-servers と discover-plugins#code-intelligence |
| 調査日 | 2026-08-29 |

---

## 1. 概要レイヤー（What & When）

### 1.1 機能の目的

L5 は **L1〜L4 で構築した拡張機能群を「パッケージ化して配布・再利用」するためのレイヤー**です。プロジェクト固有/ユーザー個人で作った Skill・Subagent・Hook・MCP server・LSP・Output Style を、**1つのプラグインに束ねて、他者へ配布** したり、**マーケットプレイス経由で公開** したりできます。

公式定義（[discover-plugins](https://code.claude.com/docs/en/discover-plugins)）:
> "Plugins extend Claude Code with skills, agents, hooks, and MCP servers. Plugin marketplaces are catalogs that help you discover and install these extensions without building them yourself."

### 1.2 含まれる機能一覧

| 機能名 | 一言説明 | 主な用途 |
|---|---|---|
| **Plugins** | Skill/Agent/Hook/MCP/LSP/Output Style/Theme/Monitor を束ねる配布単位 | 複数プロジェクト・複数ユーザーへの拡張機能配布 |
| **Plugin Marketplaces** | プラグインのカタログ（Official / Community / Custom） | 第三者発見・自動更新・組織内配布 |
| **LSP Servers** | 11言語の公式 + カスタム言語サーバー（Plugin経由配布） | 編集後の自動診断、コードナビゲーション |
| **Status Lines** | 画面下部のカスタマイズ可能な情報バー | context消費量、コスト、git branch等の常時表示 |
| **Output Styles** | システムプロンプトを改変して応答スタイル変更 | 教育モード、学習モード、独自フォーマット |
| **Themes**（experimental） | カラーテーマ配布 | ターミナル外観カスタマイズ |
| **Monitors**（experimental） | プラグイン同梱のバックグラウンド監視プロセス | デプロイステータス監視、ログ追跡 |

> **公式に未登録の L5 関連ページ**: `https://code.claude.com/docs/en/plugin-hints` と `https://code.claude.com/docs/en/plugin-relevance` が公式に存在するが、本正典および `docs/SOURCES.md` に未登録である。次回 `/update-docs` で本文取得のうえ収録可否を判断すること。

### 1.3 いつ使うか（採用判断基準）

#### 採用すべき状況（DO）
- 同じ Skill/Agent/Hook セットを **複数プロジェクト** または **チーム全体** で使い回したい → Plugin 化
- **マーケットプレイス経由で他者に配布** したい → Plugin + Marketplace
- 編集中のコードに **型エラー・参照・定義ジャンプ** を提供したい → LSP plugin
- 画面下部に **常時情報表示**（context残量、コスト、git branch） → Status Line
- 「教育モード」「学習モード」など **応答スタイルを毎回切り替えたい** → Output Styles

#### 採用すべきでない状況（DON'T）
- **このプロジェクトでしか使わない一時的な拡張** → そのまま L1〜L4 で十分（Plugin化のオーバーヘッド回避）
- **強制したい動作** → L4 Hooks（deterministic）が適切。Output Style は advisory
- **頻繁に変更・実験中の機能** → 安定するまで L1〜L4 で運用、安定後に Plugin 化
- **機微情報を含む設定** → Plugin manifest にハードコードせず、`userConfig` の `sensitive: true` を使う

#### 他レイヤーとの使い分け

| 観点 | L5 を選ぶ基準 | 他レイヤーを選ぶ基準 |
|---|---|---|
| 配布・共有 | チーム/他者へ配布・再利用したい | このプロジェクトのみ |
| 構成要素 | 複数コンポーネントの束ね | 単一機能 |
| LSP | 言語サーバー統合 | 文字列検索で十分 |
| Output Style | 応答スタイル全体を変える | CLAUDE.md で部分指示 |

---

## 2. 詳細レイヤー（How）

### 2.1 Plugins

#### 仕組み
Plugin は **`.claude-plugin/plugin.json` をマニフェストとして持つディレクトリ**。配下の `skills/`, `agents/`, `hooks/`, `.mcp.json`, `.lsp.json`, `output-styles/`, `themes/`, `monitors/`, `bin/` を **自動発見** してロードする。インストール時は `~/.claude/plugins/cache/` にコピーされ、各バージョンが独立ディレクトリで管理される（更新後約14日のgrace period。orphaned とマークされ、新しいプラグインが1つ以上インストールされている間のみバックグラウンド削除される。シンボリックリンクされたプラグインは削除・orphaned マーク対象外）。

#### インストールスコープ（4種）

| Scope | Settings file | 用途 |
|---|---|---|
| **user**（既定） | `~/.claude/settings.json` | 個人、全プロジェクト |
| **project** | `.claude/settings.json` | チーム共有（git管理） |
| **local** | `.claude/settings.local.json` | プロジェクト個人（gitignore） |
| **managed** | Managed settings | 組織配布、ユーザーは read-only |

#### インストール・管理コマンド

```bash
# 基本インストール（user scope既定）
/plugin install <name>@<marketplace>
/plugin install github@claude-plugins-official        # 公式
/plugin install <name>@claude-community               # コミュニティ
/plugin install commit-commands@claude-code-plugins   # demo

# CLI
claude plugin install formatter@my-marketplace --scope project
claude plugin uninstall formatter@my-marketplace
claude plugin list

# セッション中
/plugin              # 4タブ TUI（Discover/Installed/Marketplaces/Errors）
/plugin enable <name>@<marketplace>
/plugin disable <name>@<marketplace>
/reload-plugins      # 再起動なしで反映
```

`/plugin` 詳細パネルに表示される情報:
- **Context cost**: 起動時のtoken追加量推定
- **Last updated**: 最終更新日
- **Will install**: インストールされる commands/agents/skills/hooks/MCP/LSP の一覧

**Installed タブの利用状況表示**:
- **「Not used recently」**: **2週間以上かつ10セッション以上**使われていない plugin に付く
- **「Last used」**: 最終利用時期
- `strictKnownMarketplaces` を設定している場合、これらの表示は**出ない**
- **LSP を提供する plugin は、language server の活動を「使用」とみなす**（コマンドを打っていなくても「未使用」と誤表示されない）

**インストール結果の表示と反映**: インストール要約が **`Plugin is now active.`**（即時有効）または **`Run /reload-plugins to activate.`**（再読込が必要）のいずれかを返す。`/reload-plugins` は**プロンプトキャッシュを無効化する場合に警告**を出し、`--force` で押し切れる。

**`command` ソースの plugin**: `claude plugin install --yes` によってコマンド文字列を明示承認する（承認なしでは実行されない）。

#### 標準ディレクトリ構造

```
enterprise-plugin/
├── .claude-plugin/
│   └── plugin.json              # マニフェスト（任意）
├── skills/                       # Skill ディレクトリ
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
├── commands/                     # Flat .md（旧形式、新規は skills/ 推奨）
├── agents/                       # Subagent .md
├── output-styles/                # Output styles
├── themes/                       # カラーテーマ（experimental）
├── monitors/
│   └── monitors.json             # バックグラウンド監視（experimental）
├── hooks/
│   └── hooks.json                # フック設定
├── bin/                          # 実行可能ファイル（Bash tool のPATHに追加）
├── settings.json                 # プラグイン既定設定
├── .mcp.json                     # MCP servers
├── .lsp.json                     # LSP servers
├── scripts/                      # ヘルパースクリプト
├── LICENSE
└── CHANGELOG.md
```

⚠ `.claude-plugin/` 配下は `plugin.json` のみ。**他のディレクトリは全て plugin root に置く**。

#### Plugin Manifest 完全スキーマ（`.claude-plugin/plugin.json`）

```json
{
  "name": "plugin-name",
  "displayName": "Plugin Name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],

  "skills": "./custom/skills/",
  "commands": ["./custom/commands/special.md"],
  "agents": ["./custom/agents/reviewer.md"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json",

  "experimental": {
    "themes": "./themes/",
    "monitors": "./monitors.json"
  },

  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    }
  },

  "channels": [
    {
      "server": "telegram",
      "userConfig": {
        "bot_token": { "type": "string", "title": "Bot token", "sensitive": true }
      }
    }
  ],

  "dependencies": [
    "helper-lib",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ]
}
```

**必須フィールド**: `name` のみ（kebab-case、スペース不可）。manifestが無い場合、Claude Code が自動発見し、ディレクトリ名から名前を導出。

#### Path挙動規則
- **既定を置換**: `commands`, `agents`, `outputStyles`, `experimental.themes`, `experimental.monitors`
- **既定に追加**: `skills`（既定 `skills/` は常時スキャン、`skills` 指定で追加）
- **独自マージ規則**: `hooks`, `mcpServers`, `lspServers`

#### Plugin Dependencies

`plugin.json` の `dependencies` 配列はセマンティックバージョン範囲（`~2.1.0`/`^2.0`/`>=1.4`/`=2.1.0`）を宣言する。

- 解決は `{plugin-name}--v{version}` 形式の **git タグベース**（`claude plugin tag --push` で作成）。**`archive`/`npm`/`command` ソースはタグベース解決の対象外**（git-backed ソースのみ）
- **クロスマーケットプレイス依存は既定拒否**。`allowCrossMarketplaceDependenciesOn` で許可
- 複数プラグインが矛盾する範囲制約を課した場合は**交差（intersect）を試み**、矛盾時は `range-conflict` エラー
- `claude plugin prune` で孤立した自動インストール依存を削除
- 主なエラーコード: `dependency-unsatisfied` / `range-conflict` / `dependency-version-unsatisfied` / `no-matching-tag`

#### パス置換変数

| 変数 | 用途 | 寿命 |
|---|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | プラグインインストール先絶対パス | バージョン更新で変わる |
| `${CLAUDE_PLUGIN_DATA}` | 永続データディレクトリ (`~/.claude/plugins/data/{id}/`) | プラグイン更新後も残る |
| `${CLAUDE_PROJECT_DIR}` | プロジェクトルート | セッション中固定 |
| `${user_config.<KEY>}` | userConfig 値 | セッション中固定 |

更新時の振る舞い:
- 旧バージョンディレクトリは **約14日後に自動削除**（並走session用grace period）
- `/reload-plugins` で hooks/MCP/LSP は新パスへ切替（**monitors のみ session restart 必要**）

#### userConfig（ユーザープロンプト型設定）

```json
{
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint",
      "required": true,
      "default": "https://api.example.com"
    },
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

- `type`: `string` / `number` / `boolean` / `directory` / `file`
- `sensitive: true` → system keychain に保存（~2KB制限）
- 参照: `${user_config.<KEY>}` または `CLAUDE_PLUGIN_OPTION_<KEY>` 環境変数
- **`${user_config.*}` は shell 形式コマンドでは拒否される**（shell injection 対策）: `command`（Monitor コマンド含む）や MCP の `headersHelper` を shell 文字列として書くと `Plugin command references user_config, which is not allowed in shell-form commands` エラーになる。**exec 形式**（`args` 配列）または `${CLAUDE_PLUGIN_OPTION_<KEY>}` 環境変数経由でのみ参照可能
- **`pluginConfigs`（プラグインオプション値）はプロジェクト設定から読み込まれない**: 読み込み元は (1) `~/.claude/settings.json`（user）、(2) CLI `--settings`、(3) managed settings の3箇所のみ。`.claude/settings.json`・`.claude/settings.local.json`（project/local）は対象外——ワークスペース内リポジトリが `pluginConfigs` 値を供給できてしまうリスクを避けるための制限。`enabledPlugins` はこの制限を受けず project/local からも読み込まれる（対照的な扱い）

#### Plugin Validation

```bash
claude plugin validate ./my-plugin            # warnings 許容
claude plugin validate ./my-plugin --strict   # warnings = errors
```

#### Plugin内 Component の制約

**Plugin Agent の制約**（公式明記、セキュリティ理由）:
- サポート: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`（`worktree` のみ）
- **非対応**: `hooks`, `mcpServers`, `permissionMode`（plugin agent では禁止）

#### Plugin Cache と Path Traversal

- 全 marketplace plugin は `~/.claude/plugins/cache` にコピー
- **plugin root より外への path 参照（`../shared-utils` 等）は動作しない**
- 同 marketplace 内の別 plugin への symlink は **展開コピー** される
- Marketplace 外への symlink は **セキュリティ上スキップ**
- **marketplace エントリで宣言された plugin command のパス**は、plugin ディレクトリの外を指すと **path-traversal エラーで拒否**される（上記「plugin root より外への path 参照は動作しない」を機構として強制する）

---

### 2.2 Plugin Marketplaces

#### 3種類のマーケットプレイス

| 種類 | 名前 | 配置 | 認証 |
|---|---|---|---|
| **Official**（既定アタッチ） | `claude-plugins-official` | Claude Code 起動時に自動付与 | Anthropic 審査・キュレーション |
| **Community** | `claude-community` (`anthropics/claude-plugins-community`) | `/plugin marketplace add anthropics/claude-plugins-community` | 自動検証・安全スクリーニング、特定 commit SHA に pin |
| **Demo** | `claude-code-plugins` (`anthropics/claude-code`) | `/plugin marketplace add anthropics/claude-code` | 例示用 |
| **Custom** | 任意名 | git URL / local / remote URL | 組織判断 |

#### 公式マーケットプレイスの主要 plugin カテゴリ

- **Code intelligence**: `clangd-lsp`, `csharp-lsp`, `gopls-lsp`, `jdtls-lsp`, `kotlin-lsp`, `lua-lsp`, `php-lsp`, `pyright-lsp`, `rust-analyzer-lsp`, `swift-lsp`, `typescript-lsp`
- **External integrations**: `github`, `gitlab`, `atlassian`, `asana`, `linear`, `notion`, `figma`, `vercel`, `firebase`, `supabase`, `slack`, `sentry`
- **Automatic security review**: `security-guidance`
- **Development workflows**: `commit-commands`, `pr-review-toolkit`, `agent-sdk-dev`, `plugin-dev`
- **Output styles**: `explanatory-output-style`, `learning-output-style`

#### Marketplace 追加方法

```bash
# GitHub owner/repo
/plugin marketplace add anthropics/claude-code

# GitLab bare URL（サフィックス省略・サブグループ付きURLにも対応）
/plugin marketplace add gitlab.com/company/plugins

# Git URL
/plugin marketplace add https://gitlab.com/company/plugins.git
/plugin marketplace add git@gitlab.com:company/plugins.git
/plugin marketplace add https://gitlab.com/company/plugins.git#v1.0.0   # branch/tag

# Local
/plugin marketplace add ./my-marketplace
/plugin marketplace add ./path/to/marketplace.json

# Remote URL
/plugin marketplace add https://example.com/marketplace.json

# Shortcut
/plugin market add ...
/plugin marketplace rm <name>
```

#### プラグインソース種別

git / npm / local / URL に加え、以下3種がある:

| ソース種別 | 仕様 |
|---|---|
| `archive` | zip ファイルを HTTPS 経由でダウンロードして配布。git/npm 不要。`sha256`（64桁hex）でピン留め可。アーカイブサイズ上限256MiB。**HTTPSのみ**（`http://`・ループバック・リンクローカル・クラウドメタデータホストは拒否） |
| `command` | ローカルインストール済みツールがプラグインディレクトリを出力するソース。セッションごとに1回バックグラウンドで再実行され、再起動不要で反映。`mode: "copy"`（既定）/`"link"`（Windows非対応）。ユーザーは `--yes` でコマンド文字列を明示承認する必要あり。管理者は `disableCommandPluginSources` でブロック可能 |
| `git-subdir` | **sparse / partial clone でモノレポの特定サブディレクトリだけを取得**するソース。`url`・`path` が必須、`ref`・`sha` は任意 |

**ソース種別ごとのフィールド**:

| ソース種別 | フィールド |
|---|---|
| `url`（git） | `url`（必須）／`ref`・`sha`（任意） |
| `git-subdir` | `url`・`path`（必須）／`ref`・`sha`（任意） |
| `npm` | パッケージ指定に加え `registry`（任意） |
| `archive` | `url`（必須）／`sha256`（任意・64桁hex） |
| `command` | `command`（必須）／`timeout`（既定 **60** 秒・最大 **600** 秒）／`mode`（`copy` 既定 / `link`） |

**`strict` フィールド**: marketplace エントリの `strict` は既定 **`true`**＝**`plugin.json` が権威**（マニフェストの内容が採用される）。`false` にすると **marketplace エントリ側の記述がプラグイン定義の全体**として扱われる。

**url ソース marketplace のヘッダー**:
- `headers` 付きで登録した url ソースの marketplace では、**同一オリジン**（scheme / host / port が一致）の archive ダウンロードにも同じヘッダーが送られる。**リダイレクトでオリジンが変わるとヘッダーは落とされる**
- **`headersHelper`**: url マーケットプレイス側またはカタログエントリ側に置くと、コマンドを実行して HTTP ヘッダーを都度生成する（カタログ取得と同一オリジンの archive 取得に用いる）。**カタログエントリ側の `headersHelper` は install / update 時のみ実行**され、コマンド文字列が提示されたうえで `claude plugin install/update` が `[y/N]` で確認する（`-y` で省略可）

**`metadata.pluginRoot`**: marketplace の `metadata.pluginRoot` を設定すると、bare な plugin source 名がその配下で解決される。

**コンテナ／組織向けの追加設定**:

| キー／環境変数 | 用途 |
|---|---|
| `CLAUDE_CODE_PLUGIN_SEED_DIR` | プラグインを事前配置しておくディレクトリ（コンテナイメージへの焼き込み向け） |
| `CLAUDE_CODE_PLUGIN_CACHE_DIR` | プラグインキャッシュの配置先を差し替える |
| `disableSideloadFlags` | サイドロード系フラグの利用を禁止する |
| `pluginSuggestionMarketplaces` | インストール提案の対象とする marketplace を指定する |
| `allowManagedHooksOnly` | managed 由来の hooks のみを許可する |

**marketplace hardening**:
- marketplace 名に制御文字・不可視文字を含むものは拒否される
- `/plugin` および `claude plugin` の出力に現れる marketplace 由来テキストはエスケープ安全になっている

**claude.ai コネクタと OpenTelemetry の表示**:
- claude.ai コネクタのうち組織が認証を管理しているものには、`/mcp` と `/plugins` で `managed` マーカーが表示される
- OpenTelemetry の plugin イベントでは、claude.ai 同期プラグインの `plugin_id_hash` が実際の marketplace を反映し、管理者インストール分は `enabled_via` が `admin-install` になる

#### skills-dir plugin（新しい plugin 形態）

**skill フォルダに `.claude-plugin/plugin.json` を置くと、そのフォルダは `<name>@skills-dir` という plugin としてロードされ、agents / hooks / MCP server を同梱できる。** プロジェクトの `.claude/skills/` に置く場合は **workspace trust 承認が必要**（出典: `skills` ／ `plugins-reference#skills-directory-plugins`。`plugins-reference` 本文での裏取りは未了。[L2_SKILLS.md §2.1](./L2_SKILLS.md) にも収録）。

#### マーケットプレイス許可/拒否のオーナーワイルドカード

`strictKnownMarketplaces`（許可） / `blockedMarketplaces`（拒否）に **GitHub organization 単位のワイルドカード**（`"owner/*"`）を指定できる。

```json
{
  "permissions": {
    "strictKnownMarketplaces": ["my-org/*"]
  }
}
```

#### 設定キー名

正規のキー名は `extraKnownMarketplaces` / `strictKnownMarketplaces` のみ。`additionalMarketplaces` / `allowedMarketplaces` という別名は `settings`・`plugin-marketplaces`・`plugins-reference` の公式リファレンス本文には現れない。本正典はリファレンス本文に現れない別名を採用しない。

#### Marketplace 管理

```bash
/plugin marketplace list
/plugin marketplace update <name>
/plugin marketplace remove <name>      # ⚠ 該当 marketplace の installed plugin も削除
```

#### Auto-update

| Marketplace | 既定 | 制御 |
|---|---|---|
| Official | 有効 | `/plugin` → Marketplaces → 切替 |
| Community / Custom / Local dev | 無効 | 同上 |

環境変数:
- `DISABLE_AUTOUPDATER=1` — 全自動更新OFF
- `FORCE_AUTOUPDATE_PLUGINS=1` — Claude本体は手動、plugin は自動

#### Team Marketplace（自動配布）

`.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "my-team-tools": {
      "source": {
        "source": "github",
        "repo": "your-org/claude-plugins"
      },
      "autoUpdate": true
    }
  }
}
```
- リポジトリを trust すると、ユーザーへインストール促進
- Managed settings で `extraKnownMarketplaces` を組織配布可

#### Marketplace 公開フロー

1. プラグイン作成（skills/agents/hooks/MCP/LSPを含むディレクトリ）
2. `.claude-plugin/marketplace.json` を作成
3. GitHub/GitLab に push
4. ユーザーは `/plugin marketplace add owner/repo` で利用開始

#### Managed Marketplace Restrictions
組織管理者は許可された marketplaces のみに制限可能。

---

### 2.3 LSP Servers（コードインテリジェンス）

#### 仕組み
LSP plugin は Claude Code に **編集後の自動診断 / コードナビゲーション** を提供する。Microsoftの Language Server Protocol 標準を使用、VS Code等と同じ機構。

#### 提供される能力
- **自動診断**: ファイル編集後、language server が解析し、型エラー・import漏れ・構文エラーを Claude へ自動報告
- **コードナビゲーション**: 定義へジャンプ、参照検索、hover info、シンボル一覧、実装検索、call hierarchy

ユーザーは編集後の "diagnostics found" 表示中に **Ctrl+O** でインライン診断を表示できる。

#### 公式 LSP plugin 11言語

| Language | Plugin | 必要バイナリ |
|---|---|---|
| C/C++ | `clangd-lsp` | `clangd` |
| C# | `csharp-lsp` | `csharp-ls` |
| Go | `gopls-lsp` | `gopls` |
| Java | `jdtls-lsp` | `jdtls` |
| Kotlin | `kotlin-lsp` | `kotlin-language-server` |
| Lua | `lua-lsp` | `lua-language-server` |
| PHP | `php-lsp` | `intelephense` |
| Python | `pyright-lsp` | `pyright-langserver` |
| Rust | `rust-analyzer-lsp` | `rust-analyzer` |
| Swift | `swift-lsp` | `sourcekit-lsp` |
| TypeScript | `typescript-lsp` | `typescript-language-server` |

⚠ LSP plugin は **接続設定のみ** を提供。**バイナリは別途インストールが必要**。`Executable not found in $PATH` エラーが `/plugin` Errors タブに出たら、対応バイナリをインストール。

#### カスタム LSP plugin（`.lsp.json`）

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

または plugin.json 内 inline:
```json
{
  "name": "my-plugin",
  "lspServers": {
    "go": {
      "command": "gopls",
      "args": ["serve"],
      "extensionToLanguage": { ".go": "go" }
    }
  }
}
```

##### 必須フィールド
| Field | 説明 |
|---|---|
| `command` | LSP バイナリ（PATH内） |
| `extensionToLanguage` | 拡張子 → 言語ID マッピング |

##### 任意フィールド
| Field | 説明 |
|---|---|
| `args` | コマンドライン引数 |
| `transport` | `stdio`（既定）/ `socket` |
| `env` | 環境変数 |
| `initializationOptions` | 初期化オプション |
| `settings` | `workspace/didChangeConfiguration` で渡す設定 |
| `workspaceFolder` | ワークスペースフォルダパス |
| `startupTimeout` | 起動timeout（ms） |
| `shutdownTimeout` | 終了timeout（ms） |
| `restartOnCrash` | クラッシュ時自動再起動 |
| `maxRestarts` | 再起動回数上限 |

#### 既知の制限・運用注意
- **メモリ消費が大きい**: `rust-analyzer` や `pyright` は大規模プロジェクトで多量消費。重い場合は `/plugin disable <name>` で無効化
- **モノレポでの誤検知**: workspaceが正しく構成されていないと、内部パッケージのimportエラーが出る場合あり（Claude の編集自体は影響なし）
- **`/reload-plugins` の挙動**: 最後の LSP plugin を無効化したあとも LSP ツールは保持され、会話を読み直すことになる LSP plugin 変更の前には警告が出る

---

### 2.4 Status Lines

#### 仕組み
画面下部に **shell script の stdout を表示するカスタマイズ可能なバー**。セッションデータが JSON で stdin に渡され、スクリプトの標準出力がそのまま表示される。

公式引用（[statusline](https://code.claude.com/docs/en/statusline)）:
> "The status line is a customizable bar at the bottom of Claude Code that runs any shell script you configure. It receives JSON session data on stdin and displays whatever your script prints."

#### 用途
- Context window の使用量表示
- セッションコスト追跡
- Git branch / status 常時表示
- 複数セッションの識別

#### 設定（`settings.json`）

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/script.sh"
  }
}
```

#### スクリプトに渡される JSON（概略）
- model
- transcript path
- session_id
- cwd
- git branch
- cost
- duration

> [要確認: 公式ドキュメント参照] JSON入力フィールドの完全スキーマは preview部分のみ確認。詳細は公式 statusline ページ精読が必要。

#### Multi-line Status Line
スクリプトが複数行を出力すると、複数行で表示可能。

#### Subagent Status Lines
Plugin の `settings.json` で `subagentStatusLine` キーを使うと、plugin agent 用のステータスラインを定義できる。

---

### 2.5 Output Styles

#### 仕組み
**Output styles は Claude Code の system prompt 自体を改変する**。CLAUDE.md（user message 追加）や `--append-system-prompt`（追記）とは異なり、**system prompt の置き換え/拡張** で role/tone/format を毎回変える。

公式引用（[output-styles](https://code.claude.com/docs/en/output-styles)）:
> "Output styles change how Claude responds, not what Claude knows. They modify the system prompt to set role, tone, and output format."

#### 組み込み Output Style（4種）

| Style | 内容 |
|---|---|
| **Default** | 既定。SE 向け system prompt |
| **Proactive** | 即実行・推測でも進む。auto mode より強い自律性。permission mode は変えないので prompt は出る |
| **Explanatory** | 教育的 "Insights" を SE タスクの合間に挟む |
| **Learning** | 学習モード。`TODO(human)` マーカーをコードに残し、ユーザーに小規模実装を促す |

#### 切り替え

```bash
/config              # メニュー選択
```

または settings.local.json:
```json
{
  "outputStyle": "Explanatory"
}
```

⚠ `/output-style` コマンドは存在しない。`/config` または settings 直接編集を使用。

セッション開始時の system prompt に組み込まれるため、変更後は `/clear` または新セッションで反映。

#### カスタム Output Style

配置:
- User: `~/.claude/output-styles/`
- Project: `.claude/output-styles/`
- Managed: managed settings directory 内 `.claude/output-styles/`

ファイル形式:
```markdown
---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---

When explaining code, architecture, or data flow, start with a Mermaid diagram showing the structure, then explain in prose.

## Diagram conventions

Use `flowchart TD` for control flow and `sequenceDiagram` for request paths. Keep diagrams under 15 nodes.
```

#### Frontmatter フィールド

| Field | 既定 | 用途 |
|---|---|---|
| `name` | ファイル名 | `/config` ピッカー表示名 |
| `description` | なし | ピッカー説明 |
| `keep-coding-instructions` | `false` | Claude Code 組込み SE 指示を残すか。コーディング以外用途では `false` |
| `force-for-plugin` | `false` | Plugin output style のみ。`true` で plugin 有効中は強制適用（ユーザー設定上書き）。複数plugin が指定時は最初にロードされた方が勝つ |

#### Plugin Output Style
- Plugin の `output-styles/` ディレクトリで配布可能
- `force-for-plugin: true` 設定時、plugin 有効化で自動適用

#### 他機能との比較

| Feature | 動作 | 用途 |
|---|---|---|
| **Output styles** | system prompt 改変 | role/tone/format を毎回変えたい |
| **CLAUDE.md** | system prompt の後に user message | プロジェクト規約・前提を常に持たせる |
| `--append-system-prompt` | system prompt に追記 | 単発 invocation |
| **Agents** | 独立 system prompt/model/tools | focused task の別行 |
| **Skills** | task-specific 指示を on-demand | 再利用ワークフロー |

---

### 2.6 Themes（experimental）

Plugin に `themes/<name>.json` で配布可能:
```json
{
  "name": "Dracula",
  "base": "dark",
  "overrides": {
    "claude": "#bd93f9",
    "error": "#ff5555",
    "success": "#50fa7b"
  }
}
```
- `/theme` で選択
- Read-only、`Ctrl+E` で `~/.claude/themes/` へコピー編集

> [要確認: 公式ドキュメント参照] `base` プリセット名の完全一覧

---

### 2.7 Monitors（experimental）

Plugin が **バックグラウンド監視プロセス** を同梱できる:

```json
[
  {
    "name": "deploy-status",
    "command": "${CLAUDE_PLUGIN_ROOT}/scripts/poll-deploy.sh ${user_config.api_endpoint}",
    "description": "Deployment status changes",
    "when": "always"
  },
  {
    "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log",
    "when": "on-skill-invoke:debug"
  }
]
```

- 配置: `monitors/monitors.json` または plugin.json `experimental.monitors`
- stdout 1行ごとに Claude へ通知
- **対話 CLI session のみ動作**（`-p` モード等では無効）
- **unsandboxed**、hook と同じ trust level
- disable してもセッション中は実行継続（セッション終了で停止）

---

## 3. L5 横断: 比較表

### 3.1 Plugin がパッケージ化できる要素

| 要素 | レイヤー | 配置 |
|---|---|---|
| Skills | L2 | `skills/<name>/SKILL.md` |
| Agents | L3 | `agents/<name>.md`（制約あり） |
| Hooks | L4 | `hooks/hooks.json` |
| MCP servers | L4 | `.mcp.json` |
| LSP servers | L5 | `.lsp.json` |
| Output Styles | L5 | `output-styles/` |
| Themes（experimental） | L5 | `themes/` |
| Monitors（experimental） | L5 | `monitors/monitors.json` |
| Bin executables | L5 | `bin/`（Bash tool の PATH に追加） |

> **skills-dir plugin**: 上表とは別の入口として、**skill フォルダに `.claude-plugin/plugin.json` を置くと `<name>@skills-dir` という plugin としてロードされ、agents・hooks・MCP サーバーを同梱できる**（§2.2 参照）。プロジェクトの `.claude/skills/` に置く場合は workspace trust 承認が必要。

### 3.2 配布方式の比較

| 方式 | 配布範囲 | 更新 | 用途 |
|---|---|---|---|
| Plugin（local） | 個人・1プロジェクト | 手動 | 試作・実験 |
| Plugin（user scope） | 個人・全プロジェクト | Marketplace 経由 | 個人ツール |
| Plugin（project scope） | チーム共有 | git経由 | 組織内標準 |
| Official Marketplace | 全世界 | Auto-update | 第一級公開 |
| Community Marketplace | 全世界 | Auto-update（オプトイン） | 第三者公開 |
| Custom Marketplace | 組織内 | Auto-update（設定可） | 社内配布 |

---

## 4. L5 固有のベストプラクティス

> 横断原則は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。

### 4.1 推奨される使い方（Do）
- Plugin manifest（`plugin.json`）に `version` を semver で明記し、ユーザーが意図したタイミングで更新を受け取れるようにする
- 永続データ（npm依存、Python venv、キャッシュ）は `${CLAUDE_PLUGIN_DATA}` に書き込む（`${CLAUDE_PLUGIN_ROOT}` は更新で消える）
- 機微情報は `userConfig` の `sensitive: true` で system keychain へ
- `claude plugin validate --strict` を CI に組み込む（misspelled field の早期発見）
- LSP plugin はチーム必須言語のみインストール（メモリ消費大）
- Output Style のカスタム作成時、`keep-coding-instructions: true` の判断を明示（SE 用途継続か全く別用途か）
- Marketplace 公開前に **README にコンポーネント一覧 + 必要バイナリ + userConfig 説明** を記載

### 4.2 避けるべき使い方（Don't）

#### Plugin
- `.claude-plugin/` 配下に components（skills/agents 等）を置く → 認識されない（**root配置必須**）
- plugin root より外への path 参照（`../shared-utils`）→ cache copy で動作不能
- `${CLAUDE_PLUGIN_ROOT}` に永続データを書き込む → 更新で消える
- Plugin agent に `hooks`/`mcpServers`/`permissionMode` を指定 → セキュリティ上禁止
- 1 plugin に大量 MCP server を bundle → context 圧迫（Tool Search で軽減できるが、設計として避ける）
- manifest 未指定で複雑構成を組む → 自動発見に依存して保守性低下

#### Marketplace
- 信頼できない marketplace を `/plugin marketplace add` → MCP 経由でprompt injection リスク
- 廃止予定 marketplace を継続利用 → security update が来ない

#### LSP
- 不要言語の LSP plugin を全部インストール → memory consumption が増大
- monorepo で workspace 構成不適切 → false positive 誤検知

#### Output Style
- カスタム style で `keep-coding-instructions: false` のまま SE 用途で使う → SE 向け指示が消える
- Plugin が `force-for-plugin: true` を多用 → ユーザーの設定が常に上書きされる

---

## 5. このファイルの `[要確認]` 項目

| 項目 | セクション | 検証方法 |
|---|---|---|
| Status Line に渡される JSON 入力の完全フィールド | 2.4 | 公式 statusline ページ詳細精読 |
| Theme の `base` プリセット名一覧 | 2.6 | 公式 themes ドキュメント |
| Marketplace の `marketplace.json` 完全スキーマ | 2.2 | 公式 plugin-marketplaces ページ全文 |

---

## 6. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Discover and install plugins | https://code.claude.com/docs/en/discover-plugins |
| Plugin marketplaces | https://code.claude.com/docs/en/plugin-marketplaces |
| Plugins reference（技術仕様） | https://code.claude.com/docs/en/plugins-reference |
| Status Line | https://code.claude.com/docs/en/statusline |
| Output Styles | https://code.claude.com/docs/en/output-styles |
| Plugin dependencies | https://code.claude.com/docs/en/plugin-dependencies |
| Managed MCP | https://code.claude.com/docs/en/managed-mcp |
| 日本語版（Plugins） | https://code.claude.com/docs/ja/discover-plugins |
