# L2: Skills

正典: `docs/L2_SKILLS.md`。書き方の指針は [skill-writing.md](skill-writing.md)（正典と衝突したら正典に従う）。

## 配置

- 新規は必ず `.claude/skills/<name>/SKILL.md`（`.claude/commands/*.md` は廃止の方向）。
- **ディレクトリ名と `name:` を一致させる**（一致しないと発動しない失敗になる。verify の V1 が検査する）。
- supporting files（`references/`・`scripts/`・`examples/`・`template.md`）は、パッケージの直下に置いてよい。必要なときに Claude が読む（段階的開示）。**`SKILL.md` は必須**。supporting files だけのディレクトリは Skill として発動しない。
- SKILL.md の本文から supporting files を参照するときは、Markdown のリンク（表示名と、`./` から始まる相対パス）にし、**いつ読むか**を添える（「手動で読んで」とだけ書くと Claude は忘れる）。参照先は実在しなければならない（V6）。

## frontmatter

| キー | 使い方 |
|---|---|
| `name` | ディレクトリ名と一致させる |
| `description` | トリガーの判定に使われる。何をするかと、いつ使うかを具体的に。`when_to_use` と合わせて1536字まで |
| `disable-model-invocation: true` | 副作用のある操作（デプロイ・コミット・送信）を `/名前` 専用にする |
| `user-invocable: false` | 参考知識を `/` メニューから隠す。別の Agent に preload される Skill に付ける |
| `allowed-tools`・`disallowed-tools` | ツール名は `docs/TOOLS.md` に実在する正規名だけ。deny のキーは Skill では `disallowed-tools`（ハイフン）。Subagent の `disallowedTools`（camelCase）と混ぜない |
| `model`・`effort` | design-map の Model Assignments に従う |
| `argument-hint`・`arguments` | 引数を取るとき。本文では `$ARGUMENTS`・`$ARG1` で参照する |
| `context: fork` と `agent:` | 長い探索を隔離するときだけ。`agent:` の指定が必須で、本文に実行すべき具体的なタスクを書く（指針だけを fork すると何もせず終わる）。preload（`skills:`）との併用は原則しない |

トリガー方式は、デフォルトが「Claude の自動選択と `/名前` の両方」、`disable-model-invocation: true` が「`/名前` のみ」、`user-invocable: false` が「自動選択のみ（メニューに出ない）」。

## 本文

- 500行未満。詳細は references に分ける。
- 手順は命令形で書き、理由を添える。
- 本文に `` !`command` `` を書くと、Skill の読み込み前にシェルでコマンドが実行される（Bash ツールの呼び出しではないので、ツールの権限制御が効かない）。使うなら、副作用を README のセットアップ欄に明記できるよう、design-map の「配置時の追加手順」に載っている必要がある。必要が無ければ使わない。
- 役割別の書込範囲を Skill に持たせる設計（design-map の Write Scopes が、その Skill を定義の源とするとき）は、Write Scopes の内容を**要約せず逐語で**書く: 常設の範囲の表・構成ファイルの宣言駆動の例外・自己チェック手順・advisory である旨。

## 読み込み元

design-map の `## L2` の節と、L2 の modify・merge の既存判定レコードが、スライス `skills.md` に入っている。
