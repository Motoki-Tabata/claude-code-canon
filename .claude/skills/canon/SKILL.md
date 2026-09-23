---
name: canon
description: Run the full claude-canon pipeline (10 stages, split into 4 sessions) to build a Claude Code customization set for a target project from a natural-language request. Use only when the user invokes /canon with a target project path, or /canon resume <ts> to continue a run in a new session. Drives investigation, requirements, spec, design, generation, verification, quality review, and deployment, stopping at each human gate (P2, P4, P5, P6+7, P8).
disable-model-invocation: true
user-invocable: true
argument-hint: "<target_project_path> | resume <ts>"
---

# canon（10工程オーケストレータ・4セッション分割）

メイン Claude が **inline 実行**する Slash Command。`context: fork` は付与しない（fork すると Skill が Subagent 化し、工程2ヒアリングの inline 会話履歴継承が失われる — 基本設計書 §4.1）。

> 本ファイルには「いつ・どの Subagent を・どの順序で・どんなプロンプトで起動し、どこで停止して人間ゲートを取るか」だけを書く。判断内容（ヒアリング質問・機能選定の決定木・モデル割当・維持判定条件）は各 Skill に閉じる（§3.1）。

## 参照正典
- `00_INDEX.md §4`（機能選択フロー）・`§4.4`（強度3段階）
- `L3_AGENTS.md §2.1`（Subagent 起動・model ティア・nesting 上限=既定3階層・可変）
- `L4_AUTOMATION.md §2.1`（Hooks 発火・exit code）
- 基本設計書 §2（工程順）・§4（オーケストレーション）・詳細設計書 §11（ゲート）

## 4セッション分割と再開

1回のセッションで全工程を回すと、メイン会話の履歴を毎ターン読み直すコストが積み上がり、5時間枠を使い切る（実測: run 20260922 は開始から約2時間で上限に到達。メイン履歴の再読込が総入力の36〜48%）。**工程を区切りのよい4区間に分け、区間ごとに新しいセッションで動かす**。状態はすべてファイルが持つ（§4.2）ので、次のセッションは成果物から現在地を導いて再開できる。

| セッション | 工程 | 推奨モデル | 人間ゲート | 区間の終わり |
|---|---|---|---|---|
| **S1** | 工程1〜4（調査・ヒアリング・spec） | Opus | P2・P4（P1・P3 は報告のみ） | P4 の対話承認を記録したら停止 |
| **S2** | 工程5〜6（機能選定・設計） | Opus | P5 | P5 の対話承認を記録したら停止 |
| **S3** | 工程7〜9（生成・検証・eval） | Sonnet | P6+7（生成物と eval を1回で提示） | P6+7 の対話承認を記録したら停止 |
| **S4** | 工程10（配置） | Sonnet | P8 | 配置の案内で終了 |

判断の精度を要する区間（S1 のヒアリングと spec の精査、S2 の keep/retire の議論）は Opus、委譲と機械手順が主体の区間（S3・S4）は Sonnet。S3 の意味判断は `eval-keep-review`（Opus）に閉じる。

**区間の終わりの作法**: 最後の人間ゲートを対話で承認してもらい、`npm run state:record` で記録したら、**続きを実行せずに停止**して次のとおり案内する。

> 区間 S<n> が完了しました。新しいセッションを `claude --model <推奨モデル>` で起動し、`/canon resume <ts>` を実行してください。

### state.md（対話承認の記録）

人間ゲートの承認は**チャットの対話で取り**、要旨を `npm run state:record -- <ts> <gate> "<要旨>"`（gate は `P2`・`P4`・`P5`・`P6+7`・`P8`）で `work/<ts>/state.md` に記録する。差し戻しは `--revision` を付けて記録する。CLI は実時刻と書式を保証し、承認対象の成果物が未確定なら拒否する。

