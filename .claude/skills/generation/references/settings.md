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
- status line は、`statusLine.command` にコマンドをインラインで書く。スクリプトのファイルが要る設計は、管理パス集合にその置き場が無いので、design-map の `## 管理パス外の変更` の項目で運ぶ（そのファイルは `claude-md` の担当が `outside-managed/` に書く。settings の担当は書かない。項目が無いのにスクリプトを前提にした `command` を求められたら、書かずに報告する）。`.claude/hooks/` には置かない（verify の V9 が Hook の実体として数え、hooks を禁止した run で止まる）。どちらの形でも、モックの入力で単体で動かせる形にする。実行して確かめるのはオーケストレーターで、builder は動かせない。
- 実験機能（Experimental）に依存するときは、それが実験機能であることを本文か設定のコメントで明示する。verify が機械で止めるのは Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）の明示漏れだけ（V4）で、それ以外の明示は reviewer が見る。constraints の `experimental` が `allowed: false` なら、そもそも作らない。
- auto-compact の窓:
  - 1M の窓のモデルを使う対象に設定を生成するときは、`autoCompactWindow`（モデルごとなら `modelSettings` の `autoCompactWindow`）で窓を絞ることを検討し、値は design-map が決める。
  - 書式・範囲・既定・優先順位は正典 `canon-reference/references/features/settings.md` の §4 と `data/settings.json` の該当キーを読む。
- effort: モデルごとの effort は `modelSettings` で書く。トップレベルの `effortLevel` が効く範囲は、正典 settings §4 を読む。
- `advisorModel`: 既定では生成せず、design-map が明示したときだけ書く。使える条件は正典 settings §4 を読む。
- モデル割当の推奨は `subagents.md`（この Skill の references）の該当項を見る。

## 読み込み元

design-map の `## settings`・`## hooks`・`## permissions`・`## statusline` の節が、スライス `settings.md` に連結して入っている。
