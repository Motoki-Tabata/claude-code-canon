---
title: claude-canon 基本設計書
purpose: Claude Code のカスタマイズを「調査 → 要件定義 → 設計 → 生成 → 検証 → 品質検査 → デプロイ」の一連の工程で半自律に構築するメタジェネレータの全体設計（骨格）。成果物フォーマット・ゲート実装契約は詳細設計書を参照。
audience: [ai, human]
canon_version: v2.1.251
---

# claude-canon 基本設計書

> **正典の位置づけ**: 本設計書は `docs/` 配下の正典リファレンス10ファイル（`00_INDEX` / `L1_CONTEXT_MANAGEMENT` / `L2_SKILLS` / `L3_AGENTS` / `L4_AUTOMATION` / `L5_DISTRIBUTION` / `ORCHESTRATION` / `TOOLS` / `BEST_PRACTICES` の9ファイル ＋ 一次ソース URL 一覧 `SOURCES.md`）を Single Source of Truth（SSoT）とする。本システムのあらゆる設計判断と生成物の合否基準は、この正典に根拠を持つ。
>
> **frontmatter `canon_version` の意味と保守経路**: 両設計書の frontmatter `canon_version` は、
> **本書が書かれた時点で参照していた正典のバージョン**——すなわち `docs/` 9ファイルのメタ情報表
> 「確認したClaude Codeバージョン」の値——を指す。独立した設計書自身のバージョンではない
> （claude-canon 自身のリリース版数は `CHANGELOG.md` が持つ）。`gates/conformance_tables/*.json` の
> `canon_version` と同じ値を指し、抽出の SSoT は `gates/lib/canon.js` の `extractCanonVersion()` である。
>
> この値は **機能X（`/update-docs`）が更新しない**。機能X は `docs/` 更新の波及として両設計書の旧値残存を
> G15 が `work/<ts>/impact-report.md` へ**検出するのみ**で、両設計書への書込自体は
> `gates/canon-update-scope-guard.js` が常時 deny する（詳細設計書 §13.1）。ゆえに正典バージョンが上がった
> ときの本フィールドの追従は、impact-report を読んだ**人間が手で行う**のが契約である。

**本書の構成**: claude-canon の設計は本書（基本設計書）と [詳細設計書](detailed-design.md) の2冊で完結する。この2冊だけを入力に、システムを再現できることを目標とする。

| 文書 | 収録節 | 内容 |
|---|---|---|
| 基本設計書（本書） | §1〜§5・§8・§14・付録 | 目的・工程順・三層構成・オーケストレーション構造・調査工程・既存カスタマイズの全体最適化・ディレクトリ構成・決定事項の要約 |
| [詳細設計書](detailed-design.md) | §6・§7・§9〜§13・§15・§16 | 調査中間成果物フォーマット・spec/design-map テンプレート・デプロイ・決定論ゲート G1〜G16・README/MANIFEST 生成・機能X（正典更新）／機能Y（自己最適化）・自己検証と運用制約・eval 実装契約 |

節番号は両書で重複しない。本書中で「詳細設計書 §N」と明記した参照は、その節が向こうの文書にあることを示す。

---

## 1. システムの位置づけ

### 1.1 目的

`claude-canon` は、Claude Code のカスタマイズ機能一式を、対象プロジェクトごとに **半自律で構築するメタジェネレータ** である。自身も Claude Code のカスタマイズ機構（Subagents・Skills・Slash Commands・Hooks）で構成される「メタシステム」であり、正典 `docs/` を唯一の参照源として動作する。

- **SSoT**: 正典リファレンス `docs/` 配下。生成物の正しさはすべてここから導く。
- **実行形態**: 工程ごとに人間の承認ゲートを挟む **半自律**（無人一気通貫ではない）。
- **第一目標**: 対象プロジェクトに配置できる実運用カスタマイズ一式（`CLAUDE.md` / Rules / Skills / Subagents / MCP / Hooks / 必要に応じ Plugin）。
- **対象**: Claude Code（CLI / SDK / harness）。

### 1.2 ユースケース

利用者は対象プロジェクトを指定し、自然言語で要件を伝える。得られるもの:

- 対象プロジェクトへ配置するカスタマイズファイル群（`output/<ts>/generated/` 一式）
- 設計マップ `design-map.md`・仕様 `spec.md`・差分サマリ `MANIFEST.md`・使用説明書 `README.md`
- 品質検査レポート `eval-report.md`
- 照合付きデプロイのための配置スクリプトと管理パスリスト

**対応する2つの運用状況**:

| 状況 | 説明 |
|---|---|
| **新規** | カスタマイズが存在しないプロジェクトに、ゼロから最適構成を生成する |
| **既存あり** | 既存カスタマイズを調査し、既存＋新要件を入力に**全体を設計し直す**（差分パッチではなく全量スナップショット・§8） |

### 1.3 設計の3つの柱

| 柱 | 内容 |
|---|---|
| **正典駆動** | `docs/` を唯一の参照源とし、各 Skill／ゲートが正典の特定節を参照する。合否判定の照合表も正典から生成する |
| **責任の局所化** | 全 Subagent・全 Skill が1文責任を持ち、判定は「plan（設計工程）に一箇所集約」する（§7・§8） |
| **決定論と意味判断の分離** | 機械的に真偽が決まる検証（決定論ゲート G 群・詳細設計書 §11）と、意味を要する評価（eval 品質検査・§9 のレビュー工程）を別系統に置き、非決定性で検証を汚さない |

### 1.4 半自律の3層観点

対象プロジェクト向け生成物の設計は正典レイヤー L1〜L5 に対応するが、**本システム自身の運営規律**は次の3観点で構成する。

- **工程規律（SDD 中核）**: 工程を Subagent の役割に切り、オーケストレータ主導の委譲＋ファイル駆動で進める。各工程完了で停止し人間ゲート。
- **品質ハーネス**: 決定論ゲート（正典 `L4_AUTOMATION.md` の Hooks・exit 2 ブロック）と eval（`L3_AGENTS.md` の並列 Subagent）で二重化。
- **運用トレーサビリティ（LLMOps・軽量）**: `model:` ピン留め・成果物同梱の `spec.md`／`design-map.md`／`MANIFEST.md`・コスト観点（`effort`・コンテキストサイズ）。

---

## 2. 工程順（10工程・確定）

調査を先頭に置く。全量スナップショット方式（§8）では既存の取りこぼしが「管理パス集合の全置換」で既存機能を消すため、調査は努力目標ではなく**ハード要件**である。

| # | 工程 | 位置づけ | 人間ゲート | 決定論ゲート |
|---|---|---|---|---|
| 1 | プロジェクト調査1（浅く広く・2系統） | plan 前提 | P1 | G1(調査1) |
| 2 | 要件ヒアリング | — | P2 | G1(req) |
| 3 | プロジェクト調査2（深く狭く） | plan 前提 | P3 | G1(調査2) |
| 4 | 要件定義 = spec | spec | **P4（最重要・spec 承認）** | G1(spec) |
| 5+6 | 機能選定 → 設計 = design-map | plan | P5（廃止判定確認） | G2 ＋ G1(design) |
| 7 | 生成（全量・README/MANIFEST を最終ステップ） | implement | P6 | per-file G3〜G6 ／ snapshot G7〜G12 |
| 8 | 検証 | — | — | 上記 G 群（真偽のみ） |
| 9 | 品質検査 = eval | — | P7 | （マーカー書かない・G バッチ非発火） |
| 10 | デプロイ | 照合付き手動工程 | P8（消失予定確認） | pre-deploy 照合スクリプト |

