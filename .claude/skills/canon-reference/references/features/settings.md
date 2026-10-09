---
feature: settings
sources: [https://code.claude.com/docs/en/settings.md, https://code.claude.com/docs/en/settings-reference.md, https://code.claude.com/docs/en/settings-example.md, https://code.claude.com/docs/en/claude-directory.md, https://code.claude.com/docs/en/model-config.md, https://code.claude.com/docs/en/cli-reference.md, https://code.claude.com/docs/en/env-vars.md]
---

# settings

## 1. 概要

settings は、Claude Code の振る舞いを変える JSON のキーである。起動するモデル、確認なしで実行できるもの、読めないファイル、組織が強制するものなどを決める。[仕様]

> "Settings are the JSON keys that change how Claude Code behaves"

- **読み込まれる場所**: Claude Code は4つのファイル（`~/.claude/settings.json`・`.claude/settings.json`・`.claude/settings.local.json`・managed settings）から settings を読む。どのファイルから読んだかで、その設定が誰に効くかが決まる。[仕様]
- **読み込まれる時点**: Claude Code は settings ファイルを監視し、変更されると読み直す。`permissions`・`hooks`・`apiKeyHelper` などへの編集は再起動なしで動いているセッションに効く。ただし `model`・`effortLevel`・`modelSettings` はセッション開始時に一度だけ読まれる。[仕様]
- **コンテキストへの効き方**: settings はプロンプトとしてはコンテキストに入らない。ツールの許可・hooks・モデルなど、実行環境の挙動を決める。ただし一部のキーはコンテキストの中身を変える。`includeGitInstructions` は組み込みの git の指示と git status のスナップショットを含めるかを決める。`claudeMdExcludes` は読み込む CLAUDE.md を減らす。`skillListingBudgetFraction`・`skillListingMaxDescChars` は skill の一覧の大きさを決める。[仕様]
- **`~/.claude.json`**: settings ファイルとは別に、Claude Code が自分で書く5つ目のファイルである。サインインのセッション、MCP サーバーの設定、フォルダの信頼の判断などのプロジェクトごとの状態、`/config` が書く Global config のキーを持つ。利用者が編集する必要はない。[仕様]

  > "Claude Code also keeps a fifth file, `~/.claude.json`, that it writes for itself; you don't need to edit it."

## 2. 使う場面・使わない場面

**使う場面**[仕様]

| したいこと | 置くキー |
|---|---|
| ツールの呼び出しを許可・確認・拒否する | `settings:keys/permissions.allow`・`settings:keys/permissions.ask`・`settings:keys/permissions.deny` |
| ツールの呼び出しの前後でスクリプトを実行する | `settings:keys/hooks` |
| セッションの環境変数を設定する | `settings:keys/env` |
| プロジェクトの `.mcp.json` のサーバーを承認・拒否する | `settings:keys/enabledMcpjsonServers`・`settings:keys/disabledMcpjsonServers`・`settings:keys/enableAllProjectMcpServers` |
| チームにプラグインとマーケットプレイスを配る | `settings:keys/enabledPlugins`・`settings:keys/extraKnownMarketplaces` |
| status line・output style・既定のモデルを決める | `settings:keys/statusLine`・`settings:keys/outputStyle`・`settings:keys/model` |
| 個人の上書きを git に入れずに持つ | `.claude/settings.local.json` |

**使わない場面と近い機能との違い**[仕様]

- **Claude への指示**は settings では書けない。Claude Code のシステムプロンプトは公開されておらず、常に効く指示は CLAUDE.md（または `--append-system-prompt`）で与える。CLAUDE.md は Claude が読む指示であり、settings はクライアントが強制する設定である。
- **チームで共有する MCP サーバーの定義**は settings ではなく、プロジェクトのルートの `.mcp.json` に置く。settings に置くのは、その承認と許可・拒否のリストである。個人の MCP サーバーは `~/.claude.json` に入る。
- **Global config のキー**（`settings:global-config-keys`）は `~/.claude.json` にだけ置く。settings ファイルに書いても無視される。
- **1セッションだけ試す**なら、ファイルを書かずに `--settings`、キーごとのフラグ（`--model` など）、対になる環境変数を使う。

## 3. 仕様の要約

### 3.1 ファイルとスコープ

[仕様] スコープは、そのファイルに置いた設定が効く人とプロジェクトの範囲である。

| スコープ | ファイル | 効く相手 | 置くもの |
|---|---|---|---|
| User | `~/.claude/settings.json`（`paths:files/user:~/.claude/settings.json`） | 自分。このマシンの全プロジェクト | 個人の好み（テーマ・エディタのモード・既定のモデル・自分の permission rule） |
| Shared project | `.claude/settings.json`（`paths:files/project:.claude/settings.json`） | そのフォルダで作業する全員。git ではコミットして共有する | チームの permissions・hooks・プラグイン・プロジェクトに要る環境変数 |
| Project local | `.claude/settings.local.json`（`paths:files/local:.claude/settings.local.json`） | 自分。このプロジェクトだけ | 1プロジェクトでの個人の上書き、共有前の試験 |
| Managed | `managed-settings.json`・MDM・claude.ai の管理コンソールなど | 組織が配る全員 | セキュリティのポリシーとコンプライアンスの要件 |

- 各キーをどのファイルに置けるかは、`settings:keys` の各要素の `scopes` を見る。公式の Settings index の Scope 列では、`Any file` は4つすべて、`User or managed`・`User, local, or managed`・`Managed` は書かれたファイルだけを指す。それ以外のファイルに書いても効かない。[仕様]
- `.claude/settings.local.json` は、Claude Code が初めて書くときに `**/.claude/settings.local.json` をグローバルの git の除外ファイルに足す。手で作ったときは自分で `.gitignore` に足す必要がある。[仕様]
- git リポジトリのサブディレクトリで起動すると、Claude Code は `.claude/settings.local.json` をリポジトリのルートで読み書きする。共有の `.claude/settings.json` はセッションの作業ディレクトリから読む。[仕様]
- インストールしただけでは settings ファイルは作られない。[仕様]

### 3.2 優先順位

[仕様] 同じキーが複数の場所にあると、設定している中で最も高いレベルの値を使う。高い順に次のとおり。

1. **Managed settings**: 自分の settings ファイルも `--settings` も上書きできない。
2. **コマンドライン**: `--settings <file-or-json>` で渡した JSON（そのセッションだけ）。
3. **Project local**: `.claude/settings.local.json`
4. **Shared project**: `.claude/settings.json`
5. **User**: `~/.claude/settings.json`

- **環境変数はこの段の一部ではない**。シェルの変数と settings のキーのどちらが効くかは、対ごとに決まる（例: `env-vars:vars/ANTHROPIC_MODEL` は `settings:keys/model` に優先する）。settings ファイルの中の `env` ブロックは普通のキーなので、上の段に従う。[仕様]
- **キーごとのフラグ**（`--model`・`--permission-mode`・`--agent` など）は1つのものを1セッションだけ決め、この段には入らない。各キーの `session_override_ja` がどれが優先するかを示す。[仕様]
- **リストは上書きせず結合する**。`permissions.allow` のように同じリストのキーを複数のファイルに置くと、リストを結合する。例外は各キーの `precedence_ja` に書いた（`settings:keys/fallbackModel`・`settings:keys/availableModels` など）。`settings:keys/hooks` もファイル間で結合する。[仕様]
- **managed の優先の例外**: 制限する向きの値だけは、managed を上書きできない下位のスコープからでも尊重されるキーがある（例: `settings:keys/permissions.blockReadsOutsideWorkingDirectories` の `true`）。一覧は公式の "Exceptions to managed settings precedence" の表が正である。[仕様]

### 3.3 リポジトリのファイルで効かないキー・信頼を待つキー

[仕様] `.claude/settings.json` にコミットしたキーが全員に効かない理由は2つある。

- **リポジトリのファイルでは無視されるキー**: Scope が `User, local, or managed`・`User or managed`・`Managed` のキーと、Global config のキー（`settings:global-config-keys`。どの settings ファイルでも無視される）。`permissions.defaultMode` の `auto` と `bypassPermissions` も、project と local の settings からは効かない。`env` の中では、一部の変数（`env-vars:vars/CLAUDE_CONFIG_DIR` やテレメトリの出力先など）が project と local から無視される。
- **信頼を待つキー**: `permissions.allow`・`permissions.additionalDirectories`・`extraKnownMarketplaces`・`env` の大半の値は、各自がフォルダを信頼した後にだけ効く。`deny` と `ask` はすぐに効く。

### 3.4 書式と検証

- settings ファイルは strict JSON である。`//` のコメントや末尾のカンマは構文エラーになり、次の起動で Settings Error として報告される。[仕様]
- `"$schema": "https://json.schemastore.org/claude-code-settings.json"` を書くと、対応するエディタで補完と検証が効く。スキーマは CLI の最新版より遅れることがある。[仕様]
- 個々の値だけが不正なとき（不正な permission rule、未知の hook のイベント名など）は Settings Warning になり、その値だけを飛ばしてファイルの残りは効く。[仕様]
- 読み込まれたファイルは `/status` の `Setting sources` で確かめる。拒否された値は `claude doctor` で確かめる。[仕様]
- settings ファイルの変更を検知するたびに、Claude Code は `hook-events:events/ConfigChange` の hook を実行する。[仕様]

### 3.5 キー・モデル・環境変数の一覧

- 生成で使うキー: `settings:keys`（全件ではない。公式の全キーは settings-reference にある）
- モデルのエイリアス: `models:aliases`
- 生成物が参照しうる環境変数: `env-vars:vars`（全件ではない）
- sandbox のキー: `permissions:sandbox-keys`

## 4. 設計の指針

- **置き場所はスコープで決める**。チームで揃えるもの（permissions・hooks・プラグイン・プロジェクトの環境変数）は `.claude/settings.json`、個人の好み（テーマ・既定のモデル・自分の permission rule）は `~/.claude/settings.json`、1プロジェクトでの個人の上書きは `.claude/settings.local.json` に置く。[仕様]
- **組織が強制するものは managed に置く**。project の値は local と managed に上書きされ、user の値はすべてに上書きされる。上書きされては困る制限は managed のキー（`settings:keys/allowManagedHooksOnly`・`settings:keys/allowManagedPermissionRulesOnly`・`settings:keys/allowManagedMcpServersOnly`・`settings:keys/strictKnownMarketplaces`・`settings:keys/strictPluginOnlyCustomization`）で行う。[仕様]
- **リストの結合を前提に設計する**。下位のファイルは上位のファイルの `allow` を取り除けない。local の `allow` は project や managed の `ask` に勝たない。「local で緩める」設計は成り立たない。[仕様]
- **信頼前に効かないことを前提にする**。`.claude/settings.json` の `allow` や `env` に頼る自動化は、信頼の前や信頼しない人の環境では動かない。安全のための `deny` と `ask` は信頼を待たずに効く。[仕様]
- **生成物が効くかどうかは managed にも左右される**。`strictPluginOnlyCustomization` は user と project の skills・agents・hooks・MCP を止める。`allowManagedHooksOnly` は managed 以外の hooks と status line を止める。組織のポリシーが分かっているときは、生成する機能をそれに合わせて選ぶ。[仕様]
- **`~/.claude.json` は生成の対象にしない**。Claude Code が自分で書くファイルで、編集は要らないと公式が述べている。個人の MCP サーバーは `claude mcp add` が書く。[仕様]
- **秘密を `env` に平文で書かない**。`env` の値は settings ファイルに平文で残り、すべてのサブプロセスに渡る。API の認証情報には `apiKeyHelper` を使う。[仕様]
- **クラウドセッションでは一部しか読まれない**。リポジトリが1つのセッションでは `.claude/settings.json` が読まれる。user と local のファイルは読まれない。[仕様]

## 5. 生成の規約

- 生成する settings ファイルは strict JSON にし、コメントと末尾のカンマを入れない。[仕様]
- 各キーは、`settings:keys` の要素の `scopes` に含まれるファイルにだけ置く。[仕様]
- `.claude/settings.local.json` を生成するときは、`.gitignore` への追加も合わせて出す。これは canon が決めた規律である。根拠は公式の次の記述で、手で作ったファイルは Claude Code が git の除外ファイルに足さず、自分で `.gitignore` に足す必要がある。[仕様]
- 生成物の先頭に `$schema` を置く。これは canon が決めた規律で、公式の必須ではない（公式は、補完と検証が効くとだけ述べる）。

チームで共有する `.claude/settings.json` の最小の例（公式の例を縮めたもの）:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)", "Read(./.env.*)", "Read(./secrets/**)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh" }
        ]
      }
    ]
  }
}
```

個人の上書きを持つ `.claude/settings.local.json` の例（team の `model` を自分だけ変える）:

```json
{
  "model": "opus"
}
```

## 6. 検証ルール

- **V-settings-01**: 生成した settings ファイル（`~/.claude/settings.json`・`.claude/settings.json`・`.claude/settings.local.json`）は、コメントと末尾のカンマを含まない JSON としてパースできる。[仕様]
- **V-settings-02**: 生成した settings ファイルにある `settings:keys` のキーは、そのファイルのスコープ（user・project・local）が要素の `scopes` に含まれる。[仕様]
- **V-settings-03**: `.claude/settings.json` と `.claude/settings.local.json` の `settings:keys/permissions.defaultMode` は `auto` でも `bypassPermissions` でもない。[仕様]
- **V-settings-04**: `.claude/settings.json` と `.claude/settings.local.json` の `settings:keys/env` に、`env-vars:vars` で `ignored_in_project_env.value` が `true` の変数が無い。[仕様]
- **V-settings-05**: `settings:keys/permissions.disableBypassPermissionsMode` と `settings:keys/disableAutoMode` の値は文字列 `"disable"` である。[仕様]
- **V-settings-06**: `settings:keys/statusLine` と `settings:keys/subagentStatusLine` の `type` は `"command"` で、`command` は文字列である。[仕様]
- **V-settings-07**: `settings:keys/enabledPlugins` のキーは `<plugin-name>@<marketplace-name>` の形で、値は真偽値である。[仕様]
- **V-settings-08**: `settings:keys/skillOverrides` の値は `"on"`・`"name-only"`・`"user-invocable-only"`・`"off"` のいずれかである。[仕様]
- **V-settings-09**: `settings:keys/model` の値が `claude-` で始まらないとき、末尾の `[1m]` を除いた値が `models:aliases` のいずれかの `id` と一致する。Anthropic API 以外のプロバイダー固有の ID（推論プロファイルの ARN など）を使う構成には適用しない。[仕様]

## 7. 品質基準

- **Q-settings-01**: 各設定が、効かせたい相手に合ったスコープに置かれているか。チームで揃えるものが user に、個人の好みが共有の project に入っていないか。[仕様]
- **Q-settings-02**: 信頼を待つキー（`allow`・`additionalDirectories`・`extraKnownMarketplaces`・`env` の大半）が信頼前に効かないことを前提にした設計か。安全のための制限を `allow` の不在に頼らず `deny`・`ask` で書いているか。[仕様]
- **Q-settings-03**: リストの結合と優先順位を誤解していないか。下位のファイルで上位の `allow` を消す・緩める前提になっていないか。[仕様]
- **Q-settings-04**: 秘密が `env` やコミットされるファイルに平文で入っていないか。認証情報に `apiKeyHelper` などのヘルパーを使っているか。[仕様]
- **Q-settings-05**: 組織の managed settings（`strictPluginOnlyCustomization`・`allowManagedHooksOnly` など）が分かっているとき、生成する機能がそれに止められないか。[仕様]
- **Q-settings-06**: 環境変数・CLI のフラグ・settings のキーのどれで設定するかが、効かせたい期間（1セッションか恒常か）と相手に合っているか。対になる変数がキーに優先する場合を見落としていないか。[仕様]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/settings.md
- https://code.claude.com/docs/en/settings-reference.md
- https://code.claude.com/docs/en/settings-example.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/model-config.md
- https://code.claude.com/docs/en/cli-reference.md
- https://code.claude.com/docs/en/env-vars.md

**insight**

- なし
