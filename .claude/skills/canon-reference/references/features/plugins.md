---
feature: plugins
sources:
  - https://code.claude.com/docs/en/plugins/overview.md
  - https://code.claude.com/docs/en/plugins/install.md
  - https://code.claude.com/docs/en/plugins/code-intelligence.md
  - https://code.claude.com/docs/en/plugins/create.md
  - https://code.claude.com/docs/en/plugins/components.md
  - https://code.claude.com/docs/en/plugins/dependencies.md
  - https://code.claude.com/docs/en/plugins/publish.md
  - https://code.claude.com/docs/en/plugins/create-marketplace.md
  - https://code.claude.com/docs/en/plugins/host-marketplace.md
  - https://code.claude.com/docs/en/plugins/relevance.md
  - https://code.claude.com/docs/en/plugins/loading.md
  - https://code.claude.com/docs/en/plugins/manifest-reference.md
  - https://code.claude.com/docs/en/plugins/marketplace-reference.md
  - https://code.claude.com/docs/en/plugins/cli-reference.md
  - https://code.claude.com/docs/en/sub-agents.md
---

# Plugins

## 1. 概要

- プラグインは、skill・agent・hook・MCP サーバーなどのコンポーネントを1つのディレクトリにまとめ、Claude Code が一体としてインストールし読み込む単位である。[仕様]
  > "A Claude Code plugin is a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit."
- manifest は `.claude-plugin/plugin.json` で、任意。無いときは既定の配置（`plugin-manifest:components`）にあるコンポーネントが読み込まれ、名前はマーケットプレイスのエントリ名か（`--plugin-dir` なら）ディレクトリ名になる。manifest を書くと必須なのは `name` だけ（`plugin-manifest:fields/name`）。[仕様]
- すべてのコンポーネントはプラグイン名で名前空間化される。skill は `/<plugin>:<skill>`、agent は `<plugin>:<name>`、MCP サーバーは `plugin:<plugin>:<server>`、その MCP ツールは `mcp__plugin_<plugin>_<server>__<tool>` になる。hook には接頭辞が無い。[仕様]
- 読み込みの時点とコンテキストへの効き方 [仕様]:
  - プラグインはセッション開始時か `/reload-plugins` で読み込まれる。設定やディスクの変更は、どちらかを経るまで実行中のセッションに届かない。
  - 有効なプラグインは、使わないセッションでも毎ターンのコンテキストに載る。Claude が自分で呼べる skill・agent・command の名前と description が毎ターン載り、本文は使われたときだけ読み込まれる。MCP サーバーはセッションと並んで動き、hook はイベントごとに発火する。
  - プラグインのルートの `CLAUDE.md` はコンテキストとして読み込まれない。指示をコンテキストに入れるには skill にする。
- 配布の経路は、マーケットプレイス（`.claude-plugin/marketplace.json` を持つリポジトリかディレクトリ。プラグインの一覧と取得元を載せるカタログ）を通すのが基本である。ほかに、`--plugin-dir`/`--plugin-url` でのセッション限りの読み込み、`~/.claude/skills/` か `<project>/.claude/skills/` の下に置く skills ディレクトリのプラグイン、claude.ai からの同期がある。[仕様]

## 2. 使う場面・使わない場面

- **使う**: 複数の skill・subagent・hook・MCP サーバーを1つにまとめて、チームに配る、多くのプロジェクトに入れる、版付きで公開するとき。[仕様]
  > "Make a plugin when you want to share the setup with teammates, install it in several projects, or publish versioned releases."
- **使わない**: 1つのプロジェクトか自分だけで使う構成。skill・subagent・hook・MCP は単体で動くので、`.claude/` や `~/.claude/` に置けばよい。[仕様]
  > "Keep that standalone setup while it serves one project or only you."
- 近い機能との違い:
  - **`.claude/` の単体の構成**: プロジェクトの `.claude/` はリポジトリと一緒に配られ、名前に接頭辞が付かない。プラグインは接頭辞が付くので別プラグインの同名 skill と衝突しないが、利用者ごとにインストールか有効化が要る。[仕様]
  - **skills ディレクトリのプラグイン**: `<project>/.claude/skills/<name>/.claude-plugin/plugin.json` を置くと、マーケットプレイス無しでそのリポジトリの全員に読み込まれる（`<name>@skills-dir`）。ワークスペースの信頼の後でだけ読み込まれ、MCP バンドルと monitor は読み込まれない。[仕様]
  - **Mods**: hook を JavaScript の関数で書き、画面に描けるプラグインは mod と呼ぶ。`plugin-mods` の機能ファイルで扱う。[仕様]