- **工程1の前に preflight 2段**: 順序は **G13 →（`<ts>` 採番）→ カナリア → 工程1**。
  - **G13（詳細設計書 §11.2）**: `/canon` 展開時（`UserPromptExpansion`）に claude-canon 自身のワーカー定義を検査し、`tools:` に `Bash` があれば **run の開始をブロック**する（ワーカーがガードを迂回する手段を持たないことの保証）。
  - **ランタイム・カナリア（詳細設計書 §11.5）**: `<ts>` 採番の直後・工程1の直前に、`/canon` が sanctioned 外への意図的な書込を1回試み、**deny されなければ配線が死んでいると判断して run を中断**する。Hooks が沈黙したまま全工程が「違反ゼロ」で通る vacuous pass を防ぐ唯一の run 内手段。採番前に置くとガードの有効条件（run in-flight・詳細設計書 §11.3）を満たさず偽陽性になるため、順序は厳守する。
- **工程8（検証）と工程9（品質検査）を分離**する。eval の非決定性で決定論検証を汚さないため。
- **工程5＋6は連続実行・人間承認1回（P5）に統合**する（機能選定は設計の入口で、選定結果は design-map に載る）。
- **工程2はワーカーにしない**。ヒアリングは人間との対話そのものであり、独立コンテキストの Subagent に隔離すると対話が分断される。オーケストレータ（inline のメイン Claude）が調査結果を提示し直接対話して確定、合意結果の直列化のみを最小ワーカーに委譲する（§4.3）。
- **調査2（工程3）は要件確定後**に実行する2段調査の後段（§5.2）。人間ゲートは P1=調査1、P2=要件、P3=調査2、P4=spec、P5=design-map、P6=生成物、P7=品質検査、P8=デプロイ照合。

---

## 3. 三層構成（自身の運営規律）

正典中核（工程規律）を最優先に、品質ハーネス・運用トレーサビリティを都度生成メタジェネレータの文脈に合わせて配置する。

### 3.1 工程規律 → L2 Skills + L3 Subagents

- 工程を Subagent の役割に切り、**オーケストレータ主導の Subagent 委譲＋ファイル駆動**で進める（`ORCHESTRATION.md §5.1` の「多段の専門処理」に該当）。各工程完了で停止し人間ゲート。
- 判定ロジック（機能選択フローチャート・design-map テンプレート・維持判定条件）は L2 Skills に切り出す（`L2_SKILLS.md §2.1` の段階的開示）。
- 正典は各工程に絞って供給する（`BEST_PRACTICES.md §1.1` コンテキストは最も貴重な資源）。
- 副作用のある生成・配置系オーケストレーション Skill は `disable-model-invocation: true` で `/name` 明示起動専用にする（`L2_SKILLS.md §2.1`）。

### 3.2 品質ハーネス → L4 Hooks（決定論）＋ L3 Subagent（eval）

アプリコード用語を「設定ファイル生成」の用語へ翻訳する。

| アプリ用語 | 本システムでの意味 |
|---|---|
| リンタ／型検査 | frontmatter スキーマ・設定キー・パス規約の正典照合 |
| テスト | 参照整合（preload skill 実在／ツール名／managed-paths）＋非退行チェック |
| ミューテーションテスト | 破棄（代わりに代表シナリオ試走・詳細設計書 §15） |
| LLM-as-a-Judge eval | 品質検査工程（並列 Subagent による多観点レビュー・詳細設計書 §16） |

- 決定論ゲートの硬遮断は **PreToolUse（`permissionDecision: deny` / exit 2）** と、ブロック可能な **SubagentStop / Stop**、および run 開始を止める **UserPromptExpansion**（preflight・詳細設計書 §11.1）で行う（`L4_AUTOMATION.md §2.1`）。**PostToolUse はブロック不可**のため per-file 検査は助言（非ブロッキング）とし、権威判定は停止時に再実行する（詳細設計書 §11）。
- eval 観点: correctness / security / 正典整合 / コンテキスト効率 / 維持判定妥当性（keep-review・§8.4）。

### 3.3 運用トレーサビリティ → L1 + L5 + frontmatter `model:`

- `model:` ピン留め（`L3_AGENTS.md §2.1` のモデルティア）と、システム本体（`.claude/`）・正典（`docs/`）の版管理。
- 成果物のトレーサビリティは output 同梱で担保（`spec.md`・`design-map.md`・`MANIFEST.md` が「なぜこの構成か」を対象プロジェクトへ届ける）。
- 自己修復はデータプレーン限定（ゲート違反 → 成果物の再生成のみ。エージェント定義・`gates/` は不変）。同一ゲートの失敗は既定 N 回で打ち切り人間へエスカレーション（無限再生成の防止）。

---

## 4. オーケストレーション構造

基本は Coordinator-Worker（正典 `ORCHESTRATION.md §7` の「積みすぎない」原則）。調査工程のみ3層。

### 4.1 コーディネータ = メイン Claude が実行する Slash Command Skill

オーケストレータは **メイン Claude が inline 実行する単一の Slash Command Skill（`/canon`）** とし、10工程を駆動して各人間ゲート P1〜P8 で**チャット上でユーザー確認して停止**する。

この配置を採る根拠（いずれも `docs/` に基づく）:

1. **inline 会話履歴の継承**: 工程2のヒアリングは `requirement-elicitation` Skill を inline ロードし、メイン Claude の会話履歴を保ったままユーザーと往復対話する必要がある。オーケストレータを Subagent 化すると会話履歴が非継承となり（`L2_SKILLS.md §2.2`）往復ヒアリングが成立しない。
2. **人間ゲートの自然な表現**: 各工程の停止と承認待ちは、inline のメイン Claude が結果を提示してユーザーの応答を待つ形で、セッション内で完結できる（再起動不要）。
3. **Subagent 起動方式**: 配下ワーカーは環境に登録されているネイティブの `subagent_type` を優先して起動する。環境によっては `.claude/agents/` 配下の canon agent が `subagent_type` として未登録のことがあり（`00_INDEX.md §9`・`ORCHESTRATION.md §2.3`）、その場合に限り `Agent(subagent_type="general-purpose", …)` 起動＋「`.claude/agents/<name>/<name>.md` を Read して定義に従え」のプロンプト注入へフォールバックする。**`general-purpose` は `tools: *` で Bash/PowerShell/Monitor を含み、G13（§5.3）が強制するワーカーのコマンド実行系ツール剥奪を無効化する**ため、フォールバックは §4.4 の承認捏造不能の前提を崩す——常用せず、ネイティブ起動を優先する。この起動主体はメイン Claude に一元化する。

オーケストレータ Skill 本文には `context: fork` を**付与しない**（fork すると会話履歴が非継承になりヒアリングが破綻する・`L2_SKILLS.md §2.2`）。

### 4.2 handoffs 不採用・ファイル駆動

正典に handoffs 機構は存在しない。全工程を1本の文脈チェーンにすると調査の大量ファイルで context overload に至る（`BEST_PRACTICES.md §1.1`）。したがって:

