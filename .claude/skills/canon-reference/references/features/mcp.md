---
feature: mcp
sources:
  - https://code.claude.com/docs/en/mcp.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/plugins/components.md
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/hooks.md
  - https://code.claude.com/docs/en/tools-reference.md
---

# MCP

## 1. 概要

MCP（Model Context Protocol）サーバーは、Claude Code に外部のツール・データベース・API を与える。[仕様] プロジェクトで共有するサーバーはプロジェクトのルートの `.mcp.json`（`paths:files/project:.mcp.json`）に置き、自分だけのサーバーは `~/.claude.json`（`paths:files/user:~/.claude.json`）に置く。[仕様] `.mcp.json` は `.claude/` の中ではなくプロジェクトのルートに置く。[仕様]

- **いつ読み込まれるか**: サーバーはセッションの開始時に接続する。[仕様] `.mcp.json` のサーバーは、対話セッションでは使う前に承認を求められる（`claude -p`・Agent SDK・クラウドのセッションでは求めずに読み込む）。[仕様]
- **コンテキストへの効き方**: tool search が既定で有効で、セッションの開始時に載るのはツール名とサーバーの instructions だけになり、ツールの定義は必要になったときに `tools:tools/ToolSearch` で読み込まれる。[仕様]
  > "Only tool names and server instructions load at session start, so adding more MCP servers has minimal impact on your context window."
- サーバーごとに `alwaysLoad: true`（`mcp:mcp-json-fields/alwaysLoad`）を設定すると、そのサーバーのツールは常にコンテキストに載り、その分のコンテキストを使う。[仕様]
- ツールの出力が大きいとき、Claude Code は警告を出し、上限を超えた結果をファイルに保存して会話には参照だけを残す。上限は環境変数 `MAX_MCP_OUTPUT_TOKENS`（`env-vars:vars/MAX_MCP_OUTPUT_TOKENS`）で変えられる。[仕様]

## 2. 使う場面・使わない場面

**使う場面**

- 課題管理・監視ダッシュボードなど別のツールから会話へデータを貼り付けている場面。接続すれば Claude がそのシステムを直接読み書きする。[仕様]
  > "Connect a server when you find yourself copying data into chat from another tool"
- チーム全員に同じ外部ツールを使わせたいとき（project スコープの `.mcp.json` をコミットする）。[仕様]
- 特定の subagent だけに外部ツールを持たせたいとき。subagent の frontmatter の `mcpServers`（`frontmatter:subagent/mcpServers`）にインラインで定義すると、そのツールは親の会話に載らない。[仕様]
- 外部のイベント（CI の結果・チャットなど）をセッションに送り込みたいとき（channel。運用の機能で、選定ガイドで扱う）。[仕様]

**使わない場面・近い機能との違い**

- 手順や知識を与えるだけなら skill を使う。MCP はツール（外部システムへのアクセス）を足す機能で、skill は既存の `Skill` ツールで動くプロンプトの部品である。[仕様]（`tools-reference` の冒頭の区別。tool search 下のサーバーの instructions は skill と同じように「いつ検索するか」を Claude に伝える役を持つ。[仕様]）
- ライフサイクルの決まった時点で決まった処理を必ず走らせたいなら hook を使う。hook のハンドラーから MCP のツールを呼ぶこともできる（`hook-events:handler-types/mcp_tool`）。[仕様]
- 信頼できないサーバーは接続しない。外部の内容を取ってくるサーバーはプロンプトインジェクションの危険を持ち込む。[仕様]
- 組織での一括配布や許可・禁止の方針（`managed-mcp.json`・`allowedMcpServers`・`deniedMcpServers`）は管理者の機能である。[仕様] canon はこれを生成の範囲外としている（canon の分類で、公式の仕様ではない）。

## 3. 仕様の要約

**transport**（正は `mcp:transports`）

- リモートには `http` が推奨。`sse` は非推奨。`ws` は `claude mcp add --transport` では指定できない。ローカルのプロセスは `stdio`。[仕様]
- `type` を省いたエントリは stdio として読まれる。`url` を持つのに `type` が無いエントリは設定エラーとして読み飛ばされる。[仕様]
  > "A JSON entry that has a `url` but no `type` is a configuration error, because Claude Code reads an entry with no `type` as a stdio server."
