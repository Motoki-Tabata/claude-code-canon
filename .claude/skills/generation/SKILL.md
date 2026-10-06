---
name: generation
description: 対象プロジェクト向けのカスタマイズ（CLAUDE.md・Rules・Skills・Subagents・Hooks・MCP・Plugin）を design-map のスライスどおりに書くときの生成規約。builder が担当層（l1・skills・agents・l4・l5）の成果物を output/<ts>/generated/ に書く前に参照する。生成物に読み手が解決できない参照・編集メモ・経緯の ID を書かない規約を含む。
user-invocable: false
---

# generation（層ごとの生成規約）

builder は、design-map から切り出されたスライスを入力に、**担当する1層**の成果物を `output/<ts>/generated/` に書く。何を作るかは design-map が決めている。ここにあるのは、それを**正典のスキーマに適合する形で、読み手に伝わるように書く**ための規約である。

## 情報源の優先順位

衝突したら上を優先する。

1. `docs/`（正典）: 何が正しいか（スキーマ・フィールド・制約）。
2. skill-creator の執筆指針: 良い Skill の書き方。要約が [references/skill-writing.md](references/skill-writing.md) にある。
3. この Skill の references: claude-canon 固有の契約（design-map を入力にする・書込先・書いてはいけないもの）。

Agent・L1・L4・L5 は、この Skill の references だけで生成する。skill-creator の指針を使うのは L2（Skills）だけ。

## 担当層と読むファイル

プロンプトで渡された層に対応する1つと、共通の [references/no-leaks.md](references/no-leaks.md) を読む。

| 層 | 書くもの | 読む | スライス | 宣言一覧 |
|---|---|---|---|---|
| `l1` | `CLAUDE.md`・`.claude/rules/*.md` | [references/l1.md](references/l1.md) | `l1.md` | `targets-l1.txt` |
| `skills` | `.claude/skills/<name>/SKILL.md` と supporting files | [references/skills.md](references/skills.md)・[references/skill-writing.md](references/skill-writing.md) | `skills.md` | `targets-l2.txt` |
| `agents` | `.claude/agents/<name>/<name>.md` | [references/agents.md](references/agents.md) | `agents.md` | `targets-l3.txt` |
| `l4` | `.claude/settings.json` の hooks 配線・`.claude/hooks/**`・`.mcp.json` | [references/l4.md](references/l4.md) | `l4.md` | `targets-l4.txt` |
| `l5` | `plugin/**` | [references/l5.md](references/l5.md) | `l5.md` | `targets-l5.txt` |

## 共通の手順

1. `work/<ts>/slices/` の、自分の層のスライスと `common.md`（モデル割当・生成上の制約・Interface Contracts）を読む。`write-scopes.md` に自分の役割の記載があれば併せて読む。**design-map.md の全文は読まない**（大きく、全ワーカーが読むと消費が積み上がる）。スライスに無い情報が要るときだけ、design-map.md の該当の節を読む。
2. 書く前に、表の「宣言一覧」（`work/<ts>/slices/` にある、この層で生成される宣言済みのパスの一覧）の件数と、自分が書くファイルの数を突き合わせる。委譲の途中でファイルが1件脱落しても、ほかの検査は書く側より先に気づけない。
3. 書く。**書込先は担当層の範囲だけ**（`output/<ts>/generated/` のうち、自分の層のパス）。他の層のファイルや、対象リポジトリ、`output/<ts>/` の他の成果物には書かない。
4. 書き終えたら、自分の出力を Read し直して、宣言一覧の全件が書けていること、frontmatter が崩れていないことを確かめる。

## この層では書かないもの

- **keep のファイル**: オーケストレーターが、原本をバイト単位で `generated/` にコピー済み。読んで書き写さない（写し違いが起きる）。refactor モードで、スライスに keep のレコードがあるときだけ、コピー済みであることを Glob で確かめ、欠けていれば自分で写さず、報告に書く（new モードには keep が無く、書く前の `generated/` は存在しないことがある）。
- **`.claude/README.md`・`MANIFEST.md`・`deploy/*.list`**: 生成の最後に `emit-manifest` が決定論で作る。作文すると、起動方式の誤案内や、検証していない実績の主張が紛れ込む。design-map が `.claude/README.md` を modify としていても、書かない。
- **廃止（retire）・統合される側（merge の元）のファイル**: output に置かない。
- design-map に宣言の無いファイル。

## 制約

- 対象リポジトリを Glob するときは、`**/*` で全体を引かない。調べたいディレクトリや拡張子に絞り、`node_modules` などの依存ディレクトリやビルド出力を含めない。
- `interface_change: none` を宣言した modify のファイルは、対外インタフェースの署名（SKILL.md・Subagent の `name`、rule の `paths:` など）を変えない。変えると、そのファイルに依存する keep の前提が崩れ、verify の V7 が止める。署名の種別は design-map の既存判定にある。
- 対象プロジェクトの非管理ファイル（`README.md` など、配置の対象外のファイル）を出典として参照するときは、行番号でなく節見出しで書く（例: 「README.md の『main への直接 push を防ぐ』節」）。行番号は対象側の編集で黙ってずれ、検知できない。verify の V6 が止める。生成物どうしの行番号参照は、同じ run で一括して作られるので許される。
- `common.md` の「管理パス外の変更」にある変更の成果物（例: その変更で新設するテスト設定）を前提に本文を書くときは、その項目の「撤回したら直す生成物」に自分のファイルと節が挙がっているかを確かめる。挙がっていなければ、書いてから応答でその旨を報告する（撤回されたとき、宙に浮く生成物を直す範囲から漏れる）。
- secret をハードコードしない。`.mcp.json` などの資格情報は `${VAR}` の展開で書く。
- 文字コードは BOM なしの UTF-8。BOM 付きの `.md` は、エラーも出さずに読み込まれない。
- 他の Subagent を起動しない。応答は、書いたファイルのパスの一覧と、Experimental 依存・構文上の不安があればその旨、だけにする。

## 差し戻されたとき

オーケストレーターが、handoff.md の「差し戻し」に書いた指摘（逐語・直すファイル・直さないファイル）を渡して、builder を新規に起動する。指示が指すファイルの、指示が指す箇所だけを Edit する。全体を作り直さない。