- 各工程を **独立コンテキストの Subagent** に委譲して隔離し、親（オーケストレータ）へは**サマリのみ**返す（`L3_AGENTS.md §2.1`）。
- **工程間の状態はオーケストレータの文脈でなく、`work/`・`output/` のファイルが持つ**（ファイル駆動）。調査中間成果物・`spec.md`・`design-map.md` がそのまま工程間インターフェースになる（§14 のディレクトリ構成がデータフローを定義する）。
- 各工程は「入力ファイルを読み、出力ファイルを書き、オーケストレータに完了を返す」。オーケストレータは次工程を起動する前に停止して人間ゲートを待つ。

### 4.3 ステージ・ディスパッチ（完了リクエストとゲート発火）

決定論ゲート（詳細設計書 §11）は Hooks で発火するが、`SubagentStop` の matcher に渡る agent type だけでは判別を環境非依存にできない——ワーカーがネイティブの `subagent_type` で起動される環境と `general-purpose` へフォールバックする環境が混在しうるため、**どの工程が停止したかを名前だけで判別する設計にしない**。そこで:

- 各工程ワーカーは**最終アクションとして「完了リクエスト」ファイル** `work/<ts>/.requests/<stage>` を書く（例: `investigation` / `requirements` / `spec` / `design` / `generation`）。**書く前に、そのステージの成果物ファイルが実在し空でないことを自分で確認する。確認できない場合は完了リクエストを書かず、欠落を親へ報告する**（成果物なきリクエストはゲートに空の検査対象を渡し vacuous pass を招く・詳細設計書 §11.5）。
- `SubagentStop`（または `Stop`）で発火するゲート配線が `.requests/` を走査し、**リクエストの種類に応じてゲートバッチを選ぶ**。通過時のみ権威マーカー `output/<ts>/.gate/markers/<stage>.done` を鋳造し、処理したリクエストを消費（削除）する。違反時はブロックラッチ `output/<ts>/.gate/blocks/<stage>.blocked` を残す。消費の順序と冪等性は §4.5 の消費規約に従う。
- 承認は人間ゲート通過後に、オーケストレータが `npm run approve -- <ts> <kind>` を実行し、**`tools/approve.js` が承認サイドカー `output/<ts>/.gate/approvals/<kind>.approved` を鋳造する**。承認サイドカーは前進ゲートと凍結の根拠になる（詳細設計書 §11.3）。**エージェント（オーケストレータ含む）は `.gate/**` を Write/Edit で書かない**（§4.4）。

> **Claude Code 向けの簡素化**: `output/<ts>/.gate/**` は PreToolUse の書込先ガードで**エージェント書込を一律 deny**（deny-all）し、権威マーカー・承認・ブロックはゲートスクリプトと `tools/` CLI（Bash/node・execute 可）のみが鋳造する。ゲートは execute を持つため、非退行照合の sha256 等を直接算出できる（詳細設計書 §11 G8）。マーカー・承認・ブロックの権威記録を単一の `.gate/` サブツリーに集約し、専有トップレベルツリーを別途設けない。

### 4.4 承認の鋳造経路（`.gate/**` は deny-all・CLI 一本化）

**承認は Write/Edit で行わない。** `.gate/**` は PreToolUse の書込先ガードでエージェント書込を一律 deny する（§4.3）ため、承認の鋳造をツール経路の外（CLI）へ出す。

肝: **`tool_input` のパスは「誰が書いたか」を含まない**。`.gate/approvals/spec.approved` への書込がオーケストレータ由来かワーカー由来かをパスだけで識別する方法は存在しない（PreToolUse の入力は `tool_name` / `tool_input` / `session_id` / `cwd` / `permission_mode` であり、呼び出し元エージェントの同一性は判定材料に無い）。ゆえに `.gate/approvals/**` を allow すれば任意のワーカーが自己承認でき前進ゲートが崩壊し、deny-all のままでは承認そのものが行えなくなる二律背反に陥る。承認を Write/Edit というツール経路の外に出すことで、この二律背反を解く。

- **唯一の鋳造経路**: `tools/approve.js`（`npm run approve -- <ts> <kind>`）。`<kind>` は `spec` / `design` 等。§14 の `tools/` と `package.json` scripts には既に `approve` があり、これがその器である。
- **承認取り消し**: 前進ゲートと凍結（詳細設計書 §11.3）の解除＝サイドカー削除も同じく CLI 経由（`npm run approve -- <ts> <kind> --revoke`）。エージェントは削除もできない。
- **人間ゲートとの関係**: オーケストレータは P4/P5 等の人間ゲートでユーザー確認を取った**後に** CLI を実行する。承認は工程の途中（in-flight の run 中）に起きるため、**CLI は run 中に通る**。
  - `npm run approve -- <ts> <kind>` というコマンド文字列は保護パスを含まないため write-scope-guard のコマンド検査を通り、`tools/approve.js` が `node:fs` で直接サイドカーを鋳造する（ツール呼出でないため Hook は発火しない）。オーケストレータはコマンド実行系ツールを持つので、この CLI を run 中に叩ける。
  - **ワーカーは叩けない**。理由はガードの有効条件ではなく、**全ワーカーがコマンド実行系ツール（`Bash`・`PowerShell`）を持たないこと**（§5.3）であり、これを **G13 が preflight で機械強制**する（詳細設計書 §11.2・§11.3）。「ワーカーが承認を捏造できない」ことの根拠はガードの条件ではなくツール剥奪である。
- **G1 との整合**: G1 は承認サイドカーの存在＋`approved_by` を検査する（詳細設計書 §11.2）。`approve.js` は `approved_by`・鋳造時刻を書き込み、監査可能にする。

これにより「エージェントは `work/<ts>/.requests/<stage>` に完了リクエストを書くだけ」（§4.3）という原則が承認にも一貫して適用される。

`tools/reopen.js` は `.gate/` 直下を書く2本目の CLI だが、**承認の鋳造・取消は行わない**（それは引き続き `tools/approve.js` のみが担う・本節の一本化は不変）。

### 4.5 `.requests/` の消費規約（順序と冪等性）

完了リクエストの消費（判定バッチの実行・権威マーカーの鋳造・リクエストの削除）は、順序と冪等性を誤ると2方向に破綻する:

| 順序 | 失敗時の帰結 |
|---|---|
| 削除 → 鋳造 | 鋳造失敗でリクエストもマーカーも無くなる。ワーカーは既に停止済みで**再発火の契機が永久に失われる（デッドロック）** |
| 鋳造 → 削除 | 削除失敗でリクエストが残留 → 以降の**全** SubagentStop で当該バッチが再発火 |

残留の害は重い。工程9（eval）は「マーカー書かない・G バッチ非発火」と規定するが、`generation` リクエストが残留すれば eval-* の SubagentStop が generation バッチを引く。詳細設計書 §11.3 のブロックラッチは**一方向ラチェット**（ゲート再通過でも自動解除されず、解除は人間 CLI のみ）なので、再発火の偽陽性が人手介入まで復帰不能になる。

**確定解**: デッドロック（復帰契機の喪失）より再発火（冪等演算で無害化可能）を選び、**鋳造→削除の順に固定**したうえで、**バッチをマーカー存在でキー付けした冪等演算**にする。