- 有効にすると常時コンテキストを消費し、プラグインの hook・MCP サーバー・`bin/` の実行ファイルは利用者の権限で動く。導入の判断ではこの費用と信頼を見る。[仕様]
- claude.ai と Cowork では読み込まれるコンポーネントの組が違い、トップレベルに `bin/` を持つプラグインはインストールされない。クラウドセッションはローカルの設定のプラグインを読み込まない。[仕様]

## 3. 仕様の要約

### manifest とコンポーネント

- `plugin.json` のキーは `plugin-manifest:fields`、既定の配置は `plugin-manifest:components` を正とする。[仕様]
- 不明なトップレベルのキーは取り除かれ、プラグインは読み込まれる（`claude plugin validate` は警告）。`userConfig` の選択肢、`channels` の要素、`lspServers` の設定、monitors の要素は strict で、不明なキーがあるとプラグインは読み込まれない。[仕様]
- コンポーネントのパスはプラグインのルートからの相対で、`./` で始める。例外は `skills` の `"."` と、`mcpServers` の `https://` のバンドル URL。パスはルートの中に解決され、存在しなければならない。macOS と Linux ではバックスラッシュを含むパスを拒否する。[仕様]
- manifest のキーと既定の場所の関係は `component_relation` に持つ。値は3種類ある。[仕様]
  - `replaces`: 既定のディレクトリを走査しなくなる（`commands`・`agents`・`outputStyles`・`workflows`・`experimental.themes`・`experimental.monitors`）。既定も残すには、そのディレクトリも明示して並べる。
  - `adds`: 既定に加える（`skills`）。
  - `merges`: 既定のファイルを先に読み、manifest の宣言を合わせる（`hooks`・`mcpServers`・`lspServers`）。
- hook のファイルはトップレベルの `"hooks"` キーで包み、中身は settings の `hooks`（`settings:keys/hooks`）と同じ形にする。包まないファイルは読み込みに失敗する。manifest のインラインの `hooks` はイベントのマップそのものを書く。プラグインの hook は、プラグインの skill が使われるかに関わらず、読み込まれた時点から発火する。[仕様]
- `.lsp.json` はサーバー名から設定へのマップで、包むキーが無い。`claude plugin validate` はこのファイルを読まず、1件でも不正ならファイル全体が飛ばされる。サーバーのバイナリはプラグインに入らず、利用者の `PATH` から起動される。[仕様]
- プラグインのルートの `settings.json`（または `settings` キー）で効くのは `settings:keys/agent` と `settings:keys/subagentStatusLine` だけで、他のキーは捨てられる。プラグインの既定値は settings の中で最も弱い層である。[仕様]
- `bin/` の実行ファイルは、プラグインが有効な間 Bash ツールの `PATH` に載る。利用者自身の `PATH` の後ろに付くので、システムのコマンドを上書きできない。[仕様]

### プラグインの agent

- 受け付ける frontmatter は `frontmatter:plugin-agent` を正とする。`supported: false` のキー（`permissionMode`・`hooks`・`mcpServers`・`initialPrompt`）は無視される。hook と MCP サーバーはプラグインの階層で持たせる。[仕様]
- 名前は `<plugin>:<name>` で、`agents/` のサブフォルダはコロンで繋いで名前に入る。frontmatter が解釈できなくてもファイル名で読み込まれる。[仕様]

### パスの変数と利用者の設定

- `${CLAUDE_PLUGIN_ROOT}` はインストールされた版のディレクトリを指し、更新で変わる。`${CLAUDE_PLUGIN_DATA}`（`~/.claude/plugins/data/<id>/`）は更新をまたいで残る。`${CLAUDE_PROJECT_DIR}` はプロジェクトのルート。[仕様]
  > "`${CLAUDE_PLUGIN_ROOT}` changes when the plugin updates, so don't write state there."
