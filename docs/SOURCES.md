---
title: Claude Code 正典リファレンス 一次ソース一覧
description: docs/ 配下の正典リファレンス本体9ファイル（SOURCES.md 自身を除く）の根拠となる公式ドキュメントURLおよび調査状況の管理ファイル。
  /update-docs 実行時に canon-updater Subagent が最初に読み込む。
last_verified: 2026-09-23
maintained_by: canon-updater（/update-docs 実行時に自動更新）
---

## 概要

このファイルは `docs/` 配下の正典リファレンス本体9ファイル（`SOURCES.md` 自身を除く）の根拠となる一次ソース URL を管理する。
`/update-docs` を実行すると `canon-updater` Subagent がこのファイルを読み込み、
各 URL を WebFetch/WebSearch で調査して変更差分を検出し、対応する正典ファイルを更新する。

**調査の優先順位**: 各エントリの `priority` に従う。`high` は毎回必ず調査、`medium` は変更の可能性があるとき、`low` は構造変更時のみ。

---

## L1_CONTEXT_MANAGEMENT.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/memory | Memory（CLAUDE.md・Rules・Skills・Auto Memory） | high |
| https://code.claude.com/docs/en/settings | Settings（settings.json・permissions） | medium |
| https://code.claude.com/docs/en/settings-reference | All settings（`claudeMdExcludes`・`pluginConfigs` の `agents-md@builtin` 等 L1 が依存する設定の一次ソース） | medium |
| https://code.claude.com/docs/en/context-window | Context window（コンテキスト予算・自動圧縮） | low |
| https://code.claude.com/docs/en/prompt-caching | Prompt caching（キャッシュ挙動） | low |
| https://code.claude.com/docs/en/sessions | Sessions（セッション永続化・resume） | low |
| https://code.claude.com/docs/en/checkpointing | Checkpointing（変更の巻き戻し） | low |
| https://code.claude.com/docs/en/claude-directory | `.claude/` ディレクトリ構造の全体像 | low |

---

## L2_SKILLS.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/skills | Skills（SKILL.md frontmatter・context:fork・preload） | high |
| https://code.claude.com/docs/en/commands | Slash Commands（/name・arguments・disable-model-invocation） | high |
| https://code.claude.com/docs/en/code-review | `/code-review` の引数仕様（low/medium/high/xhigh/max/ultra・--fix・--comment） | low |
| https://code.claude.com/docs/en/ultrareview | `/code-review ultra` のクラウドレビュー詳細 | low |
| https://code.claude.com/docs/en/agent-sdk/skills | Agent SDK の Skill 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## L3_AGENTS.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/sub-agents | Subagents（frontmatter・tools・delegation・nesting既定3階層可変・fork） | high |
| https://code.claude.com/docs/en/agent-view | Agent View（バックグラウンドセッション一覧・引き続きResearch Preview） | medium |
| https://code.claude.com/docs/en/agent-teams | Agent Teams（Experimental・複数インスタンス協調） | low |
| https://code.claude.com/docs/en/worktrees | Worktrees（git worktree・isolation・bgIsolation） | medium |
| https://code.claude.com/docs/en/workflows | Dynamic Workflows（Claude 生成の .js スクリプトで Subagent を大規模制御・/workflows・ultracode・自動生成対象外） | medium |
| https://code.claude.com/docs/en/env-vars | 環境変数一覧（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`・`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`・`CLAUDE_CODE_FORK_SUBAGENT`・`CLAUDE_CODE_SUBAGENT_MODEL` 等の正式定義）。**WebFetch では表の途中で truncate し対象行に到達できない**（2026-09-23 時点・4回試行）。別経路での確認が要る | high |
| https://code.claude.com/docs/en/model-config | Model config（モデルエイリアスの解決先・`CLAUDE_CODE_SUBAGENT_MODEL` / `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` / `ANTHROPIC_DEFAULT_MODEL` の定義。`env-vars` が取得できないときの代替一次ソース） | high |
| https://code.claude.com/docs/en/cross-session-messaging | Cross-session messaging（他セッションへの直接メッセージ送信・L3新規パターン候補） | low |
| https://code.claude.com/docs/en/agent-sdk/subagents | Agent SDK の Subagent 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## L4_AUTOMATION.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/hooks | Hooks（33イベント・5ハンドラー・matcher・exit code・settings.json配線） | high |
| https://code.claude.com/docs/en/mcp | MCP Servers（transport・scope・OAuth・.mcp.json） | high |
| https://code.claude.com/docs/en/managed-mcp | Managed MCP（組織による固定server set配布・allowedMcpServers/deniedMcpServers） | medium |
| https://code.claude.com/docs/en/channels | Channels（Research Preview・リモート連携） | low |
| https://code.claude.com/docs/en/channels-reference | Channels 詳細リファレンス（Permission Relay のサニタイズ/マスキング仕様） | low |
| https://code.claude.com/docs/en/hooks-guide | Hooks ガイド（hooks.md とは別立ての導入ガイド） | low |
| https://code.claude.com/docs/en/routines | Routines（クラウド常駐スケジュール実行。scheduled-tasksの主要後継） | low |
| https://code.claude.com/docs/en/scheduled-tasks | Scheduled tasks（`/loop` のリファレンス） | low |
| https://code.claude.com/docs/en/agent-sdk/hooks | Agent SDK の Hooks 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |
| https://code.claude.com/docs/en/mcp-quickstart | MCP 導入ガイド（`mcp` とは別立て） | low |
| https://code.claude.com/docs/en/agent-sdk/tool-search | Agent SDK の Tool Search 仕様（§2.2「Tool Search（既定 ON）」の一次ソース） | low |

