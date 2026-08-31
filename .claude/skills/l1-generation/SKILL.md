---
name: l1-generation
description: Generate L1 customizations (CLAUDE.md and .claude/rules/*.md) to canon schema. Use when l1-builder must produce context-management files — enforces the 200-line limit, paths: frontmatter for rules, and @import structure. Preloaded by l1-builder.
user-invocable: false
---

# l1-generation（L1: CLAUDE.md / Rules 生成）

CLAUDE.md / Rules スキーマ準拠の生成を担う。`l1-builder` に preload されるため `context: fork` は付与しない。`disable-model-invocation` も付与しない（preload 対象のため）。

## 参照正典
- `L1_CONTEXT_MANAGEMENT.md §2.1`（CLAUDE.md）
- `L1_CONTEXT_MANAGEMENT.md §2.2`（Rules）

## CLAUDE.md 生成規約（§2.1）
- **200行以下を厳守**（公式: 超過で重要ルールが埋没し遵守率低下）。常時必要な静的事実のみ記述。手順・テンプレートは L2 Skill へ切り出す。
- frontmatter は**サポートなし**（CLAUDE.md には付けない）。
- `@import` で構造化可（相対パスはインポート元基準、`@~/...` 可、最大4 hops）。
- Include/Exclude 原則: Bash コマンドのうち推測不能なもの・非標準コードスタイル・テスト実行方法・リポジトリ作法・固有設計判断・環境の癖・非自明な罠は**書く**。コードから自明な情報・標準慣習・API ドキュメント・頻繁に変わる情報・長文チュートリアルは**書かない**。
- 削除テスト: 各行「削除したら Claude がミスするか？」NO なら削除。
- `<!-- -->` コメントはロード時に除去される。

## Rules 生成規約（§2.2）
- 配置: `.claude/rules/<topic>.md`（Markdown・説明的トピック名）。
- `paths:` frontmatter（YAML）で Glob 指定すると、該当ファイル読取時のみロード。frontmatter なしは無条件ロード（CLAUDE.md と同等）。
- Glob 例: `src/**/*.{ts,tsx}` / `lib/**/*.ts` / `*.md`。
- 1機能1ファイル。10ファイル超になったら統合を検討。

## Auto Memory（要件があれば）
利用者要件で Claude 自身の学習引き継ぎが必要なら、`MEMORY.md`（200行 or 25KB 索引）+ topic files 構成を生成する。

## 出力先
`output/<ts>/generated/CLAUDE.md`、`output/<ts>/generated/.claude/rules/*.md`。design-map の `## L1` セクションを消費する。
