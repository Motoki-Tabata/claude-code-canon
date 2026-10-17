# settings: settings・Hook・permissions・status line

正典（書く前に、change-plan の `## ファイル` にある機能のものを読む）:

| 機能 | 読む |
|---|---|
| settings | `canon-reference/references/features/settings.md` §5 |
| hooks | `canon-reference/references/features/hooks.md` §5 |
| permissions | `canon-reference/references/features/permissions.md` §5 |
| statusline | `canon-reference/references/features/statusline.md` §5 |

Hook のイベント名は `canon-reference/data/hook-events.json`（`hook-events:events`）に実在するものだけ。

## canon の契約

- **配線とハンドラの実体は両方作る**。`.claude/settings.json` の `hooks` だけ、または `.claude/hooks/**` だけを作ると、参照先の無い壊れた構成が配置される。
- `hooks`・`permissions` などが constraints で `allowed: false` なら、差分のどこにも現れてはならない（verify の V8）。
- スクリプトには実行権限が要る。書いたスクリプトのパスを応答に書く（権限はメインが付ける）。change-plan の `## 機能と責務` の「配置後の手作業」に載っていることも確かめる。
- hooks か `permissions` を書くときは、対象のワークスペースの trust を承認しないと効かない（verify の V9 が警告を出し、差分のゲートの提示に載る）。
- パスは `${CLAUDE_PROJECT_DIR}` で書く。絶対パスを書かない。
- 要件が求めない permission 規則を足さない。
- status line は、`statusLine.command` にコマンドをインラインで書く。スクリプトのファイルが要る設計は、そのファイルが change-plan の `## ファイル` に載っているときだけ書く（載っていないのにスクリプトを前提にした `command` を求められたら、書かずに報告する）。`.claude/hooks/` には置かない（verify の V8 が Hook の実体として数え、hooks を禁止した run で止まる）。どちらの形でも、モックの入力で単体で動かせる形にする。実行して確かめるのはメインで、builder は動かせない。
- 実験機能（Experimental）に依存するときは、それが実験機能であることを本文か設定のコメントで明示する。verify が機械で止めるのは Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）の明示漏れだけ（V4）で、それ以外の明示は reviewer が見る。constraints の `experimental` が `allowed: false` なら、そもそも作らない。
- auto-compact の窓:
  - 1M の窓のモデルを使う対象に設定を生成するときは、`autoCompactWindow`（モデルごとなら `modelSettings` の `autoCompactWindow`）で窓を絞ることを検討し、値は change-plan が決める。
  - 書式・範囲・既定・優先順位は正典 `canon-reference/references/features/settings.md` の §4 と `data/settings.json` の該当キーを読む。
- effort: モデルごとの effort は `modelSettings` で書く。トップレベルの `effortLevel` が効く範囲は、正典 settings §4 を読む。
- `advisorModel`: 既定では生成せず、change-plan が明示したときだけ書く。使える条件は正典 settings §4 を読む。
- モデル割当の推奨は `subagents.md`（この Skill の references）の該当項を見る。
