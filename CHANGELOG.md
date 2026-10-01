# Changelog

このファイルは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に、
[Semantic Versioning](https://semver.org/lang/ja/) を準拠のバージョニング規約として従います。

> **運用ルール**: 正典 `docs/` の更新履歴（Claude Code 公式仕様の確認バージョン・調査日）は
> `docs/SOURCES.md` が権威であり、本ファイルには書きません。本ファイルが記録するのは
> claude-canon 自身の変更だけです。

## [Unreleased]

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
