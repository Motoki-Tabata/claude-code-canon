# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に、
[Semantic Versioning](https://semver.org/lang/ja/) を準拠のバージョニング規約として従います。

> **運用ルール**: 正典 `docs/` 配下（Claude Code 公式仕様の確認バージョン・調査日）の更新履歴は
> `docs/SOURCES.md` が権威であり、本ファイルには書きません。本ファイルが記録するのは
> claude-canon 自身（本リポジトリ）の変更のみです。

## [Unreleased]

### Fixed

- **G3 が正典の許可する skill supporting files を弾いていた**（`gates/g3_path_convention.js`）:
  `.claude/skills/<name>/template.md`・`examples/*.md` を「ファイル名は固定 `SKILL.md`」として
  一律違反にしていたが、正典 `docs/L2_SKILLS.md §2.1`「ディレクトリ構造」はこれらを明示的に
  許可しており、G7 の判定④は逆に**その実在を要求**していた（ゲート間の正面衝突）。
  許可の出典を `gates/conformance_tables/paths.json` の `kinds.skill.package_layout` として
  正典から抽出し（`build-conformance-tables.js`）、G3 を定義ファイルのみに狭めた。
  併せて `.claude/skills/skill-generation/SKILL.md` の誤った出典（§2.3 → §2.1）を訂正。
- **旧規則が副作用で担っていた保証を明示化**（`gates/g7_ref_integrity.js`）: G7 に判定⑥
  「skill パッケージに定義ファイル `SKILL.md` が実在する」を新設。綴り違い（`Skill.md`）による
  サイレント不発火を検出する。実在判定は大小無視 FS（Windows）を避けてディレクトリエントリ名の
  完全一致で行う。
- **`walkManaged` が stat 不能なエントリ1件で配置を完全にブロックしていた**
  （`gates/lib/managed-paths.js`・`deploy/pre-deploy-check.js`）: 走査が全エントリへ
  `statSync` を try/catch 無しで呼んでいたため、ソケット・FIFO・権限拒否・走査中に消えた
  ファイルが1つあるだけで走査全体が中断していた。`deploy/deploy.js` も同じ走査を共有するため
  **迂回経路が無く**、P8 の uncaptured 安全網ごと配置が実行不能になる。実測は
  `/canon run 20260903_091044`——対象リポジトリの socket 様エントリ14件（全て `EACCES`）で
  `pre-deploy-check` が `EACCES: permission denied, stat` を投げて落ちた。
  走査根を `managedRoots()`（`MANAGED_PATTERNS` から機械導出・走査根を二重管理しない）へ限定し、
  ツリー全体の再帰をやめた。読めないエントリは走査を止めず `unreadable` として記録し、
  `pre-deploy-report` が**本照合の盲点として明示**する（黙って 0 件と報告しない）。

### Changed

- **管理パス集合に `.claude/hooks/**` を追加**（`gates/lib/managed-paths.js`・詳細設計書 §10.1）:
  正典 `docs/L4_AUTOMATION.md §2.1` の公式例が hook ハンドラ実体をこの位置に置くため、集合外の
  ままでは正典どおりの生成物が G9 で弾かれ、`settings.json` だけが配置されて参照先スクリプトが
  配置されない壊れた配線を deploy が作っていた。**退避スワップの管理範囲が広がる**点は
  `deploy/pre-deploy-check.js` の uncaptured 判定（exit 2・P8）が引き受ける。
- 非スキーマ判定の SSoT（`gates/lib/non-schema.js`）が、固定名3件に加えて skill supporting files と
  `.claude/hooks/**` をパターンで持つようになった（判定の複製を増やさないため）。

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
