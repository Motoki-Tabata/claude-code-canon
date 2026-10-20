/**
 * 制約強めのケース（hooks・mcp・plugins・experimental をすべて禁止した環境）の入力。
 * { 相対パス: 内容 }。`requirements.md` と、制約に触れない生成物（`generated/`）を持つ。
 * verify の constraints とパーサのテストが使う。書き出しは tests/helpers/fixtures.js が行う。
 */

export const CONSTRAINED_CASE = {
  "generated/.claude/README.md": `# .claude/ の使い方（constrained-app）

本構成は Hooks / MCP / Plugin / 実験機能を使用しない（組織ポリシーによる制約）。
セットアップに必要な追加手順・環境変数・外部接続は無い。ファイルを配置するだけで有効になる。

## 生成物一覧

| コンポーネント | 機能 | 起動方式 | 用途 |
|---|---|---|---|
| CLAUDE.md | claude-md | 常時ロード | プロジェクト規約の入口 |
| schema-review | rules | 自動ロード（paths: src/**/*.js に一致する編集時） | スキーマ変更時のレビュー観点（R1 の縮退先） |
| style-guide | skills | 「規約に沿っているか」と依頼すると自動発動。\`/style-guide\` でも起動可 | コーディング規約の参照（既存を維持） |

## 注意

schema-review は advisory であり、Hooks のような機械強制ではない。
R1 が求めた deterministic は hooks 禁止のため実現していない（requirements.md の conflicts 参照）。
`,
  "generated/.claude/rules/schema-review.md": `---
paths: src/**/*.js
---

# スキーマ変更時のレビュー観点（R1・advisory へ縮退）

R1 は本来 deterministic（Hooks による機械強制）を望んだが、constraints で hooks が
禁止されているため advisory（自動ロードされる Rules）へ縮退した（requirements.md の
conflicts に記録済み）。強制力は無く、以下は Claude が読む規約である。

- スキーマのフィールドを追加・改名したら、影響する呼び出し箇所を列挙してから編集する。
- 破壊的変更は必ず理由と移行手順を PR 本文に書く。
- 既存フィールドの型変更は互換性の観点から原則避ける。
`,
  "generated/.claude/skills/style-guide/SKILL.md": `---
name: style-guide
description: このリポジトリのコーディング規約を参照する。命名・エラー処理・ESM の書き分けで迷ったときに使う。
---

# style-guide

- ESM のみ。CommonJS を新規に足さない。
- エラーは例外で伝え、戻り値の null で表現しない。
- 公開関数には JSDoc の1行説明を付ける。

この Skill は canon の変更後も維持される（制約に触れず、新要件とも重複しない）。
`,
  "generated/CLAUDE.md": `# constrained-app

ESM のみの小さな API プロジェクト。テストは \`node --test\`。

## この構成について

組織ポリシーにより Hooks / MCP / Plugin / 実験機能は使用しない。
自動実行による機械強制の代わりに、rules（自動ロードされる規約）で運用する。

- スキーマ変更時のレビュー観点は \`.claude/rules/schema-review.md\` が担う（R1 の縮退先）。
- コーディング規約は既存の style-guide Skill を維持している。
`,
  "work/requirements.md": `# requirements（fixture・制約強め）

## メタ
confirmed_at: 2026-07-24
confirmed_by: fixture

## 確定要件（人間が言ったこと・合意したこと）
- id: R1
  want: API スキーマ変更時にレビュー観点の確認を必ず通したい
  strength_needed: deterministic
  priority: must
- id: R2
  want: コーディング規約を Claude が参照できるようにしたい
  strength_needed: advisory
  priority: should

## 使用可能なカスタマイズ機能（環境制約・探索空間の事前刈り込み）
constraints:
  hooks:        { allowed: false, reason: "組織ポリシーで自動実行される仕組みを禁止（監査ログの対象にできない）" }
  mcp:          { allowed: false, reason: "外部接続はネットワークポリシーで不可" }
  plugins:      { allowed: false, reason: "配布基盤を持たず個別ファイル配置のみ" }
  experimental: { allowed: false, reason: "実験機能への本番依存を禁止" }
  organization_policy: "生成物は監査可能な平文ファイルに限る"

## 制約と要件の衝突（ヒアリング時点で見えたもの・方向づけまで）
conflicts:
  - requirement: R1（deterministic 希望）
    constraint: hooks 禁止
    note: Hooks が使えないため deterministic は実現できない。rules による advisory へ格下げする（G1 で合意）。
`,
};