- これらの変数は Bash ツールで Claude が実行するコマンドの環境には無い。skill・command・agent の本文では `${...}` を書けば読み込み時に置換される。[仕様]
- `userConfig`（`plugin-manifest:fields/userConfig`）の値は、MCP・LSP の設定、exec 形式の hook の `args`、skill と agent の本文で `${user_config.KEY}` として参照でき、hook のプロセスには `CLAUDE_PLUGIN_OPTION_<KEY>` として渡る。`sensitive: true` の値は `settings.json` ではなく安全な保管場所に入る。シェルを通る欄（シェル形式の hook の `command`・monitor の `command`・MCP の `headersHelper`）は `${user_config.*}` を拒否する。[仕様]

### マーケットプレイス

- `marketplace.json` のキーは `marketplace:fields`、プラグインとマーケットプレイスの取得元の種別は `marketplace:source-types` を正とする。必須は `name`・`owner`・`plugins` と、各エントリの `name`・`source`。不明なキーは無視される（`claude plugin validate` は警告）。[仕様]
- 相対パスのソースは、`.claude-plugin/` ではなく、それを含むマーケットプレイスのルートから解決される。マーケットプレイスを `marketplace.json` の URL で追加したときは、相対パスは解決できない。[仕様]
- エントリと `plugin.json` の関係 [仕様]:
  - `plugin.json` が無ければ、エントリが manifest になる。
  - `plugin.json` があれば、`plugin.json` が manifest になる。`strict`（既定 `true`）のとき、エントリのコンポーネントのフィールドは追記される。`strict: false` でエントリがコンポーネントを宣言すると衝突し、読み込みに失敗する。
  - 版は `plugin.json` の `version` が勝つ。`defaultEnabled` と表示用のフィールドはエントリが勝つ。
- エントリ名はインストールと有効化のキー（`enabledPlugins` に書く `<entry-name>@<marketplace>`）で、manifest 名はコンポーネントの接頭辞になる。[仕様]

### 有効化・スコープ・版

- 有効化は `settings:keys/enabledPlugins`、マーケットプレイスの宣言は `settings:keys/extraKnownMarketplaces` で行う。スコープは user（`~/.claude/settings.json`）・project（`.claude/settings.json`）・local（`.claude/settings.local.json`）。[仕様]
- 優先順位は低い順に `--add-dir`・user・project・local・flag・managed で、プラグイン id ごとにキー単位で合成される。[仕様]
- project の settings で `true` にしただけでは、未インストールのマシンに外部ソースのプラグインは取得されない（各自のインストールが要る）。例外は、相対パスのソースか seed ディレクトリにある場合。[仕様]
- 版の決まり方 [仕様]:
  - 優先順は、manifest の `version`、エントリの `version`、ソースから導いた値（git の commit SHA など）の順。
  - `version` を固定すると、文字列を変えるまで利用者に更新が届かない。
  - ローカルパスで追加したマーケットプレイスの相対パスのプラグインは、その場で読み込まれる。そのため版に関わらず、次のセッションか `/reload-plugins` で変更が反映される。
- 自動更新は公式のマーケットプレイスでは既定で有効、それ以外では既定で無効。`marketplace.json` に自動更新を有効にするフィールドは無い。[仕様]

### 依存関係

- `dependencies` の要素は、名前、`name@marketplace`、`{ name, marketplace, version }`（`version` は semver の範囲）のいずれか。範囲は依存先のリポジトリの git タグ `<plugin-name>--v<version>` に対して解決される。[仕様]
- 別のマーケットプレイスの依存は、インストールするプラグインのマーケットプレイスの `allowCrossMarketplaceDependenciesOn`（`marketplace:fields/allowCrossMarketplaceDependenciesOn`）に載っていなければインストールされない。[仕様]

### 検証と確認の道具

- `claude plugin validate <path>` は manifest の正否を最終的に判定する。`--strict` を付けると警告でも exit 1 になり、予期しない失敗は exit 2。marketplace と plugin の manifest、skill・agent・command の frontmatter を検査する。[仕様]
- `.lsp.json`、マーケットプレイスの実行で他ディレクトリにあるプラグインのファイル、エントリの `hooks` のファイルパス形式は、`validate` が検出しない。読み込み時のエラーは `/plugin` の **Errors** タブと `claude plugin list` で確かめる。[仕様]

## 4. 設計の指針

- **プラグインにするかを先に決める**。共有・複数プロジェクト・版付き配布のどれも要らなければ、単体の `.claude/` 構成にする。[仕様]
- **常時コンテキストの量を設計の制約にする**。[仕様]
  - Claude が自分で呼べる skill・agent・command の description は、有効な間ずっと毎ターン載る。
  - 利用者が明示的に呼ぶだけの skill は、Claude が自分で呼べないよう frontmatter で制御する（公式の例は `disable-model-invocation: true`）。