```
SubagentStop 発火 → .requests/<stage> を走査
  for each request <stage>:
    ① marker 有 & request 有 → 判定を再実行せず request 削除のみ（冪等・再発火の無害化）
    ② marker 無 & request 有 → ゲートバッチ実行
         pass → ❶ marker 鋳造（先） → ❷ request 削除（後）
         fail → blocks/<stage>.blocked を残す（request は削除しない＝再判定の契機を保つ）
    ③ marker 有 & request 無 → 何もしない（処理済み）
  すべての鋳造・削除を .gate/processed.log へ追記（監査）
```

肝:
- **①が残留を無害化する**。マーカーが権威の単一根拠であり、リクエストは「判定の契機」に過ぎない。残留したリクエストは判定を再実行せず消えるだけなので、eval-* の SubagentStop が generation バッチを引いてもブロックラッチの偽陽性は生じない（工程9の「G バッチ非発火」がここで担保される）。
- **鋳造が先**なので、削除失敗しても権威は既に立っており前進できる。①が次の発火で残留を回収する。
- **fail 時に request を削除しない**のは、自己修復（§3.3 のデータプレーン限定再生成）で成果物を直した後、再度の停止で判定をやり直せるようにするため。同一ゲートの失敗は既定 N 回で打ち切り人間へエスカレーションする（§3.3）。
- **`.gate/processed.log`** は `<ts>` / `<stage>` / 判定結果 / 鋳造・削除の各時刻を追記する。`.gate/` 配下なのでエージェントは書けない（§4.4）。

**investigation の phase 別マーカー**: 調査工程は1段目（要件確定前）と2段目 focused（要件確定後）が同じ `investigation` 完了リクエストを書く。マーカーキーが単純にリクエスト名 `<stage>` のままだと、1段目で `investigation.done` が鋳造された時点で②の冪等スキップが働き、2段目の G1 focused 検査（focused 空欄・evidence_paths 実在・§6.2）が実 hook 経路で一度も走らない。そこで **investigation に限り、`work/<ts>/requirements.md` が存在するとき（＝2段目）マーカーキーを `investigation.focused` にする**。結果、1段目は `investigation.done`、2段目は `investigation.focused.done` を鋳造し、2段目の検査が冪等スキップされずに発火する。リクエストの消費（削除）は従来どおりリクエスト名 `investigation` で行う（リクエストファイルは1つ）。他ステージ（requirements/spec/design/generation）は phase を持たないためマーカーキー＝ステージ名のまま。実装は `gates/lib/run.js:processStageRequests` の `markerKey` 注入口と `gates/stage-guard.js:investigationMarkerKey`。

**巻き戻し（reopen）**: eval（工程9）の指摘や P5 差し戻しで生成物・design-map を書き直す場合、対応する権威マーカー（`generation.done`／`design.done` 等）が残っていると、①の冪等スキップにより再検査（G1・G7〜G12 等）が走らずガード（write-scope-guard・approval-guard・advance-guard）も `currentRunTs()` が null のまま素通りし続ける——`generation.done` はガードの有効条件そのものであるため（§4.3・詳細設計書 §11.3）。phase 別マーカーキー（`investigation.focused` と同型の `generation.round2` 等）は本質的な解にならない: `hasTerminalMarker()` はキー名 `generation.done` の存在そのものを見るため、round2 キーを別に鋳造しても `generation.done` は残りガードは沈黙したまま——G7〜G12 だけが再実行されて緑になり、「ガード不在で書かれた生成物が検証済みに見える」という現状より悪い状態を作る。ゆえに**マーカー取消 CLI**（`npm run reopen -- <ts> <stage>`・`tools/reopen.js`）を承認の唯一の鋳造経路（§4.4）と対になる**唯一の取消経路**として新設する。取消は `<stage>` 以降の人間承認（例: `generation` 取消には `generation.approved` の事前取消）を要求し、実行主体はオーケストレータの Bash（ワーカーは G13 のシェル剥奪で不可）に限る。

### 4.6 調査工程の3層 spawn

調査工程（§5）は `investigator`（コーディネータ）が系統A `existing-customization-analyzer` と系統B `project-profiler` を並列 spawn する。メイン Claude → investigator → analyzer/profiler の**深さ3**で、正典の nesting 上限（既定3階層・`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で可変・`L3_AGENTS.md §2.1`）に収まる。investigator は内部委譲を集約して親へ返し、オーケストレータは investigator の内部 spawn に関与しない。

---

## 5. 調査工程（2系統 × 2段）

### 5.1 2系統

> 調査対象は**対象プロジェクト（target_root）配下のみ**。investigator が受け取った target_root を `work/<ts>/target.txt` に記録し、系統A/B は `<target_root>/` 配下だけを調べる。claude-canon 自身のリポジトリ（`docs/`・`.claude/`・`gates/`）を対象として棚卸ししてはならない。**唯一の例外は `/self-optimize`**（機能Y 自己再生成・詳細設計書 §13.2.1）であり、これは意図的に `target_root = CANON_ROOT` として工程1〜9 を走らせる別 Skill である。`/canon` はこの例外を持たない。

- **系統A（既存カスタマイズ調査・メタ層）**: `<target_root>/` の `CLAUDE.md`・`.claude/rules/`・`.claude/skills/`・`.claude/agents/`・`.claude/settings.json`・`.mcp.json`・`plugin/` を正典分類軸（L1〜L5・強度・依存）で構造化分解する。読取専用。
- **系統B（プロジェクト実態調査・ドメイン層）**: `<target_root>/` の言語・フレームワーク・テスト基盤・規約・CI を調べる。読取専用。プロジェクトに接地した生成物を生むための素材。

### 5.2 2段

```
調査1（ヒアリング前・浅く広く）
  investigator → existing-customization-analyzer（系統A: .claude 全量）
              → project-profiler（系統B: 言語/FW/テスト/CI の骨格）
        │
        ▼
要件ヒアリング（調査結果提示 → 要件確定 → 調査スコープ確定）
        │
        ▼
調査2（spec 前・深く狭く）
  project-profiler（再起動）… 確定要件に関係する箇所だけ深掘り
        │
        ▼