---

## L5_DISTRIBUTION.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/discover-plugins | Plugins 概要・インストール | medium |
| https://code.claude.com/docs/en/plugins-reference | Plugin 仕様（manifest・.claude-plugin/・plugin root・Agent制約） | high |
| https://code.claude.com/docs/en/plugin-marketplaces | Marketplace 配布（archive/commandソース・GitLab対応・owner wildcard） | low |
| https://code.claude.com/docs/en/plugin-dependencies | Plugin依存関係解決（semver範囲・gitタグ解決） | medium |
| https://code.claude.com/docs/en/statusline | Status Line（Plugin UI拡張） | low |
| https://code.claude.com/docs/en/output-styles | Output Styles（Themes・Experimental） | low |
| https://code.claude.com/docs/en/plugins | Plugin作成ガイド（discover-plugins/plugins-referenceとは別立て） | low |
| https://code.claude.com/docs/en/plugin-evals | Plugin evals（`claude plugin eval`・manifest の `experimental.evals`） | medium |
| https://code.claude.com/docs/en/plugin-hints | Plugin hints（CLI からの自プラグイン推奨） | low |
| https://code.claude.com/docs/en/plugin-relevance | Plugin relevance（組織向けプラグイン推奨） | low |
| https://code.claude.com/docs/en/agent-sdk/plugins | Agent SDK の Plugin 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## ORCHESTRATION.md の一次ソース

> ORCHESTRATION.md は複数の公式ドキュメントを横断して整理したファイル。
> 以下は特にオーケストレーション設計に関係する URL。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/sub-agents | Subagent delegation パターン | high |
| https://code.claude.com/docs/en/skills | Skill inline 実行・context:fork パターン | high |
| https://code.claude.com/docs/en/agent-teams | 多層オーケストレーション（Agent Teams 経由） | low |
| https://code.claude.com/docs/en/commands | Slash Command 実行モデル | medium |

---

