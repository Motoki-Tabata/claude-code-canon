---
title: 正典リファレンスの構築手順
purpose: 正典リファレンス（.claude/skills/canon-reference/）を公式ドキュメントから作り直す手順を定める。ソースの取得と分類、成果物の構成、data/*.json のスキーマ、機能ファイルのテンプレート、検査の項目、スナップショットの規約を扱う。後で更新 Skill（.claude/skills/canon-update/）に移す。
audience: [ai, human]
---

# 正典リファレンスの構築手順

正典リファレンス（以下「リファレンス」）は、canon が機能選定・設計・生成・検証・品質検査の根拠にする知識 Skill である。本書は、それを**公式ドキュメントから一から作る手順**を定める。初版の構築も、以後の更新も、同じ手順で全ファイルを作り直す。既存の版を部分的に直すことはしない（§10）。

本書は、構築を行う Claude（オーケストレーター）と、それを承認する人が読む。

---

## 1. 成果物

```text
.claude/skills/canon-reference/
├─ SKILL.md                 目的・読み方・「問い→読むファイル」の索引・[仕様]/[知見] の規約・data の使い方
├─ sources.json             時点の情報（generated_at・claude_code_version）・全ソースの分類・未確認事項
├─ references/
│   ├─ selection.md         機能選定ガイド（比較表・制御の強さ・運用機能の選択肢）
│   ├─ patterns.md          機能の組み合わせ方（委譲・並列・強制・配布の型）
│   ├─ quality.md           機能横断の品質基準と検証ルール
│   └─ features/<機能>.md   1機能1ファイル（§5）
└─ data/<名前>.json         機械可読データ（§4）
```

- 機械可読データは **JSON** にする。canon は依存パッケージを持たず、Node の標準機能だけで読めるようにするため。
- Markdown は説明・選定基準・設計の指針・品質基準に専念する。スキーマや一覧の正は `data/*.json` に置き、Markdown は読み手の判断に要る範囲だけを要約する。
- `SKILL.md` の frontmatter は `name: canon-reference`・`user-invocable: false` とする。ワーカーは `skills:` で preload するか `references/` を読み、スクリプトは `data/*.json` と `sources.json` を読む。
- 独自のレイヤー用語（L1〜L5・2層/3層など）は使わない。整理の軸は公式の機能単位にする。

### 1.1 機能ファイルの一覧と範囲

機能ファイルは、**ファイルとして配置できる機能**ごとに1つ作る。範囲の基準は公式ページ `claude-directory` の「File reference」表である。この表の全行を、次のどれかに割り当てる（割り当ては `sources.json` の `placeable_files` に記録し、§8 で漏れを検査する）。

| 機能ファイル | 主に扱うもの | 主な公式ページ |
|---|---|---|
| `claude-md.md` | `CLAUDE.md`・import・`AGENTS.md`・auto memory との関係 | `memory` |
| `rules.md` | `.claude/rules/*.md`・`paths` | `memory`（rules の節） |
| `skills.md` | `skills/<name>/SKILL.md`・`commands/*.md` | `skills` |
| `subagents.md` | `agents/*.md`・`agent-memory/` | `sub-agents` |
| `hooks.md` | settings の `hooks`・ハンドラー | `hooks`・`hooks-guide` |
| `mcp.md` | `.mcp.json`・スコープ・transport | `mcp` |
| `plugins.md` | manifest・components・marketplace・dependencies・code intelligence | `plugins/*` |
| `plugin-mods.md` | Mods | `plugins/mods/*` |
| `settings.md` | `settings.json`・`settings.local.json`・スコープと優先順位・主要キー | `settings`・`settings-reference` |
| `permissions.md` | permissions・permission modes・sandboxing | `permissions`・`permission-modes`・`sandboxing` |
| `output-styles.md` | `output-styles/*.md` | `output-styles` |
| `statusline.md` | status line の設定とスクリプト | `statusline` |

- 表に無い行（例: `workflows/*.js`・`.worktreeinclude`・`keybindings.json`・`themes/*.json`・`~/.claude.json`）は、既存の機能ファイルに含めるか、新しい機能ファイルを作るか、選定ガイドに選択肢として載せるだけにするか、扱わないかを決め、理由を `placeable_files` に書く。新しい機能ファイルを作るときは、構築を始める前に人の承認を取る。
- `placeable_files` の範囲は File reference 表の行だけにする。プラグインにしか無いファイル（`.claude-plugin/plugin.json`・`hooks/hooks.json`・`.lsp.json`・`monitors/monitors.json`・`bin/` など）は `placeable_files` に入れず、`paths:files` に `scope: plugin`・`feature: plugins` の行として置く。中身の書式は `plugins.md` から各機能ファイル（`hooks.md` など）を参照する。
- 1ファイルが大きすぎるときは、公式の章立てに合わせて分割してよい（例: `plugins.md` → `plugins.md` と `plugin-marketplace.md`）。分割したら `SKILL.md` の索引と `sources.json` の割り当てを合わせる。
- 運用の機能（routines・scheduled tasks・channels・agent teams・worktrees・GitHub Actions など）は機能ファイルを作らず、`selection.md` に選択肢として載せる。

---

## 2. 全体の流れ

| 手順 | 内容 | 成果 | 担い手 |
|---|---|---|---|
| 1 | ソースを取得する（§3.1） | scratchpad に取得物 | オーケストレーター |
| 2 | 全ページを分類する（§3.2） | `sources.json`（`pages`・`placeable_files`） | オーケストレーター |
| 3 | 時点の情報を決める（§3.3） | `sources.json`（`generated_at`・`claude_code_version`） | オーケストレーター |
| 4 | 機能ごとに `data/*.json` → `features/*.md` の順で書く（§4・§5） | `data/`・`references/features/` | 機能ごとのサブエージェント（§7） |
| 5 | 件数を持つデータを独立に取り直して突き合わせる（§6） | 一致の確認、不一致の解消 | 別のサブエージェント |
| 6 | 横断の文書を書く（§5.4） | `selection.md`・`patterns.md`・`quality.md`・`SKILL.md` | オーケストレーター |
| 7 | 検査する（§8） | 検査の結果 | オーケストレーター |
| 8 | 前の版（または旧 `docs/`）と突き合わせる（§9） | 食い違いの一覧と解決 | オーケストレーター |

手順2の分類と手順7の検査の結果は、人に見せてから次へ進む。

---

## 3. ソース

### 3.1 取得

| 種別 | ソース | 取得の仕方 |
|---|---|---|
| `spec` | `https://code.claude.com/docs/llms.txt` に載る `https://code.claude.com/docs/en/` 配下の全ページ | 一覧は `llms.txt`。本文は各ページの `.md` 版を `curl -sSL <url>` で取得する |
| `version` | `https://code.claude.com/docs/en/changelog.md`・`https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md`・`whats-new/*` | `curl -sSL` |
| `insight` | Anthropic が発信する設計の知見（下の一覧） | `.md` 版があればそれを `curl` で取る。無ければ HTML を `curl` で取り、タグを除いたテキストにする |

- 本文は **WebFetch ではなく `curl` で `.md` 版を全文取得する**。WebFetch は長い表を途中で落とすことがあり、同じページでも取得のたびに結果が変わる。`.md` 版は数百KB のページ（`hooks`・`env-vars` など）でも途切れない。
- `llms.txt` の `## Indexes` 節にある `https://code.claude.com/docs/_llms/<言語>.md` は翻訳版の索引なので分類の対象にしない。対象は `/docs/en/` 配下だけで、ページ数は一意な URL で数える。
- `insight` の引用は、取得した原文（HTML から作ったテキストを含む）に grep で照合してから書く。WebFetch の要約を引用の根拠にしない。
- 取得物は scratchpad に置き、リポジトリには入れない。

`insight` の候補は次のとおり。ほかの Anthropic 発信の情報を使うときも、発信元が Anthropic であることを確かめてから `sources.json` の `insights` に足す。コミュニティの情報は使わない。

- platform.claude.com の Agent Skills のページ（一覧は `https://platform.claude.com/llms.txt`。とくに `agents-and-tools/agent-skills/best-practices.md`）
- anthropic.com/engineering の記事
- claude.dev
- GitHub `anthropics/skills`（skill-creator など）

### 3.2 分類

`llms.txt` の全ページを、`kind` と `treatment` の組で分類する。

| `treatment` | 意味 | 使い方 |
|---|---|---|
| `detailed` | 配置できる機能の仕様の根拠 | 機能ファイルと `data/` の根拠にする。`features` に割り当て先を書く |
| `selection-only` | 運用の機能・横断の概念 | `selection.md`・`patterns.md` に選択肢や前提として載せる |
| `out-of-scope` | 扱わない | `reason` に理由を書く |

分類の目安（`llms.txt` の節で決める。迷ったらページの本文を読んで決める）:

| `llms.txt` の節 | 既定の扱い |
|---|---|
| Core concepts・Use Claude Code | 機能の仕様を持つページ（`claude-directory`・`memory` など）は `detailed`、概念の説明は `selection-only` |
| Build with Claude Code（Agents and parallel work・MCP・Skills・Automation） | 配置できる機能は `detailed`、運用の機能は `selection-only` |
| Plugins（Use・Create・Mods・Run a marketplace・Reference） | `detailed`。組織の管理（`plugins/org` など）は `out-of-scope` |
| Configuration（Settings・Permissions and sandboxing・Model and responses・Interface の `statusline`） | `detailed`。端末や表示の個人設定は `out-of-scope` |
| Reference（`tools-reference`・`hooks`・`commands`・`env-vars`・`cli-reference` など） | `detailed`（`data/` の根拠） |
| Platforms and integrations・Claude Code in the cloud・desktop・Code review & CI/CD | `selection-only` か `out-of-scope` |
| Administration（Setup・Deployment・Gateways・Usage and costs・Security and data・Adoption） | `out-of-scope`（管理・デプロイ・ゲートウェイ）。ただし permissions や settings の仕様を持つページは中身を見て決める |
| Environments（cloud・self-hosted） | `out-of-scope` |
| Agent SDK | `out-of-scope`（canon は Claude Code の設定ファイルを生成し、SDK のアプリは作らない） |
| Troubleshooting | `out-of-scope` |
| `changelog`・`whats-new/*` | `kind: version`・`treatment: out-of-scope`・`reason`「版の決定と新機能の検出にだけ使う」 |

### 3.3 時点の情報

- `claude_code_version` は GitHub の `CHANGELOG.md` の先頭の版番号で決め、`changelog.md` の先頭と一致することを確かめる。食い違えば両方の値を `unverified` に載せ、小さい方を採る。
- `generated_at` は構築を始めた日（`YYYY-MM-DD`）にする。
- 前の版の `claude_code_version` 以降の `whats-new/*` と CHANGELOG を読み、配置できる機能の追加・変更を拾う。拾ったものが §1.1 の割り当てや `data/` に反映されているかを、手順4の担い手に伝える。

### 3.4 `sources.json` のスキーマ

```json
{
  "generated_at": "YYYY-MM-DD",
  "claude_code_version": "X.Y.Z",
  "llms_txt": { "url": "https://code.claude.com/docs/llms.txt", "page_count": 0 },
  "pages": [
    {
      "url": "https://code.claude.com/docs/en/hooks.md",
      "title": "Hooks reference",
      "section": "Reference > Reference",
      "kind": "spec",
      "treatment": "detailed",
      "features": ["hooks"],
      "reason": null
    }
  ],
  "insights": [
    { "url": "…", "title": "…", "publisher": "Anthropic", "used_by": ["skills", "quality"] }
  ],
  "placeable_files": [
    { "file": "workflows/*.js", "assigned_to": "selection", "reason": "…" }
  ],
  "unverified": [
    { "where": "data/hook-events.json", "item": "…", "what": "…" }
  ]
}
```

- `pages` は `llms.txt` の `/docs/en/` 配下を、1 URL につき1件だけ持つ。`page_count` は `pages` の件数と一致させる。
- `kind` は `spec`・`version` のどちらか。`treatment` が `out-of-scope` のときだけ `reason` を書き、それ以外は `null` にする。`features` は `detailed` のときだけ空でない。
- `placeable_files` は `claude-directory` の File reference 表の全行を持つ。`assigned_to` は機能ファイル名（拡張子なし）・`selection`・`out-of-scope` のどれか。
- `unverified` は、構築の時点で確かめきれなかった事項の一覧である。経緯は書かない。

---

## 4. `data/*.json`

### 4.1 共通の形

すべてのファイルを次の形にする。

```json
{
  "id": "hook-events",
  "description": "このファイルが何の一覧か（1文）",
  "collections": {
    "events": {
      "description": "…",
      "complete": true,
      "complete_basis": "公式ページが全件を表で列挙している",
      "stated_total": null,
      "items": [
        { "id": "PreToolUse", "…": "…", "source": { "url": "https://code.claude.com/docs/en/hooks.md", "anchor": "#pretooluse" } }
      ]
    }
  }
}
```

- **`items` の要素1つが1つの事実**（イベント1つ・フィールド1つ・ツール1つ）で、要素ごとに `source`（`url` と見出しの `anchor`）を持つ。要素の中の値はその `source` に従う。要素の中に別のページ、または同じページの別の `anchor` を根拠にする値があれば、その値をオブジェクトにして `source` を付ける。
- `anchor` は、公開ページの HTML に実在する `id` を `#` 付きで書く（`.md` の見出しから推測しない。`.` は `-` になり、`’` などの記号は残る）。表の行に付く `id`（例: `settings-reference` のキーごとの `#sandbox-enabled`）も使ってよい。根拠が最初の見出しより前（ページの冒頭）にあるときは `""` にする。
- `source.url` は `sources.json` の `pages` にあり `treatment` が `detailed` のページだけを指す。`insight` を `data/` の根拠にしない。
- `id` はコレクションの中で一意にする。公式の名前があればそれを使う（イベント名・ツール名・キー名）。
- **`complete`** は、公式が全件を列挙していて、それを全部収めたときだけ `true` にする。`complete_basis` は `true` でも `false` でも書く。`true` なら全件だと言える根拠（どの表・節が列挙しているか）を、`false` なら理由（「公式が全件を列挙していない」「生成で使うものだけを選んだ。選んだ基準は…」のどちらか）を書く。`false` のコレクションで見つからないものを「無い」と扱わない。
- **`stated_total`** は、公式ページが件数を本文に明記しているときだけその数を入れる。数字でなく語で述べるとき（"the only field"・"three scopes"）も明記に数える。入れたら `items` の件数と一致させる。
- 公式が "Recommended" と書く値は、要素に `recommended: true` を持たせて表す。
- 時点の情報（日付・版番号）は書かない（§10）。
- 公式の同じ表に並ぶが性質の違う値（例: Model aliases の表の `default`。公式は「エイリアスではない」と明記する）は、コレクションに含めてよい。含めたら要素に `kind` を持たせて区別し、その意味をコレクションの `description` に書く。

### 4.2 ファイルとコレクション

必須のフィールドだけを示す。判断に要るフィールドは足してよい。説明の文は `description_ja` に日本語で書く。

| ファイル | コレクション | 要素の必須フィールド | 根拠のページ |
|---|---|---|---|
| `paths.json` | `files` | `id`・`path`・`kind`（`file`/`dir`）・`scope`（`managed`/`user`/`project`/`local`/`plugin`）・`commit`（真偽）・`feature` | `claude-directory`・`settings`・`memory` |
| `frontmatter.json` | `skill`・`command`・`subagent`・`plugin-agent`・`rule`・`output-style` | `id`（キー）・`type`・`required`・`default`・`allowed_values`・`description_ja` | `skills`・`sub-agents`・`plugins/components`・`memory`・`output-styles` |
| `hook-events.json` | `events`・`handler-types`・`handler-common-fields`・`exit-codes`・`common-input`・`common-output` | events: `id`・`matcher_target`・`can_block`・`input_fields`・`decision_fields` | `hooks` |
| `tools.json` | `tools` | `id`（正規のツール名）・`permission_required`・`description_ja` | `tools-reference` |
| `settings.json` | `keys`・`global-config-keys` | keys: `id`（ドット区切りのキー）・`type`・`scopes`・`description_ja`。global-config-keys: `id`・`kind`（`current`/`removed`）・`description_ja` | `settings-reference` |
| `permissions.json` | `rule-syntax`・`modes`・`sandbox-keys` | rule-syntax: `id`（ツール）・`specifier_forms`。modes: `id`・`description_ja` | `permissions`・`permission-modes`・`sandboxing` |
| `plugin-manifest.json` | `fields`・`components` | `id`・`type`・`required`・`description_ja` | `plugins/manifest-reference`・`plugins/components` |
| `marketplace.json` | `fields`・`source-types` | `id`・`type`・`required`・`description_ja` | `plugins/marketplace-reference` |
| `mcp.json` | `transports`・`scopes`・`mcp-json-fields` | `id`・`description_ja` | `mcp` |
| `models.json` | `aliases` | `id`（エイリアス）・`description_ja` | `model-config` |
| `builtin-commands.json` | `commands` | `id`（`/` を除いた名前） | `commands` |
| `env-vars.json` | `vars`・`ignored-in-env` | vars: `id`・`description_ja`・`used_for`。ignored-in-env: `id`・`kind`（`name`/`pattern`）・`ignored_from`（`project-local`/`all-files`） | `env-vars`・`settings-reference` |
| `statusline.json` | `input-fields`・`subagent-task-fields` | `id`（ドット区切りのフィールド名）・`type`・`description_ja`（subagent-task-fields は `optional` も） | `statusline` |
| `mods.json` | `events`・`api`・`files`・`render-sites`・`elements`・`limits` | `id`・`description_ja`（render-sites と elements は `description_ja` の代わりに公式の列の `props`・`surfaces`、limits は `target`・`value`） | `plugins/mods/*` |
| `builtins.json` | `output-styles`・`subagents`・`skill-substitutions` | `id`（Claude Code が組み込みで持つ名前）・`description_ja` | `output-styles`・`sub-agents`・`skills` |

- `settings:keys` と `env-vars:vars` は生成で使うものだけを選ぶので `complete: false` にし、選んだ基準を `complete_basis` に書く。`env-vars:ignored-in-env` は選ばず、公式の節に名前が載るものをすべて収める。
- `builtins.json` は、Claude Code が組み込みで持つ名前のうち、ほかのファイルの主題に収まらないもの（出力スタイル・サブエージェントの種類・Skill の置換変数）を置く。組み込みのツールとコマンドは `tools.json`・`builtin-commands.json` に置く。
- hook の matcher の評価規則は名前の一覧ではなく規則なので、`data/` に置かず `hooks.md` の本文に書く。
- `marketplace:source-types` の `required` は、公式が必須と明記したフィールドの `id` の配列にする。明記が無ければ `null` にする。
- `paths:files` の `commit` は、そのリポジトリ（`scope: plugin` はプラグインのリポジトリ）にコミットして共有する前提かを表す。
- `data/settings.json` と `data/mcp.json` は Claude Code が読む設定ファイルではない（Claude Code が読むのは `.claude/settings.json` と `.mcp.json` だけ）。

---

## 5. Markdown の文書

### 5.1 共通の規約

- 本文は日本語で書く。識別子・キー・コマンド・パスは原文のまま書く。判定の根拠になる箇所だけ、英語の原文を短く引用する（`> "…"`）。
- 本文の主張には **[仕様]** か **[知見]** を付ける。[仕様] は `spec` のページに、[知見] は `insights` のページに根拠がある。根拠の無い主張は書かない。canon が決めた規律を書くときは、それが公式の仕様ではないことを明記する。
- [仕様] の根拠には `kind: spec` のページを `treatment` によらず使ってよい（`selection-only` を含む）。`data/` の `source` が `detailed` のページに限られるのは §4.1 のとおり。
- canon の規律だけで成り立つ主張・規則には [仕様] を付けず、「canon の規律で、公式の仕様ではない」と書く。公式の事実を根拠に canon が決めた規則は、[仕様] を付けたうえで、どこからが canon の規律かを括弧で書く。
- `data/` の要素を参照するときは `` `<ファイルのid>:<コレクション>/<要素のid>` `` と書く（例: `` `hook-events:events/PreToolUse` ``）。コレクション全体は `` `hook-events:events` `` と書く。
- 一覧や件数は本文に写さず、`data/` を参照する。本文には読み手が判断に要る要約だけを書く。

### 5.2 機能ファイルのテンプレート

すべての機能ファイルは、次の8つの見出しをこの順で持つ（見出しの文言も固定する）。

```markdown
---
feature: <機能のid（ファイル名と同じ）>
sources: [<この機能が根拠にする spec ページの URL>]
---

# <機能名>

## 1. 概要
何か。いつ読み込まれ、コンテキストにどう効くか。

## 2. 使う場面・使わない場面
選定の判断材料。近い機能との違い。

## 3. 仕様の要約
正は data/*.json。読み手が判断に要る範囲だけを書き、一覧は data/ を参照する。

## 4. 設計の指針
## 5. 生成の規約
書き方の型と最小の例。

## 6. 検証ルール
## 7. 品質基準
## 8. 出典
```

- **6. 検証ルール**は機械で真偽が決まる規則だけを置く。1規則1行で、`V-<機能のid>-NN`（`NN` は01から振る2桁）の ID を付け、判定に使う `data/` の要素を参照する。

  ```markdown
  - **V-hooks-01**: settings の `hooks` のキーは `hook-events:events` のいずれかの `id` と一致する。[仕様]
  ```

- data を参照しない V ルールも置いてよい。ただし真偽がファイルそのもの（構文のパース・ファイル構成・パスの実在・CLI の終了コード）で機械的に決まるものに限る。
- `complete: false` のコレクションと名前を照合する V ルールで一致しないときの扱いは、機能ファイルには書かない。`quality.md` の `V-common` にまとめる（一致しなければ違反ではなく「未判定」）。
- **7. 品質基準**は意味の判断を要るレビュー観点を置く。`Q-<機能のid>-NN` の ID を付け、[仕様] か [知見] を付ける。
- **8. 出典**は、本文で使った URL を種別（`spec`/`insight`）ごとに並べる。
- ID は版をまたいで引き継がない。作り直すたびに01から振り直す。

### 5.3 書く順序

機能ごとに、`data/*.json` を先に書き、それを読んで機能ファイルを書く。複数の機能が使う `data/` のファイル（`paths.json`・`frontmatter.json`・`settings.json`）は、オーケストレーターがコレクションごとに担い手を決め、同じコレクションを2人が書かないようにする。

### 5.4 横断の文書

| 文書 | 内容 | 根拠 |
|---|---|---|
| `selection.md` | 要件から機能を選ぶ手順。機能の比較表、制御の強さ（指示 → Hook → permissions → sandbox）、運用機能の選択肢（`selection-only` のページ） | `features-overview`・各機能ファイルの §2 |
| `patterns.md` | 機能の組み合わせ方（委譲・並列・強制・配布の型） | 各機能ファイル・`insights` |
| `quality.md` | 機能横断の品質基準（`Q-common-NN`）と検証ルール（`V-common-NN`） | 各機能ファイルの §6・§7・`insights` |
| `SKILL.md` | 目的、読み方、「問い→読むファイル」の索引、[仕様]/[知見] の規約、`data/` の参照の書き方と読み方 | 本書 |

`SKILL.md` の本文は500行以内にし、詳細は `references/` に任せる。

---

## 6. 件数の独立取得

件数を持つコレクション（`hook-events:events`・`tools:tools`・`builtin-commands:commands`・`frontmatter` の各コレクション・`models:aliases`・`permissions:modes` など）は、`data/` を書いた担い手とは**別のサブエージェント**に、同じページから id の一覧だけを取り直させる。取り直しのプロンプトには `data/` の内容も期待する件数も渡さない。

- 2回の一覧が一致すれば完了。
- 一致しなければ、オーケストレーターが `.md` 版の本文を grep して、どちらが正しいかを決める。決められなければ、そのコレクションを `complete: false` にし、`unverified` に載せる。
- 公式ページが件数を明記していれば（`stated_total`）、それとも突き合わせる。

---

## 7. 並列化

- 手順4は機能ごとに独立しているので、機能ごとにサブエージェントを1つずつ、1ターンで並列に起動する。
- 委譲のプロンプトには、本書の該当節（§4・§5.1〜§5.3・§10）、担当の機能と書いてよい `data/` のコレクション、担当のページの URL と取得の仕方（§3.1）、**日本語で書くこと**を明記する。
- 委譲のプロンプトには、ファイルは Write で書くこと、シェルで書くならヒアドキュメントの区切りを引用符で囲むこと（`<<'EOF'`）も明記する。引用符が無いと本文のバッククォートが展開され、コマンドが実行される。
- サブエージェントは自分の担当以外のファイルを書かない。担当外の不足に気づいたら、報告に書く。

---

## 8. 検査

検査は使い捨てのスクリプトで行い、リポジトリには入れない。結果は人に報告する。

| # | 検査 | 方法 |
|---|---|---|
| 1 | `data/*.json` と `sources.json` がすべてパースできる | `JSON.parse` |
| 2 | `data/` のすべての要素に `source.url` と `source.anchor` があり、`url` が `sources.json` の `detailed` のページを指し、空でない `anchor` が公開ページの HTML の `id` に実在する | スクリプト（HTML を `curl` で取得して `id="…"` と照合） |
| 3 | `complete: false` のコレクションに `complete_basis` があり、`stated_total` があれば `items` の件数と一致する | スクリプト |
| 4 | `sources.json` の `pages` が `llms.txt` の `/docs/en/` 配下の URL と過不足なく一致し、重複が無い | スクリプト |
| 5 | `placeable_files` が `claude-directory` の File reference 表の全行と一致する | スクリプト |
| 6 | `features/*.md` が §5.2 の8つの見出しをこの順で持つ（コードフェンスの中の行は数えない） | スクリプト |
| 7 | 本文の `data/` 参照（`` `<id>:<collection>/<item>` ``）がすべて解決する | スクリプト |
| 8 | `V-`・`Q-` の ID がファイルの中で連番になっていて、リファレンス全体で一意 | スクリプト |
| 9 | 本文に日付の注記・「解決済」・取り消し線（`~~`）・独自のレイヤー用語が無い | grep。レイヤー用語は語の境界付きの `L[1-5]`（`WSL2` に当てない）と、`N層構成`・`N層の` のような独自の用語の形に絞る（「3層下まで」のような普通の言い回しに当てない） |
| 10 | 件数を持つコレクションが、独立した2回の取得で一致している（§6） | 手順5の結果 |
| 11 | `SKILL.md` の索引が全ての `references/` のファイルを指し、リンクが解決する | スクリプト |
| 12 | `npm test` が通る | `npm test` |

---

## 9. 前の版との突き合わせ

構築の最後に、主要な事実（Hook のイベント・frontmatter のフィールド・ツール名・settings の優先順位・配置パス）を前の版（初版では旧 `docs/`）と比べ、食い違いを一覧にする。

- 食い違いごとに公式の `.md` 版で裏を取り、正しい方を新しい版に反映する。前の版は直さない。
- 一覧と解決の仕方は人への報告に書き、リファレンスには残さない（差分は git に任せる）。
- 前の版に在って新しい版に無いものは、公式から消えたのか、探索の範囲から漏れたのかを区別する。漏れなら新しい版に足す。

---

## 10. スナップショットの規約

- リファレンスは、構築した時点で**新しく作った**形にする。更新でも全ファイルを本書とテンプレートに従って作り直し、前の版を部分的に直さない。
- CHANGELOG・更新履歴・「解決済」・取り消し線・日付の注記・版ごとの差分の説明を置かない。
- 時点を表す情報は `sources.json` の `generated_at` と `claude_code_version` だけにする。
- 未確認の事項は、その時点の一覧として `sources.json` の `unverified` に置くだけにし、経緯は書かない。
- 前の版との差分は git の履歴で追う。