spec へ: 既存棚卸し（系統A）＋ プロジェクト接地素材（系統B）を統合入力
```

### 5.3 落とし穴と対策

- **調査の過剰（context dumping）** → 要件が調査スコープを絞る（2段調査）。
- **読取専用の強制** → 系統A/B のワーカーは `tools: Read Grep Glob` のみ（`Write`/`Edit`/コマンド実行系ツールを与えない）。
- **コマンド実行系ツールは全ワーカーから剥奪＋機械強制** → 系統A/B の読取専用に留まらず、**すべての工程ワーカー（spec-writer・selector・designer・generator・各 builder・readme-writer・eval-*）の `tools:` に `Bash`・`PowerShell` を含めない**。PreToolUse の3ガードは `Write`/`Edit` の `tool_input` パスで判定するため、シェルのリダイレクト（`echo > path`）や `node` 実行を捕捉できず、コマンド実行系ツールを持つワーカーが1体でも居ればガードを素通りできるからである（詳細設計書 §11.3）。sha256 算出・スクリプト実行など execute を要する処理は**ゲート側（`gates/`）と `tools/` CLI が持つ**（§4.3・詳細設計書 §11 G8）ので、ワーカーにコマンド実行系ツールは要らない。**この剥奪は方針の明記に留めず G13（preflight・詳細設計書 §11.2）が機械的に強制する**: `<canon_root>/.claude/agents/**/*.md` の `tools:` にコマンド実行系ツールがあれば run の開始をブロックする。**対象は claude-canon 自身のワーカーのみ**で、生成物の Subagent（対象プロジェクトで動く）がコマンド実行系ツールを持つのは正当ゆえ対象外（詳細設計書 §11.2 の適用範囲表）。
- **制約の検出** → 調査で「Hooks 不在・MCP 設定なし・組織ポリシー痕跡」等の事実を拾い、ヒアリングで意図（禁止か未使用か）を確認する材料にする（詳細設計書 §6.3）。

---

## 8. 既存カスタマイズがある場合の全体最適化

差分パッチでなく「既存＋新要件を入力に全体を設計し直す」。

- plan は既存 design-map を出発点にせず、**統合 spec から design-map を引き直す**。
- **維持は再生成せず既存実体を output へ verbatim コピー**する（generator が Read → Write。詳細設計書 §9.3）。「維持＝再生成しない」を「output に存在しない」と解釈してはならない。配置は管理パス集合（詳細設計書 §10.1）の退避スワップ全置換であり、維持ファイルが物理的に output に無ければ置換で消える。ゆえに維持は「output に literal コピー（内容不変）」でなければならない。
- 配置マニフェスト `MANIFEST.md` に**廃止を明示**（管理パス集合の全置換で黙って消える事故と区別）。

### 8.1 判定の4選択肢

系統A で棚卸しした既存カスタマイズ1件ずつに designer が割り当てる:

- **維持(keep)**: 既存実体を output へ verbatim コピー（新規書き起こししない）。
- **改修(modify)**: 新内容で再生成する。
- **統廃合(merge)**: 他と統合。複数を1つに、または新規に吸収する。
- **廃止(retire)**: output から外す。MANIFEST に明示する。

### 8.2 維持は「積極的維持」— 5条件クリアを要求

改修/統廃合/廃止は「変える」判断で diff に出て人間ゲートで気づける。**維持は「変えない」判断で diff に出ない**ため、誤った現状維持が気づかれず通る。ゆえに維持だけ厳しい条件を課す。次のすべてを満たすときのみ維持を許す:

| 条件 | 内容 | 判定元 |
|---|---|---|
| **C1 正典適合** | 系統A `canon_conformance` が clean（unknown_frontmatter_keys 空・deprecated_notation 空・frontmatter_keys_valid true・tool_names_valid true） | 系統A・**実照合**（機械） |
| **C2 要件非抵触** | 統合 spec 新要件・統合方針と競合/重複せず、`requirements.md` の conflicts に登場しない | spec 突合＝**意味判断**（eval 回付・§8.4） |
| **C3 依存健全** | 系統A `depends_on.customization_refs` の参照先が今回の design-map で `retire`/`merge` されない。`modify` の場合は当該レコードが `interface_change: none` を宣言している（宣言は G8 が generation 段階で実照合・詳細設計書 §11.2） | 系統A＋design-map・**実照合**（機械） |
| **C4 強度整合** | 既存が担う強度が `requirements.md` の `strength_needed`・constraints と矛盾しない | requirements.md・**意味判断**（形式検査のみ機械） |
| **C5 プロジェクト実態整合** | 系統A `depends_on.project_refs`（Rules の paths glob・supporting file・path）が系統B `ref_resolution` で全て resolved=true（陳腐化した参照が無い） | 系統B・**実照合**（機械） |

1つでも欠けたら維持不可＝改修/統廃合/廃止へ回す。**判定元の性質を区別する**: C1/C3/C5 は実データ照合で G2 が真偽確定する。C2/C4 は意味判断を含み、designer が立てた boolean の**形式検査のみ** G2 が行い、意味的妥当性は eval（工程9）へ回付する（§8.4・詳細設計書 §11 G2）。C5 は「Python 廃止後も残る `paths:"src/**/*.py"`、消えた supporting file 参照」等の陳腐化を捕まえる。全量スナップショットでは「変えない＝diff に出ない」ため陳腐化した維持が最も気づかれにくい。C3 のうち `modify` 依存先への `interface_change: none` 宣言は、design 段階では生成物が未存在で実照合できないため G2 は宣言の形式検査に留め、宣言内容の実照合（frontmatter `name` 同一性）は generation 段階の G8 が担う（詳細設計書 §9.2・§11.2）。

### 8.3 改修 vs 統廃合 vs 廃止の切り分け

どれも diff に出るので相対的に緩くてよいが目安:
- **改修**: 機能は要る＋単体で成立＋逸脱や新要件との差分を直せば使える（C1 違反・C2 抵触の多く）。
- **統廃合**: 複数の既存が同目的を重複、または新規が役割を包含する。1つに寄せる。
- **廃止**: 機能自体が不要 or 統合後の全体像に居場所がない。**最も慎重に**（MANIFEST 明示＋人間ゲート必須）。

### 8.4 承認ポイント P5 のレビュー形式（注意の集中）

全既存精査は負荷が高いため、注意を要するものに絞って提示する:
- **廃止(retire)全件**: 最も事故が重い。1件ずつ確認。
- **維持のうち C2 が eval 未通過のもの**: eval（工程9）が「keep とされた既存が新要件・統合方針と競合/重複しないか」を意味的に検査し、疑いありと判定した維持は P5 で**強制表示**する（C2 は三段担保: G2 形式検査 → eval 意味判断 → P5 人間確認）。**回付先の実装契約は詳細設計書 §16**（判定入力バンドル・verdict スキーマ・カバレッジ規約・judge の較正）。
- **統廃合(merge)の統合先**: どこに寄せたかの妥当性。

5条件が明確にクリアな維持（新要件と無関係・C1/C3/C5 実照合 pass・C2 eval も clean）はサマリ提示に留め、人間の注意を「判断が割れた箇所・不可逆な廃止」に集中させる。

---

## 14. ディレクトリ構成（全体像）

配置を貫く3原則: (1) git 管理の「システム本体」と gitignore の「実行結果」を物理分離 (2) 検証ゲートを最適化対象外の不変土台として可変 agent 群から隔離 (3) 世代管理は本体の版・対象プロジェクト成果物とは別系統。

```text
claude-canon/
├─ docs/                          ← 【SSoT・正典】git 管理。機能X 更新対象。ゲート照合表の生成元
│   ├─ 00_INDEX.md … BEST_PRACTICES.md（9ファイル・TOOLS.md 含む）
│   └─ SOURCES.md                  ← 一次ソース URL 一覧
│
├─ .claude/                       ← 【システム本体＝実行体】git 管理・可変。機能Y が「次世代」生成する対象
│   ├─ README.md                   ← 起動方式の使用説明書（詳細設計書 §12・G10 対象）
│   ├─ settings.json               ← Hooks 配線（決定論ゲート発火・gates/ を command handler で呼ぶ）
│   ├─ rules/                      ← claude-canon 自身の運営規律（`paths:` でパス条件付きロード・§14.1a）
│   │   ├─ workflow.md             ← 無条件ロード。応答言語・検証してから完了・申し送りの裏取り等（≤40行）
│   │   ├─ gates-and-tests.md      ← paths: gates/** tests/** eval/** tools/** deploy/**
│   │   ├─ canon-docs.md           ← paths: docs/**
│   │   └─ worker-definitions.md   ← paths: .claude/agents/** .claude/skills/** .claude/settings.json
│   ├─ agents/                     ← Subagent 19体
│   │   ├─ canon-orchestrator は Skill 側（下記）に置く（メイン Claude が inline 実行するため）
│   │   ├─ investigator/…                       ← 調査コーディネータ（3層起点）
│   │   ├─ existing-customization-analyzer/…    ← 系統A・読取専用
│   │   ├─ project-profiler/…                   ← 系統B・読取専用
│   │   ├─ requirements-recorder/…              ← 工程2: 合意要件の直列化（機械的・haiku）
│   │   ├─ spec-writer/…                        ← 工程4
│   │   ├─ selector/…                           ← 工程5
│   │   ├─ designer/…                           ← 工程6（既存4判定・keep_conditions）
│   │   ├─ generator/…                          ← 工程7（builders と readme-writer を統括）
│   │   ├─ l1-builder / skill-builder / agent-builder      ← 工程7 の各 Builder（生成対象は L1・Skill・Subagent の3種のみ。MCP/Hooks/Plugin 専用 Builder は無い・詳細設計書 §9.3）
│   │   ├─ readme-writer/…                      ← 工程7最終: 成果物 README/MANIFEST
│   │   ├─ eval-reviewer/…                      ← 工程9 コーディネータ（並列 eval-* を spawn）
│   │   ├─ eval-correctness / eval-security / eval-canon / eval-context / eval-keep-review
│   │   └─ canon-updater/…                      ← 機能X（詳細設計書 §13.1・`/canon` の委譲チェーン外・独立）
│   └─ skills/                     ← Skill 14件
│       ├─ canon（/canon）                       ← オーケストレータ Slash Command（disable-model-invocation:true）
│       ├─ update-docs                           ← 機能X 保守ループ（本体フロー非連動・詳細設計書 §13.1）
│       ├─ self-optimize                         ← 機能Y 自己再生成（本体フロー非連動・詳細設計書 §13.2.1・候補生成まで）
│       ├─ output-path-resolver / model-selection ← 共通
│       ├─ requirement-elicitation               ← ヒアリング設計（inline 専用）
│       ├─ feature-selection / layer-design / orchestration-patterns / existing-disposition  ← 判断
│       ├─ l1-generation / skill-generation / agent-generation  ← 生成（対応する Builder に preload。Hooks/MCP/Plugin 生成用 Skill は無い）
│       └─ quality-checklist                     ← 決定論ゲート仕様＋eval 観点の定義
│
├─ gates/                         ← 【検証ゲート・判定ロジックの不変土台】git 管理・最適化対象外（機能Y 不可侵）
│   ├─ g1_stage_order.js … g12_output_perfile.js  ← g1〜g12（純関数）
│   ├─ g13_worker_privilege.js    ← G13: 自身の .claude/agents/** の tools: にコマンド実行系ツールが無いか（preflight・詳細設計書 §11.2）。root 注入口あり（機能Y 昇格前検証・詳細設計書 §13.2）
│   ├─ g14_canon_consistency.js / g15_propagation.js / g16_ledger.js ← 機能X 専用ゲート（詳細設計書 §11.2・§13.1）
│   ├─ write-scope-guard.js / approval-guard.js / advance-guard.js / stage-guard.js / gen-guard.js  ← 発火配線が呼ぶ実処理（/canon run 用）
│   ├─ canon-update-scope-guard.js / canon-guard.js ← 機能X 専用の発火配線実処理（逆極性・詳細設計書 §11.3「ガードの3系統」）
│   ├─ self-optimize-scope-guard.js ← 機能Y 自己再生成専用の発火配線実処理（終端マーカー後も保護継続・詳細設計書 §13.2.1・§11.3「ガードの3系統」）
│   ├─ session-init.js             ← SessionStart 実処理（足場作りのみ・採番はしない。§11.3 注）
│   ├─ build-conformance-tables.js ← docs/ → conformance_tables/ を生成（手動編集しない）
│   ├─ lib/                        ← 共有ライブラリ（run/artifact/markdown/canon/managed-paths/generations＋design-map・investigation＝G2/G8 が design-map・系統A/B をパース。resolveTargetRoot は run.js）
│   └─ conformance_tables/         ← docs/ から生成（frontmatter/tools/paths.json・手動編集しない）
│
├─ eval/                          ← 【eval ハーネス（工程9・詳細設計書 §16）】git 管理。hooks から発火しない別系統
│   ├─ bundle.js                   ← 判定入力バンドル生成（決定論・宣言除去規約・§16.3）
│   ├─ verdict.js                  ← judge の verdict パース＋スキーマ検証（§16.4）
│   ├─ report.js                   ← eval-report 集約検証・カバレッジ規約（§16.5）
│   └─ meta-eval.js                ← judge の較正（ラベル付きコーパスの precision/recall・§16.6）
│
├─ output/                        ← 【成果物ステージング】gitignore・対象プロジェクトで版管理
│   └─ YYYYMMDD_hhmmss/
│       ├─ generated/              ← CLAUDE.md / .claude/{rules,skills,agents,settings.json} / .mcp.json / plugin
│       │   └─ .claude/README.md
│       ├─ .deploy/                ← 配置スクリプトの真実源（詳細設計書 §10.1）
│       │   ├─ managed-paths.list   ← 管理パス集合（base＋検出 .claude＋generator 出力）
│       │   ├─ retired.list
│       │   ├─ RUN.md               ← 配置手順書（emit-run-manifest.js が同梱・§10.2 run-manifest 方式。スクリプト正本は複製しない）
│       │   └─ pre-deploy-report.txt ← pre-deploy-check.js の照合結果（配置直前・対象で実行）
│       ├─ .gate/                  ← 権威マーカー・承認・ブロック（Hook/tools 専有・PreToolUse が deny-all・§4.4）
│       │   ├─ markers/<stage>.done   ← 終端マーカー含む（ガード有効条件の判定材料・詳細設計書 §11.3）
│       │   ├─ approvals/<kind>.approved ← tools/approve.js のみが鋳造（§4.4）
│       │   ├─ blocks/<x>.blocked
│       │   └─ processed.log          ← 消費規約の監査ログ＋カナリア結果（§4.5・詳細設計書 §11.5）
│       ├─ spec.md                 ← 承認状態は .gate/approvals に外出し（詳細設計書 §7）
│       ├─ design-map.md           ← 承認状態は .gate/approvals に外出し（詳細設計書 §9.2）
│       ├─ MANIFEST.md
│       ├─ eval/<axis>.md          ← 工程9 各軸 judge の verdict（本文＋json フェンス1個・§16.4）
│       └─ eval-report.md          ← 工程9（eval-reviewer が集約・マーカー書かない）
│
├─ work/                          ← 【調査中間成果物】gitignore
│   ├─ .session-ts                  ← `tools/new-ts.js`（`npm run ts`）が採番した ts。**SessionStart は採番しない**（詳細設計書 §11.3 注）
│   ├─ .canon-update-ts             ← `tools/new-canon-ts.js`（`npm run canon:ts`）が採番した機能X 専用 ts（詳細設計書 §13.1・`.session-ts` と相互排他）
│   ├─ .self-optim                  ← `tools/selfopt.js`（`npm run selfopt:begin`）が書く sentinel（label 記録・機能Y 自己再生成用・詳細設計書 §13.2.1・他2系統と3方向相互排他）
│   └─ YYYYMMDD_hhmmss/
│       ├─ target.txt                   ← 対象プロジェクトのルート（/canon run のみ）
│       ├─ existing_customizations.md   ← 系統A
│       ├─ project_profile.md           ← 系統B
│       ├─ requirements.md              ← 工程2
│       ├─ eval-bundle/<axis>/<case>.md ← 工程9 の判定入力バンドル（eval/bundle.js が生成・§16.3）
│       ├─ canon-diff-proposal.md       ← 機能X: 差分候補・固定フォーマット（詳細設計書 §13.1）
│       ├─ impact-report.md             ← 機能X: G15 波及 stale 検出レポート（詳細設計書 §13.1）
│       └─ .requests/                   ← 完了リクエスト（エージェント書込・Hook が消費削除・§4.3）
│
├─ deploy/                        ← 【配置スクリプト正本】git 管理。正本のまま実行（output へは複製せず RUN.md を同梱・詳細設計書 §10.2）
│   ├─ pre-deploy-check.js         ← 工程10①（詳細設計書 §10.2）。管理パス集合パターンは gates/lib/managed-paths.js を共有（G9 と同一 SSoT・§10.1）
│   ├─ deploy.js                   ← 工程10②（詳細設計書 §10.2）
│   └─ emit-run-manifest.js        ← 工程10 手順書 RUN.md を output/<ts>/.deploy/ へ同梱（§10.2 run-manifest 方式）
├─ tools/                         ← 補助 CLI（new-ts / new-canon-ts / approve / unblock / reopen / promote / rollback / selfopt / stage-candidate 等）
├─ tests/                         ← 自己検証テストランナー（詳細設計書 §15）
│   └─ helpers/                    ← テスト共通ヘルパ（詳細設計書 §15.2「テストハーネスの運用制約」・§15.3）:
│                                      paths.js（gates/lib/* の re-export）／hook.js（ガード子プロセス起動）／
│                                      run-state.js（sentinel 退避復元）／fixtures.js（frontmatter・サンプルリポ配置）／
│                                      ts.js（ts 名前空間レジストリ TS_NAMESPACES）
├─ fixtures/                      ← 代表シナリオ用サンプル対象リポジトリ（new/existing/constrained）。deploy テストは各ケース配下 expected-output/（= output/<ts>/ 相当: generated/ ＋ .deploy/*.list）を突合入力に使う
│   ├─ eval-corpus/<axis>/cases/  ← judge 較正用のラベル付きコーパス（正例／違反例＋label.json・§16.6）
│   └─ generations/                ← `npm run stage`/`promote` の入出力 fixture（実 generations/ を汚さないよう分離）
│       ├─ candidate-good-demo/     ← 正常系の次世代候補 fixture
│       └─ candidate-poisoned/      ← 機能Y 自己欺瞞実証 fixture（`tools: Bash` を持つ次世代候補・詳細設計書 §13.2）
├─ guide/                         ← 人間向け手順（セットアップ手順のみ。§14.1a）
├─ generations/                   ← 【世代管理・機能Y 用】配下は全て .gitignore（実行結果。詳細設計書 §13.2 が権威。次回 `/self-optimize`/`promote` 時に自動再作成）
├─ design/                        ← 本設計書2冊（基本設計書・詳細設計書）
│   ├─ basic-design.md             ← 本書
│   └─ detailed-design.md          ← 詳細設計書
├─ package.json                   ← npm scripts 全16件（build:tables / test / ts / approve / unblock 等）。
│                                    全件一覧は guide/setup.md §8 が権威。
│                                    approve = 承認鋳造の唯一経路（§4.4）／test = 配線テスト・必須（詳細設計書 §15.3）
├─ .github/workflows/ci.yml       ← 恒久 CI: 照合表の鮮度検査 → npm test（§15.2・os×node の matrix）
├─ .gitignore                     ← output/*・work/* を除外（.gitkeep で空ディレクトリのみ追跡）・generations/・tasks/ を除外
├─ .gitattributes                 ← 改行コードを LF に統一（text=auto eol=lf）
├─ LICENSE                        ← MIT License
├─ CHANGELOG.md                   ← claude-canon 自身の変更履歴（Keep a Changelog 形式）
└─ README.md                      ← 概要・10工程の要約・`guide/setup.md` への導線
```

### 14.1 `.claude/CLAUDE.md`（生成物側）の構成要件

本節は canon が**生成する対象プロジェクト向け**の `CLAUDE.md` の構成要件である。全 Subagent・全 Skill が前提とする共通規約のみを記載する。正典 `L1_CONTEXT_MANAGEMENT.md §2.1`・`BEST_PRACTICES.md §3.1` に従い **200行以下を厳守**し、手順・テンプレートは Skills に切り出す。

含めるべき: プロジェクト概要（正典駆動・出力分離の原則）／正典参照ルール（`docs/` は読込専用）／出力先規約への参照（詳細は `output-path-resolver`）／人間ゲートの案内／experimental 依存の注記方針／シークレット管理（直書き禁止・`${VAR}`・`userConfig sensitive`・`BEST_PRACTICES.md §7.2`）。

含めるべきでない（禁則）: 各 Builder/Skill の生成テンプレート実体／機能選定の決定木／層数判断基準／モデル割当ロジック／正典の構文詳細／多段ワークフロー手順（すべて対応する Skill に閉じる）。

### 14.1a claude-canon 自身の L1（`.claude/rules/`）の構成要件

開発規律の蓄積を機構的に自身へ取り込むにあたり、配置先には次の制約がある:

- **ルート `CLAUDE.md` は採用できない**: `tools/stage-candidate.js` は `generated/` の全ファイルが `.claude/` 配下であることを前提検査し、ルート `CLAUDE.md` を明示的に拒否する（候補世代レイアウト契約・詳細設計書 §13.2.1）。採用すると `/self-optimize` のステージングが構造的に落ちる。また `write-scope-guard.js`・`self-optimize-scope-guard.js` の保護対象トークンにも `CLAUDE.md`（ルート）は含まれず、run 中に無防備な書込先になる。
- **`.claude/rules/` を採用する**: (a) 両ガードの保護対象（`.claude/` 配下）に含まれる (b) `tools/stage-candidate.js` の `.claude/` 限定契約に適合する (c) `paths:` frontmatter によるパス条件付き遅延ロード（`L1_CONTEXT_MANAGEMENT.md §2.2`）で常時コンテキスト代償がほぼゼロ。

**構成**: 無条件ロードの `rules/workflow.md`（**40行以内厳守**。CLAUDE.md の200行制限よりさらに厳しくする——無条件ロードされる分量は最小限に留め、工程別の規律は `paths:` で有効域を絞る）と、`gates/**`・`docs/**`・`.claude/agents/** .claude/skills/**` にそれぞれスコープした3件の `paths:` 付き rule に分割する（§14 ディレクトリ構成参照）。教訓は都度「自分への規則」として rule 本文へ蒸留し切る。rule は要約でなく自己完結した規則として読めることを優先し、経緯・事故の詳細を rule 本文の前提にしない（当該コミット時点の git 履歴に残っていれば補助的に参照できるが、参照できることを規則の成立条件にはしない）。

**G10（README 生成）契約**: `.claude/rules/` の各ファイルは `kind: rule` として `.claude/README.md` に「自動ロード」として掲載する（`gates/g10_readme.js` の `method: 'auto-load'`）。

### 14.2 配置の判断根拠

- **docs/ → gates/conformance_tables/ の生成関係**が SSoT の実装。照合表は正典から生成し手動編集しない。
- **gates/ を .claude/ の外に**出したのが機能Y への最大の防御線（詳細設計書 §13.2 条件2 の物理実装）。機能Y は `.claude/` を作り替えるが `gates/` に触れない → 独立ゲートが作り替え後の本体を検証できる。
- **判定ロジック（gates/）と発火配線（.claude/settings.json）の分離**: 判定は `gates/`（不変土台）、発火は `.claude/settings.json`（可変・機能Y の改変対象）。機能Y が次世代を生成する際は「発火配線が正しく gates/ を呼ぶこと自体を昇格前検証の対象に含める」。**ただし配線の生存検証を機能Y（将来）まで先送りにはできない**: 配線が死ねば全ゲートが沈黙して vacuous pass するため、初版から `npm test`（配線テスト・必須化）とランタイム・カナリアで帯域外に検証する（詳細設計書 §11.5・§15.3）。
- **PreToolUse 3ガードはパスで判定**（詳細設計書 §11.3）: エージェント同一性に依存せず `tool_input` のパス（Bash/PowerShell はコマンド文字列）とサイドカー/ラッチの存在だけで効く。**この性質の帰結として承認は Write/Edit で行えない**（同一パスへの書込をオーケストレータとワーカーで識別できないため）。承認の鋳造は `tools/approve.js` に一本化し、`.gate/**` は deny-all とする（§4.4）。
- **`tools/` CLI がツール経路の外側にある意味**: `.gate/**` の deny-all はエージェントのツール発行（Write/Edit/Bash）を塞ぐが、CLI は人間または run 外のセッションが叩く。**「ガードで塞ぐ経路」と「承認を鋳造する経路」を物理的に別にした**のがこの配置であり、ワーカーの自己承認を構造的に不可能にする（§4.4・詳細設計書 §11.3）。
- **output/work は gitignore**（実行結果は対象プロジェクト側で版管理）。**システム本体は git 管理**。

---

## 付録: 決定事項の要約（早見表）

| 論点 | 決定 |
|---|---|
| 実行者 | 半自律（工程ごと人間ゲート P1〜P8） |
| 生成物 | 対象プロジェクト用の実運用カスタマイズ一式 |
| 工程順 | 調査1→ヒアリング→調査2→spec→選定→設計→生成→検証→品質検査→照合付き配置（10工程） |
| オーケストレーション | メイン Claude の Slash Command Skill（`/canon`）＋ Subagent 委譲＋ファイル駆動。handoffs 不採用 |
| 起動方式 | ネイティブ `subagent_type` を優先。未登録環境に限り general-purpose 経由＋定義ファイル Read 注入へフォールバック（`docs/L3_AGENTS.md §2.1`） |
| 工程2 | ワーカー化せずオーケストレータ直接対話。合意記録は requirements-recorder が直列化 |
| 使用不可制約 | `requirements.md` constraints に保持。機能選定の分岐を事前刈り込み。調査検出＋ヒアリング確認 |
| 成果物出力 | 全量スナップショット（output 配下・gitignore） |
| 既存扱い | 維持は再生成せず既存実体を verbatim コピー。改修/新規のみ内容生成 |
| 維持判定 | 積極的維持＝5条件 C1〜C5 クリア必須。G2（設計時点）＋G8（生成物）で二重検証。C2/C4 意味判断は eval 回付 |
| 配置 | 管理パス集合（詳細設計書 §10.1）を退避スワップで全置換（.bak 退避→コピー→失敗時 restore）。集合外は不可侵 |
| 検証/品質 | 決定論ゲート G1〜G16（真偽のみ・PreToolUse/PostToolUse/SubagentStop/UserPromptExpansion 発火）と eval（LLM-as-a-Judge）を分離。G1〜G12 は生成物検証、**G13 のみ自己検証（preflight）** |
| ゲート硬遮断 | PreToolUse deny（3ガード）と SubagentStop/Stop、**UserPromptExpansion（G13・run 開始をブロック）**。PostToolUse はブロック不可のため助言＋G12 権威再検証 |
| **承認の鋳造** | **`.gate/**` は deny-all。承認は Write/Edit で行わず `npm run approve -- <ts> <kind>`（`tools/approve.js`）が唯一の経路。取り消しも CLI（§4.4）** |
| **マーカーの巻き戻し** | **`npm run reopen -- <ts> <stage>`（`tools/reopen.js`）が唯一の取消経路。`<stage>` 以降の人間承認の事前取消を要求し、ガード（3種）と再検査（G1・G7〜G12 等）を再武装する（§4.5・詳細設計書 §11.3）** |
| **シェルの扱い** | **コマンド実行系ツール（`Bash`・`PowerShell`。Windows の主シェルである `PowerShell` を含む）を全ワーカーから剥奪（`tools:` に含めない）＝ G13（preflight・`UserPromptExpansion@/canon`）が機械強制し、違反なら run 開始をブロック。加えて write-scope-guard のコマンド文字列検査を保険として置く。適用は claude-canon 自身の `.claude/agents/**` のみで、生成物の Subagent は対象外（シェル正当）。オーケストレータ `/canon` は Skill ゆえ対象外＝シェル可。**列挙の網羅性が単一障害点**（漏れたツール経由で全ガードを迂回できる・§5.3・詳細設計書 §11.2 G13・§11.3）** |
| **ガードの有効条件** | **run が in-flight のときのみ有効（`work/.session-ts` の指す `output/<ts>/` に終端マーカーが無い間）。保守ループ・実装作業は run 外なので通る（詳細設計書 §11.3・§13.1）** |
| **`.requests/` 消費規約** | **鋳造→削除の順に固定。マーカー存在でキー付けした冪等演算（marker 有 & request 有 → 削除のみ）。`.gate/processed.log` で監査（§4.5）** |
| **配線の生存検証** | **`npm test`（配線テスト・必須）＋ランタイム・カナリア（工程1直前・deny されなければ中断）の二段。settings.json の自己検証は原理的に不可能（詳細設計書 §11.5・§15.3）** |
| gates/ | `.claude/` の外に置く不変土台（機能Y 不可侵）。照合表は docs/ から生成 |
| **機能X** | **正典更新**（`canon-updater`＋`/update-docs`＋G14〜G16＋`canon-update-scope-guard`）。`docs/` 書換は更新ゲート（人間承認）が唯一の関門。edit は `docs/`・`work/<ts>/` 限定。波及同期は G15 が検出のみ（詳細設計書 §13.1・§11.2・§11.3） |
| **機能Y** | **自己最適化**（世代分離・自己再生成・乖離検出・実昇格）。世代分離条件（G13 の世代適用＝自己欺瞞封鎖）を満たす（詳細設計書 §13.2） |
| ブートストラップ | 初版手書き→安定→機能Xで正典最新化→機能Yの世代基盤・昇格機構→自己再生成→実昇格の順に段階を踏む（詳細設計書 §13.3） |