## BEST_PRACTICES.md の一次ソース

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/best-practices | 公式ベストプラクティス（コンテキスト管理・Subagent採用判断） | high |
| https://code.claude.com/docs/en/how-claude-code-works | Claude Code の動作原理 | medium |
| https://code.claude.com/docs/en/security | セキュリティアーキテクチャ（Manual/Auto権限・sandbox・プロンプトインジェクション対策） | high |
| https://code.claude.com/docs/en/permission-modes | Permission modes（default/acceptEdits/auto/dontAsk/bypassPermissions/plan/manual の全値集合・auto modeの既定化） | high |
| https://code.claude.com/docs/en/features-overview | 機能比較・トリガー表（00_INDEX §4フローチャートの一次ソース候補） | medium |
| https://code.claude.com/docs/en/common-workflows | 実践ワークフローレシピ集（scheduled実行4択比較表等） | low |
| https://code.claude.com/docs/en/sandboxing | Sandbox 設定の一次ソース候補（§7.5 の設定キー群がこのページか settings-reference のいずれに属すか未確認・要継続調査） | medium |
| https://code.claude.com/docs/en/sandbox-environments | Sandbox 実行環境の詳細 | low |
| https://code.claude.com/docs/en/auto-mode-config | Auto mode の設定詳細（`disableAutoMode` 等） | medium |
| https://code.claude.com/docs/en/large-codebases | 大規模コードベース向けワークフロー | low |
| https://code.claude.com/docs/en/goal | `/goal`（§1.3 の検証手段・hooks 系設定との相互作用） | medium |
| https://code.claude.com/docs/en/headless | Headless（§6.1 非対話実行） | low |
| https://code.claude.com/docs/en/agent-sdk/permissions | Agent SDK の Permission 仕様（本システムが動作する SDK/harness 側の一次ソース） | low |

---

## 00_INDEX.md の一次ソース

> 00_INDEX.md は docs/ 全体の索引・用語集・機能選択フローを整理したファイル。
> 以下は全体構造の把握に必要な URL。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/ | 公式ドキュメントトップ（全体目次） | high |
| https://code.claude.com/docs/llms.txt | 機械読取用ドキュメント一覧 | high |
| https://code.claude.com/docs/en/changelog | Changelog（新機能・仕様変更の検知） | high |
| https://code.claude.com/docs/en/agents | Subagent/Agent View/Agent Teams/Dynamic Workflows横断ハブページ（§8対応表への追加候補） | medium |
| https://code.claude.com/docs/en/settings-reference | settings.json 全フィールドの横断リファレンス（`extraKnownMarketplaces`・`claudeMdExcludes`・`disableCommandPluginSources` 等の一次ソース） | medium |
| https://code.claude.com/docs/en/cli-reference | CLI フラグの横断リファレンス | low |
| https://code.claude.com/docs/en/interactive-mode | 対話モードの操作リファレンス | low |
| https://code.claude.com/docs/en/errors | エラーメッセージ・トラブルシューティングの横断リファレンス | low |
| https://code.claude.com/docs/en/whats-new/index | What's new（週次リリースノートの索引。個別週の URL はここから解決する） | low |
| https://code.claude.com/docs/en/glossary | 用語集 | low |

---

## TOOLS.md の一次ソース

> TOOLS.md は Claude Code の正規ツール名46種を同定する横断リファレンス。
> ツール名は L1（settings `permissions`）・L2（Skill `allowed-tools`）・L3（Subagent `tools`）・
> L4（Hook matcher・MCP）の4レイヤーから参照されるため、単一レイヤーに属さない。

| URL | 内容 | priority |
|---|---|---|
| https://code.claude.com/docs/en/tools-reference | Tools reference（正規ツール名の網羅表・Permission required 列）**総数は公式が宣言しないため毎回再計数する** | high |
| https://code.claude.com/docs/en/sub-agents | Subagents（`Task`→`Agent` 改名・Subagent 非提供ツール・`tools` 省略時の全継承） | high |
| https://code.claude.com/docs/en/permissions | Permissions（MCP 命名規約 `mcp__<server>__<tool>`・glob の可否） | high |
| https://code.claude.com/docs/en/artifacts | Artifacts（`Artifact` ツールおよび `/design` bundled skill の一次ソース） | low |
| https://code.claude.com/docs/en/advisor | Advisor（`/advisor`。`tools-reference` の表には現れないため、ツール名として扱うかは未確定） | low |