- **必ず守らせる規則は hook に、手順や知識は skill に置く**。[仕様]
  > "If a rule must hold every time, such as blocking edits to protected files, add it to the plugin as a hook rather than a skill."
- **プラグインの hook は有効な間ずっと発火する**ので、`matcher` で対象を絞る。プラグイン自身の MCP ツールに当てるときは、`mcp__plugin_<plugin>_<server>__<tool>` の完全な名前を書く。サーバー名だけの matcher は発火しない。[仕様]
- **agent に hook・MCP・permissionMode を持たせたい場合**: プラグインの agent ではこれらが無視される。プラグインの階層の hook・MCP にするか、agent を `.claude/agents/` に置く単体の構成を選ぶ。[仕様]
- **状態とファイルの置き場所** [仕様]:
  - 同梱のファイルは `${CLAUDE_PLUGIN_ROOT}` で参照する。
  - 依存パッケージ・キャッシュ・生成物は `${CLAUDE_PLUGIN_DATA}` に置く。
  - キャッシュに写されたプラグインは、ルートの外（`../shared` など）を参照できない。
- **名前は永続的に扱う**。[仕様]
  - `name@marketplace` がインストール・有効化・設定のキーなので、改名は既存のインストールを壊す。
  - 表示名は `displayName` で変える。
  - 改名や削除が避けられないときは、`renames` で移行させる。
- **版の方針を1つに決める**。[仕様]
  - 選択肢は2つ。リリースのたびに `version` を上げるか、git でホストするマーケットプレイスでは `version` を省いて commit SHA で追跡させるか。
  - `plugin.json` とエントリの両方に `version` を書かない。
- **秘密の値は `userConfig` の `sensitive: true` で受け取り**、設定ファイルに直接書かない。[仕様]
- **依存先の API に頼るなら版の範囲を付ける**。範囲が無い依存は、次の更新で依存先の最新リリースに移る。[仕様]
- **リポジトリの全員に配る経路** [仕様]:
  - マーケットプレイスを `extraKnownMarketplaces` に、プラグインを `enabledPlugins` に入れた `.claude/settings.json` をコミットする。この場合も、外部ソースのプラグインは各自のインストールが要る。
  - プラグインを `.claude/skills/<name>/` に置く skills ディレクトリのプラグインにする。
- **言語サーバー**: 公式の code intelligence プラグインがある言語はそれを入れ、無い言語だけ `.lsp.json` を書く。[仕様]

## 5. 生成の規約

- 置き場所 [仕様]:
  - `plugin.json` だけを `.claude-plugin/` に置く。ほかはすべてプラグインのルートに置く。
  - 新しいコマンドは `commands/` ではなく `skills/<name>/SKILL.md` で書く。
  - プラグインのルートに `CLAUDE.md` を置かない。
- manifest のコンポーネントのパスは `./` で始め、`..` を使わない。hook のコマンドと MCP の設定では、同梱のファイルを `${CLAUDE_PLUGIN_ROOT}/...` で参照する。[仕様]
- シェル形式の hook の `command` では、`${CLAUDE_PLUGIN_ROOT}` を含むパスを二重引用符で囲む。`args` を使う exec 形式なら引用符は要らない。[仕様]

最小の manifest（`name` だけが必須）[仕様]:

```json
{
  "name": "my-plugin",
  "description": "Review, formatting, and database tools for this team",
  "version": "1.0.0",
  "author": { "name": "Your Name" }
}
```

配置の型 [仕様]:

```text
my-plugin/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── review/
│       └── SKILL.md
├── agents/
│   └── security-reviewer.md
├── hooks/
│   └── hooks.json
├── scripts/
│   └── format.sh
└── .mcp.json
```

