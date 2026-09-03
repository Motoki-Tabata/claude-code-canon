---
name: canon
description: Run the full claude-canon pipeline (10 stages) to build a Claude Code customization set for a target project from a natural-language request. Use only when the user invokes /canon with a target project path. Drives investigation, requirements, spec, design, generation, verification, quality review, and deployment, stopping at each human gate P1-P8.
disable-model-invocation: true
user-invocable: true
argument-hint: "<target_project_path>"
---

# canon（10工程オーケストレータ）

メイン Claude が **inline 実行**する Slash Command。`context: fork` は付与しない（fork すると Skill が Subagent 化し、工程2ヒアリングの inline 会話履歴継承が失われる — 基本設計書 §4.1）。

> 本ファイルには「いつ・どの Subagent を・どの順序で・どんなプロンプトで起動し、どこで停止して人間ゲートを取るか」だけを書く。判断内容（ヒアリング質問・機能選定の決定木・モデル割当・維持判定条件）は各 Skill に閉じる（§3.1）。

## 参照正典
- `00_INDEX.md §4`（機能選択フロー）・`§4.4`（強度3段階）
- `L3_AGENTS.md §2.1`（Subagent 起動・model ティア・nesting 上限=既定3階層・可変）
- `L4_AUTOMATION.md §2.1`（Hooks 発火・exit code）
- 基本設計書 §2（工程順）・§4（オーケストレーション）・詳細設計書 §11（ゲート）

## この Skill が前提とする契約（実装済み・変更禁止）

1. **G13（preflight）は本 Skill の展開時に自動発火する**。`/canon` の `UserPromptExpansion` で `gates/g13_worker_privilege.js` が走り、claude-canon 自身のワーカー定義（`.claude/agents/**`）の `tools:` にコマンド実行系ツール（Bash/PowerShell/Monitor）が1つでもあれば **exit 2 で run の開始自体がブロックされる**。本 Skill 本文はその後に実行される。
2. **ガードは run in-flight のときのみ有効**（§11.3・ガードの有効条件）。`<ts>` を採番して `work/.session-ts` が置かれた瞬間から、`output/<ts>/.gate/**`・`docs/`・`gates/`・`.claude/` への書込が deny される。採番前は素通りする。
3. **承認は CLI が唯一の鋳造経路**（§4.4・承認鋳造経路の一本化）。`.gate/**` はエージェント書込 deny-all。人間ゲート通過後、オーケストレータ（＝本 Skill を実行するメイン Claude）が `npm run approve -- <ts> <kind>` を **Bash で実行**する。ワーカーはコマンド実行系ツールを持たないので承認を捏造できない。
4. **工程間の状態はファイルが持つ**（§4.2）。各ワーカーは入力ファイルを読み、出力ファイルを書き、最後に `work/<ts>/.requests/<stage>` を書いて完了を告げる。`SubagentStop` で `stage-guard`/`gen-guard` が発火し、通過時のみ `output/<ts>/.gate/markers/<stage>.done` を鋳造する。

## `subagent_type` マッピング（§4.1）

全ワーカーは、環境に登録されているネイティブの `subagent_type`（例: `Agent(subagent_type="spec-writer", model=<各 agent の model>)`）を優先して起動する。環境によっては `.claude/agents/` 配下の canon agent が `subagent_type` として未登録のことがあり（`docs/L3_AGENTS.md §2.1` 運用ノート）、その場合に限り **`Agent(subagent_type="general-purpose", model=<各 agent の model>)`** ＋「`.claude/agents/<name>/<name>.md` を Read して定義に従うこと」＋ `<ts>`・入出力の絶対パス・前段の結果の明示注入へフォールバックする。**`general-purpose` は `tools: *` で Bash/PowerShell/Monitor を含み、G13（基本設計書 §5.3）が強制するワーカーのコマンド実行系ツール剥奪を無効化する**——フォールバックを使った run では §4.4「ワーカーはコマンド実行系ツールを持たないので承認を捏造できない」という前提が成立しないため、使った場合はユーザーに明示する。この起動主体はメイン Claude に一元化し、ワーカーに多段委譲を指示しない（investigator の系統A/B spawn を除く）。

---

## 実行手順

### preflight（工程1の前・順序厳守）

基本設計書 §2・詳細設計書 §11.5 の preflight 2段。**順序は G13 →（`<ts>` 採番）→ カナリア → 工程1**。

