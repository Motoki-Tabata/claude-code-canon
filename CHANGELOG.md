# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に、
[Semantic Versioning](https://semver.org/lang/ja/) を準拠のバージョニング規約として従います。

> **運用ルール**: 正典 `docs/` 配下（Claude Code 公式仕様の確認バージョン・調査日）の更新履歴は
> `docs/SOURCES.md` が権威であり、本ファイルには書きません。本ファイルが記録するのは
> claude-canon 自身（本リポジトリ）の変更のみです。

## [1.0.0] - 2026-08-31

### Added

- **10工程パイプライン**（`/canon <target_project_path>`）: プロジェクト調査（2系統×2段）→
  要件ヒアリング → spec 策定 → 機能選定+設計（design-map）→ 生成 → 決定論ゲート検証 →
  eval 品質検査 → 配置まで、人間ゲート P1〜P8 で確認を挟みながら半自律で構築。
- **決定論ゲート G1〜G16** と PreToolUse 3ガード（write-scope / approval / advance）による
  vacuous pass 対策二重化: `.claude/settings.json` の hooks 配線と、run 内のランタイム・
  カナリア（工程1直前）で配線の実発火を検証。
- **eval 品質検査**（工程9・5軸: correctness / security / canon / context / keep-review）と
  ラベル付きコーパスによるメタ評価（judge の precision/recall 較正）。
- **機能X（正典更新・`/update-docs`）**: `docs/` 配下9ファイルを公式ドキュメントの一次ソースに
  照らして更新するワークフロー。差分候補の提示 → 承認 → 適用 → G14〜G16 検証。
- **機能Y（自己最適化・`/self-optimize`）**: claude-canon 自身の `.claude/` を対象に同じ10工程を
  回し、`generations/candidate-<label>/` へ次世代候補を用意。世代管理台帳・実昇格機構
  （`npm run promote`・乖離検出・失敗時自動ロールバック）を含む。
- **配置系**（工程10）: `deploy/pre-deploy-check.js` による取りこぼし（uncaptured）照合と、
  退避スワップ方式（`.claude-canon.bak.<ts>/`）の `deploy/deploy.js`。
- **自己検証スイート**: `npm test`（Node 組み込み `node --test`）394件。配線テスト・
  ゲート単体テスト・代表シナリオ統合テスト・自己適用回帰テストを含む。
- **依存ゼロ設計**: 外部 npm パッケージを使用しない（`npm install` 不要）。
