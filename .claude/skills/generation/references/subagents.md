# subagents: `.claude/agents/**`

正典: `canon-reference/references/features/subagents.md` の §4「設計の指針」と §5「生成の規約」（型、frontmatter のキー、`name` の制約）。ツール名は `canon-reference/data/tools.json`（`tools:tools`）の正規名だけ。書く前に読む。

## canon の契約

- 配置は `.claude/agents/<name>/<name>.md` または `.claude/agents/<name>.md`。識別は `name` だけで行われ、tree 全体で一意にする。
- `tools` は**最小権限**。本文の実際の操作から逆算して、読む道具と書く道具を過不足なく宣言する。省略すると全ツールを継承する。
- `model`・`effort` は design-map の Model Assignments に従う。
- `skills:` で preload する Skill に、`disable-model-invocation: true` のものを入れない。preload されるのは本文の全文なので、常時は要らない Skill も入れない。
- 本文に、書込先（どのパスにだけ書くか）と、入力として何を受け取るかを書く。多段の委譲が不要なら spawn の指示を書かず、`tools` から `Agent` を外す。
- 対象向けに生成する Subagent が `Bash`・`PowerShell`・`Monitor` を持つのは、要件が求めるときだけ（テストの実行やビルドなど）。
- 役割に書込範囲を割り当てる設計（design-map の Write Scopes に、その役割の記載があるとき）は、本文に「書込範囲」の節を置き、Write Scopes の内容を**要約せず逐語で**写す。常設の範囲と、構成ファイルの宣言駆動の例外を分けて書き、例外に当たる範囲外のパスへの書込みが要るときの3分岐を手順に明記する。
  - 常設の範囲に当たる → 続行する。
  - 例外の条件（対象の表に挙がっていて、かつ要件の文書に明記されている）を満たす → 続行し、変更内容を報告に書く。
  - どちらでもない → 実装せず、停止して報告する。

  Hook は呼び出した Subagent を識別できないので、この自己チェックが唯一の担保になる。
- プラグインに同梱する Subagent では `hooks`・`mcpServers`・`permissionMode` が無視される。これらが要る Subagent は、プラグインでなく `.claude/agents/` に置く。
- Dynamic Workflows（Claude が実行時に書くスクリプト）は生成しない。

## 読み込み元

design-map の `## subagents` の節と、その modify・merge の既存判定レコードが、スライス `subagents.md` に入っている。
