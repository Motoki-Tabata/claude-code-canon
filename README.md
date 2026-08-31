# claude-canon

[![CI](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml/badge.svg)](https://github.com/Motoki-Tabata/claude-code-canon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Claude Code のカスタマイズ一式（`CLAUDE.md` / Rules / Skills / Subagents / MCP / Hooks / Plugin）を、
対象プロジェクトごとに**半自律で構築するメタジェネレータ**です。自身も Claude Code のカスタマイズ
機構（Subagents・Skills・Slash Commands・Hooks）で構成される「メタシステム」であり、正典
`docs/` を唯一の参照源として動作します。

- **SSoT**: `docs/` 配下の正典リファレンス9ファイル＋一次ソース一覧 `docs/SOURCES.md`。生成物の
  合否判定の照合表もここから機械生成します（`npm run build:tables`）。
- **実行形態**: 工程ごとに人間の承認ゲートを挟む半自律（無人一気通貫ではありません）。
- **対象**: Claude Code（CLI / SDK / harness）。

設計は2冊構成です。全体像・工程順・オーケストレーション構造は
[design/basic-design.md](design/basic-design.md)、成果物フォーマットと決定論ゲートの実装契約は
[design/detailed-design.md](design/detailed-design.md) を参照してください。

## 10工程・人間ゲート

`/canon <target_project_path>` が調査から配置までの10工程を、各人間ゲート（P1〜P8）でチャット上の
確認を待って停止しながら進めます。

| # | 工程 | 人間ゲート |
|---|---|---|
| 1 | プロジェクト調査1（浅く広く・2系統） | P1 |
| 2 | 要件ヒアリング | P2 |
| 3 | プロジェクト調査2（深く狭く） | P3 |
| 4 | 要件定義 = spec | **P4（最重要）** |
| 5+6 | 機能選定 → 設計 = design-map | P5 |
| 7 | 生成（全量・README/MANIFEST を最終ステップ） | P6 |
| 8 | 検証（決定論ゲート） | — |
| 9 | 品質検査（eval・5軸 judge） | P7 |
| 10 | デプロイ（照合付き手動配置） | P8 |

決定論ゲート（工程8）と意味判断を要する eval（工程9）は別系統です。eval の非決定性で決定論検証を
汚さないための分離であり、eval が clean でも決定論ゲートのラッチが立てば前進しません。

対象プロジェクトに既存カスタマイズがある場合は、差分パッチではなく**既存＋新要件を入力に全体を
設計し直す**（全量スナップショット方式）動作になります。

## 使い方

- `/canon <target_project_path>` — 対象プロジェクトへのカスタマイズ一式の生成。
- `/self-optimize <label>` — claude-canon 自身の `.claude/` を対象に同じ工程を回し、次世代候補を
  `generations/candidate-<label>/` に用意します（実昇格は別途 `npm run promote`）。
- `/update-docs` — `docs/` 配下の正典リファレンスを公式ドキュメントの一次ソースに照らして更新します。

初回セットアップ・実行手順の詳細は [guide/setup.md](guide/setup.md) を参照してください。

> ⚠ **最重要**: 決定論ゲートは `.claude/settings.json` の hooks 配線で発火します。配線が死んで
> いると、ゲートが沈黙したまま全工程が「違反ゼロ」で通過する vacuous pass が起こり得ます。
> `settings.json` の自己検証は原理的に不可能なため、初回セットアップ時は必ず
> [guide/setup.md](guide/setup.md) の配線の実発火確認手順（`npm run smoke:arm`/`smoke:check`）を
> 実施してください。

## 前提

- Node.js v22 以上（`npm test` が `node --test` へグロブ文字列を直接渡す形式のため v20 系では動作しない）
- git（`docs/`・`.claude/`・`gates/` は git 管理。`output/`・`work/` は clone 時点で空ディレクトリとして
  存在し、中身のみ gitignore）
- **依存ゼロ**: `npm install` は不要（外部 npm パッケージを使わない設計。テストは Node 組み込み
  `node --test`）

## 導入

```bash
git clone https://github.com/Motoki-Tabata/claude-code-canon.git
cd claude-code-canon

npm run build:tables   # 正典から照合表を生成（初回・docs/ 変更のたびに必須）
npm test                # 配線テスト（必須の帯域外検証・§11.5）
```

`/canon` 実行前に hooks の実発火確認（`npm run smoke:arm`/`smoke:check`）が必要です。詳細は
[guide/setup.md](guide/setup.md) を参照してください。

`package.json` の全 npm scripts（機能X・機能Y・eval 用途を含む）は
[guide/setup.md §8](guide/setup.md#8-npm-scripts-一覧) の一覧表を参照してください。

## ディレクトリ構成

- `docs/` — 正典リファレンス（SSoT）
- `design/` — 設計書2冊（基本設計書・詳細設計書）
- `.claude/` — システム本体（Subagent 19体・Skill 14件・Rule 4件・hooks 配線）
- `gates/` — 決定論ゲート・判定ロジックの不変土台（機能Y 不可侵）
- `eval/` — 品質検査ハーネス（工程9）
- `deploy/` / `tools/` — 配置スクリプト・補助 CLI
- `tests/` — 自己検証テストランナー（`tests/helpers/` に共通ヘルパ: パス解決・sentinel退避復元・fixture生成・ts名前空間発行）
- `fixtures/` — 代表シナリオ・eval 較正コーパス
- `guide/` — 人間向け手順（セットアップ）
- `.github/workflows/` — 恒久 CI（照合表の鮮度検査 → `npm test`）
- `output/` / `work/` — run ごとの成果物・中間ファイル（中身は gitignore・`.gitkeep` で空ディレクトリのみ追跡）。
- `generations/`（gitignore・初回は不在）— 機能Y（自己最適化）の世代管理台帳。`npm run stage`/`promote`
  実行時に作成される。

詳細な配置根拠は [design/basic-design.md](design/basic-design.md) §14 を参照してください。

## ライセンス

[MIT License](LICENSE)