`hooks/hooks.json`（`"hooks"` で包む）[仕様]:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh\"" }
        ]
      }
    ]
  }
}
```

同じリポジトリの中で配るマーケットプレイス（エントリの `name` を `plugin.json` の `name` と揃える）[仕様]:

```json
{
  "name": "your-marketplace",
  "owner": { "name": "Your Org" },
  "plugins": [
    { "name": "my-plugin", "source": "./plugins/my-plugin", "description": "Review and formatting tools" }
  ]
}
```

プロジェクトでマーケットプレイスとプラグインを宣言する `.claude/settings.json` [仕様]:

```json
{
  "extraKnownMarketplaces": {
    "your-marketplace": {
      "source": { "source": "github", "repo": "your-org/your-marketplace" }
    }
  },
  "enabledPlugins": {
    "my-plugin@your-marketplace": true
  }
}
```

## 6. 検証ルール

- **V-plugins-01**: `plugin.json` のトップレベルのキーは、`plugin-manifest:fields` のいずれかの `id` と一致する（`experimental.*` は `experimental` の下のキーとして）。[仕様]
- **V-plugins-02**: `plugin.json` があれば `name` を持つ（`plugin-manifest:fields/name` の `required`）。[仕様]
- **V-plugins-03**: `plugin.json` の `name` は kebab-case である。また、`plugin-manifest:fields/name` の `reserved_prefixes` で始まらず、`reserved_values` と一致しない。[仕様]
- **V-plugins-04**: manifest のコンポーネントのキー（`plugin-manifest:fields` のうち `component_relation` を持つもの）の各パスは `./` で始まり、`..` とバックスラッシュを含まない。例外は `skills` の `"."`、`mcpServers` の `https://` の `.mcpb`/`.dxt` の URL。[仕様]
- **V-plugins-05**: manifest が指すコンポーネントのパスが、プラグインの中に存在する。`agents` の各要素は `.md` ファイル、`skills` の各要素はディレクトリである。[仕様]
- **V-plugins-06**: `.claude-plugin/` の中に `plugin.json` と `marketplace.json` 以外を置かない。コンポーネント（`plugin-manifest:components` の `default_location`）はプラグインのルートに置く。[仕様]
- **V-plugins-07**: hook のファイル（`plugin-manifest:components/hooks` の `hooks/hooks.json` と、`hooks` キーが指す `.json`）は、トップレベルに `"hooks"` キーを持つ。その下のキーは `hook-events:events` のいずれかの `id` と一致する。[仕様]
- **V-plugins-08**: `userConfig`・`channels`・`lspServers`・`experimental.monitors` の各要素は、`plugin-manifest:fields` の該当要素の `option_fields`・`entry_fields`・`server_fields` にあるキーだけを持ち、`required: true` のキーをすべて持つ。`userConfig` の `type` は `allowed_values` のいずれかである。[仕様]
- **V-plugins-09**: `commands` のオブジェクトマップの各値は、`source` と `content` のちょうど一方を持つ（`plugin-manifest:fields/commands` の `entry_fields`）。[仕様]
- **V-plugins-10**: プラグインの `settings.json` と `settings` キーは、`settings:keys/agent` と `settings:keys/subagentStatusLine` 以外のキーを持たない。[仕様]
- **V-plugins-11**: `agents/` の agent の frontmatter のキーは、`frontmatter:plugin-agent` の `supported: true` の要素のいずれかである。`allowed_values` を持つキーの値は、そのいずれかである。[仕様]
- **V-plugins-12**: シェル形式の hook の `command`（`args` を持たないもの）と monitor の `command` は、`${user_config.` を含まない（`plugin-manifest:fields/userConfig`）。[仕様]
- **V-plugins-13**: プラグインのルート（`plugin-manifest:components` の基準）に `CLAUDE.md` が無い。[仕様]
- **V-plugins-14**: `marketplace.json` は、`marketplace:fields` のうち `level: top-level` で `required: true` のキーを持つ。各エントリは、`level: plugin-entry` で `required: true` のキーを持つ。[仕様]
- **V-plugins-15**: `marketplace.json` の `name` は、`marketplace:fields/name` の `reserved_names` のどの値とも一致せず、どの接頭辞でも始まらない。ただし `github.com/anthropics/` から来る公式・community・directory の名前は除く。[仕様]
- **V-plugins-16**: エントリの `source` が文字列なら、`marketplace:source-types/plugin:relative-path` の規則（`./` で始まる、`"."`、または `metadata.pluginRoot` の下の素の名前）に従い、`..` を含まない。オブジェクトなら、`source` の値は `marketplace:source-types` の `kind: plugin` の要素の `type_name` のいずれかである。[仕様]
- **V-plugins-17**: エントリの `headersHelper` を設定するなら、そのエントリは `"strict": false` を持つ（`marketplace:fields/plugins[].headersHelper`）。[仕様]
- **V-plugins-18**: エントリの `hooks`（`plugin-manifest:fields/hooks`）はインラインのオブジェクトで書く（ファイルパスか配列で書くと、読み込み時にエラーになる）。[仕様]
- **V-plugins-19**: `strict: false`（`marketplace:fields/plugins[].strict`）のエントリが `plugin.json` を持つプラグインを指すなら、そのエントリは `commands`・`agents`・`skills`・`hooks`・`outputStyles`・`themes` を宣言しない。[仕様]
- **V-plugins-20**: 相対パスのエントリでは、`plugin.json` とエントリの両方に `version`（`marketplace:fields/plugins[].version`）を書かない。また、エントリの `name` は、指す先の `plugin.json` の `name` と一致する。[仕様]

