---
name: generation
description: 対象プロジェクト向けのカスタマイズ（CLAUDE.md・Rules・Skills・Subagents・settings・Hooks・MCP・Plugin・出力スタイル）を design-map のスライスどおりに書くときの生成規約。builder が担当（claude-md・rules・skills・subagents・settings・mcp・plugins・output-styles）の成果物を output/<ts>/generated/ に書く前に参照する。生成物に読み手が解決できない参照・編集メモ・経緯の ID を書かない規約を含む。
user-invocable: false
---

# generation（担当ごとの生成規約）

builder は、design-map から切り出されたスライスを入力に、**担当する1つの unit** の成果物を `output/<ts>/generated/` に書く。何を作るかは design-map が決めている。ここにあるのは、それを**正典のスキーマに適合する形で、読み手に伝わるように書く**ための規約である。

## 情報源の優先順位

衝突したら上を優先する。

1. `.claude/skills/canon-reference/`（正典）: 何が正しいか（仕様・生成の規約・検証ルール）。機能ごとのファイル `references/features/<機能>.md` の §5「生成の規約」を、書く前に必ず読む。
2. この Skill の references: canon 固有の契約（design-map を入力にする・書込先・書いてはいけないもの）。正典の内容は写していない。

## 担当と読むファイル

プロンプトで渡された unit に対応する1つと、共通の [references/no-leaks.md](references/no-leaks.md) を読む。

| unit | 書くもの | 読む | スライス | 宣言一覧 |
|---|---|---|---|---|
| `claude-md` | `CLAUDE.md`・`AGENTS.md` | [references/claude-md.md](references/claude-md.md) | `claude-md.md` | `targets-claude-md.txt` |
| `rules` | `.claude/rules/*.md` | [references/rules.md](references/rules.md) | `rules.md` | `targets-rules.txt` |
| `skills` | `.claude/skills/<name>/**`・`.claude/commands/*.md` | [references/skills.md](references/skills.md) | `skills.md`（分割されたときは渡された `skills-<k>.md`） | `targets-skills.txt`（分割されたときは渡された `targets-skills-<k>.txt`） |
| `subagents` | `.claude/agents/**` | [references/subagents.md](references/subagents.md) | `subagents.md` | `targets-subagents.txt` |
| `settings` | `.claude/settings.json`・`.claude/hooks/**` | [references/settings.md](references/settings.md) | `settings.md` | `targets-settings.txt` |
| `mcp` | `.mcp.json` | [references/mcp.md](references/mcp.md) | `mcp.md` | `targets-mcp.txt` |
| `plugins` | `plugin/**` | [references/plugins.md](references/plugins.md) | `plugins.md` | `targets-plugins.txt` |
| `output-styles` | `.claude/output-styles/*.md` | [references/output-styles.md](references/output-styles.md) | `output-styles.md` | `targets-output-styles.txt` |

## 共通の手順

1. `work/<ts>/slices/` の、自分の unit のスライスと `common.md`（モデル割当・生成上の制約・Interface Contracts）を読む。`write-scopes.md` に自分の役割の記載があれば併せて読む。**design-map.md の全文は読まない**（大きく、全ワーカーが読むと消費が積み上がる）。スライスに無い情報が要るときだけ、design-map.md の該当の節を読む。
2. 書く前に、表の「宣言一覧」（`work/<ts>/slices/` にある、この unit で生成される宣言済みのパスの一覧）の件数と、自分が書くファイルの数を突き合わせる。委譲の途中でファイルが1件脱落しても、ほかの検査は書く側より先に気づけない。
3. 書く。**書込先は担当 unit の範囲だけ**（`output/<ts>/generated/` のうち、自分の unit のパス）。他の unit のファイルや、対象リポジトリ、`output/<ts>/` の他の成果物には書かない。
4. 書き終えたら、自分の出力を Read し直して、宣言一覧の全件が書けていること、frontmatter が崩れていないことを確かめる。

## この unit では書かないもの

- **keep のファイル**: オーケストレーターが、原本をバイト単位で `generated/` にコピー済み。読んで書き写さない（写し違いが起きる）。refactor モードで、スライスに keep のレコードがあるときだけ、コピー済みであることを Glob で確かめ、欠けていれば自分で写さず、報告に書く（new モードには keep が無く、書く前の `generated/` は存在しないことがある）。
- **参照元からのコピー済みのファイル**: `common.md` の `## 参照元からのコピー` に挙がった生成先は、オーケストレーターが参照元からバイト単位でコピー済み。Write で打ち直さない。コピー済みであることを Glob で確かめ、読んで、対象に合わせて変える箇所（design-map の機能の節の指示）だけを Edit する。指示が無ければ変えない。欠けていれば自分で写さず、報告に書く。
- **`.claude/README.md`・`MANIFEST.md`・`deploy/*.list`**: 生成の最後に `emit-manifest` が決定論で作る。作文すると、起動方式の誤案内や、検証していない実績の主張が紛れ込む。design-map が `.claude/README.md` を modify としていても、書かない。
- **廃止（retire）・統合される側（merge の元）のファイル**: output に置かない。
- design-map に宣言の無いファイル。

## 制約

- 対象リポジトリを Glob するときは、`**/*` で全体を引かない。調べたいディレクトリや拡張子に絞り、`node_modules` などの依存ディレクトリやビルド出力を含めない。
- `interface_change: none` を宣言した modify のファイルは、対外インタフェースの署名（SKILL.md・Subagent の `name`、rule の `paths:` など）を変えない。変えると、そのファイルに依存する keep の前提が崩れ、verify の V7 が止める。署名の種別は design-map の既存判定にある。
- 対象プロジェクトの非管理ファイル（`README.md` など、配置の対象外のファイル）を出典として参照するときは、行番号でなく節見出しで書く（例: 「README.md の『main への直接 push を防ぐ』節」）。行番号は対象側の編集で黙ってずれ、検知できない。verify の V6 が止める。生成物どうしの行番号参照は、同じ run で一括して作られるので許される。
- `common.md` の「管理パス外の変更」にある変更の成果物（例: その変更で新設するテスト設定）を前提に本文を書くときは、その項目の「撤回したら直す生成物」に自分のファイルと節が挙がっているかを確かめる。挙がっていなければ、書いてから応答でその旨を報告する（撤回されたとき、宙に浮く生成物を直す範囲から漏れる）。
- secret をハードコードしない。資格情報は環境変数の展開（`${VAR}`）で書く。
- 文字コードは BOM なしの UTF-8。BOM 付きの `.md` は、エラーも出さずに読み込まれない。
- 他の Subagent を起動しない。応答は、書いたファイルのパスの一覧と、Experimental 依存・構文上の不安があればその旨、だけにする。

## 差し戻されたとき

オーケストレーターが、handoff.md の「差し戻し」に書いた指摘（逐語・直すファイル・直さないファイル）を渡して、builder を新規に起動する。指示が指すファイルの、指示が指す箇所だけを Edit する。全体を作り直さない。
