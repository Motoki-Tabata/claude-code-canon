---
name: generation
description: 対象プロジェクト向けのカスタマイズ（CLAUDE.md・Rules・Skills・Subagents・settings・Hooks・MCP・Plugin・出力スタイル）を change-plan.md の指示どおりに worktree へ書くときの生成規約。builder が担当のファイルを Edit・Write する前に参照する。差分に読み手が解決できない参照・編集メモ・経緯の ID を書かない規約を含む。
user-invocable: false
---

# generation（担当ごとの生成規約）

builder は、`work/<ts>/change-plan.md` の `## ファイル` のうち**渡された担当のファイル**を、対象の worktree の上で編集する。変更集合方式なので、書くのは change-plan に載ったファイルだけで、触らないファイルは書き写さない。

## 情報源の優先順位

衝突したら上を優先する。

1. `.claude/skills/canon-reference/`（正典）: 何が正しいか（仕様・生成の規約・検証ルール）。機能ごとのファイル `references/features/<機能>.md` の §5「生成の規約」を、書く前に必ず読む。
2. この Skill の references: canon 固有の契約（change-plan を入力にする・書込先・書いてはいけないもの）。正典の内容は写していない。

## 担当と読むファイル

プロンプトで渡された担当のファイルの機能に対応する1つ以上と、共通の [references/no-leaks.md](references/no-leaks.md) を読む。機能と担当（unit）の対応は `lib/features.js` の `UNITS` で、メインが同じ unit のファイルを1体の builder に渡す。

| unit | 書くもの | 読む |
|---|---|---|
| `claude-md` | `CLAUDE.md`・`AGENTS.md` | [references/claude-md.md](references/claude-md.md) |
| `rules` | `.claude/rules/*.md` | [references/rules.md](references/rules.md) |
| `skills` | `.claude/skills/<name>/**`・`.claude/commands/*.md` | [references/skills.md](references/skills.md) |
| `subagents` | `.claude/agents/**` | [references/subagents.md](references/subagents.md) |
| `settings` | `.claude/settings.json`・`.claude/hooks/**` | [references/settings.md](references/settings.md) |
| `mcp` | `.mcp.json` | [references/mcp.md](references/mcp.md) |
| `plugins` | `plugin/**` | [references/plugins.md](references/plugins.md) |
| `output-styles` | `.claude/output-styles/*.md` | [references/output-styles.md](references/output-styles.md) |

## 共通の手順

1. change-plan.md の `## ファイル` から、担当のファイル（渡されたパス）の `op`・`reqs`・`instruct` を読む。`reqs` の要件 ID は requirements.md の該当の要件（`want`・`accept`）で確かめる。**change-plan.md の他のファイルの指示と、他の中間文書は読まない**。指示に無い情報が要るときだけ、該当の節を読む。
2. 書く前に、担当のファイルの件数と、自分が書くファイルの数を突き合わせる。
3. 書く。**書込先は担当のファイルだけ**（worktree の絶対パス＋ change-plan の `path`）。
   - `modify`: 現物を Read し、`instruct` が指す箇所だけを Edit する。全文を Write し直さない。指示の無い箇所は 1 文字も変えない。
   - `new`: Write する。
   - `delete`: builder は何もしない（メインが `git rm` する）。
4. 書き終えたら、自分の出力を Read し直して、担当の全件が書けていること、frontmatter が崩れていないこと、`accept`（受入基準）が diff で確かめられる形で満たされていることを確かめる。

## 書かないもの

- 担当外のファイル、change-plan に載っていないファイル。対象の他の部分を「ついでに」直さない。
- `op: delete` のファイル。
- 対象の worktree の外。

## 制約

- 対象リポジトリを Glob するときは、`**/*` で全体を引かない。調べたいディレクトリや拡張子に絞り、`node_modules` などの依存ディレクトリやビルド出力を含めない。
- 対象の非カスタマイズファイル（`README.md` など）を出典として参照するときは、行番号でなく節見出しで書く（例: 「README.md の『main への直接 push を防ぐ』節」）。差分に無いファイルへの行番号引用は、verify の V6 が止める。
- secret をハードコードしない。資格情報は環境変数の展開（`${VAR}`）で書く。
- 文字コードは BOM なしの UTF-8。BOM 付きの `.md` は、エラーも出さずに読み込まれない。
- 実行権限が要るスクリプトを書いたときは、応答に書く（権限はメインが付ける。builder は付けられない）。
- 他の Subagent を起動しない。応答は、書いたファイルのパスの一覧と、Experimental 依存・構文上の不安があればその旨、だけにする。

## 差し戻されたとき

メインが、handoff.md の「差し戻し」に書いた指摘（逐語・直すファイル・直さないファイル）を渡して、builder を新規に起動する。指示が指すファイルの、指示が指す箇所だけを Edit する。全体を作り直さない。
