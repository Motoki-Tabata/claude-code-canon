# .claude/ の使い方（constrained-app）

本構成は Hooks / MCP / Plugin / 実験機能を使用しない（組織ポリシーによる制約）。
セットアップに必要な追加手順・環境変数・外部接続は無い。ファイルを配置するだけで有効になる。

## 生成物一覧

| コンポーネント | 層 | 起動方式 | 用途 |
|---|---|---|---|
| CLAUDE.md | L1 | 常時ロード | プロジェクト規約の入口 |
| schema-review | L1 Rules | 自動ロード（paths: src/**/*.js に一致する編集時） | スキーマ変更時のレビュー観点（R1 の縮退先） |
| style-guide | L2 Skill | 「規約に沿っているか」と依頼すると自動発動。`/style-guide` でも起動可 | コーディング規約の参照（既存を維持） |

## 注意

schema-review は advisory であり、Hooks のような機械強制ではない。
R1 が求めた deterministic は hooks 禁止のため実現していない（requirements.md の conflicts 参照）。