## 7. 品質基準

- **Q-plugins-01**: プラグインにする理由（チームへの共有・複数プロジェクトへの導入・版付きの配布）が要件から説明できる。そうでなければ単体の `.claude/` 構成になっている。[仕様]
- **Q-plugins-02**: Claude が自分で呼べる skill・agent が本当に自動で呼ばれる必要のあるものに絞られている。利用者が明示的に呼ぶだけのものは、自動で呼ばれないよう制御されている。有効な間ずっと毎ターンのコンテキストを使うため。[仕様]
- **Q-plugins-03**: 毎回守らせる規則が skill の指示ではなく hook で強制されている。プラグインに入れたい指示は `CLAUDE.md` ではなく skill になっている。[仕様]
- **Q-plugins-04**: プラグインの hook の `matcher` が、目的のツールやイベントに絞られている。プラグインの hook は、そのプラグインを使わない場面でも発火するため。[仕様]
- **Q-plugins-05**: プラグインの agent が、無視されるキー（`permissionMode`・`hooks`・`mcpServers`・`initialPrompt`）に頼った設計になっていない。[仕様]
- **Q-plugins-06**: 永続化すべき状態・依存パッケージ・キャッシュが `${CLAUDE_PLUGIN_DATA}` に置かれている。`${CLAUDE_PLUGIN_ROOT}` には書かれていない。[仕様]
- **Q-plugins-07**: 秘密の値が `userConfig` の `sensitive: true` で受け取られ、manifest・`.mcp.json`・hook のコマンドに直接書かれていない。[仕様]
- **Q-plugins-08**: 版の方針（毎回上げる、または省いて commit で追跡する）が1つに決まっていて、利用者に更新が届く。[仕様]
- **Q-plugins-09**: プラグイン名が配布後も変えない前提で選ばれている。表示の都合は `displayName` で吸収されている。[仕様]
- **Q-plugins-10**: プロジェクトで配る場合に、利用者がプラグインを手元に揃える手順まで含めて設計されている。プロジェクトの `enabledPlugins` だけでは外部ソースのプラグインは取得されないため（例外は相対パスのソースか skills ディレクトリのプラグイン）。[仕様]
- **Q-plugins-11**: 依存するプラグインの API（MCP ツール名・skill 名）に頼る箇所に、検証済みの版の範囲が付いている。別のマーケットプレイスの依存なら、`allowCrossMarketplaceDependenciesOn` が設定されている。[仕様]
- **Q-plugins-12**: 言語サーバーを足す場合は、公式の code intelligence プラグインで足りないことを確かめてから `.lsp.json` が書かれている。バイナリを利用者が別に入れる必要があることが伝わる。[仕様]

## 8. 出典

spec:

- https://code.claude.com/docs/en/plugins/overview.md
- https://code.claude.com/docs/en/plugins/install.md
- https://code.claude.com/docs/en/plugins/code-intelligence.md
- https://code.claude.com/docs/en/plugins/create.md
- https://code.claude.com/docs/en/plugins/components.md
- https://code.claude.com/docs/en/plugins/dependencies.md
- https://code.claude.com/docs/en/plugins/publish.md
- https://code.claude.com/docs/en/plugins/create-marketplace.md
- https://code.claude.com/docs/en/plugins/host-marketplace.md
- https://code.claude.com/docs/en/plugins/relevance.md
- https://code.claude.com/docs/en/plugins/loading.md
- https://code.claude.com/docs/en/plugins/manifest-reference.md
- https://code.claude.com/docs/en/plugins/marketplace-reference.md
- https://code.claude.com/docs/en/plugins/cli-reference.md
- https://code.claude.com/docs/en/sub-agents.md

insight:

- （なし）
