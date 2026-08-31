# constrained-app

ESM のみの小さな API プロジェクト。テストは `node --test`。

## この構成について

組織ポリシーにより Hooks / MCP / Plugin / 実験機能は使用しない。
自動実行による機械強制の代わりに、L1 Rules（自動ロードされる規約）で運用する。

- スキーマ変更時のレビュー観点は `.claude/rules/schema-review.md` が担う（R1 の縮退先）。
- コーディング規約は既存の style-guide Skill を維持している。
