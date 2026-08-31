# claude-canon `.claude/` 使用説明書

この文書は現行 `.claude/`（Subagent 19体・Skill 14件・Rule 4件・`settings.json` 1件）の**使い方**をまとめたものです。各コンポーネントの frontmatter から起動方式を機械的に導いて記載しています。

---

## 1. 何ができるか

この一式は、Claude Code のカスタマイズ一式（CLAUDE.md・Rules・Skills・Subagents・設定）を、対象プロジェクトの要件に合わせて調査・設計・生成・検証するための claude-canon 本体です。ユーザーが直接使う入口は次の3つの Slash Command です。

- `/canon` — 対象プロジェクトのパスを渡すと、調査・要件確定・仕様策定・設計・生成・検証・品質検査・配置までの10工程を、各人間ゲート（P1〜P8）で立ち止まりながら進めます。
- `/self-optimize` — claude-canon 自身の `.claude/` を対象に同じ工程を回し、`generations/candidate-<label>/` に次世代候補を用意します。候補を作るところまでで、現行 `.claude/` への実昇格（`npm run promote` の本実行）は行いません。
- `/update-docs` — `docs/` 配下の正典リファレンスを公式ドキュメントの一次ソースに照らして更新します。`/canon`・`/self-optimize` の実行フローには組み込まれていません。

これら3つの起動の裏側で、19体の Subagent がメイン Claude から場面ごとに自動的に呼び出され、調査・要件記録・仕様執筆・機能選定・設計・生成・検証・品質検査を分担します。ユーザーが Subagent を個別に起動する操作はありません。

このほかに、設計・生成・品質検査の判断基準（機能選定の基準、レイヤー構成や連携パターンの選び方、モデル階層の割当基準、既存カスタマイズの処遇判定基準、生成スキーマの規約、品質検査の観点定義、ヒアリング質問集など）を定めた11件の内部参照知識があります。これらは対応する Subagent が起動時に自動的に読み込むものであり、ユーザーが `/` コマンドや依頼文で直接呼び出す対象ではないため、以下の起動一覧には含めません。

---

## 2. どう起動するか

### Slash Command（明示起動のみ・自動では発動しない）

| コマンド | 引数 | 起動方式 |
|---|---|---|
| `/canon <target_project_path>` | 対象プロジェクトのパス | `/canon <target_project_path>` で明示起動。自動では発動しない。 |
| `/update-docs` | なし | `/update-docs` で明示起動。自動では発動しない。 |
| `/self-optimize <label>` | 候補世代のラベル（英数字と `-`/`_`） | `/self-optimize <label>` で明示起動。自動では発動しない。 |

### Rule（`.claude/rules/` 配下・自動ロード。ユーザーが個別に起動する対象ではありません）

| Rule | 適用範囲 | 内容 |
|---|---|---|
| `workflow` | 無条件（全ファイル） | 日本語応答・申し送りの裏取り・数量要約の数え直し・承認ゲートの規律等、claude-canon の開発作業全般に関わる規律。 |
| `gates-and-tests` | `gates/** tests/** eval/** tools/** deploy/**` | vacuous pass の回避・能力ベースの検出器設計・複製排除（`tests/helpers/*` への集約含む）・`git ls-files` ベースの走査・ts 名前空間の機械検査・追跡外コーパス不在時の明示スキップ・ゲートの人間オーバーライド手順・judge/ラベル不一致の裁定・隔離生成物の鮮度検出等、検証ハーネス実装の規律。 |
| `canon-docs` | `docs/**` | 一次ソースの不在と捏造の区別・WebFetch の網羅列挙の限界等、正典更新作業の規律。 |
| `worker-definitions` | `.claude/agents/** .claude/skills/** .claude/settings.json` | hooks 書式の落とし穴・ゲート変更のワーカー定義への追従・自己参照構造のトラップ対処等、ワーカー定義編集の規律。 |