- `sdk` はファイルに書けない（`mcp:transports/sdk`）。[仕様]

**スコープ**（正は `mcp:scopes`）

- `local`（既定）・`project`・`user` の3つ。`local` と `user` は `~/.claude.json`、`project` は `.mcp.json` に保存される。[仕様]
- MCP の `local` スコープは settings の `.claude/settings.local.json` とは別物で、保存先はホームの `~/.claude.json`。[仕様]
- 同じサーバーが複数の場所で定義されていると、優先順位の最も高い定義を1つだけ使い、フィールドはスコープをまたいでマージしない。優先順位は local → project → user → plugin のサーバー → claude.ai のコネクター。スコープ同士は名前で、plugin とコネクターはエンドポイント（URL かコマンド）で重複を判定する。[仕様]
  > "The entire server entry from that source is used; fields are not merged across scopes."

**`.mcp.json` のフィールド**（正は `mcp:mcp-json-fields`。公式の全件の一覧は無い）

- 形は `{"mcpServers": {"<name>": {...}}}`。[仕様]
- 環境変数の展開 `${VAR}`・`${VAR:-default}` が効くのは `command`・`args`・`env`・`url`・`headers` だけ（各要素の `expands_env`）。[仕様] 既定値の無い未設定の変数は展開されずにそのまま残り、警告が出る。[仕様]
- リモートサーバーの `url`・`headers` では、Claude Code 自身やクラウドプロバイダーの資格情報の変数（`ANTHROPIC_API_KEY` など）は値が設定されていても空として読まれる。[仕様]
- `CLAUDE_PROJECT_DIR` は stdio サーバーの環境には設定されるが Claude Code 自身の環境には無いので、プロジェクトの `.mcp.json` の `command`・`args` で参照するときは `${CLAUDE_PROJECT_DIR:-.}` のように既定値が要る。plugin の MCP 設定は既定値なしで直接置換される。[仕様]
- 認証は、OAuth（`http`・`sse`。`/mcp` か `claude mcp login` でサインイン）、静的な `headers`、接続時にコマンドでヘッダーを作る `headersHelper` のどれか。[仕様] `headersHelper` は任意のシェルコマンドとして実行されるため、プロジェクトの `.mcp.json` と local スコープのサーバーでは、そのフォルダーを信頼するまで実行されない。[仕様]

**ツール名と参照の仕方**

- MCP のツールは `mcp__<server>__<tool>` という名前になる。permissions のルールは `mcp__<server>`・`mcp__<server>__*`・`mcp__<server>__<tool>` の形を取る。[仕様] hook の matcher でサーバーの全ツールに合わせるには `mcp__<server>__.*` と書く（`.*` が無いと完全一致として比べられる）。[仕様]
- plugin が同梱するサーバーのツールは `mcp__plugin_<plugin-name>_<server-name>__<tool-name>` になり、サーバー名は `plugin:<plugin-name>:<server-name>` で登録される。サーバーのキーだけで書いた matcher は plugin のサーバーには合わない。[仕様]
- MCP のプロンプトは `/mcp__<server>__<prompt>` のコマンドとして使える。リソースは `@server:protocol://resource/path` で参照する。[仕様]

**plugin・subagent での定義**

- plugin は、ルートの `.mcp.json` か `plugin.json` の `mcpServers`（`plugin-manifest:fields/mcpServers`）にサーバーを定義する。plugin の `.mcp.json` は包みの `mcpServers` を省いてもよい。[仕様]
- subagent の frontmatter の `mcpServers` は、設定済みのサーバー名の参照か、`.mcp.json` と同じスキーマのインライン定義を取る。plugin の subagent ではこのフィールドは無視される。[仕様]

**承認の設定**（settings の側。正は settings のデータ）

- `.mcp.json` のサーバーの承認は `settings:keys/enableAllProjectMcpServers`・`settings:keys/enabledMcpjsonServers`・`settings:keys/disabledMcpjsonServers` で決める。信頼していないフォルダーでは、リポジトリにコミットされた `.claude/settings.json` の承認は無視される。[仕様]
  > "A cloned repository can't approve its own servers"
- `disabledMcpjsonServers` はどの permission mode でもサーバーを拒否する。[仕様]

## 4. 設計の指針