---

## 調査手順（canon-updater 向け・機能X 実装契約・詳細設計書 §13.1）

`/update-docs` 実行時、`canon-updater` は2フェーズに分けて調査・更新を行う（更新ゲートの人間承認を挟む）。

**フェーズ1（調査・差分提案）**:
1. このファイル（`docs/SOURCES.md`）を Read で読み込む
2. `priority: high` の URL から順に WebFetch（失敗時は WebSearch で補う）で内容を取得する
3. 対応する `docs/` ファイルの現在の内容と比較し、変更差分**候補**を特定する（採否は判定しない）
4. `work/<ts>/canon-diff-proposal.md`（固定フォーマット・`.claude/agents/canon-updater/canon-updater.md` 参照）を書く。**この時点では `docs/` を書き換えない**（提案完了時に `canon-guard` が、採番時点の `docs/` スナップショットとの差分がないことを照合し、差分があれば停止をブロックする）

**更新ゲート（人間承認・唯一の関門）**: ユーザーとの対話で採否と breaking 判定を確定し、`work/<ts>/state.md` に記録する。

**フェーズ2（承認差分の反映）**:
5. 承認された差分のみを正典ファイルへ反映し、`last_verified`／確認バージョン欄を今日の日付・値に書き換える
6. このファイルの更新履歴に investigated_at の行を追記する
7. `npm run build:tables` で照合表を再生成する

