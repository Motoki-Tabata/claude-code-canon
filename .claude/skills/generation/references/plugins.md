# plugins: `plugin/**`

正典: `canon-reference/references/features/plugins.md` §5「生成の規約」（ディレクトリ構造、manifest のフィールド）と、Mods を作るときは `canon-reference/references/features/plugin-mods.md` §5。書く前に読む。manifest のフィールドは `canon-reference/data/plugin-manifest.json`。

## canon の契約

- `plugins` が constraints で `allowed: true` で、配布の要件があるときだけ作る。
- manifest のコンポーネントのパスは、plugin のルートからの相対パスで**実在しなければならない**（verify の V6）。plugin のルートの外（`../`）を指す参照は動かない。
- 同梱する Subagent では `hooks`・`mcpServers`・`permissionMode` が無視される。要る Subagent は `.claude/agents/` に置く（[subagents.md](subagents.md)）。
- 実験機能（`themes/`・`monitors/` など）は、constraints が許すときだけ作り、実験機能であることを明示する（V4）。
- `.claude/README.md` は plugin の配布物に分類されるが、書かない。`emit-manifest` が作る（[SKILL.md](../SKILL.md)）。

## 読み込み元

design-map の `## plugins`・`## plugin-mods` の節が、スライス `plugins.md` に連結して入っている。