1. **G13**: 本 Skill 展開時に自動発火済み（上記契約1）。ここで run が始まっている＝ G13 を通過している。
2. **`<ts>` 採番**: `npm run ts` を Bash で実行し、`<ts>`（`YYYYMMDD_hhmmss`）を得る。これが `work/.session-ts` を書き、`output/<ts>/`・`work/<ts>/` の骨格を作る。**この瞬間から run in-flight**。以降の各工程が読み書きするパスの一覧・規約は `output-path-resolver` を参照。
3. **ランタイム・カナリア（§11.5・配線の生存確認）**: 採番の直後・工程1の前に、hooks 配線が現に生きていることを確かめる。
   - `node gates/canary.js target <ts>` で的パス（`output/<ts>/.gate/.canary`）を得る。
   - **Write ツールでその的への書込を実際に試みる**。`.gate/**` は deny-all なので、配線が生きていれば **deny される**。
   - 結果を `node gates/canary.js report <ts> denied`（deny された場合）または `... report <ts> allowed`（**通ってしまった場合**）で通知する。
   - **allowed だった場合＝配線が死んでいる**。カナリアが exit 非0 を返すので、**run を即座に中断**し「決定論ゲートの配線が発火していない。`.claude/settings.json` を確認し `npm test` を通してから再実行せよ」とユーザーに告げて停止する。全工程が「違反ゼロ」で通る vacuous pass を防ぐ唯一の run 内手段（§11.5）。
   - **対象プロジェクトの確定**: `$ARGUMENTS`（`<target_project_path>`）を `work/<ts>/target.txt` に記録する。以降の調査は `<target_root>/` 配下のみを対象とし、claude-canon 自身のリポジトリを棚卸ししない（§5.1）。

### 工程1: プロジェクト調査1（浅く広く・2系統）→ P1

1. `investigator` を起動（ネイティブ `subagent_type`。未登録環境のみ `general-purpose` フォールバック・sonnet）。investigator は系統A `existing-customization-analyzer` と系統B `project-profiler` を**並列 spawn**し（深さ3・§4.4）、`work/<ts>/existing_customizations.md`（系統A）と `work/<ts>/project_profile.md`（系統B の profile 節）を書く。読取専用。
2. investigator が `work/<ts>/.requests/investigation` を書いて完了。`SubagentStop` で `stage-guard` が G1（調査1）を検査しマーカー鋳造。
3. **P1**: 調査サマリをユーザーに提示し、続行を確認して停止。

### 工程2: 要件ヒアリング（inline・ワーカー化しない）→ P2

1. `requirement-elicitation` Skill を **inline ロード**（Subagent に委譲しない・会話履歴継承のため）。
2. 工程1の調査結果を提示し、**新規/既存改修モードを確認**。質問リストと用語誤マッピング検知チェックリストに沿って AskUserQuestion で往復対話し、要件と制約（hooks/mcp/plugins/experimental の可否）を収集する。
3. 合意後、`requirements-recorder`（haiku・機械的直列化）を起動し `work/<ts>/requirements.md` を書かせる。`.requests/requirements` → `stage-guard` が G1（req: strength_needed/priority の enum・conflicts）を検査。
4. **P2**: 確定要件をユーザーに提示し承認を得る。承認後 `npm run approve -- <ts> requirements` を実行。

### 工程3: プロジェクト調査2（深く狭く）→ P3

1. `project-profiler` を再起動し、確定要件に関係する箇所だけ深掘りさせる（`work/<ts>/project_profile.md` の `focused` 節に追記・evidence_paths 必須）。
2. `.requests/investigation`（調査2）→ G1（focused 空欄違反・evidence_paths 実在）。
3. **P3**: 深掘り結果を提示し続行確認。

### 工程4: 要件定義 = spec → P4（最重要）

1. `spec-writer` を起動し、系統A・系統B・requirements を統合入力に `output/<ts>/spec.md` を書かせる（§7 テンプレート）。
2. `.requests/spec` → G1（open_questions 残存で前進不可・受け入れ基準の存在）。
3. **P4**: spec.md の絶対パスを提示し、**内容を精査して承認**を得る（最重要ゲート）。承認後 `npm run approve -- <ts> spec` を実行。これが無いと次工程の `design-map.md` 書込が approval-guard に deny される（前進ゲート a）。

### 工程5+6: 機能選定 → 設計 = design-map → P5

1. `selector`（feature-selection preload）を起動し、constraints で機能選択フローを刈り込んで L1〜L5 の使用機能を決める。
2. 続けて `designer`（opus・layer-design/orchestration-patterns/model-selection/existing-disposition preload）を起動し、`output/<ts>/design-map.md` を書かせる（§9）。**新規シナリオ(1) では既存が無いので keep 判定は発生しない**（G2 は空パス）。
3. `.requests/design` → `stage-guard` が G2（維持判定・シナリオ1は空）＋ G1（design）を検査。
4. **P5**: design-map をユーザーに提示（廃止判定があれば強調）。承認後 `npm run approve -- <ts> design` を実行。これが無いと生成物書込が deny される（前進ゲート b）。

### 工程7: 生成（全量・README/MANIFEST を最終ステップ）→ P6

1. `generator` を起動し、design-map を唯一の設計入力に `output/<ts>/generated/**` を生成させる。generator は必要な builder（`l1-builder`/`skill-builder`/`agent-builder`）と、最終ステップで `readme-writer`（README.md・MANIFEST.md・`.deploy/managed-paths.list`）を統括する（深さ: orchestrator→generator→builder・5以内）。
2. 書込ごとに **PostToolUse で G3〜G6 が助言**（違反はラッチへ転写）。generator が `.requests/generation` を書いて完了 → `SubagentStop` で `gen-guard` が **snapshot ゲート G7〜G12** を検査（G12 が全 output に G3〜G6 を権威再検証）。
3. **P6**: 生成物一式（generated/・MANIFEST・README）をユーザーに提示。承認後 `npm run approve -- <ts> generation` を実行。
   - 補足: generator が書くのは `.deploy/managed-paths.list`・`retired.list`（配置スクリプトの入力）まで。配置手順書 `.deploy/RUN.md` は工程10でオーケストレータが `emit-run-manifest.js` から出力する（配置先 `<target>` が定まるのが工程10のため）。

