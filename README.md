# claude-canon

[![CI](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml/badge.svg)](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Claude Code のカスタマイズ一式（`CLAUDE.md`・Rules・Skills・Subagents・MCP・Hooks・Plugin）を、
対象プロジェクトごとに**半自律で作る・直すメタジェネレータ**です。ゲートごとに人間の承認を挟み、
無人で最後まで走らせることはしません。

- **SSoT**: 正典リファレンス `.claude/skills/canon-reference/`（Claude Code の公式仕様を12機能ごとに整理した
  `references/`、機械可読の一覧 `data/`、一次ソースと版 `sources.json`）。生成物の検査は `data/` を直接読みます。
- **変更集合方式**: 対象リポジトリの worktree（ブランチ `canon/<ts>`）の上で、変えるファイルだけを編集し、
  削除は `git rm` で行います。差分は `git diff` で示し、反映は人間のマージです。対象は git で管理されている必要があります。
- **中間文書は2つ**: `requirements.md`（要件・根拠の確度・受入基準）と `change-plan.md`（ファイルごとの変更指示・
  影響を受ける参照元の扱い）。run の状態は `work/<ts>/handoff.md` が持ちます。

全体像と「なぜそうしたか」は [design/architecture.md](design/architecture.md) にあります。書式と検査の契約は、
`.claude/skills/` の知識 Skill の `references/` とテストに置いています。

## 経路とゲート

1つのセッションで1つの段を行います。状態はファイルが持つので、段の境界でセッションを切っても失うものはありません。

| 経路 | 使う場面 | 段（推奨の起動） | 人間のゲート |
|---|---|---|---|
| 小 | 既存のカスタマイズの改修（新しい機能種別を足さず、構成を変えない） | `/canon-plan`（opus・medium）→ `/canon-build`（sonnet・medium） | G1 計画 → G2 差分 → 人間のマージ |
| 大 | 新規の構築・全面的な作り直し | `/canon-plan` → `/canon-design`（opus・medium）→ `/canon-build` | G1 要件 → G2 設計 → G3 差分 → 人間のマージ |

- `/canon-plan` が、worktree の作成・棚卸し（`inventory`）・要件のヒアリング・根拠の確認を行います。
  「文言のみ」の根拠しかない要件は G1 で確定しません。
- `/canon-build` が、編集（builder）・対象のテスト・`verify`・レビュー（reviewer・prompt-auditor）・差分のゲート・振り返りを行います。
- **承認は handoff.md に sha256 かコミットの sha を付けて記録**し（`npm run approvals`）、次の段の開始時に照合します。
  承認の後で対象が変わっていれば、承認は無効です。
- **run は canon のルートで行います**。状態と中間文書は `work/<ts>` に置き、git では追跡しません。生成物は
  canon のルートの外の `~/.claude-canon/wt/<対象名>-<ts>/` に置きます。
- フックは使いません。順序と承認は対話と handoff.md で扱います（理由は architecture.md §8）。

## 前提

- Node.js 22 以上（`npm test` が `node --test` にグロブ文字列を渡すため、20 系では動きません）
- git
- Claude Code と、標準 Skill のプラグイン `example-skills@anthropic-agent-skills`（導入は guide を参照）
- 依存パッケージはありません（`npm install` は不要）

## 導入

```bash
git clone https://github.com/Motoki-Tabata/claude-code-canon.git
cd claude-code-canon

npm test               # 検査・スクリプト・自己適用のテスト
```

標準 Skill の導入、段の運用、マージと片付けは [guide/setup.md](guide/setup.md) を参照してください。

## ディレクトリ構成

- `.claude/` — 本体。段の Skill `canon-plan`・`canon-design`・`canon-build`、知識 Skill 5件と正典リファレンス `canon-reference`、その更新 Skill `canon-update`、Subagent 6体、
  保守用の Rule、`settings.json`（permissions だけ）。使い方は [.claude/README.md](.claude/README.md)
- `lib/` — スクリプトが共有するパーサと判定
- `tools/` — `new-run`・`preflight`・`inventory`・`impact`・`worktree`・`verify`・`check`・`approvals`・`handoff`・`token-usage`
- `tests/` — 検査・スクリプト・自己適用のテスト（`node --test`）。
  正典リファレンスの検査は `npm run reference-check`（`-- --online` で公式サイトとの照合も行う。手順は guide を参照）
- `design/` — 設計書（`architecture.md` 1冊）
- `guide/` — セットアップと運用の手順
- `tasks/lessons.md` — claude-canon 本体への改修要求の台帳
- `work/` — run の状態と中間物（gitignore）
- `.github/workflows/` — CI（`npm test`）

## ライセンス

[MIT License](LICENSE)
