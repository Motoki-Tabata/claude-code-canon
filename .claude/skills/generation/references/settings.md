# settings: settings・Hook・permissions・status line

正典（書く前に、design-map の節がある機能のものを読む）:

| 機能 | 読む |
|---|---|
| settings | `canon-reference/references/features/settings.md` §5 |
| hooks | `canon-reference/references/features/hooks.md` §5 |
| permissions | `canon-reference/references/features/permissions.md` §5 |
| statusline | `canon-reference/references/features/statusline.md` §5 |

Hook のイベント名は `canon-reference/data/hook-events.json`（`hook-events:events`）に実在するものだけ。

## canon の契約

- **配線とハンドラの実体は両方作る**。`.claude/settings.json` の `hooks` だけ、または `.claude/hooks/**` だけを作ると、参照先の無い壊れた構成が配置される。
- `hooks`・`permissions` などが constraints で `allowed: false` なら、生成物のどこにも現れてはならない（verify の V9）。
- スクリプトには実行権限が要る。配置後の手作業として、design-map の「配置時の追加手順」に載っていることを確かめる。
- パスは `${CLAUDE_PROJECT_DIR}` で書く。絶対パスを書かない。
- 要件が求めない permission 規則を足さない。
- status line のスクリプトの置き場は、design-map の宣言に従う。モックの入力で単体で動かせる形にする。実行して確かめるのはオーケストレーターで、builder は動かせない。
- 実験機能（Experimental）に依存するときは、それが実験機能であることを本文か設定のコメントで明示する（V4）。constraints の `experimental` が `allowed: false` なら、そもそも作らない。

## 読み込み元

design-map の `## settings`・`## hooks`・`## permissions`・`## statusline` の節が、スライス `settings.md` に連結して入っている。