**注意事項**:
- **WebFetch は長大な公式ページの網羅列挙で不安定**（実在しないコマンド名・実在しない環境変数名・実在しないページへのリンクの混入を複数回観測済み）。単発の結果を鵜呑みにせず、複数回突合するか公式が総数を明記するページを優先する
- **ページの自己申告する合計値と実列挙が食い違う場合は実列挙を優先する**。合計値は要約モデルの集計であり取得のたびに揺れるが、行単位の列挙は複数回の独立取得で安定して一致する。列挙専用プロンプト（「表の該当列のみを1行1件で出力し、集計はするな」）が最も安定する
- ツール総数・Hook イベント数・`[要確認]` マーカー総数などの**数え値は毎回再計数する**（前回の値をそのまま転記しない）
- WebFetch が失敗した URL は `[要確認]` 注記を対応する正典ファイルに追記し、スキップする
- 正典ファイルの構造（セクション番号・メタ情報）は維持したまま内容のみ更新する
- Experimental/Preview の区分変更（GA昇格等）は特に重点的に確認する

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-08-29 | 初版（v2.1.251 時点の一次ソース調査） |
| 2026-09-04 | `subagent_type` の登録可否に関する論点のみを調査（部分更新）。ファイル定義 agent が `subagent_type` として登録されるかは実行環境の種別ではなく `settingSources` の指定・ディレクトリ監視の状態・frontmatter の妥当性・programmatic 定義との名前衝突で決まる、という一次ソースの記述を確認。これに伴い `L3_AGENTS.md §2.1`（運用ノート2箇所）・`00_INDEX.md §9`（用語集 `subagent_type` 行）・`ORCHESTRATION.md §2.3` の「SDK/harness 環境では未登録」という環境種別による断定を、ネイティブ `subagent_type` 優先＋未登録環境に限るフォールバックの両対応表現へ改めた。あわせてフォールバック時に `general-purpose` の `tools: *` が G13 のコマンド実行系ツール剥奪を無効化する旨の明示を4箇所へ追加。調査した一次ソース: https://code.claude.com/docs/en/agent-sdk/claude-code-features ／ https://code.claude.com/docs/en/agent-sdk/subagents ／ https://code.claude.com/docs/en/agent-sdk/typescript ／ https://code.claude.com/docs/en/sub-agents ／ https://code.claude.com/docs/en/changelog 。**確認バージョンは v2.1.251 のまま据え置き**（本 run は本論点に限定した部分調査であり、v2.1.252〜259 の全変更を突合していないため） |
| 2026-09-23 | **v2.1.251 → v2.1.280 への全面更新**（investigated_at: 2026-09-23）。正典本体9ファイル全ての「確認した Claude Code バージョン」「調査日」を更新した。<br><br>**⚠ breaking 変更2件**:<br>1. **AGENTS.md の読み込み仕様**: 旧正典は「公式は Claude Code が読むのは `CLAUDE.md` であって `AGENTS.md` ではないと明言している」と断定し、インポートと symlink の2手段のみを示していた。**v2.1.277 以降、Claude Code は既定で `AGENTS.md` を直接読む**（作業ディレクトリとその上位に `CLAUDE.md`/`.claude/CLAUDE.md`/`CLAUDE.local.md` が無い場合）。`/config` の **Project instructions**（`claude-md-or-agents-md` 既定 / `claude-md-and-agents-md` / `claude-md` / `managed-only`）と `pluginConfigs` の `agents-md@builtin` で制御する。`CLAUDE.local.md` を置くと `AGENTS.md` が読まれなくなる点に注意。**旧記述に依拠して「AGENTS.md は読まれない」と設計した成果物は前提が崩れている**。<br>2. **`/output-style` コマンドの存在**: 旧正典は「`/output-style` コマンドは存在しない」と断定していた。**v2.1.269 以降 `/output-style <style>` が存在する**（引数なしで一覧表示、非対話モード・Agent SDK・Remote Control でも動作、選択は `.claude/settings.local.json` に保存）。**旧記述に依拠して `/output-style` を「非実在コマンド」として扱った成果物は誤り**。<br><br>**主要な差分**:<br>・**正規ツール総数を46種に確定**（権限要 14 ＋ 権限不要 32）。`SubagentHandback` を新規追加。3回の独立取得で行単位照合が一致したことを根拠とし、ページの自己申告合計値（47）は採用しなかった。この照合規律（自己申告合計と実列挙が食い違えば実列挙を優先）を TOOLS.md §3 に明文化した。<br>・**Hook イベント総数を33種に確定**。`PreModelSwitch` / `PostModelSwitch` を UI・コンテキスト層へ追加（5種→7種）。2026-08-29 版から持ち越していた「changelog は追加を宣言するが hooks ページに現れない」という矛盾は、`hooks` ページ側の更新により解消。<br>・**`CLAUDE_CODE_SUBAGENT_MODEL` の優先順位の矛盾が解消**。解決順序は per-invocation → frontmatter（`inherit` 含む）→ 環境変数 → メイン会話。`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` を新規収録。<br>・**モデルエイリアスの解決先を更新**: `opus` → Opus 5.5（Microsoft Foundry のみ Opus 4.6）、`sonnet` → プロバイダ別（Sonnet 5 / 4.6 / 4.5）、`fable` → Fable 5.1。旧記述の「Opus 5 / Bedrock は Opus 4.8」「Fable 5」を差し替え。<br>・Subagent frontmatter に `omitClaudeMd` を追加。Subagent 非提供ツールから `TaskOutput` が外れ9種→8種。background subagent の保持ツールに `LSP` と `SubagentHandback` を追加。<br>・Output style に `Concise` を追加（Default + 4種）。切替の反映が「次のメッセージから」に変更。<br>・Plugin agent のサポートフィールドに `omitClaudeMd`/`color`/`experimental` を追加、`initialPrompt` を非対応として明記。Plugin manifest に `$schema`/`metadata`/`defaultEnabled`/`workflows`/`experimental.evals` を収録。<br>・auto mode の起動既定を精緻化（`auto` は Pro/Max/Team のターミナル・VS Code のみ。**Enterprise プランと Claude Console API キーは `default`**）。分類器のサーバーサイド実行・`CLAUDE_CODE_AUTO_MODE_SERVER`・`/status` の `Auto mode server` 行を追加。<br>・bundled skill に `/design` を追加。`/code-review --comment` の GitLab 対応、`/doctor` の診断範囲拡張を反映。<br>・`llms.txt` 突合により一次ソース13件を新規登録（`plugin-evals`・`plugin-hints`・`plugin-relevance`・`goal`・`headless`・`artifacts`・`advisor`・`mcp-quickstart`・`agent-sdk/skills`・`agent-sdk/plugins`・`agent-sdk/tool-search`・`whats-new/index`・`settings-reference` の L1 側追加）。00_INDEX §8.1 の未登録ページ一覧は26件→19件へ。<br>・00_INDEX §10 の `[要確認]` 台帳から3項目（Channels ページの配置・`PreModelSwitch`/`PostModelSwitch`・`CLAUDE_CODE_SUBAGENT_MODEL` 優先順位）を解決済みへ書き換えた。<br><br>**⚠ 次回への申し送り（未解決事項）**:<br>1. **`env-vars` ページに到達できていない**。2種類のプロンプトで計4回試行したが、いずれも環境変数表の途中で truncate され、`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` / `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` / `CLAUDE_CODE_FORK_SUBAGENT` / `CLAUDE_CODE_SUBAGENT_MODEL` / `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` / `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` / `CLAUDE_CODE_MCP_STARTUP_WAIT_MS` / `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` / `CLAUDE_CODE_AUTO_MODE_SERVER` のいずれの行文言も確定できていない。**うち3回目の試行は実在しない変数名（`CLAUDE_CODE_MAX`）と `llms.txt` に存在しないページへのリンク（`effort-levels`・`tmux`・`ide-auto-connect`）を含む confabulation を返したため全面破棄した**——環境変数表でも「実在しない名前の混入」が起きることの実測例である。次回は WebFetch 以外の経路（公式リポジトリ等）での確認を検討すること。なお `CLAUDE_CODE_SUBAGENT_MODEL` の定義自体は `model-config` ページから逐語取得できており、優先順位の論点は確定済み。<br>2. **`commands` ページの網羅列挙ができていない**。列挙専用プロンプトでもアルファベット順 `/add-dir`〜`/plan` の63件で打ち切られ、`/q` 以降に到達できなかった。**bundled skill の総数・組み込みスラッシュコマンドの総数はいずれも数えられていない**ため、L2 §2.3 の「総数を記載しない」方針を維持している。この列挙で視認された未収録コマンド名のうち他の一次ソースで裏が取れた `/output-style`・`/design`・`/advisor`・`/cd` の4件のみを採用し、残り（`/auto-mode-setup`・`/insights`・`/passes` 等）は単発の列挙を根拠にしないため**採用を見送った**。次回再確認すること。<br>3. **`permission-modes` ページの後半が未読**。応答が大きく、逐語確認は冒頭〜"Switch permission modes" のタブ群に限られた。"How the classifier evaluates actions" 以降に差分がある可能性は排除できない。<br>4. **`auto-mode-classifier-billing` の実在が未確認**。`changelog` v2.1.278 が `https://code.claude.com/docs/en/auto-mode-classifier-billing` を参照するが、このページは今回取得した `llms.txt` の一覧に現れない。実在と内容を確認するまで一次ソースとして登録していない。<br>5. priority: low の URL は変更の兆候が見えた4件（`model-config`・`output-styles`・`llms.txt`・`changelog`）のみ追加調査した。未取得の low ページについて不在証明は成立しない。 |