**state.md は待ち状態の判定（再開時に人間の返事待ちか）にだけ使い、ゲートの通過判定には使わない**（LLM が書ける記録のため）。工程順の機械担保は、決定論ゲートだけが鋳造する完了マーカーの順序（G1 が前段マーカーを要求し、advance-guard が `spec.done` なしの design-map 書込・`design.done` なしの generated/** 書込を deny する）が担う。承認は「承認対象の成果物の確定より後に記録されたもの」だけが有効で、成果物を作り直すと古い承認は自動的に無効になる。

### 差し戻し（SendMessage で再開しない）

ゲートで人間が修正を求めたら次の手順で戻る。**ワーカーを `SendMessage` で再開しない**——再開は5分キャッシュが切れた状態で蓄積した文脈（14〜22万トークン）を作り直すことになり、実測で初回起動より重かった（差し戻し分は総入力の約25%）。

1. `npm run state:record -- <ts> <gate> --revision "<要旨>"` で差し戻しを記録する。
2. 修正指示を `work/<ts>/revisions/<stage>-<n>.md` に書く（人間の指摘の逐語・直す箇所・直さない箇所）。
3. 巻き戻す工程のマーカーが残っていれば `npm run reopen -- <ts> <stage>` を実行する（`<stage>` 以降の工程マーカーを連鎖で削除する。`generation.done` が消えるとガードが再武装される）。対応: P2→`requirements`・P4→`spec`・P5→`design`・P6+7→`generation`。
4. 該当ワーカー（`requirements-recorder`・`spec-writer`・`designer`・`generator`）を**新規に起動**し、入力ファイル一式のパスと修正指示ファイルのパスを注入して「指示された箇所だけを Edit する」ことを明示する（各定義の「修正モード」節）。
5. 完了リクエスト → ゲート（`npm run recheck -- <ts> <stage>`）→ 該当ゲートで対話承認を取り直して記録する。P6+7 から戻った場合は、工程9 を **round 2 以降**（`npm run eval:bundle -- <ts> --round N`）として、差分だけ再判定する。

## この Skill が前提とする契約（実装済み・変更禁止）

1. **G13（preflight）は本 Skill の展開時に自動発火する**。`/canon` の `UserPromptExpansion` で `gates/g13_worker_privilege.js` が走り、claude-canon 自身のワーカー定義（`.claude/agents/**`）の `tools:` にコマンド実行系ツール（Bash/PowerShell/Monitor）が1つでもあれば **exit 2 で run の開始自体がブロックされる**。本 Skill 本文はその後に実行される。
2. **ガードは run in-flight のときのみ有効**（§11.3・ガードの有効条件）。`<ts>` を採番して `work/.session-ts` が置かれた瞬間から、`output/<ts>/.gate/**`・`docs/`・`gates/`・`.claude/` への書込が deny される。採番前は素通りする。**終端マーカー `generation.done` が鋳造される（工程7通過）まで run は in-flight** で、セッションの合間（S1→S2→S3）も `.session-ts` は残ってガードは武装したまま。この間は claude-canon 本体の保守編集（docs/・gates/・.claude/・design/）が deny される——長く中断するなら run を完走させるか放棄する（後述「run の終い方」）。
3. **承認は対話で取り、`work/<ts>/state.md` に記録する**（承認サイドカー・`npm run approve` は廃止済み）。`.gate/**` はエージェント書込 deny-all で、工程の完了マーカー（`markers/<stage>.done`）は決定論ゲートだけが鋳造する。state.md は判定材料にしない（上記）。
4. **工程間の状態はファイルが持つ**（§4.2）。各ワーカーは入力ファイルを読み、出力ファイルを書き、最後に `work/<ts>/.requests/<stage>` を書いて完了を告げる。`SubagentStop` で `stage-guard`/`gen-guard` が発火し、通過時のみ `output/<ts>/.gate/markers/<stage>.done` を鋳造する。
5. **run in-flight 中は一時ファイルも `work/<ts>/` に置く**（S3-4）。環境（ハーネス）は「一時ファイルはセッション固有の scratchpad ディレクトリを使え」と指示することがあるが、write-scope-guard は sanctioned ツリー（`output/<ts>/`・`work/<ts>/`）外への書込を一律 deny するため、scratchpad は run 中は使えない（ライブ run `20260910_220906` で実測）。大きな応答をファイルへ永続化する必要があるとき（例: Write を持たないワーカーの応答を代筆する）は `work/<ts>/` に一時フラグメントを作り、使用後に削除すること。

## `subagent_type` マッピング（§4.1）

全ワーカーは、環境に登録されているネイティブの `subagent_type`（例: `Agent(subagent_type="spec-writer")`）を優先して起動する。**ネイティブ起動では `model` 引数を渡さない**——起動時の `model` 引数は frontmatter より優先されるため、渡すと定義のモデルを上書きする（run `20260919_023121` で実測: `spec-writer`・`generator` が frontmatter sonnet のまま Opus で走り、`eval-keep-review` は frontmatter opus のまま sonnet で走った）。モデルの正は各 agent の frontmatter の一箇所に置く。環境によっては `.claude/agents/` 配下の canon agent が `subagent_type` として未登録のことがあり（`docs/L3_AGENTS.md §2.1` 運用ノート）、その場合に限り **`Agent(subagent_type="general-purpose", model=<対象 agent の frontmatter の model>)`**（フォールバックでは frontmatter が効かないので、定義を読んだ上で同じ値を渡す）＋「`.claude/agents/<name>/<name>.md` を Read して定義に従うこと」＋ `<ts>`・入出力の絶対パス・前段の結果の明示注入へフォールバックする。**`general-purpose` は `tools: *` で Bash/PowerShell/Monitor を含み、G13（基本設計書 §5.3）が強制するワーカーのコマンド実行系ツール剥奪を無効化する**——フォールバックを使った run では §4.4「ワーカーはコマンド実行系ツールを持たない」という前提が成立しないため、使った場合はユーザーに明示する。この起動主体はメイン Claude に一元化し、ワーカーに多段委譲を指示しない（`generator` の builder 群への spawn を除く）。調査ワーカー（系統A/B）は中継役を挟まずメイン Claude が直接起動する——中継役（旧 investigator）は深さ2の子の報告が呼び出し元に届かず、メイン会話を経由した逐語転記が必要になった（run 20260919・20260922 で連続して発生）ため廃止した。

---

## 実行手順

`$ARGUMENTS` が `resume <ts>` なら「再開」、それ以外（対象プロジェクトのパス）なら「新規開始（preflight）」へ進む。

### 再開（`/canon resume <ts>`・S2〜S4 の開始、または中断した S1）

会話履歴は無い。現在地はディスクから導く。

1. **G13**: 本 Skill 展開時に自動発火済み（契約1）。
2. `npm run resume -- <ts>` を Bash で実行し、出力の JSON だけを読む（多数のファイルを Read して現在地を推測しない）。別の run が in-flight で拒否された場合は、原因をユーザーに報告して指示を仰ぐ（別の /canon run の切り替えだけは `--force` で可能。機能X・機能Y の run が in-flight のときは不可）。
3. JSON の読み方:
   - `expected_model` が自分のモデルと違う場合は、その旨を警告してユーザーに続行可否を尋ねる（S1・S2 は Opus、S3・S4 は Sonnet を推奨。強制はしない）。
   - `blocked`（ブロックラッチ）があれば、`next_action` より先に原因を提示して人間の判断を仰ぐ（自動で解除・再生成しない）。
   - `pending_requests` があれば `npm run recheck -- <ts> <stage>` でゲートを起動する。
   - `stale` があれば「直したのに再検査していない」疑い。ユーザーに報告し、`npm run reopen` → 再生成 → recheck の要否を確認する。
   - `canary_required` が true なら、下記 preflight 手順3のカナリアを撃つ（別セッションでは配線が変わっている可能性があるため毎回撃つ）。S4 は `generation.done` 後で run が in-flight でなくガードが非適用のため撃たない。
4. `position`（現在地）と `next_action` に従い、該当する工程の手順へ進む。**工程2のヒアリング途中で中断していた場合**、会話は失われているので、調査サマリの提示からやり直す。
5. `waiting_gate` が入っていれば、そのゲートの提示から始める（承認待ち）。

### 新規開始（`/canon <target_project_path>`・preflight・工程1の前・順序厳守）

基本設計書 §2・詳細設計書 §11.5 の preflight 2段。**順序は G13 →（`<ts>` 採番）→ カナリア → 工程1**。

1. **G13**: 本 Skill 展開時に自動発火済み（上記契約1）。ここで run が始まっている＝ G13 を通過している。
2. **`<ts>` 採番**: `npm run ts` を Bash で実行し、`<ts>`（`YYYYMMDD_hhmmss`）を得る。これが `work/.session-ts` を書き、`output/<ts>/`・`work/<ts>/` の骨格を作る。**この瞬間から run in-flight**。以降の各工程が読み書きするパスの一覧・規約は `output-path-resolver` を参照。
3. **ランタイム・カナリア（§11.5・配線の生存確認）**: 採番の直後・工程1の前に、hooks 配線が現に生きていることを確かめる。
   - `node gates/canary.js target <ts>` で的パス（`output/<ts>/.gate/.canary`）を得る。
   - **Write ツールでその的への書込を実際に試みる**。`.gate/**` は deny-all なので、配線が生きていれば **deny される**。
   - 結果を `node gates/canary.js report <ts> denied`（deny された場合）または `... report <ts> allowed`（**通ってしまった場合**）で通知する。
   - **allowed だった場合＝配線が死んでいる**。カナリアが exit 非0 を返すので、**run を即座に中断**し「決定論ゲートの配線が発火していない。`.claude/settings.json` を確認し `npm test` を通してから再実行せよ」とユーザーに告げて停止する。全工程が「違反ゼロ」で通る vacuous pass を防ぐ唯一の run 内手段（§11.5）。
   - **対象プロジェクトの確定**: `$ARGUMENTS`（`<target_project_path>`）を `work/<ts>/target.txt` に記録する。以降の調査は `<target_root>/` 配下のみを対象とし、claude-canon 自身のリポジトリを棚卸ししない（§5.1）。

### 工程1: プロジェクト調査1（浅く広く・2系統）→ P1（報告のみ）

1. 系統A `existing-customization-analyzer` と系統B `project-profiler`（`profile` モード）を、**メイン Claude が同一 turn で並列に直接起動する**（中継役は置かない）。プロンプトに `<ts>`・`target_root`・書き出し先の絶対パスを注入する。各ワーカーは対象を read-only で調べ、**自分の成果物を自分で書く**: 系統A → `work/<ts>/existing_customizations.md`、系統B → `work/<ts>/project_profile.md`（`## profile` 節のみ）。応答テキストは「書いた旨」だけの短いものになる（本文は会話に流れない）。
2. **両ワーカーの完了後**、メイン Claude が2ファイルの実在を確かめ、**系統Aの `## サマリ` の総数が本文の `- path:` 行数と一致するか数え直す**（件数は転記・提示の前に数え直す規律・`.claude/rules/workflow.md`）。確認できたら `npm run recheck -- <ts> investigation` を実行する（完了リクエストを書いてゲートを hook 経路と同じ形で起動し、G1（調査1・両ファイルの実在・件数照合）を検査してマーカーを鋳造する）。G1 が違反を返したら、違反内容を渡して該当ワーカーを**新規に起動し直して**書き直させる。
3. **P1（報告のみ・停止しない）**: 調査サマリは工程2の冒頭でヒアリングの材料として提示する。続行確認のために別途停止しない（ユーザーは工程2の往復で内容を確認できる）。

### 工程2: 要件ヒアリング（inline・ワーカー化しない）→ P2

1. `requirement-elicitation` Skill を **inline ロード**（Subagent に委譲しない・会話履歴継承のため）。
2. 工程1の調査結果を提示し、**新規/既存改修モードを確認**。質問リストと用語誤マッピング検知チェックリストに沿って AskUserQuestion で往復対話し、要件と制約（hooks/mcp/plugins/experimental の可否）を収集する。
3. 合意後、`requirements-recorder`（機械的直列化。model は暫定 sonnet・S3-1 参照）を起動し `work/<ts>/requirements.md` を書かせる。`.requests/requirements` → `stage-guard` が G1（req: strength_needed/priority の enum・conflicts）を検査。
4. **P2**: 確定要件をユーザーに提示し承認を得る。`npm run state:record -- <ts> P2 "<要旨>"` で記録する。

### 工程3: プロジェクト調査2（深く狭く）→ P3（報告のみ）

1. `project-profiler` を `focused` モードで直接起動し、確定要件に関係する箇所だけ深掘りさせる（注入: `requirements.md` の確定要件、系統A `existing_customizations.md` の `depends_on.project_refs` 一覧、`<ts>`・`target_root`・`work/<ts>/project_profile.md` の絶対パス）。
2. **profiler が `work/<ts>/project_profile.md` の末尾へ `## focused` 節を自分で追記する**（Edit。`project-profiler` は `Write`/`Edit` を持ち、書き込み先はこの1ファイルだけ）。オーケストレータは書き写さない——書き写しは応答の要約・整形によるずれとコストの二重払いを生む（実測: run 20260919・20260922 で逐語転記が必要になった）。
   - **書式は `project-profiler` の agent 定義にある `focused` の出力テンプレートと「値の語彙契約」に従う**（`findings:` キー配下に `- topic` / `evidence_paths` / `summary`、`ref_resolution:` は `- ref: <値>  kind: <語>  resolved: <true|false>` をこの順で1行に）。この形式は G1 が正規表現で機械照合する。
   - **`evidence_paths` は対象リポジトリからの相対パスを裸で書く**（バッククォート・絶対パス不可）。G1 は `work/<ts>/target.txt` のルートから解決して実在照合する（幻覚防止）。
3. profiler の完了後、オーケストレータが `project_profile.md` を Read して `## profile` 節が残っていること・`## focused` 節が追記されていることを確かめ、`npm run recheck -- <ts> investigation` を実行する（完了リクエストを書いてゲートを起動し、G1（focused 空欄違反・evidence_paths 実在）を検査する）。マーカー `output/<ts>/.gate/markers/investigation.focused.done` の実在で通過を確かめる。
4. **P3（報告のみ・停止しない）**: 深掘り結果を短く報告し、そのまま工程4へ進む。

### 工程4: 要件定義 = spec → P4（最重要）

1. `spec-writer` を起動し、系統A・系統B・requirements を統合入力に `output/<ts>/spec.md` を書かせる（§7 テンプレート）。
2. `.requests/spec` → G1（open_questions 残存で前進不可・受け入れ基準の存在）。
3. **P4**: spec.md の絶対パスを提示し、**内容を精査して承認**を得る（最重要ゲート）。`npm run state:record -- <ts> P4 "<要旨>"` で記録する。次工程の `design-map.md` 書込は `spec.done`（G1 通過で鋳造されるマーカー）を前提とし、advance-guard の順序ガードが強制する。
4. **S1 の終わり**: 上記の作法で停止し、S2 の起動（Opus）を案内する。

### 工程5+6: 機能選定 → 設計 = design-map → P5

1. `selector`（feature-selection preload）を起動し、constraints で機能選択フローを刈り込んで L1〜L5 の使用機能を決める。
2. 続けて `designer`（opus・layer-design/orchestration-patterns/model-selection/existing-disposition preload）を起動し、`output/<ts>/design-map.md` を書かせる（§9）。**新規シナリオ(1) では既存が無いので keep 判定は発生しない**（G2 は空パス）。
3. `.requests/design` → `stage-guard` が G2（維持判定・シナリオ1は空）＋ G1（design）を検査。
4. **P5**: design-map をユーザーに提示（廃止判定があれば強調）。`npm run state:record -- <ts> P5 "<要旨>"` で記録する。生成物書込は `design.done`（G1・G2 通過で鋳造されるマーカー）を前提とし、advance-guard の順序ガードが強制する。
   - **P5 差し戻し**: 上記「差し戻し」の手順で戻る（`npm run reopen -- <ts> design` が `design.done` と、あれば下流の `generation.done` を連鎖で削除し、G1・G2 が再実行される）。
5. **S2 の終わり**: 上記の作法で停止し、S3 の起動（Sonnet）を案内する。

### 工程7: 生成（全量・README/MANIFEST を最終ステップ）

0. **design-map をスライスに切り出す**: `npm run slice -- <ts>` を Bash で実行する（`work/<ts>/slices/` に、`common.md`・`write-scopes.md`・`l1.md`/`skills.md`/`agents.md`/`l4.md`/`l5.md`・`disposition-other.md`・`responsibilities.md`・`other-sections.md`・`targets-<層>.txt` を書く。書き出し前に古いスライスを掃除する）。generator・各 builder・readme-writer・eval judge は design-map 全文（約96KB）でなくスライスを読む——全文 Read は 1 run で 19〜30 回・1 回 3.4〜3.7 万文字に達し、読んだ内容がそのエージェントの以後の全ターンで cache_read として積み上がっていた。`design.done` が無ければ拒否される（設計が確定してから切り出す）。差し戻しで design-map を書き直したら、`design.done` を再鋳造した後に必ず再実行する。
1. `generator` を起動し、design-map（スライス経由）を唯一の設計入力に `output/<ts>/generated/**` を生成させる。プロンプトに `work/<ts>/slices/` の絶対パスを注入する。generator は必要な builder（`l1-builder`/`skill-builder`/`agent-builder`）と、最終ステップで `readme-writer`（`generated/.claude/README.md` のみ）を統括する。**MANIFEST.md・`.deploy/*.list`・L4 成果物（`.claude/settings.json`・`.mcp.json`）は generator 自身が書く**（`readme-writer` の責務ではない）（深さ: orchestrator→generator→builder・5以内）。
2. 書込ごとに **PostToolUse で G3〜G6 が助言**（違反はラッチへ転写）。generator が `.requests/generation` を書いて完了 → `SubagentStop` で `gen-guard` が **snapshot ゲート G7〜G12** を検査（G12 が全 output に G3〜G6 を権威再検証）。**generator が完了リクエストを書かずに turn を終えた場合、および成果物の完成を報告せずに turn を終えた場合**（詳細設計書 §11.5）、`output/<ts>/generated/`・`MANIFEST.md`・`.deploy/managed-paths.list`・`.deploy/retired.list` の実在を確認し、欠けていれば generator を**新規に起動し直して**完走させる。**generator の応答が「待機中」等で完走を報告していなくても、それを未完了の証拠と読まない**——実測（run `20260909_003820`）では `(待機中。人間からの明示的な指示があるまで操作は行いません。)` とだけ返しながら、`generated/**` 28ファイル・`MANIFEST.md`・`.deploy/*` と `.requests/generation` を全て書き終えていた。判断材料はワーカーの自己申告ではなく**ディスクの実在**である（`.claude/rules/worker-definitions.md`「ワーカーの『書いた』は裏取りする」の裏返しで、『書いていない』も裏取りする）。
3. 補足: generator が書くのは `.deploy/managed-paths.list`・`retired.list`（配置スクリプトの入力）まで。配置手順書 `.deploy/RUN.md` は工程10でオーケストレータが `emit-run-manifest.js` から出力する（配置先 `<target>` が定まるのが工程10のため）。
4. **P6 は独立して停止しない**（P7 と1回に統合する）: 生成物の提示は工程9の後の P6+7 で、eval の結果と一緒に行う。

### 工程8: 検証

工程7の `gen-guard` バッチ（G7〜G12）が真偽で確定済み。ブロックラッチ（`.gate/blocks/*.blocked`）が残っていれば前進不可。解除は原因修正＋再生成、またはやむを得ない場合のみ `npm run unblock -- <ts>`（人間判断）。

### 工程9: 品質検査 = eval → P6+7

決定論ゲート（工程8）と分離した**意味判断**の工程（§16）。**eval はマーカーを鋳造せず G バッチも発火させない**（§2・§16.7）。

1. **判定入力バンドルを先に生成する（round 1）**: `npm run eval:bundle -- <ts>`。design-map の keep/merge から `work/<ts>/eval-bundle/keep-review/` を決定論的に作り（対象を名指しする生成物の箇所は `file:line` で逆引きして同梱する・S2-5）、生成物のスナップショット（`.snapshot-r1.json`）を保存する。**前の試行の判定（`eval/*.md`・`eval-report.md`）と古いバンドルは消える**（前の判定が新しい判定に見えないように・S2-2）。**designer の `keep_conditions` 宣言と rationale はバンドルに入らない**（judge が判定対象自身の主張に自己一致して常に clean と答える恒真バグを構造的に防ぐ・§16.3）。
2. **5軸の judge をメイン Claude が同一 turn で並列に直接起動する**: `eval-correctness` / `eval-security` / `eval-canon` / `eval-context` / `eval-keep-review`（中継役の `eval-reviewer` は廃止した——集約は下の手順3でコードが決定論に行うので、LLM の中継役は要らず、深さ2の子の報告が失われる failure mode も避けられる）。プロンプトに `<ts>`・`output/<ts>/`・`work/<ts>/slices/`（design-map の切り出し。全文は読ませない）を注入し、keep-review には `work/<ts>/eval-bundle/keep-review/` も注入する。各 judge は `output/<ts>/eval/<axis>.md` に本文＋json フェンス1個の verdict を書く。**全 judge の完了後、5軸の軸ファイルの実在を確かめる**（工程9 は完了リクエストを持たないため、他の工程より欠落の検出が遅れやすい・詳細設計書 §11.5）。**軸ファイルが欠けているなら次の順で復旧する**（judge が判定を応答本文に返しながらファイルを書かない failure mode がある。実測: run 20260903_091044 round 2 の eval-correctness）。
   - **(a)（判定が応答本文に返っている場合）** オーケストレータが **judge の判定内容（`verdict` / `rationale` / `evidence` / `confidence`）を1文字も変えずに、書式だけを機械的に修正して**軸ファイルへ書く。**判定そのものを書き換えてはならない**——それは judge の役割の簒奪であり、eval の独立性が失われる。実測（run 20260909_003820）でこの手当は機能した。
   - **(b) 判定が失われている場合**: 起動プロンプトに `quality-checklist` の出力契約（```json フェンスは1個・`findings[].target` は `coverage` にも列挙・`condition` は keep-review 以外 `null`）を明記して、その軸の judge を**新規に起動し直す**。再判定になるが、`SendMessage` での再開は使わない（5分キャッシュ切れで蓄積した文脈を作り直すため、判定の揺れを避ける利点より高くつく）。

   **書式違反のうち判定内容を毀損しない3種**（未知のトップレベルキー・`condition` の enum 外・`findings[].target` の `coverage` 不記載）は `eval/verdict.js` が自動補正するため、**軸は判定不能にならず (a)(b) の復旧作業自体が不要**になった（S2-1）。`npm run eval:report` の出力（`notes`）に「書式を自動補正した」旨が出るので、それを見て `quality-checklist` の NG 例を judge へ次 round で指摘するだけでよい。それでも欠けている（フェンス不在・必須キー欠落等）なら上記 (a)(b) で復旧する。
   書き出し後に手順3 を再実行し、判定不能が解消したことを確かめる。
3. **集約と機械検証は決定論で行う**: `npm run eval:report -- <ts> --write`。各軸の判定から `output/<ts>/eval-report.md` を組み立て（judge の判定内容は1文字も変えず、violation を1件も落とさない・`eval/aggregate.js`）、続けてスキーマ・カバレッジ・集約漏れを検査する（違反があれば exit 2）。回付対象（keep×C2/C4・merge×統合先）に未判定があれば eval の失敗として扱う。**判定対象0件は「品質を確認した」ではない**（§16.5）。全軸が判定済みで検査を通ると、その判定が「有効な判定」として保存され、round 2 の土台になる。
4. **P6+7**: 生成物一式（generated/・MANIFEST・README）と `eval-report.md` を**1回の提示にまとめる**。`verdict: violation` は**1件残らず提示**する（§8.4 の強制表示）。とくに **C2 の violation は P5 の再確認事項**として扱う。`npm run state:record -- <ts> P6+7 "<要旨>"` で記録する。
5. **S3 の終わり**: 上記の作法で停止し、S4 の起動（Sonnet）を案内する。

**round 2 以降（指摘を受けて生成物を直したあとの再 eval）は、差分だけを再判定する**（1周あたり約7M・全体の16〜20%を占めた eval を、2周目で丸ごと繰り返さない）:
1. 「差し戻し」の手順で生成物を直し、`gen-guard` が通ったら `npm run eval:bundle -- <ts> --round 2`（3周目なら `--round 3`）を実行する。前 round の有効な判定（`effective-r<N-1>.json`）が無ければ拒否される（前 round を `eval:report --write` で確定してから）。
2. コマンドの出力（と `work/<ts>/eval-bundle/round.json`）が、**再判定する軸**（`rejudge_axes`）と**引き継ぐ軸**（`carry_axes`）、各軸の**再判定する対象**（`rejudge_targets`）を示す。再判定するのは、前 round に違反があった軸と、変更があれば常に **security** 軸、および keep/merge の対象が変わった keep-review。それ以外は前 round の判定を引き継ぐ（変更で新たな違反が出うる軸を security に絞るのは既知のトレードオフ）。再判定する軸のファイルと `eval-report.md` は round 開始時に消え、前 round のものは `output/<ts>/eval/round<N-1>/` に退避される。
3. **再判定する軸の judge だけ**を起動する。プロンプトに `work/<ts>/eval-bundle/round.json` を注入し、round 2 モード（各 judge 定義の「round 2（再判定）モード」節）で動かす——変更ファイルと前 round の違反対象だけを見て、`coverage` に再判定した対象を**すべて**列挙させる。列挙が漏れると、ハーネスが未判定として落とす。
4. `npm run eval:report -- <ts> --write` で集約する（引き継いだ判定と再判定の結果を合成する）。以降は手順4・5 と同じ。

**eval は決定論ゲートの代替ではない**。eval が clean でも決定論ゲートのブロックラッチが立っていれば前進しない。逆に eval の指摘で生成物を書き換える場合は工程7へ戻る（自己修復はデータプレーン限定・§3.3）。judge が verdict を書けなかった／形式が壊れていた場合は、**「違反なし」と読まずに「judge が判定できなかった」と報告する**（§16.4）。

**工程7へ戻る具体手順**（重要: `generation.done` はガードの有効条件そのものであり、残ったままだと再検査もガードも働かない・基本設計書 §4.5 巻き戻し・詳細設計書 §11.3）: 上記「差し戻し」の手順に従う（`reopen generation` → `generator` を新規起動・修正指示を注入 → `gen-guard` が G1・G7〜G12 を実際に再実行 → 工程9 を再実行 → P6+7 を取り直す）。

### 工程10: デプロイ → P8

配置は claude-canon の外（対象リポジトリで人間が実行）で Hook が発火できないため、`deploy/` 正本のスタンドアロン CLI で照合付き手動配置する（§10.2・退避スワップ）。これらは run 外 CLI で `.session-ts` に触れないため、ガードの有効条件（§11.3）と両立する。`<output>` は `output/<ts>` の絶対パス、`<target>` は対象リポジトリのルート。S4 は `generation.done` 後で run が in-flight でなく、ガードは非適用。

1. **手順書を同梱する**: `node deploy/emit-run-manifest.js <output> <target>` を実行し `output/<ts>/.deploy/RUN.md` を出力する（配置/廃止される集合と実行コマンドの決定論的な同梱・§10.2 run-manifest 方式。スクリプト正本は複製しない＝`gates/lib/managed-paths.js` の SSoT を二重化しない）。以降の手順は RUN.md と同一。
2. **配置前照合**: `node deploy/pre-deploy-check.js <output> <target>`。対象の実管理パス集合と output を突き合わせ、消える予定を retired（想定内）/ uncaptured（取りこぼし）に区分する（`.deploy/pre-deploy-report.txt` にも出力）。**uncaptured≥1（exit 2）なら配置を止め、調査 or design-map へ差し戻す**（§10.2）。
3. **P8**: pre-deploy-report の retired 一覧が意図した廃止と一致することをユーザーが確認する。`npm run state:record -- <ts> P8 "<要旨>"` で記録する。
4. **配置**: `--confirm` 無し（`node deploy/deploy.js <output> <target>`）は配置予定表示のみ（対象不変）。承認後 `--confirm` 付きで退避スワップ配置する（対象を `.claude-canon.bak.<ts>/` へ mv 退避 → output 配置 → post-check で sha256 バイト同一確認 → 失敗時は自動 restore）。**`--confirm` でも実行時に uncaptured があれば拒否**する（P8 を無視した配置の最終防波堤）。
5. ロールバックは対象の git revert ＋ `.claude-canon.bak.<ts>/` からの手動 restore。`.bak` の掃除は人間が明示的に行う（自動削除しない）。

---

## run の終い方

- **run が終わる時点**: 終端マーカー `generation.done`（工程7の G7〜G12 通過）が鋳造された瞬間に run は in-flight でなくなり、ガードは非適用になる。S3 の後半（eval・P6+7）と S4 はこの状態で進む。
- **run の途中（S1〜S3 の区間の間）**: `generation.done` が無いあいだは run 中で、`work/.session-ts` が残る。この間、claude-canon 本体（docs/・gates/・.claude/・design/ 等）の保守編集は sanctioned ツリー外として deny される。保守をしたいときは、run を工程7まで完走させるか、放棄する（`work/.session-ts` の扱いはユーザーに確認する）。
- **設計書への記録**: `design/` 配下は run 中は書き込めない。`generation.done` の鋳造後（S3 の eval 以降・S4）であれば書ける。run の記録（canon-issues 等）が必要なら、その時点以降に行う。
- 機能X（`/update-docs`）・機能Y（`/self-optimize`）とは相互排他。run が中断中でもそれらは開始できない。

## 各ゲートで停止する（自動遷移しない）

人間ゲート **P2・P4・P5・P6+7・P8** で**必ずチャット上でユーザー確認を取り停止する**（§4.1）。P1・P3 は報告のみで停止しない。承認は対話で取り、`npm run state:record` で `work/<ts>/state.md` に記録する。ブロックラッチが立っていれば、原因を提示して人間の判断を仰ぐ（無限再生成しない・§3.3）。
