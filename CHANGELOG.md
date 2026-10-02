# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に、
[Semantic Versioning](https://semver.org/lang/ja/) を準拠のバージョニング規約として従います。

> **運用ルール**: 正典 `docs/` の更新履歴（Claude Code 公式仕様の確認バージョン・調査日）は
> `docs/SOURCES.md` が権威であり、本ファイルには書きません。本ファイルが記録するのは
> claude-canon 自身の変更だけです。

## [Unreleased]

### Added

- **reviewer 用の review-bundle**: `npm run review-bundle -- <ts>` が `work/<ts>/review-bundle/reviewer/` に、判定の対象の全件
  （`INDEX.md`）・rationale を除いた設計意図（`design.md`）・受入基準（`acceptance.md`）を書きます。reviewer は
  design-map の全文と slices を読まなくなりました。keep-reviewer 用は従来どおり refactor モードのときだけ作ります。
- **Subagent `session-analyst`**: ヒアリングで過去のセッション履歴を要件の材料にするとき、分析と保存
  （`work/<ts>/session-analysis-<名前>.md`）を本人が行います。メインが分析の応答を逐語で書き写す手順をやめました。

### Changed

- **生成物の README の「使用例」**: spec の受入基準 A1 の転記をやめ、利用者が起動する Skill の起動行
  （`/名前 <argument-hint>`）を並べます。受入基準は run の道具で、配置後の README に置くと古いパスや番号を指したまま残るためです。
- **keep の K3（依存健全）**: keep にするテストが、同じ run で変える同梱データの件数や内容を固定していないかを
  designer が原本で確かめる項目を design Skill に足しました。
- **Phase C の品質検査**: 生成物に CLI・スクリプトがあれば、受入基準が求めていなくても、対象の現物に向けて1回実行し、
  出力を P4 に含めます。

### Fixed

- **`npm run tokens -- <session-id>`**: canon 以外のプロジェクト（対象プロジェクト）のセッションも解決します。
  canon のディレクトリに無ければ `~/.claude/projects/*` を横断し、複数見つかれば候補を挙げて止まります。

## [2.1.0] - 2026-10-01

run の置き場所を、canon と対象プロジェクトの2フォルダだけで完結する形に戻しました。2.0.0 で始めた run は引き継げません（新しい run を始めてください）。

### Changed

- **run は canon のルートで行います**: run ごとの worktree `../canon-runs/<ts>` とブランチ `run/<ts>` をやめました。
  すべての Phase を canon のルートで起動し、成果物は `work/<ts>`・`output/<ts>` に置きます。成果物はコミットしません。
- **canon の版の確認**: `npm run new-run` が run を始めたときの canon の HEAD を handoff.md の `canon_commit` に記録し、
  各 Phase の開始時に、canon 本体（`.claude/`・`lib/`・`gates/`・`tools/`・`docs/`）が変わっていれば差分を示して確認します。
- **canon 課題の記録**: run 中に見つけた canon 本体の問題は、その場で `tasks/lessons.md` に書きます。
  handoff.md の「canon 課題候補」と、Phase D の転記の工程は廃止しました。
- **品質検査**: reviewer の correctness・security に、生成物に含まれる実行コード（Hook のスクリプト・MCP の command）と
  `permissions` の確認を足しました。
- **`.claude/settings.json`**: `additionalDirectories`（`../canon-runs/`）と `git worktree list` の許可を外しました。

### Removed

- Phase C の `/security-review`・`/code-review`。run の成果物を追跡しないので差分が無く、確認の範囲は reviewer が受け持ちます。

## [2.0.0] - 2026-10-01

構成を作り替えました。フックと完了マーカーで工程を進める方式をやめ、Phase ごとのセッションで動くオーケストレーターと、
1本にまとめた検証 CLI、Agent Skills の仕様に沿った軽い構成にしています。設計は `design/architecture.md` と
`design/artifacts.md` の2冊にまとめ直しました。1.x からの run の引き継ぎはできません（新しい run を始めてください）。

### Changed

- **Phase A〜D とセッション**: 1つの Phase を1つのセッションで行い、ユーザーが `/canon-a <target>`・`/canon-b <ts>`・
  `/canon-c <ts>`・`/canon-d <ts>` で起動します。spec は Phase A で確定し、Phase B は承認済みの spec だけを入力にします。
- **番号を振り直しました**: 工程1〜9・人間ゲート P1〜P5（要件・spec・design-map・生成物とレビュー・配置）・
  verify の検査 V1〜V9・keep の条件 K1〜K5。報告だけだったゲートは廃止しました。
- **状態と承認**: run の状態は `work/<ts>/handoff.md` だけが持ちます（進捗・承認・差し戻し・申し送り・canon 課題候補）。
  承認は対象の sha256 を付けて記録し、次の Phase の開始時に照合します。承認の後で対象が変わっていれば無効です。
- **run の git 運用**: run ごとに worktree `../canon-runs/<ts>` とブランチ `run/<ts>` を作り、Phase の終わりごとに
  `work/<ts>`・`output/<ts>` をコミットします。run ブランチは push しません。
- **検証**: 成果物の検査を `npm run verify -- <ts>`（V1〜V9）の1本にまとめ、`verify-report.md` と exit code を返します。
  検査対象がゼロなら違反にし、検査した generated/ のハッシュを記録します。
- **品質検査**: reviewer（correctness・security・正典の意図・context）と keep-reviewer（K2・K4・merge 先）に、
  標準 Skill の `/claude-api prompt-audit`・`/security-review`・`/code-review` を加えました。指摘は修正ループで
  直してから P4 に出します。
- **Agent を17体から6体に**: `investigator`（existing・profile・focused の3モード）・`spec-writer`・`designer`
  （機能選定を含む）・`builder`（層を引数で受け、層ごとに並列に起動）・`reviewer`・`keep-reviewer`。
  ワーカーを束ねる中継役は置かず、オーケストレーターが直接起動します。
- **Skill を14件から9件に**: Phase Skill `canon-a`〜`canon-d` と、知識 Skill `investigation`・`requirements`・`design`・
  `generation`・`review`。書式の実例は各 Skill の `references/` に置きました。
- **スクリプトの置き場**: 入口は各 Phase Skill の `scripts/`、共有のパーサと管理パス集合は `lib/` に置きました。
  MANIFEST・README・配置リストは `emit-manifest.js` が決定論で生成します。
- **`.claude/settings.json`**: hooks を除き、permissions だけにしました（canon のスクリプトの許可、deploy の
  `--confirm` の拒否、`git push` の確認、run の worktree へのファイルアクセス）。

### Added

- `npm run new-run`（ts の採番・worktree・骨格・handoff.md の雛形）
- `npm run approvals`（承認行の記録と照合）
- `npm run review-bundle`（keep-reviewer の判定入力。designer の主張を機械的に除く）
- 自己適用テストに、ワーカーがコマンド実行系ツールを持たないことと、Phase Skill の構成の検査を追加

### Removed

- フックによる工程制御の全体（書込ガード・前進ガード・停止時の検査・完了マーカーとリクエスト・ブロックの記録・
  配線の生存確認・セッション開始時の初期化）と、その操作用の CLI（再検査・巻き戻し・ブロック解除・状態の記録・再開）
- 正典更新と自己最適化の専用コマンドと、その世代管理
- 5軸の評価ハーネス（判定の集約・round 管理・較正）
- テスト用のサンプル入力ディレクトリ（テスト入力は `tests/helpers` でインライン生成）
- 旧設計書（基本・詳細の2冊と、運用記録の文書）

### 移行

- 1.x の run の成果物はそのまま使えません。新しい run を `/canon-a` から始めてください。
- Phase C の標準 Skill のために、プラグイン `example-skills@anthropic-agent-skills` を入れてください（`guide/setup.md`）。

## 1.x

1.x 系の変更履歴は、タグ `v1.0.0` と、2.0.0 より前の main のコミット履歴を参照してください。
