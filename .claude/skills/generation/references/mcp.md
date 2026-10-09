# mcp: `.mcp.json`

正典: `canon-reference/references/features/mcp.md` の §5「生成の規約」（`mcpServers` の包み、`type`、`${VAR}` を置ける位置）。書く前に読む。

## canon の契約

- **資格情報は必ず `${VAR}` の展開で書く**。キーや token を直書きしない（verify の V4 が止める）。未設定で既定値も無い `${VAR}` は、未展開の文字列のまま使われて接続に失敗する。
- `mcp` が constraints で `allowed: false` なら、生成物のどこにも現れてはならない（V9）。
- OAuth や環境変数のセットアップが要るときは、配置後の手作業として、design-map の「配置時の追加手順」に載っていることを確かめる。
- Agent Teams・Channels・Monitors・Themes に依存するときは、実験機能であることを明示する（V4）。constraints の `experimental` が `allowed: false` なら作らない。

## 読み込み元

design-map の `## mcp` の節が、スライス `mcp.md` に入っている。