### Subagent（メイン Claude が場面に応じて自動的に使う。ユーザーが直接起動する手順はありません）

| Subagent | メインが自動的に使う場面 |
|---|---|
| `investigator` | 調査工程1（ヒアリング前・浅く広く）の入口で、系統A・系統Bの並列調査を統括するために使われる。 |
| `existing-customization-analyzer` | `investigator` が系統A（既存カスタマイズの棚卸し）を必要とするときに使われる。 |
| `project-profiler` | `investigator` が系統B（プロジェクト実態の調査）を必要とするとき（工程1の "profile" モード）、および要件確定後の深掘り調査（工程3の "focused" モード）で使われる。 |
| `requirements-recorder` | ヒアリングでユーザーと合意済みの要件を `work/<ts>/requirements.md` に書き出す、工程2の最終アクションとして使われる。 |
| `spec-writer` | 調査結果と確定要件を統合して `output/<ts>/spec.md` を書く、工程4で使われる。 |
| `selector` | 承認済み仕様から使用するレイヤー機能を選ぶ、工程5で使われる。 |
| `designer` | 承認済み仕様と機能選定結果から `design-map.md`（設計判断）を書く、工程6で使われる。 |
| `generator` | 設計マップに基づき必要な Builder だけを起動して生成をまとめる、工程7で使われる。 |
| `l1-builder` | 生成対象に L1（CLAUDE.md・Rules）が含まれるとき、`generator` から工程7で使われる。 |
| `skill-builder` | 生成対象に Skills / Slash Commands が含まれるとき、`generator` から工程7で使われる。 |
| `agent-builder` | 生成対象に Subagent が含まれるとき、`generator` から工程7で使われる。 |
| `readme-writer` | 全 Builder が完了した後、この README.md 自体を書く工程7の最終ステップとして `generator` から使われる。 |
| `eval-reviewer` | 決定論ゲート（工程8）の後、P7ゲートの前に、5軸の品質検査（工程9）を統括するために使われる。 |
| `eval-correctness` | `eval-reviewer` が生成物と受け入れ基準(A1)の整合を判定させるときに使われる。 |
| `eval-security` | `eval-reviewer` が権限設計・安全性を判定させるときに使われる。 |
| `eval-canon` | `eval-reviewer` が正典の趣旨適合を判定させるときに使われる。 |
| `eval-context` | `eval-reviewer` がコンテキスト効率を判定させるときに使われる。 |
| `eval-keep-review` | `eval-reviewer` が維持判定の意味的妥当性を判定させるときに使われる。 |
| `canon-updater` | `/update-docs` からのみ使われる。`/canon`・`/self-optimize` の実行中に使われることはない。 |

---

## 3. 前提セットアップ

- **Hooks の配線**: `.claude/settings.json` に `UserPromptExpansion`・`PreToolUse`・`PostToolUse`・`SubagentStop`・`Stop`・`SessionStart` の各イベントが `node "${CLAUDE_PROJECT_DIR}/gates/*.js"` を直接呼び出す形で配線済みです。実行環境に Node.js が入っており、`gates/` 配下の参照スクリプトが存在し実行できる状態であることが前提です。新規の配線作業は不要です（既存のまま）。
- **MCP**: この一式に MCP サーバーの定義は含まれていません。シークレットや OAuth 認可のセットアップは不要です。
- **Experimental 機能**: この一式は Experimental 依存を含みません（`constraints.experimental.allowed: false` で使用しない方針が確定済み）。追加のフラグ設定は不要です。
- **Skill 内シェル実行**: `.claude/settings.json` の `disableSkillShellExecution: true` により、Skill 本文内の `!command` 形式のインラインシェル実行は使えません。

---

## 4. 使用例

`/self-optimize <label>` を実行すると、preflight（`<ts>` 採番＋sentinel・カナリア確認）を経て工程1（調査1）が走り、その完了直後・工程2（要件ヒアリング）開始前に C1/C5 の試し打ち手順が実行されます。手順は次のとおりです。

