---
name: skill-generation
description: Generate L2 Skills (SKILL.md) and Slash Commands to canon schema. Use when skill-builder must produce skill packages — handles progressive disclosure, frontmatter (description, disable-model-invocation, context:fork + agent, arguments), and directory layout. Preloaded by skill-builder.
user-invocable: false
---

# skill-generation（L2: Skills / Slash Commands 生成）

Skills（SKILL.md）/ Slash Commands スキーマ準拠の生成を担う。`skill-builder` に preload されるため `context: fork` は付与しない。`disable-model-invocation` も付与しない（preload 対象のため）。

## 参照正典
- `L2_SKILLS.md §2.1`（SKILL.md frontmatter 完全リファレンス／Progressive Disclosure Loading／ディレクトリ構造・supporting files）
- `L2_SKILLS.md §2.2`（context:fork）
- `TOOLS.md`（`allowed-tools`/`disallowed-tools` に書けるツール名の正規リファレンス）

## ディレクトリ・配置（§2.1）
- 新規は必ず `.claude/skills/<name>/SKILL.md` 形式（`.claude/commands/*.md` は廃止予定）。
- ディレクトリ名と `name:` を一致させる（silent failure 防止）。
- supporting files（`template.md`／`examples/`／`scripts/`）はパッケージ直下に置いてよく、必要時に Read される（Progressive Disclosure Loading・§2.1 ディレクトリ構造）。**`SKILL.md` は必須**——supporting files だけのディレクトリはスキルとして発動しない（G7 が実在照合する）。本文からは `[xxx.md](./xxx.md)` 形式で参照すること（§4.2。「手動で Read してください」と書くと Claude は忘れる）。

## frontmatter 規約（§2.1）
- `description` はトリガー判定に使われる。最重要キーワードを冒頭に。
- `disable-model-invocation: true`: 副作用ある操作（deploy/commit/send）を `/name` 専用化。
- `user-invocable: false`: 参考知識用に `/メニュー` から隠す。
- `allowed-tools`/`disallowed-tools`/`model`/`argument-hint`/`arguments` を要件に応じて付与。**ツール名は `TOOLS.md` に実在するものだけ**（旧称・非実在を書くと G5 が弾く）。
- 引数は `$ARGUMENTS` / `$ARG1`（`arguments:` 名前付き）で参照。
- **deny list のキーは `disallowed-tools`（Skill 側はハイフン）**。Subagent 側の `disallowedTools`（camelCase）と混同しない。

## context:fork 生成規約（§2.2・将来適用時）
- 利用者の Skill が長大探索を要し fork する場合のみ `context: fork` + **`agent:` 指定必須**（Explore/Plan/general-purpose）。
- 本文に actionable な具体的タスク手順を必ず書く（ガイドラインのみを fork すると subagent が何もせず終了 — 公式警告）。
- preload（`skills:`）と `context: fork` は原則併用しない（本システム方針）。

## 役割別書込スコープを Skill 側の SSoT に持たせる設計（design-map の `## Write Scopes` 参照時）
複数の実装役 Subagent へファイル所有権を割り当てる設計で、その定義を1つの参照 Skill（preload 専用・
`user-invocable: false`）に集約する場合、`## Write Scopes` の内容を逐語射影する。含めるべき構成:
常設スコープ表（役割ごとの許可 glob）／ビルド設定・構成ファイルの宣言駆動の例外（対象ファイル一覧・
許可条件・「常に対象外」リスト）／3分岐の自己チェック手順／advisory である旨の注記（PreToolUse hook
はエージェント識別子を受け取れない設計のため役割を機構的に強制できない。担保は自己チェックと事後
レビューの2段構えのみ）。

## トリガー設計マトリクス（§2.1）
| frontmatter | Claude 自動 | ユーザー /name | 用途 |
|---|---|---|---|
| デフォルト | ✅ | ✅ | 通常スキル |
| `disable-model-invocation: true` | ❌ | ✅ | 副作用操作 |
| `user-invocable: false` | ✅ | ❌ | 参考知識 |

## Skill 本文のシェル実行（`!command` 構文）への注意（§2.2 の注記）
生成する Skill 本文に `` !`command` `` 構文（Dynamic Context Injection）を書くと、Skill 注入前にシェルでコマンドが実行される。これは Bash ツール呼出ではないため PreToolUse ガードが見えない。対象プロジェクト向け生成物では要件に応じて使ってよいが、**副作用・セキュリティ影響を README のセットアップ欄に明示**すること。

## 出力先
`output/<ts>/generated/.claude/skills/<name>/SKILL.md`。design-map の `## Skills`・`## Model Assignments` を消費する。
