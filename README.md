# claude-canon

[![CI](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml/badge.svg)](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Claude Code のカスタマイズ一式（`CLAUDE.md`・Rules・Skills・Subagents・MCP・Hooks・Plugin）を、
対象プロジェクトごとに**半自律で構築するメタジェネレータ**です。工程ごとに人間の承認を挟み、
無人で最後まで走らせることはしません。

- **SSoT**: 正典リファレンス `.claude/skills/canon-reference/`（Claude Code の公式仕様を12機能ごとに整理した
  `references/`、機械可読の一覧 `data/`、一次ソースと版 `sources.json`）。生成物の検査は `data/` を直接読みます。
- **成果物**: 対象プロジェクトに配置するファイル一式と、なぜその構成にしたかの記録（spec・design-map・
  MANIFEST）、使い方の説明（README）、配置の手順と照合結果。
- **既存のカスタマイズがある場合**: 差分パッチではなく、既存と新しい要件から全体を設計し直し、
  配置後の全量を出力します（全量スナップショット方式）。

設計は2冊です。全体像・Phase と工程・責務・run の運用は [design/architecture.md](design/architecture.md)、
成果物の書式・検査・配置の契約は [design/artifacts.md](design/artifacts.md) にあります。

## Phase A〜D

1つの Phase を1つのセッションで行います。状態は `work/<ts>/handoff.md` と各成果物のファイルが持つので、
Phase の境界でセッションを切っても失うものはありません。

| Phase | 起動 | 工程 | 人間ゲート | 推奨モデル |
|---|---|---|---|---|
| A | `/canon-a <target>` | 1 調査①（既存の棚卸しとプロジェクトの実態）→ 2 要件ヒアリング → 3 調査②（要件に関係する箇所の深掘り）→ 4 spec | P1 要件・P2 spec | opus |
| B | `/canon-b <ts>` | 5 機能選定と設計（design-map） | P3 design-map | opus |
| C | `/canon-c <ts>` | 6 生成 → 7 検証（verify）→ 8 品質検査と修正ループ | P4 生成物とレビュー | sonnet |
| D | `/canon-d <ts>` | 9 配置前照合 → 配置（人間が sandbox の外で実行）→ 配置後の手順 | P5 配置 | sonnet |

- **検証と品質検査は別系統**です。検証（`npm run verify`）は機械的に真偽が決まる V1〜V9 を判定し、
  品質検査（reviewer・keep-reviewer と、標準 Skill の `/claude-api prompt-audit`）は意味の判断を扱います。レビューは verify が見た項目を判定し直しません。
- **承認は handoff.md に sha256 付きで記録**し（`npm run approvals`）、次の Phase の開始時に照合します。
  承認の後で対象が変わっていれば、承認は無効です。
- **run は canon のルートで行います**。成果物は `work/<ts>`・`output/<ts>` に置き、git では追跡しません。
  run を始めたときの canon のコミットを handoff.md に記録し、Phase の開始時に canon 本体が変わっていれば警告します。
- フックは使いません。工程の順序と承認は対話と handoff.md で扱います（理由は architecture.md §9）。

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

標準 Skill の導入、Phase A〜D の運用、配置、run の片付けは [guide/setup.md](guide/setup.md) を参照してください。

## ディレクトリ構成

- `.claude/` — 本体。Phase Skill `canon-a`〜`canon-d`（`scripts/` を含む）、知識 Skill 5件と正典リファレンス `canon-reference`、その更新 Skill `canon-update`、Subagent 8体、
  保守用の Rule、`settings.json`（permissions だけ）。使い方は [.claude/README.md](.claude/README.md)
- `lib/` — スクリプトが共有するパーサと管理パス集合
- `tools/` — `approvals.js`（承認の記録と照合）・`check.js`（requirements・spec・design-map の機械点検）・`handoff.js`（handoff.md の更新）・`token-usage.js`（セッションのトークン消費の集計）
- `tests/` — 検査・スクリプト・自己適用のテスト（`node --test`）
- `design/` — 設計書2冊
- `guide/` — セットアップと運用の手順
- `tasks/lessons.md` — claude-canon 本体への改修要求の台帳
- `work/`・`output/` — run の中間物と成果物（gitignore）
- `.github/workflows/` — CI（`npm test`）

## ライセンス

[MIT License](LICENSE)