- **スコープの選び方**: チームで共有し、リポジトリと一緒に配る必要があるサーバーだけを project スコープの `.mcp.json` に置く。個人の開発用、試験的なもの、バージョン管理に入れたくない資格情報を持つものは local、多くのプロジェクトで使う個人の道具は user に置く。[仕様]
- **コンテキストの節約**: tool search の既定（遅延読み込み）に任せ、`alwaysLoad: true` は毎ターン必要な少数のツールに限る。[仕様]
  > "Use this for a small number of tools that Claude needs on every turn, since each upfront tool consumes context"
- **subagent への閉じ込め**: 一部の作業でしか使わないサーバーは、`.mcp.json` ではなく、その作業を担う subagent の `mcpServers` にインラインで定義し、親の会話のコンテキストを使わないようにする。[仕様]
- **資格情報**: 秘密の値は `.mcp.json` に直接書かず、`${VAR}` で環境変数から読む。[仕様] Claude Code の資格情報を MCP サーバーに渡したいときは、別名の変数にコピーしてその名前を参照する（元の名前は空として読まれる）。[仕様]
- **最小の権限**: データベースのサーバーには読み取り専用のユーザーを使う（公式の例の推奨）。[仕様]
- **自作のサーバーを設計するとき**（Claude Code の設定ではなく、サーバー側の設計の知見）:
  - API のエンドポイントをそのまま包まず、作業の単位で少数の影響の大きいツールにまとめる。ツールが多すぎたり重なったりすると、エージェントが効率のよい進め方から逸れる。[知見]
    > "More tools don’t always lead to better outcomes."
  - ツールの説明とサーバーの instructions は既定で 2,048 文字で切り詰められるので、簡潔に書き、重要なことを先頭に置く。[仕様] instructions には、扱う作業の種類・いつ検索すべきか・主な機能を書く。[仕様]
  - 大きくなりうる応答には、ページング・範囲指定・絞り込み・切り詰めを既定値付きで用意する。[知見]
    > "pagination, range selection, filtering, and/or truncation with sensible default parameter values"
  - 低水準の識別子より意味のある情報を返し、エラーは次に取るべき行動が分かる文面にする。[知見]
    > "return only high signal information back to agents"
  - 1回の応答で大きな結果が必要なツールは、ツールの `_meta["anthropic/maxResultSizeChars"]` で保存の閾値を上げられる。毎回人の承認を要するツールは `_meta["anthropic/requiresUserInteraction"]: true` を付ける。[仕様]

## 5. 生成の規約

- project スコープのサーバーは、プロジェクトのルートの `.mcp.json` に `mcpServers` の包みを付けて書く。[仕様]
- リモートのサーバーには必ず `type` を書く。stdio のサーバーも、意図を明示するため `type: "stdio"` を書く（`type` を書くことは canon の規律で、公式は stdio の `type` の省略を認めている）。
- 秘密の値は `${VAR}` で参照し、リテラルで書かない。[仕様] 置ける位置は `expands_env` が `true` のフィールドだけ。[仕様]
- `.mcp.json` の `command`・`args` でプロジェクトのパスを使うときは `${CLAUDE_PROJECT_DIR:-.}` と既定値を付ける。[仕様]
- `timeout` はミリ秒で、1000 以上にする。[仕様]
- 生成した `.mcp.json` のサーバーを permissions・hook の matcher・skill の `allowed-tools`・subagent の `tools` で参照するときは、`mcp__<server>__<tool>`（plugin なら `mcp__plugin_<plugin>_<server>__<tool>`）の完全な名前を使う。[仕様]

最小の例（stdio のサーバー1つとリモートのサーバー1つ）:

```json
{
  "mcpServers": {
    "notion": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_TOKEN": "${NOTION_TOKEN}"
      }
    },
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

subagent に閉じ込める例（frontmatter）:

```yaml
---
name: browser-tester
description: Tests features in a real browser using Playwright
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
---
```

## 6. 検証ルール

- **V-mcp-01**: project スコープの MCP 設定ファイルは、プロジェクトのルートの `.mcp.json` にあり、`.claude/` の中に無い（`paths:files/project:.mcp.json`・`mcp:scopes/project`）。[仕様]
- **V-mcp-02**: プロジェクトの `.mcp.json` の最上位は `mcpServers` のキーを持つオブジェクトで、その値はオブジェクトである（`mcp:mcp-json-fields/mcpServers`）。plugin の `.mcp.json` は包みが無くてもよい。[仕様]
- **V-mcp-03**: サーバーのエントリの `type` は、`mcp:transports` の `configurable_in_mcp_json` が `true` の要素のいずれかの `type_values` に含まれる（`mcp:mcp-json-fields/type`）。[仕様]
- **V-mcp-04**: `url` を持つエントリは `type` を持つ（`mcp:mcp-json-fields/type` の `required_when`）。[仕様]
- **V-mcp-05**: サーバー名が `mcp:mcp-json-fields/mcpServers` の `reserved_server_names.names` のいずれとも一致しない。[仕様]
- **V-mcp-06**: `${...}` の参照は、`mcp:mcp-json-fields` の `expands_env` が `true` のフィールドの値の中にだけ現れる。[仕様]
- **V-mcp-07**: プロジェクトの `.mcp.json` の `command`・`args` にある `${CLAUDE_PROJECT_DIR}` の参照は、`${CLAUDE_PROJECT_DIR:-<default>}` の形で既定値を持つ（`mcp:mcp-json-fields/command`・`mcp:mcp-json-fields/args`）。[仕様]
- **V-mcp-08**: `timeout` は 1000 以上の数値である（`mcp:mcp-json-fields/timeout` の `min_effective`）。[仕様]
- **V-mcp-09**: `oauth` は `type` が `mcp:mcp-json-fields/oauth` の `applies_to` に含まれるエントリにだけ現れる。[仕様]
- **V-mcp-10**: `oauth.scopes` は文字列で、`oauth.authServerMetadataUrl` は `https://` で始まる（`mcp:mcp-json-fields/oauth.scopes`・`mcp:mcp-json-fields/oauth.authServerMetadataUrl`）。[仕様]

## 7. 品質基準

- **Q-mcp-01**: 各サーバーのスコープが用途に合っている。チームで共有するものだけが `.mcp.json` にあり、個人用・資格情報を伴う試験的なものが `.mcp.json` に入っていない。[仕様]
- **Q-mcp-02**: 秘密の値がリテラルで書かれておらず、`${VAR}` で参照されている。参照する変数が、リモートサーバーで空として読まれる資格情報の変数（`ANTHROPIC_API_KEY` など）ではない。[仕様]
- **Q-mcp-03**: `alwaysLoad: true` が、毎ターン必要な少数のツールを持つサーバーに限られている。[仕様]
- **Q-mcp-04**: 一部の作業でしか使わないサーバーが、親の会話の `.mcp.json` ではなく、その作業の subagent の `mcpServers` に閉じ込められている。[仕様]
- **Q-mcp-05**: 接続するサーバーが信頼できる提供元のものである。外部の内容を取り込むサーバーはプロンプトインジェクションの危険を持ち込むことが、選定の理由に織り込まれている。[仕様]
- **Q-mcp-06**: データベースなど変更を伴いうるサーバーが、読み取り専用など最小の権限の資格情報で接続している。[仕様]
- **Q-mcp-07**: permissions のルール・hook の matcher・`allowed-tools`・`tools` に書いた MCP のツール名が、`mcp__<server>__<tool>`（plugin なら `mcp__plugin_<plugin>_<server>__<tool>`）の完全な形で、実在のサーバー名と一致している。hook の matcher でサーバーの全ツールに合わせる箇所に `.*` が付いている。[仕様]
- **Q-mcp-08**: 自作のサーバーのツールが、API をそのまま包んだ多数の細かいツールではなく、作業の単位でまとまった少数のツールになっている。名前に、サービスやリソースで区切る接頭辞がある。[知見]
- **Q-mcp-09**: 自作のサーバーのツールの説明と instructions が簡潔で、重要なことが先頭の 2,048 文字に入っている。パラメーター名が曖昧でない（`user` ではなく `user_id` など）。[仕様]・[知見]
- **Q-mcp-10**: 自作のサーバーのツールが、大きくなりうる応答にページングや切り詰めを持ち、エラーで次の行動が分かる文面を返す。[知見]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/mcp.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/plugins/components.md
- https://code.claude.com/docs/en/permissions.md
- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/tools-reference.md

**insight**

- https://www.anthropic.com/engineering/writing-tools-for-agents
