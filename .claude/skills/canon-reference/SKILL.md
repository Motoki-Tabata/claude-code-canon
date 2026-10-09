---
name: canon-reference
description: Claude Code の公式ドキュメントから作った、カスタマイズの正典リファレンス。CLAUDE.md・ルール・Skill・サブエージェント・Hook・MCP・プラグイン・Mods・settings・permissions・出力スタイル・status line の、選び方・仕様・設計の指針・生成の規約・検証ルール・品質基準を扱い、配置パス・frontmatter・Hook のイベント・ツール名・settings のキーなどの機械可読の一覧を data/ に持つ。機能を選ぶ、設計する、生成する、検証する、レビューするときに参照する。
user-invocable: false
---

# canon-reference（正典リファレンス）

Claude Code のカスタマイズについて、canon が機能選定・設計・生成・検証・品質検査の根拠にする知識である。公式ドキュメント（`spec`）と、Anthropic が発信する設計の知見（`insight`）だけを根拠にしている。

## 読み方

1. 下の索引から、問いに合うファイルを1つ選んで読む。全部を読む必要はない。
2. 機能ファイル（`references/features/<機能>.md`）は、どれも同じ8つの節を持つ。
   - 1. 概要
   - 2. 使う場面・使わない場面
   - 3. 仕様の要約
   - 4. 設計の指針
   - 5. 生成の規約
   - 6. 検証ルール
   - 7. 品質基準
   - 8. 出典

   問いに合う節だけを読めばよい。
3. 一覧や件数が要るときは、本文ではなく `data/*.json` を読む。本文は一覧を写さず、`data/` の要素を参照する（「data/ の参照」の節）。
4. 公式の原文で確かめたいときは、各ファイルの「出典」の URL を読む。`.md` 版は `curl -sSL <url>` で全文を取れる。

## 索引

| 問い | 読むファイル |
|---|---|
| 要件にどの機能を使うか。近い機能とどう違うか。運用の機能（定期実行・並列・CI）に何があるか | `references/selection.md` |
| 機能をどう組み合わせるか（委譲・並列・強制・配布） | `references/patterns.md` |
| 機能をまたぐ検証ルールと品質基準。生成物のどのファイルにどの規則を当てるか | `references/quality.md` |
| CLAUDE.md・`CLAUDE.local.md`・AGENTS.md・import・auto memory | `references/features/claude-md.md` |
| `.claude/rules/` と `paths` | `references/features/rules.md` |
| Skill（`SKILL.md`）とコマンドファイル | `references/features/skills.md` |
| サブエージェントの定義（`agents/*.md`）・モデルの割り当て | `references/features/subagents.md` |
| Hook のイベント・ハンドラー・matcher・決定の返し方 | `references/features/hooks.md` |
| MCP サーバー・`.mcp.json`・スコープ・transport | `references/features/mcp.md` |
| プラグインの manifest・コンポーネント・マーケットプレイス | `references/features/plugins.md` |
| Mods（JavaScript の関数で書く Hook と描画） | `references/features/plugin-mods.md` |
| settings ファイル・スコープと優先順位・主なキー | `references/features/settings.md` |
| permission 規則・permission モード・サンドボックス | `references/features/permissions.md` |
| 出力スタイル（`output-styles/*.md`） | `references/features/output-styles.md` |
| status line の設定とスクリプト | `references/features/statusline.md` |
| どこに何のファイルを置けるか | `data/paths.json`（`paths:files`） |
| 根拠にしたページ、版と日付、確かめきれなかった事項 | `sources.json` |

## [仕様] と [知見]

本文の主張には、根拠の種類を示す印が付いている。

- **[仕様]**: 公式ドキュメント（`sources.json` の `pages` の `kind: spec` のページ）に根拠がある。
- **[知見]**: Anthropic が発信する設計の知見（`sources.json` の `insights`）に根拠がある。公式の仕様ではなく、推奨や経験則である。
- **canon の規律**: canon が決めた規則には「canon の規律で、公式の仕様ではない」と書いてある。公式の事実に canon の判断を重ねた規則は、[仕様] の後の括弧に canon の規律の部分を書いてある。
- 判定の根拠になる箇所は、英語の原文を `> "…"` で短く引用している。

## data/ の参照

本文は `data/` の要素を `` `<ファイルのid>:<コレクション>/<要素のid>` `` の形で参照する。コレクション全体は `` `<ファイルのid>:<コレクション>` `` と書く。

- 読み方: 最初の `:` の前がファイル（`data/<ファイルのid>.json`）、その後の最初の `/` までがコレクション、残りが要素の `id` である。要素の `id` には `:` や `/` が含まれることがある（例: `` `paths:files/user:~/.claude/settings.json` ``）。
- 例: `` `hook-events:events/PreToolUse` `` は、`data/hook-events.json` の `collections.events.items` のうち、`id` が `PreToolUse` の要素を指す。

### data/ のファイル

| ファイル | 中身 | コレクション |
|---|---|---|
| `paths.json` | カスタマイズのファイルとディレクトリの配置（スコープごと） | `files` |
| `frontmatter.json` | 各ファイルの種類が受け付ける frontmatter のキー | `skill`・`command`・`subagent`・`plugin-agent`・`rule`・`output-style` |
| `hook-events.json` | Hook のイベント・ハンドラーの種別・exit code・共通の入出力 | `events`・`handler-types`・`exit-codes`・`common-input`・`common-output` |
| `tools.json` | 組み込みツールの正規名 | `tools` |
| `settings.json` | settings ファイルのキー（canon が使うもの） | `keys` |
| `permissions.json` | permission 規則の書式・モード・サンドボックスのキー | `rule-syntax`・`modes`・`sandbox-keys` |
| `plugin-manifest.json` | プラグインの manifest のフィールドとコンポーネント | `fields`・`components` |
| `marketplace.json` | マーケットプレイスのフィールドとソースの種別 | `fields`・`source-types` |
| `mcp.json` | MCP の transport・スコープ・`.mcp.json` のフィールド | `transports`・`scopes`・`mcp-json-fields` |
| `models.json` | モデルのエイリアスと特別な値 | `aliases` |
| `builtin-commands.json` | 組み込みのコマンド・bundled skill・bundled workflow | `commands` |
| `env-vars.json` | 環境変数（canon の生成物が参照しうるもの） | `vars` |
| `statusline.json` | status line のコマンドが受け取る JSON のフィールド | `input-fields` |
| `mods.json` | Mods のイベントと mods API | `events`・`api` |

`data/settings.json` と `data/mcp.json` は、Claude Code が読む設定ファイルではない。

### コレクションの読み方

- **`complete`**: `true` なら、公式が列挙した全件を収めている。`false` なら一部だけで、理由が `complete_basis` にある。`false` のコレクションに無い名前を「存在しない」と扱わない（`references/quality.md` の V-common-01）。
- **`stated_total`**: 公式ページが件数を本文に明記しているときだけ値がある。
- **`source`**: 要素ごとに、根拠のページ（`url`）と見出しの `anchor` を持つ。要素の中で別のページを根拠にする値は、その値自身が `source` を持つ。
- **`kind`**: 同じ表に性質の違う値が並ぶコレクションでは、要素の `kind` で区別する（例: `models:aliases/default` は `kind: special`）。意味はコレクションの `description` にある。
- 説明の文は `description_ja` にある。

## 時点

本リファレンスが基づく Claude Code の版と構築の日付は、`sources.json` の `claude_code_version` と `generated_at` にだけある。本文と `data/` には日付や版を書かない。構築の時点で確かめきれなかった事項は、`sources.json` の `unverified` にある。