1. **対象を得る**: 工程1完了時点で既に存在する `work/<ts>/existing_customizations.md`（系統Aの成果物）を確認します。C5用の確認先は `fixtures/sample-repos/existing/expected-work/project_profile.md:15-16` という裸のパス+行範囲形式で明記されています。
2. **実行して観測する**: `gates/lib/investigation.js` の `parseSystemA`・`isCanonClean`（C1用）・`parseSystemB`（C5の書式契約確認用）を呼び出すスクリプトを `work/<ts>/` 配下に置いて `node` で実行します。
3. **結果を報告する**: `isCanonClean` が返した C1 の真偽と根拠キー、および C5 側の書式契約または fixture での確認結果をチャット上で報告します。keep/modify/merge/retire の最終判定自体は工程6の `designer` が行います。

この手順は次の2点を区別します。

- **C1**（`parseSystemA` + `isCanonClean`）は、工程1完了直後に既にある実データ（`work/<ts>/existing_customizations.md`）に対してそのまま確認できます。
- **C5**（`parseSystemB`）が要る `## focused`/`ref_resolution` は `requirements.md` 確定後（工程3）にしか書かれないため、工程1直後は fixture または書式契約の確認にとどまります。実データでの C5 検証（`resolved` の真偽が実際にどう出るか）は工程3（focused）以降に行われるものであり、本手順の C5 確認は書式契約の確認までが範囲です。

また、以降の各工程（工程2〜9）が読み書きするパスの一覧・規約は、`/canon` と共通の内部参照知識を通じて一貫した形で解決されるようになっています（利用者が個別に参照する対象ではありません）。

---

## 5. 注意・制約

- **PreToolUse はブロックする**: `Write`・`Edit`・`NotebookEdit`・`Bash`・`PowerShell`・`Monitor` の実行時に、書込範囲チェック（`/canon` 用・`/update-docs` 用・`/self-optimize` 用の3系統）・承認チェック・前進チェックが自動で走り、範囲外の操作はブロックされます。
- **UserPromptExpansion はブロックする**: `/canon`・`/update-docs`・`/self-optimize` の展開時に、ワーカー権限検査が自動で走ります。違反があれば run の開始自体がブロックされます。
- **PostToolUse はブロックしない**: `Write`・`Edit`・`NotebookEdit` の後に前進チェックが走りますが、この段階では止まりません。違反は記録され、`Stop` 時に権威判定されます。
- **SubagentStop・Stop はブロックする**: Subagent 終了時・ターン終了時に、完了リクエストの処理が自動で走ります。`Stop` は連続8回ブロックするとターンが強制終了します。
- **SessionStart はブロックしない**: セッション開始時に足場作りのみが行われます。
- **`/self-optimize` は実昇格しない**: 生成された候補は `generations/candidate-<label>/` に置かれるだけで、`npm run promote` の本実行（現行 `.claude/` への実際の入れ替え）は別の明示的な操作としてユーザーが行う必要があります。また、工程7完了後も `.self-optim` の印が残っている間は、`.claude/`・`docs/`・`gates/`・`tests/`・`generations/` への書込みが拒否され続けます。
- **`self-optimize/SKILL.md` の起動方法・引数**: `name`/`description`/`disable-model-invocation`/`user-invocable`/`argument-hint` の各 frontmatter により、`/self-optimize <label>` という呼び出し方のみが有効です。
- **`/canon` の委譲チェーンの外にあるもの**: `canon-updater` は `/update-docs` からのみ起動され、`/canon`・`/self-optimize` の実行中に自動的に使われることはありません。
- **人間ゲートは自動で進まない**: `/canon`・`/self-optimize` の各工程の切れ目（P1〜P7）では、チャット上でユーザーの確認を待って停止します。
