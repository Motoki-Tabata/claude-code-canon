# L3: Subagents

正典: `docs/L3_AGENTS.md`・ツール名は `docs/TOOLS.md`。

## 配置

`.claude/agents/<name>/<name>.md` または `.claude/agents/<name>.md`。ファイル名とディレクトリ名は識別に無関係で、識別は `name` だけで行われる。`name` は tree 全体で一意にする。

## frontmatter

| キー | 使い方 |
|---|---|
| `name`（必須） | 小文字とハイフンだけ。`:` は使えない（プラグインの名前空間に予約されており、含むとファイルが読み込まれない） |
| `description`（必須） | 「何をするか」と「いつ委譲するか（Delegate when …）」を1〜2文で。委譲の的中率は description の精度で決まる。曖昧な語を避け、他の役割と区別できる具体的な条件を書く |
| `tools` | **最小権限**。本文の実際の操作から逆算して、読む道具（Read・Grep・Glob）と書く道具（Write・Edit）を過不足なく宣言する。省略すると全ツールを継承する。ツール名は `docs/TOOLS.md` の正規名だけ。deny のキーは `disallowedTools`（camelCase） |
| `model`・`effort` | design-map の Model Assignments に従う。Subagent は親のティアを超えない。設計判断を担う役割は `effort: high` |
| `skills` | preload する Skill。**`disable-model-invocation: true` の Skill は preload できない**（エラーになる）。preload されるのは Skill の本文の全文なので、常時は要らない Skill を入れない |
| `isolation: worktree` | ファイルの衝突を避けたい builder 型の役割にだけ、必要なら付ける |
| `mcpServers` | 外部連携が要るときだけ |

- Subagent に存在しないキー（`user-invocable`・`disable-model-invocation`・`handoffs`・`agents`）を付けない。未知のキーとして検査が止める。`context: fork` も Subagent のキーではない（Skill 側のキー）。
- `tools` に `Skill` を書いても preload にならない。preload は `skills:` で行う。

## 本文に書くこと

- 書込先（どのパスにだけ書くか）と、入力として何を受け取るかを明示する。
- 多段の委譲が不要な Subagent には、spawn の指示を書かない（nesting は既定3階層。`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で変えられる）。spawn を抑止するなら `tools` から `Agent` を外す。
- 役割に書込範囲を割り当てる設計（design-map の Write Scopes に、その役割の記載があるとき）は、本文に「書込範囲」の節を置き、Write Scopes の内容を**要約せず逐語で**写す。常設の範囲と、構成ファイルの宣言駆動の例外を分けて書く。例外に当たる範囲外のパスへの書込みが要るときの3分岐を、手順に明記する: 常設の範囲に当たる→続行する／例外の条件（対象の表に挙がっていて、かつ要件の文書に明記されている）を満たす→続行し、変更内容を報告に書く／どちらでもない→実装せず、停止して報告する。Hook は呼び出した Subagent を識別できないので、この自己チェックが唯一の担保になる。

## 生成物の Subagent が持ってよいツール

対象プロジェクト向けに生成する Subagent は、要件が求めるなら `Bash`・`PowerShell`・`Monitor` を持ってよい（テストの実行やビルドなど、対象側でシェルを使うのは正当）。ただし、要件が無ければ付けない（最小権限の原則は変わらない）。この許可は、対象向けの生成物にだけ当てはまる。

## プラグインに同梱する Subagent

`hooks`・`mcpServers`・`permissionMode` は、プラグインから読み込まれるときは無視される。これらが要る Subagent は、プラグインでなく `.claude/agents/` に置く。`isolation` は `worktree` だけが使える。

## 生成しないもの

Dynamic Workflows（Claude が実行時に書くスクリプトで、静的なスキーマが公式に無い）。

## 読み込み元

design-map の `## L3` の節と、L3 の modify・merge の既存判定レコードが、スライス `agents.md` に入っている。