### 工程8: 検証

工程7の `gen-guard` バッチ（G7〜G12）が真偽で確定済み。ブロックラッチ（`.gate/blocks/*.blocked`）が残っていれば前進不可。解除は原因修正＋再生成、またはやむを得ない場合のみ `npm run unblock -- <ts>`（人間判断）。

### 工程9: 品質検査 = eval → P7

決定論ゲート（工程8）と分離した**意味判断**の工程（§16）。**eval はマーカーを鋳造せず G バッチも発火させない**（§2・§16.7）。

1. **判定入力バンドルを先に生成する**: `npm run eval:bundle -- <ts>`。design-map の keep/merge から `work/<ts>/eval-bundle/keep-review/` を決定論的に作る。**designer の `keep_conditions` 宣言と rationale はバンドルに入らない**（judge が判定対象自身の主張に自己一致して常に clean と答える恒真バグを構造的に防ぐ・§16.3）。
2. `eval-reviewer` を起動し、5軸（correctness / security / canon / context / keep-review）の judge を並列 spawn させる。各 judge は `output/<ts>/eval/<axis>.md` に本文＋json フェンス1個の verdict を書き、`eval-reviewer` が `output/<ts>/eval-report.md` へ集約する。
3. **ハーネスで集約を機械検証する**: `node eval/report.js` 相当の検査（スキーマ・カバレッジ・集約漏れ）。回付対象（keep×C2/C4・merge×統合先）に未判定があれば eval の失敗として扱う。**判定対象0件は「品質を確認した」ではない**（§16.5）。
4. **P7**: `eval-report.md` を提示する。`verdict: violation` は**1件残らず提示**する（§8.4 の強制表示）。とくに **C2 の violation は P5 の再確認事項**として扱う。承認後 `npm run approve -- <ts> eval`。

**eval は決定論ゲートの代替ではない**。eval が clean でも決定論ゲートのブロックラッチが立っていれば前進しない。逆に eval の指摘で生成物を書き換える場合は工程7へ戻る（自己修復はデータプレーン限定・§3.3）。judge が verdict を書けなかった／形式が壊れていた場合は、**「違反なし」と読まずに「judge が判定できなかった」と報告する**（§16.4）。

### 工程10: デプロイ → P8

配置は claude-canon の外（対象リポジトリで人間が実行）で Hook が発火できないため、`deploy/` 正本のスタンドアロン CLI で照合付き手動配置する（§10.2・退避スワップ）。これらは run 外 CLI で `.session-ts` に触れないため、ガードの有効条件（§11.3）と両立する。`<output>` は `output/<ts>` の絶対パス、`<target>` は対象リポジトリのルート。

1. **手順書を同梱する**: `node deploy/emit-run-manifest.js <output> <target>` を実行し `output/<ts>/.deploy/RUN.md` を出力する（配置/廃止される集合と実行コマンドの決定論的な同梱・§10.2 run-manifest 方式。スクリプト正本は複製しない＝`gates/lib/managed-paths.js` の SSoT を二重化しない）。以降の手順は RUN.md と同一。
2. **配置前照合**: `node deploy/pre-deploy-check.js <output> <target>`。対象の実管理パス集合と output を突き合わせ、消える予定を retired（想定内）/ uncaptured（取りこぼし）に区分する（`.deploy/pre-deploy-report.txt` にも出力）。**uncaptured≥1（exit 2）なら配置を止め、調査 or design-map へ差し戻す**（§10.2）。
3. **P8**: pre-deploy-report の retired 一覧が意図した廃止と一致することをユーザーが確認する。
4. **配置**: `--confirm` 無し（`node deploy/deploy.js <output> <target>`）は配置予定表示のみ（対象不変）。承認後 `--confirm` 付きで退避スワップ配置する（対象を `.claude-canon.bak.<ts>/` へ mv 退避 → output 配置 → post-check で sha256 バイト同一確認 → 失敗時は自動 restore）。**`--confirm` でも実行時に uncaptured があれば拒否**する（P8 を無視した配置の最終防波堤）。
5. ロールバックは対象の git revert ＋ `.claude-canon.bak.<ts>/` からの手動 restore。`.bak` の掃除は人間が明示的に行う（自動削除しない）。

---

## 各ゲートで停止する（自動遷移しない）

各人間ゲート P1〜P8 で**必ずチャット上でユーザー確認を取り停止する**（§4.1）。承認は口頭でなく `npm run approve` の実行で表す。ブロックラッチが立っていれば、原因を提示して人間の判断を仰ぐ（無限再生成しない・§3.3）。
