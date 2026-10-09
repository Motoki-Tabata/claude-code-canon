# skills: Skill とコマンドファイル

正典: `canon-reference/references/features/skills.md` の §4「設計の指針」（description の書き方、段階的開示）と §5「生成の規約」（置き場所、補助ファイル、`${CLAUDE_SKILL_DIR}`）。書く前に読む。

## canon の契約

- **ディレクトリ名と `name:` を一致させる**。一致しないと発動しない失敗になる（verify の V1）。新規は `.claude/skills/<name>/SKILL.md`。コマンドファイルは、design-map が既存を保つと宣言したときだけ書く。
- supporting files だけのディレクトリは Skill として発動しない。**`SKILL.md` は必須**。
- SKILL.md の本文から supporting files を参照するときは、Markdown のリンク（表示名と、`./` から始まる相対パス）にし、**いつ読むか**を添える。参照先は実在しなければならない（V6）。
- Skill に `scripts/` などのディレクトリがあるとき、対象リポジトリ直下の同名パスは、コマンド形（`` `bash scripts/x.sh` ``）か地の文で書き、パス単独のバッククォートにしない。第1セグメントが Skill 直下に実在するトークンを、V6 は Skill 内の supporting file への参照と見なし、無ければ違反にする。
- `model`・`effort` は design-map の Model Assignments に従う。
- 本文に `` !`command` `` を書くと、Skill の読み込み前にシェルでコマンドが実行され、ツールの権限制御が効かない。使うなら、design-map の「配置時の追加手順」に載っている必要がある。載っていなければ使わない。
- 役割別の書込範囲を Skill に持たせる設計（design-map の Write Scopes が、その Skill を定義の源とするとき）は、Write Scopes の内容を**要約せず逐語で**書く: 常設の範囲の表・構成ファイルの宣言駆動の例外・自己チェック手順・advisory である旨。

## 読み込み元

design-map の `## skills` の節と、その modify・merge の既存判定レコードが、スライス `skills.md` に入っている。担当 Skill が多いとき、`slice.js` が `skills-<k>.md` に分け、builder は渡された1つだけを書く。
