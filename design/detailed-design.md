---
title: claude-canon 詳細設計書
purpose: claude-canon の成果物フォーマット・決定論ゲートの実装契約・機能X（正典更新）／機能Y（自己最適化）の実装契約・自己検証と eval の実装契約を定める。システム全体像・工程順・オーケストレーション構造・調査工程・既存カスタマイズの全体最適化・ディレクトリ構成は基本設計書を参照。
audience: [ai, human]
canon_version: v2.1.251
---

# claude-canon 詳細設計書

本書は [基本設計書](basic-design.md) と対をなす。本書は §6・§7・§9〜§13・§15・§16 を収録し、
§1〜§5・§8・§14・付録は基本設計書にある。節番号は両書で重複しない。本書中の「基本設計書 §N」は
その節が向こうの文書にあることを示す。

---

## 6. 調査中間成果物フォーマット

系統A・系統Bは**別ファイル**。判定はせず事実抽出に徹する。

### 6.1 系統A: `work/<ts>/existing_customizations.md`

```
## サマリ
総数 / レイヤー内訳(L1〜L5) / 正典逸脱の疑い（事実のみ）

## レコード（1ファイル1件）
- path / layer / kind / strength
  purpose_verbatim: "<frontmatter description 転記>"
  frontmatter_keys / declared_tools / declared_model / declared_skills
  depends_on:
    customization_refs: [他カスタマイズ・設定への参照]   # C3 が見る対象
    project_refs:                                        # C5 が見る対象
      - kind: paths_glob      value: "src/**/*.ts"       # Rules の paths: frontmatter
      - kind: supporting_file value: "./scripts/x.sh"    # Hook スクリプト等
      - kind: path_reference  value: "src/legacy/"
  referenced_by: [逆参照]
  canon_conformance:
    frontmatter_keys_valid / unknown_frontmatter_keys / tool_names_valid / deprecated_notation
```

肝: `depends_on` を **customization_refs（カスタマイズ間依存＝C3） と project_refs（プロジェクト実体への参照＝C5）** に二分する。系統Aは抽出に徹し、解決も判定もしない。`canon_conformance` は真偽と差分のみ。

### 6.2 系統B: `work/<ts>/project_profile.md`

```
## profile（調査1・浅く広く・要件前）
languages / frameworks / build / package_manager
test: { frameworks / test_dirs / runner_cmd }
ci / conventions（naming/lint/format）/ repo_scale / existing_docs

## focused（調査2・深く狭く・要件確定後にのみ追記）
requirement_ref / scope
findings:
  - topic / evidence_paths（根拠必須）/ summary
extractable_templates:
  - source / as / note（Skill の supporting file 素材）
ref_resolution:                       # C5 の解決結果: 系統A project_refs を実リポジトリに照合
  - ref: "src/**/*.ts"  kind: paths_glob  resolved: true  match_count: 42  sample: "src/app.ts"
  - ref: "./scripts/x.sh"  kind: supporting_file  resolved: false  reason: "not found"
```

肝: `profile`/`focused` 分離（2段調査の構造）、`evidence_paths`（幻覚防止）、`extractable_templates`（接地の価値）、`ref_resolution`（系統A の project_refs を実リポジトリに解決した真偽＋サンプル・C5 の判定入力）。

**`evidence_paths` の書式契約**: 各項目は**対象リポジトリルート相対のパス**とする。
`gates/lib/markdown.js` の `parseListLike` は値が `/^\[.*\]$/` にマッチする場合のみカンマで
分割する。**複数パスを書くときは `[a, b, c]` の角括弧が必須**——角括弧を付けなければカンマ区切り
に見えても分割されず、**行全体が1本のパスとして扱われ**、G1 の実在検査（§11.2）で存在しない
パスとして幻覚扱いの違反になる（単一パスのみなら角括弧は無くてもよい）。
末尾に**行番号 suffix `:N` および行範囲 `:N-M` を付けてよい**（付けなくてもよい・bare path も有効）。
G1 の実在検査は**行番号 suffix を剥離してから** `existsSync` する。**1項目の中にカンマを含む複数
行番号（例 `path:12,40`）は許容しない**——角括弧の**内側**ではカンマが項目の区切りとして働くため、
`[path:12,40]` は `path:12` と `40` の2項目に分解され、`40` が単独の存在しないパスとして違反になる。
複数行を示したい場合は行範囲（`:12-40`）を使うか、`findings` エントリを分ける。

**値の語彙契約**: 系統A/B の自由記述は、構文（見出し・キー名）だけでなく**値の書式**も機械照合の対象になる。
以下は `existing-customization-analyzer`・`project-profiler` の両ワーカー定義に明文化し、
`fixtures/sample-repos/existing/expected-work/` の該当ブロックを実例として直接参照させること。

1. **`evidence_paths`（本節・上記）は複数パスに角括弧 `[a, b]` が必須で、裸パスで書く**
   （バッククォート囲みを使わない）。`gates/lib/markdown.js` の値展開は二重引用符は剥がすが
   バッククォートは剥がさないため、`` `foo.md:22-33` `` は `existsSync('`foo.md:22-33`')` として
   失敗し幻覚として弾かれる。角括弧の省略も同様に「行全体が1個の値」として実在検査に失敗する
   （本節冒頭「`evidence_paths` の書式契約」参照）。
2. **`canon_conformance.deprecated_notation` は文字列 `[]`（または未定義／空文字）のみが
   「無し」を表す**。「なし」等の自然文は厳密不一致で clean 扱いされない。`tool_names_valid`
   は `tools:` フィールドを宣言しない記録でも常に `true` と明記する（検査対象が無い＝空虚に
   適合、の慣例）。
3. **系統A `project_refs[].value` と系統B `ref_resolution[].ref` は文字列完全一致で結合する**
   （C5・`gates/g2_keep_judgement.js`）。節番号のまとめ書き（`"design.md §8, §8.1, §8.2"`）や
   複数参照の圧縮表記（`"a.js, b.js, c.js"`）は避け、**1参照につき1エントリ**を系統A/B の
   双方で同じ粒度・同じ文字列で書く。
4. **`kind: settings`（frontmatter を持たない JSON）のレコードは `canon_conformance.unknown_frontmatter_keys`
   を `[]` 固定とする**。JSON トップレベルキー（`.claude/settings.json` の `$comment` 系等）は
   frontmatter の概念が無いため「未知の frontmatter キー」として報告するのは圏域錯誤である。
5. **run 種別の sentinel ファイル**（`<ts>` プレースホルダを含まない `work/.canon-update-ts`・
   `work/.self-optim` 等）も、`work/<ts>/...` 形式の動的パスと同じ「run 実行中に動的生成されるパス」
   カテゴリに含める。ただしこれは**分類**の話であり、`resolved` の真偽は変えない——該当 run が
   非 in-flight なら `resolved: false` が引き続き正しい。

### 6.3 工程2成果物: `work/<ts>/requirements.md`

ヒアリング直後・人間合意の記録。他工程と同じファイル駆動に揃える（トレーサビリティ・機械照合のため）。

```markdown
## メタ
confirmed_at / confirmed_by（P2 の承認者）

## 確定要件（人間が言ったこと・合意したこと）
- id: R1
  want: <達成したいこと・ユーザーの言葉>
  strength_needed: <advisory|deterministic|enforced>   # 制約との衝突検出に使う
  priority: <must|should|could>

## 使用可能なカスタマイズ機能（環境制約・探索空間の事前刈り込み）
constraints:
  hooks:        { allowed: true|false, reason: "..." }
  mcp:          { allowed: true|false }
  plugins:      { allowed: true|false }
  experimental: { allowed: true|false, reason: "..." }   # Agent Teams/Channels/Monitors/Themes/context:fork
  organization_policy: <その他組織ポリシー由来の制約>

## 制約と要件の衝突（ヒアリング時点で見えたもの・方向づけまで）
conflicts:
  - requirement: R1（deterministic 希望）
    constraint: hooks 禁止
    note: <deterministic 不可。permission 承認(advisory)へ格下げか断念か。判定は plan だが人間に選択肢を提示>
```

肝と責務:
- `constraints` は要件と独立した環境条件で、機能選択（工程5）の分岐を事前に刈り込む入力。
- `strength_needed`（要件ごと）で制約との衝突（deterministic 希望なのに Hooks 禁止）を検出する。正典 `00_INDEX.md §4.4` の強度3段階（Advisory=CLAUDE.md / Deterministic=Hooks / Enforced=permissions）に対応。
- `conflicts` は方向づけまで（判定しない）。
- **制約の出所（合わせ技）**: 「調査での検出（Hook 不在・MCP 設定なし・ポリシー痕跡）＋ヒアリングでの確認（禁止か未使用か）」で暗黙の制約も捕捉する。

**`allowed: false` の意味論**: `allowed: false` は「**生成物のどこにも存在してはならない（絶対不在）**」を
意味し、G11（§11.2）はこれを機械的に強制する。既存改修モードで「対象が既にその機能を使用中で、維持
したいが新規追加は望まない」場合に `allowed: false` と記録すると、G11 は既存の keep 対象が単にその
機能を使っているだけで違反にしてしまう。**この意図は `allowed: true` ＋ `reason` に「既存維持・新規
追加なし」等を明記する**ことで表す（`allowed: false` を使わない）。ヒアリング（工程2・
`requirement-elicitation`）はこの区別をユーザーに確認する。

**使用不可制約の波及**:
- MCP 禁止 → 外部連携を生成物に含められない（代替: 手動手順の L1/L2 化）。
- Hooks 禁止 → 決定論ガードレールを生成物に含められない → permission 承認(advisory)へ格下げ or 断念。
- Plugins 禁止 → L5 配布不可。個別ファイル配置のみ。
- experimental 禁止 → `context: fork`／Agent Teams／Channels／Monitors／Themes 不可（生成物を制限）。
- **注意**: これは「生成物に含めてよいか」の制約であり、claude-canon 自身が使う決定論ゲートの Hooks（生成物検証用）には影響しない。

---

## 7. spec テンプレート（工程4成果物）

`output/<ts>/spec.md`。plan がこれだけで design-map を引け、検証／品質検査が受け入れ基準の出典にできる2条件を満たす。

主要セクション:
- **§0 メタ**: spec_id / canon_version / inputs（系統A・B 成果物のパス）。**`canon_version` の出典は正典 `docs/` のメタ情報表「確認したClaude Codeバージョン」のみ**とし、`gates/conformance_tables/*.json` の `canon_version` フィールドから読む（`extractCanonVersion()` が生成した値・§11.4）。**両設計書の frontmatter から複写してはならない**——設計書側の値は人手保守であり正典に対して遅れうる（§13.1）。承認状態は spec.md 内に持たせず、サイドカー `output/<ts>/.gate/approvals/spec.approved`（存在マーカー）で表す（§11）。このサイドカーは **`npm run approve -- <ts> spec` が鋳造する**（エージェントは `.gate/**` を書けない・基本設計書 §4.4）。
- **§1 目的とあるべき全体像**: purpose / strength 内訳 / scope_layer。
- **§2 新要件**: id / want / rationale / project_grounding（系統B focused から接地・evidence 付き）。
- **§3 既存資産の棚卸し**: 系統A 全レコードを参照。**維持/改修は決めない**（事実のみ）。
- **§4 統合方針**: 既存×新要件の競合・重複の**方向づけ**（最終判定は plan）。
- **§5 プロジェクト接地素材**: paths_hints / model_hint / supporting_file_candidates。
- **§6 スコープ外**: やらないことの明示（全体最適化の暴走防止）。
- **§7 制約**: security / cost / experimental（依存フラグ可否）。
- **§8 受け入れ基準**（4カテゴリ・検証／品質検査の出典）:
  - `functional`（A1）→ eval で判定（§9・詳細は §16）
  - `non_regression`（A2）→ 決定論ゲート（G8 が対象原本と output コピーを sha256 直接照合・§11）
  - `canon_conformance`（A3）→ 決定論ゲート（G3〜G7・G12）
  - `snapshot_integrity`（A4）→ 決定論ゲート（G9）
- **§9 未決事項**: 人間判断が要る論点（空でなければ次工程へ進めない）。

**責務三段分離**: 調査は判定しない → spec は方向づけまで → plan（design-map）が確定する。判定を一箇所（plan）に集約する。

---

## 8. （基本設計書に収録）

既存カスタマイズがある場合の全体最適化（判定の4選択肢・維持5条件 C1〜C5・改修/統廃合/廃止の切り分け・P5 レビュー形式）は基本設計書 §8 を参照。

---

## 9. design-map（工程5+6成果物・plan の中核インターフェース）

design-map は spec と並ぶ工程間インターフェース。`selector`（機能選定）→ `designer`（設計）が連続 spawn で生成し、`generator` の唯一の設計入力になる。「output ＝ design-map の射影」が全量スナップショットの設計的裏付け。

### 9.1 位置づけと責務

- 統合 spec（承認済み）を入力に**全体を引き直す**（既存 design-map を継承しない・基本設計書 §8）。
- 維持/改修/統廃合/廃止の判定を確定する（責務三段分離の「plan が確定」）。
- constraints（`requirements.md`）で機能選択フローチャート（`00_INDEX.md §4`）の分岐を事前刈り込みする。

### 9.2 構造

```
# design-map.md

## メタ
spec_ref: { path: output/<ts>/spec.md }
layers（生成物のオーケストレーション層数）: <2層|3層> / rationale: <層数の理由>   # ORCHESTRATION.md §5

## Used Features（起動すべき Builder の決定・generator が読む）
<L1/L2/L3/L4/L5 の8機能のうち該当するもの。非該当は N/A>

## レイヤー構成
L1: <CLAUDE.md / Rules と paths（spec §5 paths_hints 由来）>
L2: <Skills / Slash Commands・自動発動可否(disable-model-invocation)・context:fork 可否(constraints 整合)>
L3: <Subagents（責務・tools・model・skills preload）>
L4: <MCP servers / Hooks（constraints 許可時のみ）>
L5: <Plugin 化の有無（constraints 許可時のみ）>

## 既存判定（existing_disposition・基本設計書 §8）
existing_disposition:
  - path: .claude/agents/reviewer/reviewer.md
    disposition: keep
    keep_conditions:                     # 5条件を明示（1つでも false なら keep 不可）
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "..."
  - path: .claude/skills/old-test-gen/SKILL.md
    disposition: retire                  # or modify / merge
    reason_code: superseded_by_new
    superseded_by: .claude/skills/test-gen/SKILL.md
    manifest_note: "既存 old-test-gen は廃止。新 test-gen へ移行"
  - path: .claude/skills/self-optimize/SKILL.md
    disposition: modify
    interface_change: none               # modify のみで有効。§11.2 G2/G8 実装契約（C3）参照
    rationale: "本文に節を追加するのみ。frontmatter name は不変"

## Model Assignments
<各実行単位の model: 割り当て（spec §5 model_hint 由来・§9.4）>

## Interface Contracts
<カスタマイズ間の入出力・依存方向（generator が preload/参照整合を保つ材料）>

## Experimental Dependencies
<context:fork / Agent Teams / Channels / Monitors / Themes への依存箇所（constraints 許可時のみ・eval と G11 が見る）>

## 依存フラグ
<nesting 段数・isolation:worktree の要否>
```

肝: `keep_conditions` の5条件を明示的に並べ、1つでも false なら keep を選べない構造にする（判定を裁量でなく規則適用に近づける）。承認状態は design-map 内に持たせず、サイドカー `output/<ts>/.gate/approvals/design.approved` で表す（§11）。このサイドカーは **P5 の人間ゲート通過後に `npm run approve -- <ts> design` が鋳造する**（エージェントは `.gate/**` を書けない・基本設計書 §4.4）。

**`interface_change`**: `modify` レコードにのみ意味を持つ任意フィールド。値語彙は `none`（対外インタフェース＝frontmatter `name` を変えない）| `breaking`（変える、または不明）の2値で、**未記載は `breaking` とみなす**（現行挙動を既定として保つ）。`retire`/`merge` レコードへの宣言は誤解を招くため違反（disposition 自体が実体消失を意味するため `interface_change` は無意味）。designer は design 段階で生成物がまだ存在しないため、この宣言を**実照合できない**——強制は generator 完了後の G8 が担う(§11.2)。

### 9.3 生成物との対応（generator の責務）

- **keep** → 再生成せず、既存実体（`<target_root>/<相対パス>`）を Read → Write で output へ verbatim コピー。snapshot の G8 が対象原本と output コピーを sha256 バイト同一照合する（§11）。
- **modify / merge / 新規** → generator が生成する。
- **retire** → output から除外・MANIFEST 廃止欄へ。
- design-map 全ファイル ⇔ output の過不足ゼロを G9 が検証。
- **配置リストの出力**: generator は工程7の最終処理で `output/<ts>/.deploy/managed-paths.list`（管理パス集合＝base ＋系統A が検出した `.claude/` 互換パス）と `.deploy/retired.list`（**対象から意図的に消えるファイル＝disposition:retire ＋ merge の被統合元**を対象相対パスへ落としたもの）を出力する。merge 被統合元は統合先へ集約され対象から消えるため、retire と同じく「想定内の消失」として retired.list に載せる（さもなくば pre-deploy-check が uncaptured と誤検出する）。pre-deploy 照合・配置スクリプトの唯一の入力（§10）。

### 9.4 モデル割当の根拠

正典 `L3_AGENTS.md §2.1`・`BEST_PRACTICES.md §3.3` に基づき、Opus / Sonnet / Haiku の3段階で割り当てる。`haiku`（=`claude-haiku-4-5`）は次を**すべて満たす**役割にのみ採用する:

1. 設計判断・文脈推論を伴わない（機械的構造化・固定フォーマット出力に限る）。
2. 正典 `docs/` を参照せず完結する（生成/判断 Skill を preload しない）。
3. 失敗コストが低い（後続工程または eval が出力を検証する）。

`fable`（Claude Fable 5）は公式エイリアスとして指定可能だが canon フローでは既定採用しない。詳細ロジックは `model-selection` Skill が保持し、designer が design-map の `## Model Assignments` に記録する。

---

## 10. デプロイ（照合付き手動工程・退避スワップ）

配置は claude-canon の外（人間が対象リポジトリで実行）で Hook が発火できないため、決定論ゲート（生成時検証）とは別に、配布物としての照合＋配置スクリプトを output 同梱し人間が回す。

### 10.1 管理パス集合（canon が置換してよい範囲）

「全量スナップショット」は `.claude/` 全体の全削除ではない。canon が生成・維持の対象とする **管理パス集合（managed path set）だけを全置換**する。集合外には一切触れない。

管理パス集合（base）:
```
CLAUDE.md
.claude/rules/**
.claude/skills/**
.claude/agents/**
.claude/settings.json          ← Hooks 配線を生成する場合のみ
.claude/hooks/**               ← Hook ハンドラ実体を生成する場合のみ（L4）
.claude/README.md              ← 成果物の使用説明書（§12）
.mcp.json
plugin/**                      ← L5 化する場合のみ
```

- **`.claude/hooks/**` を集合に含める理由**: 正典 `L4_AUTOMATION.md §2.1` の公式例は hook ハンドラ実体を `${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh` に置く（`:350`・`:363`・`:375`・`:401`・`:445`。`ORCHESTRATION.md:455-479` も同じ）。§11.2 の G11 検出経路③も「hook スクリプトの実体配置（`.claude/hooks/**`）」を前提にしている。集合外のままだと (1) 正典の公式例どおりの生成物が G9 の集合内包検査で弾かれ、canon は**自分の正典が示す形を生成できない**、(2) `.claude/settings.json` だけが配置され参照先スクリプトが配置されない**壊れた配線**を deploy が作る。代償として `.claude/hooks/**` は退避スワップの管理下（＝廃止もできる）に入るが、対象側の canon 管理外 hook を消す危険は §10.2① の uncaptured 判定（exit 2）が引き受ける——集合外の現状は**取りこぼしを検出する機会そのものが無い**ため、加えたほうが安全側でもある。

- **集合外は不可侵**: CI ワークフロー（`.github/workflows/`）・`CODEOWNERS`・その他プロジェクト固有ファイルは削除も上書きもしない。
- **検出パスの加算**: 系統A が対象側の追加カスタマイズパスを検出した場合のみ、その検出パスを集合に加える（`.claude/` 全体を一括削除しない）。
- **user-profile 側（`~/.claude/`）は集合に含めない**: cross-project の個人設定であり対象プロジェクトの版管理外。常に除外する。
- **実データ化**: 管理パス集合は検出分で実行ごとに変わるため、スクリプトにハードコードせず generator が `output/<ts>/.deploy/managed-paths.list` へ機械可読リストとして出力する（§9.3）。配置スクリプトはこれのみを読む。

### 10.2 取りこぼし照合と退避スワップ

verbatim コピー（§9.3）は「調査で把握済みの keep が消える」事故を閉じるが、**管理パス集合内で調査が取りこぼした／調査〜デプロイ間に対象側で増えた**ファイルは design-map にも系統Aにも載らず、置換で黙って消える。防御は破壊の直前に実物どうしを突き合わせるしかない。ゆえに工程10を照合付き手動工程へ格上げし、配置本体を退避スワップにする。

```
① pre-deploy-check（配置直前に対象で実行・照合専用）
   入力: 対象の【実】管理パス集合 全ファイル（ライブ状態）＋ output/<ts>/ 全ファイル
   判定: 集合内で「対象に在って output に無い」を列挙＝置換で消えるもの
   区分: retired（意図的廃止・merge 被統合元を含む・想定内）/ uncaptured（調査取りこぼし・要注意）
   出力: pre-deploy-report（消えるファイル一覧＋区分）
        ▼
   P8: 消失予定を人間確認
        ▼
   uncaptured が1件でもあれば → 配置を止め調査 or design-map へ差し戻す
   retired のみ → ② deploy（退避スワップ）
② deploy（P8 承認後に実行）
   step1: 対象の管理パス集合を .claude-canon.bak.<ts>/ へ mv で退避（削除でなく退避）
   step2: output/<ts>/ の管理パス集合を対象へコピー配置
   step3: post-check（配置後に集合が output と一致するか簡易確認）
   step4: 成功→.bak 保持（ローカル revert 用）／失敗→.bak から restore（配置前状態へ戻す）
```

- **原子性**: mv 退避により「対象にも .bak にも無い窓」を最小化し、コピー途中失敗でも restore で配置前状態へ戻せる。
- **ロールバック**: 対象側 git の revert に加え、直近の `.claude-canon.bak.<ts>/` から手動 restore できる。.bak の掃除は人間が明示的に行う。

#### 実装契約（上記骨子を実行可能な精度に落とす）

pre-deploy-check / deploy は `deploy/` 正本（基本設計書 §14）の**スタンドアロン CLI**（hook ではない — 工程10 は run 外）。`<ts>` は `<output-dir>` のディレクトリ名から取得し、run を in-flight 化しない（`mintTs`/`.session-ts` に触れない）。引数は `pre-deploy-check.js <output-dir> <target-repo-dir>` と `deploy.js <output-dir> <target-repo-dir> [--confirm]`。

- **管理パス集合の実体化**: §10.2① 入力の「対象の【実】管理パス集合 全ファイル」は、§10.1 の管理パス集合パターン（`gates/lib/managed-paths.js` の `MANAGED_PATTERNS`。G9 と同一の SSoT）を `<target>` に適用して**実在するファイル全部**。`managed-paths.list` は「output 側が配置する集合」の権威（step2 の配置対象）を与え、パターンは「集合の名前空間」（取りこぼし検出の走査範囲）を与える。両者は独立に効く（list のみを読むと取りこぼしを検出できないため、走査はパターンで行う）。
- **pre-deploy-report の実体**: `output/<ts>/.deploy/pre-deploy-report.txt`（＋ stdout）。消えるファイルを **retired / uncaptured** に区分し件数を記す。retired 判定は `retired.list`（対象相対パス）との一致。**uncaptured ≥ 1 で exit 2**（配置中断＝調査 or design-map へ差し戻し）。retired のみ／0 件で exit 0。
- **P8 の CLI 表現**: `deploy.js` は `--confirm` 無しでは配置予定を表示するのみで**配置しない**（人間承認 P8 の機械的裏付け）。実行時に pre-deploy-check 相当を再実行し、**uncaptured ≥ 1 なら配置を拒否**する（P8 を無視した配置を防ぐ最終防波堤）。
- **post-check の一致**: step3 は配置後、集合内の各ファイルが output と **sha256 バイト同一**であることを確認する（§9.3 keep の G8 と同じ非退行基準）。不一致は step4 の restore を起動する。
- **原子性・ロールバック**: step1 は mv 退避、post-check 失敗時は `.bak` から restore（配置物を除去し退避物を戻す）し exit 2。成功時は `.bak` を保持し revert 手順（git revert ＋ `.bak` 手動 restore）を出力する。`.bak` の掃除は人間（上記既述）。
- **run-manifest 同梱**: pre-deploy-check.js / deploy.js は `gates/lib/managed-paths.js`（管理パス集合の SSoT）を相対 import しており素朴な複製では単体動作しない。さりとて `managed-paths.js` も複製すると管理パス集合のパターン定義が正本と output コピーの2箇所に分裂し、一方だけが仕様に追従する単一障害点になる。集合の網羅性が破れると退避スワップが不可侵領域を破壊しうる（§10.1）ため、この定義は**二重化しない**。ゆえにスクリプトは canon 正本のままとし、output には**実行手順書 `RUN.md` のみを同梱**する（`deploy/emit-run-manifest.js`）。RUN.md は固定テンプレートで、変数は `<ts>`・output/target/canon の絶対パスと、`managed-paths.list`/`retired.list` から読んだ配置集合・廃止集合の要約のみ（自由作文しない）。emit-run-manifest も pre-deploy-check / deploy と同じ run 外 CLI（`.session-ts` に触れない）で、引数は `emit-run-manifest.js <output-dir> <target-repo-dir>`。オーケストレータが工程10 の冒頭で実行し、以降の手順（pre-deploy-check → P8 → deploy --confirm）は RUN.md と同一。
- **自己指定の拒否**: `pre-deploy-check.js`・`deploy.js`・`emit-run-manifest.js` の3本は、`<target-repo-dir>` を `path.resolve` した結果が `CANON_ROOT`（claude-canon 自身）と一致する場合、**exit 1 で拒否**する。工程10（退避スワップ配置）は対象プロジェクトの `.claude/` に人間が回す運用を前提としており、対象に claude-canon 自身を指定すると**稼働中の実行体を、機能Y の昇格前検証（G13・G3〜G6・`npm test`・自動ロールバック・§13.2）を一切通さずに置換できてしまう**。自己再生成の唯一の正しい経路は世代ステージング（`tools/stage-candidate.js`）→ `tools/promote.js` であり、この3本には自己指定の経路を存在させない。

---

## 11. 決定論ゲート（G1〜G16・完全リスト）

工程8。すべて真偽が機械的に決まる。LLM 主観はゼロ。判定ロジックは `gates/`（不変土台・基本設計書 §14）に置き、`.claude/settings.json` の Hooks 配線が発火させる。

### 11.1 発火系統（`L4_AUTOMATION.md §2.1` に基づく）

- **per-file 系統**: 単一ファイルで真偽が確定するもの。**PostToolUse**（output 配下への書込1件ごと）で発火。**PostToolUse はブロック不可**のため助言（非ブロッキング）とし、違反はブロックラッチへ転写する。読取失敗（環境要因）は誤ブロックを避けるため非ブロッキング降格し、権威判定は G12 が担う。
- **snapshot 系統**: 全量そろって初めて真偽が決まるもの。**SubagentStop / Stop**（完了リクエスト `.requests/generation` を消費したとき）で発火。**SubagentStop / Stop はブロック可能**（`Stop` は連続8回 block でターン強制終了・`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で変更可）。
- **stage 系統**: 工程規律・設計時点の検証。**SubagentStop / Stop**（各ステージの完了リクエストで分岐発火）。
- **preflight 系統**: **メタシステム自身の健全性**を run 開始前に確定するもの。**`UserPromptExpansion`**（`/canon` の展開時）で発火し、違反なら exit 2 で **run の開始自体をブロック**する。`L4_AUTOMATION.md §2.1` の一覧で `UserPromptExpansion`（スラッシュコマンド展開時）は **Block可（✅）**。他の3系統が「その run の成果物」を対象にするのに対し、本系統だけは**対象が claude-canon 自身**である（§11.4・G13）。
- **バッチ発火は冪等**（基本設計書 §4.5 消費規約）: マーカー既存のリクエストは判定を再実行せず削除のみ。ゆえにリクエスト残留による G バッチ再発火はブロックラッチの偽陽性を生まない（基本設計書 §2 工程9 の「eval は G バッチ非発火」の担保）。
- 破壊的失敗・書込先/承認/前進の違反は **PreToolUse** で `permissionDecision: deny`（後述の3ガード）。**exit 2 のみがブロッキング**（exit 0＝成功パース、1/その他＝非ブロッキング）。

### 11.2 ゲート一覧

| ゲート | 内容 | spec 対応 | 系統 | 発火契機 |
|---|---|---|---|---|
| **G1** 工程順・状態 | focused 空欄違反／evidence_paths 実在／open_questions 残存／requirements の enum（strength_needed・priority）／承認サイドカーの存在＋approved_by／work/<ts>/existing_customizations.md 実在（系統A成果物・§6.1） | 規律 | stage | SubagentStop@各リクエスト |
| **G2** 維持判定妥当性 | keep 全レコードで keep_conditions C1〜C5 が true／**実照合**: C1（対象原本が正典 frontmatter/tools 適合）・C3（keep の依存先が同 design-map で retire/modify されない）・C5（対象原本の project 参照が対象リポジトリで解決）／**形式検査のみ**: C2・C4 が true 宣言（意味判断は eval へ回付・基本設計書 §8.4）／廃止の manifest_note | A2 | stage | SubagentStop@design |
| **G3** パス規約準拠 | 許可パス合致／拡張子・種別整合／skill ディレクトリ名＝name 一致※／**skill パッケージ配下の supporting files は違反にしない**（正典 `L2_SKILLS.md §2.1` ディレクトリ構造の明示的許可） | A3 | per-file | PostToolUse |
| **G4** frontmatter スキーマ | 必須キー存在（Subagent: name＋description）／未知キー検出／型・語彙照合 | A3 | per-file | PostToolUse |
| **G5** tools/ツール名 | Claude Code の正規ツール名（Read/Write/Edit/Bash/Grep/Glob/WebFetch 等）照合／旧称・非実在ツール検出／MCP `mcp__server__tool` 構文 | A3 | per-file | PostToolUse |
| **G6** セキュリティ | secret ハードコード検出／`.mcp.json` の `${VAR}` 展開遵守／experimental 依存フラグ明示 | §7 | per-file | PostToolUse |
| **G7** 参照整合 | preload skill（`skills:`）実在／`disable-model-invocation:true` skill を preload していない／description による委譲トリガーの妥当／supporting files 実在／**skill パッケージに定義ファイル `SKILL.md` 実在**／plugin 参照実在 | A2 | snapshot | SubagentStop@generation |
| **G8** 非退行 | 維持ファイル全量が output に存在／**対象原本と output コピーが sha256 バイト同一**（ゲートが両者を Bash で算出）／廃止の明示照合 | A2 | snapshot | SubagentStop@generation |
| **G9** スナップショット完全性 | design-map ⇔ output 双方向突合／MANIFEST ⇔ output／空でない出力／managed-paths.list が base ＋検出 `.claude/*`＋(L5)plugin のみ（集合外を排除・§10.1） | A4 | snapshot | SubagentStop@generation |
| **G10** README 整合 | 網羅性／起動方式の正典整合（§12.4 導出ルール一致）／セットアップ完全性／内部専用の非露出 | README 機能 | snapshot | SubagentStop@generation |
| **G11** 制約遵守 | `requirements.md` constraints に違反する生成物の検出（hooks 禁止なのに hook 含む／experimental 禁止なのに context:fork 使用 等） | requirements.md | snapshot | SubagentStop@generation |
| **G12** per-file 権威再検証 | 停止時に全 output カスタマイズへ G3〜G6 を再実行（PostToolUse の読取失敗で非ブロッキング降格した分を網羅）／output ツリー不在は違反（vacuous pass 防止） | A3 | snapshot | SubagentStop@generation |
| **G13** ワーカー権限ポリシー（自己） | **claude-canon 自身**の `<canon_root>/.claude/agents/**/*.md` の frontmatter `tools:` に **コマンド実行系ツール（`Bash`・`PowerShell` 等）が含まれていたら違反**（run 開始をブロック）／agent 定義ファイルの `tools:` が読めない・不正なら違反（vacuous pass 防止）／**root 引数省略時は既定で `<canon_root>` を検査するが、機能Y の昇格前検証（§13.2）から `generations/candidate-*/.claude/agents/**` を指定して呼び出せる** | 基本設計書 §5.3 | **preflight** | **UserPromptExpansion@`/canon`**／**`tools/promote.js` 昇格前** |
| **G14** 正典整合（機能X） | `docs/` 9ファイルの確認バージョン・調査日が全ファイルで一致／`docs/SOURCES.md` 更新履歴に当該調査日の行が1件以上ある／`gates/build-conformance-tables.js` 相当を in-process 実行し `ExtractionError` なし・`canon_version` が docs 宣言と一致 | §13.1 | snapshot（機能X） | SubagentStop@canon-update |
| **G15** 波及 stale 検出（機能X・検出のみ） | 直前 `docs/` 内容（`git show HEAD:`）と更新後の差分から「変化した値」を抽出し、`.claude/**`・`gates/**`・`tests/**`・両設計書中の**旧値**の残存を `work/<ts>/impact-report.md` へ列挙。**判定はブロックしない**（レポート生成自体が合格条件・0件でも生成必須） | §13.1 | snapshot（機能X） | SubagentStop@canon-update |
| **G16** `[要確認]` 台帳整合（機能X） | `docs/00_INDEX.md §10` の各行が「未解決」／「取り消し線＋解決済＋日付」のいずれかにパース可能（形式検査）／docs 全体の `[要確認]` 実マーカー総数と `canon-diff-proposal.md` の申告値が一致／乖離は `impact-report.md` へ報告（判定はしない） | §13.1 | snapshot（機能X） | SubagentStop@canon-update |

- **G3「skill ディレクトリ名＝name 一致」（※）は正典由来ではない第3の例外**: §11.4 は「判定の出典は必ず正典 docs／例外は G11 と G13 の2つ」と述べるが、G3 のこの1項目だけは正典に根拠が無い（`L2_SKILLS.md` は「既定: ディレクトリ名」と述べるのみで、`name` を明示した場合の一致まで要求していない）。設計由来の追加規律として`gates/conformance_tables/paths.json` の `design_derived_requirements`（`status: accepted_by_human`）に隔離したうえで検査対象に含める。G3 の他2項目（許可パス合致・拡張子種別整合）は通常どおり正典由来。詳細は §11.4 を参照。
- **G3 の skill supporting files 許容（2026-09-03 裁定）**: G3 はかつて「skill ディレクトリ配下のファイル名は固定 `SKILL.md`」として `.claude/skills/<name>/template.md`・`examples/*.md` を一律違反にしていたが、これは**正典に反する誤検出**である。`L2_SKILLS.md §2.1`「ディレクトリ構造」は `SKILL.md`（必須）に加えて `template.md`／`examples/`／`scripts/`（任意）を明示的に許可し、§4.1 は「長大な参考資料は supporting files に分離」を推奨、§4.2 は本文からの `[xxx.md](./xxx.md)` 参照を求める。G7 の判定④は逆に**その実在を要求**しており、G3 と G7 が正面から矛盾していた（実測: 2026-09-03 の `/canon` run `20260903_091044` で設計者が回避を強いられた）。`filename_fixed: SKILL.md` は**スキル定義ファイルの名前**が固定であることを述べるのみで同ディレクトリの他ファイルを禁じてはいない——ゆえにこれは※の「設計由来の第3の例外」に属する話ではなく、**正典由来ルールの適用範囲の誤り**であり、`design_derived_requirements` へ移すのではなく G3 を狭めて解決する。許可の出典は `gates/conformance_tables/paths.json` の `kinds.skill.package_layout`（`build-conformance-tables.js` が §2.1 のツリー図から抽出。抽出できなければ `ExtractionError` で落ちる）。
  - **副作用で塞がっていた穴の塞ぎ直し**: 旧規則は副次的に「skill パッケージに `SKILL.md` が実在する」ことも保証していた（他の名前を置けなかったため）。規則を狭めた以上この保証は明示的に持ち直す必要があり、G7 に判定⑥（skill パッケージの定義ファイル実在）を新設した。無いとサイレント不発火（`Skill.md` のような綴り違いでスキルがロードされず、エラーも出ない）が全ゲートを素通りする（§11.5）。
  - **per-file 非対象**: supporting files はワーカー定義ではないため G3/G4 のスキーマ検査対象から外す。除外判定は `gates/lib/non-schema.js`（SSoT）が `skillPathRole()`（`gates/lib/artifact.js`）へ委譲する形で持ち、`.claude/hooks/**`（hook ハンドラ実体・§10.1）も同じ経路で除外する。

- **G11 と G6 の区別**: G6 は普遍的な安全性（secret・experimental 依存の明示）、G11 はこのプロジェクト固有の環境制約（`requirements.md` 由来）。designer が良かれと Hooks/context:fork を使う設計を出しても、制約違反なら生成前に弾ける。
- **G13 と G5／G4 の区別（置き場の根拠）**: G13 の対象であるコマンド実行系ツールは**正規のツール名であり、G5 は正しく pass させる**。「正規ツール名だが特定ロールには許さない」は**権限ポリシー**であって名前照合（G5）でも frontmatter スキーマの型・語彙照合（G4）でもない。責務が異なるため相乗りさせず新ゲートを立てる。
- **G13 が per-file 系統でない理由（決定的）**: G3〜G6 は **`output/` 配下への書込1件ごと**に発火する（§11.1）。しかし G13 の対象である claude-canon 自身の `.claude/agents/**` は、**write-scope-guard が `.claude/` を保護しているため run 中に一度も書かれない**（§11.3）。ゆえに G5 に相乗りしても、あるいは G13 を per-file 系統に置いても、**発火機会が構造的にゼロ＝検査が沈黙する**（§11.5 が警告する vacuous pass そのもの）。対象が「run の成果物」でなく「run を実行する主体」である以上、発火も run の**外側＝開始前**に置かねばならない。これが preflight 系統を新設した理由である。
- **G8 と G2 の区別**: G8 は生成後の生成物検証（維持ファイルが verbatim コピーで正しく保全されたか）、G2 は design 時点の判定妥当性検証（維持5条件を満たさないのに keep と判定していないか）。両段で検証する。
- **「LLM 主観ゼロ」の範囲**: G2 が真偽判定するのは C1/C3/C5 の実データ照合と C2/C4 boolean の形式検査のみ。C2/C4 の意味的妥当性は eval（工程9）が受け持ち、疑わしきは P5 で人間確認する。
- **G14〜G16 は `/canon` の run 系統と分離した別系統**（機能X・§13.1）: 発火は `work/<ts>/.requests/canon-update` の消費であり、`/canon` の `.requests/generation` とは別名前空間（`work/.canon-update-ts` が指す `<ts>`）。`/canon` run と機能X run は相互排他（同時に in-flight にならない・§13.1）なので、両系統のバッチが同一 `<ts>` を取り合うことはない。
- **G15 が「検出のみ・非ブロッキング」である理由**: §13.1 の安全制約は「edit 範囲を `docs/` に限定・判定しない・人間ゲート必須」。波及の**要否**（`.claude/` 側の複写をどう直すか）は意味判断を要し、機械が決めてよい事柄ではない。G15 の役割は「レポートを生成しないまま run が終わる」ことを防ぐ（vacuous pass の一種）ことに限定し、内容の当否には踏み込まない。
- **G16 の実測背景**: `docs/00_INDEX.md §10` の `[要確認]` 台帳は運用上 drift しやすいと実測済みである。G16 は「台帳が更新されたことの形式」を検査するのであって、`[要確認]` の解消そのものを判定しない。
- **G7 supporting file 判定の2段構え契約**: `checkSupportingFiles` は SKILL.md body 中のバッククォート付きパス様トークンを一律スキルディレクトリ相対で解決していたため、リポジトリ相対の地の文参照（例: `` `gates/lib/run.js` ``・`` `docs/` ``・`` `.claude/settings.json` ``）や一般名詞的なファイル名の言及（例: `` `template.md` ``・`` `spec.md` ``・`` `CLAUDE.md` ``）を supporting file 参照と誤認していた。判定③（description の委譲トリガー）が「正典に MUST の明文が無い」場合を error/warning の2段に分けている前例（本節 G7 行の記述）と同じ理由で、④（supporting files 実在）も2段構えとする:
  - **Tier A（error・ブロッキング）**: `./`・`../` を冠する明示相対トークン、または**トークンの第1セグメントがスキルディレクトリ直下に実在するエントリ名と一致する**トークン（例: `examples/` が実在する場合の `examples/sample.md`）。これらは構造上 Progressive Disclosure 参照であることが確定するため、実在しなければ従来どおりブロックする。
  - **Tier B（warning・非ブロッキング）**: Tier A に該当しない残りのトークンは、スキルディレクトリ → `generated` root → target root（`resolveTargetRoot`）の順に解決を試み、いずれでも解決できないものを「参照先が解決できないパス様トークン」として**報告に留める**（黙って捨てない・vacuous pass の逆＝過検出の防止）。

#### G2/G8 実装契約（上記骨子を実行可能な精度に落とす）

G2/G8 は design-map の `existing_disposition`（§9.2）をパースする。design-map パーサ `gates/lib/design-map.js`（`parseExistingDisposition`）と系統A/B パーサ `gates/lib/investigation.js`（`parseSystemA`/`parseSystemB`）を `gates/lib/markdown.js` ベースで新設する（依存ゼロ・`artifact.js` の frontmatter パーサはネスト YAML 非対応ゆえ使えない）。対象原本ルートは `gates/lib/run.js` の `resolveTargetRoot(ts)`（`work/<ts>/target.txt`）で解決する。

- **G2（stage=design）判定入力対応**（keep 全レコードで）:
  - **C1（実照合）**: 系統A（`work/<ts>/existing_customizations.md`）の当該 path の `canon_conformance` が clean（`frontmatter_keys_valid=true` ∧ `unknown_frontmatter_keys` 空 ∧ `tool_names_valid=true` ∧ `deprecated_notation` 空）。
  - **C2・C4（形式検査のみ）**: design-map の `keep_conditions` の該当 boolean が `true` 宣言か。意味的妥当性は eval（工程9・**実装契約は §16**）へ回付する（G2 は宣言 true をそのまま受理し、意味は検証しない）。**回付先の eval には、この宣言 boolean と rationale を渡してはならない**（judge が判定対象自身の主張に自己一致して恒真になるため・§16.3 の宣言除去規約）。
  - **C3（実照合）**: 系統A の当該 path の `depends_on.customization_refs` の各先が、同 design-map で以下のいずれにも該当しないこと。
    - **`retire`/`merge`**: 依存先の実体が消えるため**常に違反**（実照合の余地なし）。
    - **`modify`**: 当該レコードが `interface_change: none` を宣言していれば**健全とみなす**（宣言だけで通る恒真経路を作らないため、この宣言は G8 が generation 段階で実照合する。下記）。宣言が無い（＝`breaking`）なら従来どおり違反。`interface_change` に `none`/`breaking` 以外の値、または `retire`/`merge` レコードへの宣言は values 契約違反（§6.2）。
    - **背景**: claude-canon 自身の自己最適化 run（`/self-optimize`）では `.claude/settings.json` が複数の Slash Command Skill を参照するため、旧 C3（`modify` を無条件違反）だと Slash Command を1つでも改修すると自己最適化が永久にブロックされる構造的トラップがあった。
  - **C5（実照合）**: 系統A の当該 path の `depends_on.project_refs` の各 ref が、系統B（`work/<ts>/project_profile.md`）の `ref_resolution` で `resolved=true`。
  - `keep_conditions` のいずれかが `false` 宣言なら keep 不可＝違反。retire/merge レコードは `manifest_note` 非空を照合。**keep 0件・design-map 不在を成功と誤認しない**（vacuous pass 防止・§11.5）。
- **G8（stage=generation）照合経路**: design-map の `disposition:keep` 集合について、対象原本 `<target_root>/<相対パス>` と output コピー `output/<ts>/generated/<相対パス>` を `sha256File`（`gates/lib/managed-paths.js`）でバイト同一照合し、keep 全量が output に存在することを確認する。retire/merge 被統合元は output に非在かつ `.deploy/retired.list` に明示されていること（廃止の明示照合）。keep 0件を成功と誤認しない。
  - **`interface_change: none` の実照合**: `modify` disposition のレコードが `interface_change: none` を宣言している場合、対象原本と output コピーの **frontmatter `name` が同一**であることを照合する（`gates/lib/artifact.js` の `parseFrontmatter` を使う）。frontmatter を持たない対象（`.json` 等）への `none` 宣言は「検査不能＝違反」とする（G11 の未知キー規約・§11.4 と同じ規律——宣言と強制の乖離を許さない）。この実照合が、design 段階では確かめようのなかった C3 の宣言を工程をまたいで裏取りする（宣言だけで keep が通る恒真経路を塞ぐ）。
- **G13 の適用範囲＝パスで截然と分ける（最重要）**: G13 は **claude-canon 自身のワーカー**にのみ適用し、**canon が生成する対象プロジェクト向け生成物には絶対に適用しない**。対象プロジェクトの Subagent がコマンド実行系ツールを持つことは正当だからである（テスト実行・ビルド・lint など）。両者はパスで交わらない:

| 対象 | パス | コマンド実行系ツールの可否 | 見るゲート |
|---|---|---|---|
| **claude-canon 自身のワーカー**（メタシステムの実行主体） | `<canon_root>/.claude/agents/**/*.md` | **禁止**（G13 違反・run をブロック） | **G13**（preflight） |
| **生成物の Subagent**（対象プロジェクトで動く） | `output/<ts>/generated/.claude/agents/**/*.md` → 配置後 `<target_root>/.claude/agents/**` | **正当**（要件しだい。G5 が正規ツール名として pass させる） | G3〜G6・G12（per-file / snapshot） |

  肝: 判定材料は**パスの所属ツリー**（`<canon_root>/.claude/` か `output/<ts>/generated/` か）であり、エージェント同一性にも意味判断にも依存しない（§11.3 の「`tool_input` で判定」と同じ規律）。**`docs/` 由来の照合表（§11.4）で決まるのは G3〜G6 の側だけ**で、G13 は正典由来でなく本設計書 §11.3 由来の自己規律である（G11 が `requirements.md` 由来であるのと同じ構図）。
- **G13 の対象外**: `gates/` スクリプトと `tools/` CLI は **execute を持つ必要がある**（基本設計書 §4.3・詳細設計書 §11.3）が、これらは**エージェント定義ファイルではない**ため G13 のスコープ（`<canon_root>/.claude/agents/**/*.md` の frontmatter `tools:`）に初めから入らない。オーケストレータ `/canon` も同様で、`.claude/skills/canon/` に置かれる Skill であって `.claude/agents/**` ではないため対象外＝**コマンド実行系ツールを使える**。

#### G11 実装契約（上記骨子を実行可能な精度に落とす）

G11 は「このプロジェクトで**使ってはいけない機能**が生成物に混入していないか」を判定する。出典は正典 `docs/` ではなく `work/<ts>/requirements.md`（§11.4 の例外の1つ）。判定は snapshot 系統・`SubagentStop@generation`（`gates/gen-guard.js` の `GATE_MODULES.generation` に登録済み）。

- **判定入力**: `work/<ts>/requirements.md` の3節（§6.3）＝ `## 確定要件`（`strength_needed`）・`constraints`・`conflicts`。**検査対象**は `output/<ts>/generated/**` の**全ファイル型**（`.md` に限らない。`.json`・`plugin/**` も含む。型で絞ると経路が漏れる＝§10.1 で G9 が踏んだのと同型の穴）。requirements.md のパーサは `gates/lib/requirements.js` に新設し、`gates/lib/markdown.js` の共有パーサ（`findHeading`/`sectionSlice`/`parseBulletRecords`）を土台にする（依存ゼロ・ネスト非対応の `artifact.js` は使えない）。
- **禁止集合の導出規約（最重要）**: 禁止機能を**代表例の列挙で書かない**。`constraints` の**キー全集合**を走査し、`allowed: false` のキーごとに **能力（capability）検出器**を当てる。検出器は「その能力が生成物に現れうる**全経路**」を持たねばならず、1経路（例: hooks を `settings.json` の `hooks` キーだけで見る）で書くとその他の経路（plugin 同梱 `hooks/`・`.claude/hooks/` の実体）が静かに素通りする。可能な限り**正典 SSoT から導出**する（hooks のイベント名は `gates/conformance_tables/hooks.json` の全イベントから、plugin の同梱物は `L5_DISTRIBUTION.md:72` の自動発見ディレクトリから）。

| constraints キー | 検出経路（能力で書く。代表例で書かない） |
|---|---|
| `hooks` | ① 生成 JSON（`.claude/settings.json`・`plugin.json`・`.claude-plugin/plugin.json` 等）の `hooks` 宣言 ② その宣言内のイベント名を **`hooks.json` の全イベント集合**（正典 SSoT）と照合 ③ hook スクリプトの実体配置（`.claude/hooks/**`・`plugin/hooks/**`） |
| `mcp` | ① `.mcp.json` の実在（`plugin/**` 同梱を含む） ② frontmatter `mcpServers:` ③ `tools:` 中の `mcp__<server>__<tool>` 構文 ④ settings.json の `enabledMcpjsonServers` |
| `plugins` | ① 管理パス集合の L5 パターン（`plugin/**`・`gates/lib/managed-paths.js` の SSoT）に合致する生成物 ② `plugin.json` / `marketplace.json` の実在 ③ settings.json の `enabledPlugins` |
| `experimental` | ① frontmatter `context: fork` ② 環境変数**接頭辞** `CLAUDE_CODE_EXPERIMENTAL_`（単一の変数名を書かない。G6 が `..._AGENT_TEAMS` 1件を見るのとは別の粒度） ③ plugin 同梱の `themes/`・`monitors/`（`L5_DISTRIBUTION.md:625-626` が experimental と明記） ④ `output/<ts>/design-map.md` の `## Experimental Dependencies` 節が非空（§9.2 が「eval と G11 が見る」と規定） |
| `organization_policy` | `allowed` を持たない自由文。**機械判定できない**ことを結果に明示する（違反にしないが、黙って無いことにもしない） |
| **上記以外のキー** | `allowed: false` なら**検出器不在＝検査不能として違反**（下記） |

- **未知キー＝違反**: `allowed: false` なのに G11 が検出器を持たないキーは、「禁止したはずの機能が検査されないまま違反0件で通る」経路になる（§11.5 の vacuous pass の芽）。ゆえに G11 は**検査不能を違反として run をブロック**する。代償として、`constraints` に新しいキーを足したら G11 の検出器も同時に実装しなければ run が止まる——この非対称は意図的で、「禁止の宣言」と「禁止の強制」が乖離しないことを機械で保証する。
- **散文は検出しない**: hooks の検出は**構成として現れる経路**（JSON 宣言・スクリプト実体）に限り、Markdown 本文中の語（`Stop`・`Setup` 等は普通の英単語でもある）は検出しない。生成物が「Hooks は使わない」と説明する文で違反にすると検査が実用不能になる。この限界は結果に明示する。
- **縮退設計の検査範囲**: 「制約で deterministic が使えないとき advisory へ格下げした設計が妥当か」のうち、決定論で判定できるのは **conflicts の登録漏れと整合**までとする。
  - **登録漏れ**: `strength_needed: deterministic` の要件が存在し、その実現手段（§6.3 の強度3段階対応・`00_INDEX.md §4.4`: deterministic → Hooks / enforced → permissions）が禁止されているなら、`conflicts` に**当該要件 id を指すエントリ**が無ければ違反（縮退の判断が記録されないまま生成が通ることを防ぐ）。
  - **整合**: `conflicts[].requirement` が実在の要件 id を、`conflicts[].constraint` が**実在しかつ禁止済み**の constraints キーを指すこと（無関係な conflicts を1件書けば通る形骸化を防ぐ）。
  - **踏み込まない範囲**: design-map の自由記述（`## レイヤー構成` の散文）との突合はしない。パーサの脆さを判定の前提にすると、書き方の揺れが偽陽性になり検査の信頼を損なう。縮退の**意味的な妥当性**（advisory へ落として要件を満たせるのか）は人間ゲート P5/P7 が読む。
- **vacuous pass 封鎖（§11.5）**: 次はすべて違反とする。①`work/<ts>/requirements.md` 不在 ②`constraints` 節不在 ③ constraints キー0件 ④`allowed` が真偽値でない ⑤`generated/` 不在または空（制約検査の対象ゼロを合格と読まない・G12 と同じ規律）。**「制約が書かれていない＝制約なし＝合格」と読まない**のが肝である。制約が全て `allowed: true`（＝実際に制約が無い）ことと、制約が記録されていないことは別事象である。
- **eval に回さない（§16.1 の分離線）**: 制約遵守は真偽が機械的に決まるため、G11 の判定を eval へ回付してはならない。G2 が C2/C4 を eval へ回すのは「意味を要する」からであって、判定に自信が無いからではない。
- **G6 との区別（再掲・実装コメントに残す）**: G6 は普遍的な安全性（secret・experimental 依存の**明示**）、G11 はこのプロジェクト固有の環境制約（experimental の**使用可否**そのもの）。同じ `context: fork` でも、G6 は「実験機能である旨を書いたか」を、G11 は「そもそも使ってよいか」を見る。

#### G14/G15/G16 実装契約

G14〜G16 は機能X（§13.1）の run が消費する完了リクエスト `work/<ts>/.requests/canon-update` を契機に、`gates/canon-guard.js`（SubagentStop/Stop）が `gates/lib/run.js` の `processStageRequests()` をそのまま用いてバッチ実行する。判定入力は `work/<ts>/canon-diff-proposal.md`（§13.1 が定める固定フォーマット）と `docs/` 更新後の実体。

- **G14（正典整合）判定入力**: `docs/` 9ファイルの `last_verified`／確認バージョン欄の一致、`docs/SOURCES.md` 更新履歴の当該日エントリ、`gates/build-conformance-tables.js` の関数を in-process 呼び出しして `ExtractionError` が投げられないこと（依存ゼロ方針を守り、外部プロセス起動でなく関数呼び出しで確認する）。
- **G15（波及 stale 検出）判定入力**: (a) `gates/conformance_tables/*.json` の作業ツリー版と `git show HEAD:` 版の差分（`build-conformance-tables.js` 再生成後に取得可能な値の変化）、(b) `canon-diff-proposal.md` の `## 旧表現→新表現` 表（更新者の自己申告）。両者の**旧値**を `.claude/**`・`gates/**`・`tests/**`・両設計書に対して文字列走査し、ヒット箇所を `work/<ts>/impact-report.md` へ列挙する。**0件でも `impact-report.md` は必ず生成する**（生成不在は違反＝vacuous pass 防止）。過去 `output/*/` への影響通知（§13.1 既存成果物への影響）もここに集約する。
- **G16（`[要確認]` 台帳整合）判定入力**: `docs/00_INDEX.md §10` の各行を「未解決」形式（項目｜所在｜検証方法）または「解決済み」形式（取り消し線＋`**解決済（YYYY-MM-DD）**:` 接頭＋根拠）のいずれかにパースする形式検査。`docs/` 全体の `[要確認]` マーカー実数を数え、`canon-diff-proposal.md` `## メタ` 節の申告値と一致することを確認する。乖離自体は違反にせず `impact-report.md` へ報告する（§10 の解消判断は人間が行う）。
  - **実マーカー計数規約**: 素朴な `/\[要確認\]/g` は `docs/` 全体で26件ヒットするが、実測するとその内訳は節見出し（`## N. このファイルの `[要確認]` 項目`）・保守ルールの説明文・解消済み経緯の記述・`docs/SOURCES.md` の更新ログという**記法そのものへの言及**が大半で、生きたマーカーを1件も含まない歪みがあった。計数は次の規則に従う: ①素の形 `[要確認]` と拡張形 `[要確認: 理由]` の両方を対象にする ②インラインコードスパン（バッククォート囲み）の内側は除外する（記法への言及であってマーカーではない） ③見出し行（`^#{1,6}\s`）は除外する ④`docs/SOURCES.md` は正典本文ではなく保守ログのため除外する。ファイル別内訳を `impact-report.md` へ追記する。
- **`00_INDEX.md §11` 保守ルールへの追記**: 「`[要確認]` 項目が解消されたら §10 から削除し、該当箇所に追記」に加え、「解消済みの経緯を残したい場合は行を削除せず取り消し線＋`**解決済（日付）**`で残してよい」を追記する（G16 の形式検査が両形式を許容する根拠）。
- **vacuous pass 封鎖**: 次は違反とする。①`work/<ts>/canon-diff-proposal.md` 不在 ②`## メタ` 節に調査日・確認バージョン・`[要確認]` 実数のいずれか欠落 ③`impact-report.md` 不在（G15 の判定条件そのもの）。「差分が無かった」ことと「レポートを生成しなかった」ことは別事象であり、後者は常に違反。
- **eval に回さない**: G14〜G16 は真偽が機械的に決まる（版一致・レポート実在・台帳形式）ため、判定を eval へ回付しない。波及の当否・`[要確認]` 解消の妥当性という**意味判断**は人間ゲート（更新ゲート・§13.1）が担う。

### 11.3 PreToolUse 3ガード（決定論の担保・`tool_input` で判定＝エージェント同一性に依存しない）

書込先・承認・前進とも `tool_input`（パス、およびコマンド実行系ツールはコマンド文字列）＋サイドカー／ラッチの存在だけで判定でき、エージェント同一性に依存しない（`L4_AUTOMATION.md §2.1` の `permissionDecision: deny`）。

- **書込先ガード（write-scope-guard）**: `Write`/`Edit` 等のパスが sanctioned ツリー（`output/<ts>/`・`work/<ts>/`）外なら deny。特に `docs/`・`gates/`・`.claude/`（システム本体）を保護。**`output/<ts>/.gate/**` はエージェント書込を一律 deny（deny-all）**（エージェントは `work/<ts>/.requests/<stage>` に完了リクエストを書くだけ。承認・マーカーの鋳造は `tools/` CLI とゲートスクリプトのみ・基本設計書 §4.4）。**matcher にコマンド実行系ツール（`Bash`・`PowerShell`）を含め、コマンド文字列も検査する**（下記「シェル経路の封鎖」）。
- **承認ガード（approval-guard・前進ゲート＋凍結）**: 「承認を待ってから次工程」を書込で強制する。
  - 前進ゲート(a): `design-map.md` 書込は `output/<ts>/.gate/approvals/spec.approved` が存在しなければ deny（spec 未承認では designer が設計を書けない）。
  - 前進ゲート(b): 生成物書込（`output/<ts>/generated/**`）は `design.approved` が存在しなければ deny（design-map 未承認では generator が生成物を書けない）。
  - 凍結(c): `spec.md` 書込は `spec.approved` が存在すれば deny（承認済み spec を改変させない。変更は**承認取り消し CLI** `npm run approve -- <ts> spec --revoke` で・基本設計書 §4.4）。
  - 凍結(d): `design-map.md` 書込は `design.approved` が存在すれば deny（取り消しは同じく CLI 経由）。
- **前進ガード（advance-guard）**: PostToolUse の per-file 違反はブロック不可のため run 全体の `.gate/blocks/gen.blocked` に転写し、本ガードがラッチ存在中は当該 `<ts>` の output 前進書込を deny する。**唯一の硬遮断は PreToolUse deny**（PostToolUse/SubagentStop の exit 2 は握り潰され得る）。ラッチはゲート再通過でも自動解除されず、解除は人間 CLI（`npm run unblock -- <ts>`）のみ。

**シェル経路の封鎖**: `Write`/`Edit` の `tool_input` パスのみを見るガードは、**シェルのリダイレクト（`echo x > docs/foo.md`）や `node` 実行を捕捉できない**。「唯一の硬遮断は PreToolUse deny」という主張は、シェルを持つエージェントが1体でも居れば崩れる。しかも承認の鋳造がシェル経由（`npm run approve`）になる（§4.4）ため、放置すれば**ワーカーが自己承認 CLI を叩ける**ことになり連動して致命化する。

> **対象は「コマンド実行系ツール」であって `Bash` 単体ではない**: 正典 `TOOLS.md §2` の正規44種には **`PowerShell` が別ツールとして実在**し（権限要）、**Windows では主シェル**である。`Bash` のみを見る実装では次が実測で素通りした:
>
> - `PowerShell: Set-Content docs/foo.md 'x'` → allow（`docs/`＝SSoT を改変できる）
> - `PowerShell: Set-Content output/<ts>/.gate/approvals/spec.approved ''` → allow ← **承認サイドカーの捏造が成立し、deny-all と前進ゲートのラチェットが崩壊する**
>
> ゆえに対象は **`Bash` ＋ `PowerShell`**（＝正典44種のうち任意コマンドを実行できるツール全部）とする。**ここに漏れがあると、そのツール経由で全ガードを迂回できる**。正典にツールが追加された際は、コマンド実行系が増えていないかを `/update-docs` の手順で必ず確認すること。
>
> 肝: 「剥奪＝正・検査＝保険」の非対称構成であり、**実質的な防御は剥奪の一点に依存する**。その剥奪が列挙漏れで破れるなら防御全体が破れる。列挙の網羅性そのものが単一障害点である。

二重で塞ぐ:

| 手当 | 内容 | 根拠 |
|---|---|---|
| **剥奪＋機械強制** | **全ワーカーの `tools:` にコマンド実行系ツール（`Bash`・`PowerShell`）を含めない**。系統A/B は既に `Read Grep Glob` のみ（基本設計書 §5.3）だが、これを spec-writer・selector・designer・generator・各 builder・readme-writer・eval-* を含む**全ワーカーへ拡張**する。execute を要する処理はゲートと `tools/` CLI が持つ（基本設計書 §4.3）。**この剥奪は人手のレビュー観点に頼らず G13（preflight）が決定論的に強制する**（§11.2） | 基本設計書 §5.3・§11.2 G13・`L3_AGENTS.md §2.1`（tools は最小権限） |
| **検査** | **write-scope-guard の matcher にコマンド実行系ツール（`Bash`・`PowerShell`）を追加**し、`tool_input.command` の文字列を検査して保護パス（`docs/`・`gates/`・`.claude/`・`output/<ts>/.gate/**`）への書込コマンドを deny する | `L4_AUTOMATION.md §2.1` の matcher は PreToolUse でツール名にマッチし、公式例（`block-rm.sh`）が `.tool_input.command` を検査して `permissionDecision: deny` を返す形と同一 |
| **承認 CLI の非対称** | 承認 CLI（`npm run approve`）は **run 中でも通る**（承認は工程の途中で起きるため通らねばならない・基本設計書 §4.4）。**ワーカーが叩けない根拠はシェルの剥奪**であって、ガードの有効条件ではない。オーケストレータはシェルを持つので叩ける | 基本設計書 §4.4・詳細設計書 §11.2 G13 |

剥奪が主防御（そもそもコマンド実行系ツールを持たない）、検査が多層防御（万一発行されても保護パスへの書込を捕捉する）。検査は文字列検査ゆえ完全ではない（難読化された書込は捕捉しきれない）ため、**剥奪を正とし検査を保険とする**。この非対称を承知のうえで両方置く。

肝: **剥奪が正である以上、剥奪こそ機械で守らねばならない**。`tools:` に1語 `Bash` を足すだけで防御線全体が無効化され、しかもその改変は diff に出るが**ゲートは何も言わない**——設計の方針が実装時に守られたことを、方針の明記だけでは証明できない。これは基本設計書 §8.2 が「維持は diff に出ないから厳しい条件を課す」としたのと同型の危険であり、さらに悪いことに**破れても静か**である。ゆえに G13 で run 開始をブロックする（§11.2）。オーケストレータ `/canon` は `.claude/agents/**` でなく `.claude/skills/canon/` に置かれる Skill なので **G13 の対象外＝コマンド実行系ツールを使える**。この非対称は基本設計書 §4.4 の承認経路と整合する: 承認 CLI（`npm run approve`）を実行するのはオーケストレータであり、**ワーカーはコマンド実行系ツールを持たないので承認 CLI を叩けない**。「承認を鋳造できるのはオーケストレータと人間だけ」がこの機械強制によって初めて構造的に保証される。

**ガードの有効条件**: 上記3ガードは **run が in-flight のときのみ有効**とする。

- **判定材料**: `work/.session-ts` が指す `output/<ts>/` に**終端マーカーが無い間**だけ deny する。終端マーカーがある（run 完了）／`.session-ts` が無い（run 未開始）場合、ガードは素通りさせる。

**巻き戻し時の再武装**: `tools/reopen.js` が `markers/<stage>.done` を削除すると、`currentRunTs()` は再び非 null を返し3ガードが再武装される。同時に `hasMarker` の冪等スキップ（§4.5①）が外れ、次の SubagentStop で G1・G7〜G12 等が実際に再実行される（`.claude/settings.json` の SessionStart 採番禁止と同型の誤判定事故——run が実質終わっていないのに保護が解ける事故——を、意図的操作の側から塞ぐ）。取消後に run を放棄すると `.session-ts` 残置と同じ事故になるため、CLI は次の一手（再生成→再承認）を出力に明記する。

> **`.session-ts` の書き手**: **`tools/new-ts.js`（`npm run ts`）のみ**が採番して書く。オーケストレータが工程1の直前に実行する。**`SessionStart` hook は採番してはならない**（足場作りのみ）。理由:
>
> 1. **SessionStart は無条件に発火する**。`/canon` を一度も実行しない保守セッション（`/update-docs` 等）や、設計書を書くだけのセッションでも発火する。そこで新規 `<ts>` を採番すると、それらのセッションが即座に「run in-flight」と誤判定され、保守ループが書けなくなる。
> 2. **中断 run の再開（§15.2）を壊す**。`.session-ts` はセッションを跨いで温存されるべきで、セッション開始のたびに上書きされてはならない。
> 3. カナリアの順序制約（§11.5）は「`<ts>` 採番の後・工程1の前」を要求するが、これは**採番が `/canon` の制御下にある**ことを前提にしている。SessionStart 採番はこの前提と両立しない。
>
> 肝: 採番の契機は「セッションの開始」ではなく「**run の開始**」である。両者を同一視するとガードの有効条件が無効化される。
- **理由**: ガードが常時有効だと、基本設計書 §13.1 が「保守ループとして温存する」とした `/update-docs`（`docs/` を書く）・`/update-system`（`.claude/` を書く）が**両方とも deny 対象になり全滅**する。claude-canon 自身の実装・保守作業（`.claude/`・`gates/` の編集）も、機能X の canon-updater（`docs/` を書き換える・§13.1）も同じく全滅する。保守セッション・実装作業は run 外なので、条件化すれば通る。
- **安全性**: ガードが守る対象は「**run 中のワーカーが sanctioned 外を汚さないこと**」であって、人間が主導する run 外の保守作業ではない。run 外に守るべき in-flight の成果物は存在しない。機能X の `docs/` 書換は更新ゲート（人間承認）が別途唯一の関門として機能する（§13.1）ので、本ガードの条件化で保護が抜けることはない。
- **副作用と受容**: この条件化により「run 外なら誰でも `docs/` を書ける」状態になるが、run 外の書き手は人間かその直接の指示下にあるセッションであり、**ガードでなく人間ゲートが担保する層**である（§13.1 の更新ゲート）。in-flight 判定が誤って false になる（＝終端マーカーが早期に立つ）と run 中もガードが無効化されるため、**終端マーカーの鋳造は `.gate/` 専有＝ゲートのみ**（基本設計書 §4.4）とし、エージェントが立てられないようにする。

**ガードの3系統**: 上記3ガード（write-scope-guard・approval-guard・advance-guard）は `/canon` run（`work/.session-ts`）専用であり、`docs/` を含む「システム本体」を**保護対象**として deny する。機能X（正典更新・§13.1）は逆に `docs/` を**書込対象**とするため、極性が逆の別ガード `canon-update-scope-guard`（`work/.canon-update-ts` を判定材料とする）を新設する。自己再生成（§13.2.1）は `/canon` run と同じ極性（`.claude/` を保護）だが、**終端マーカーで保護が解けない**点が異なるため、3本目 `self-optimize-scope-guard`（`work/.self-optim` を判定材料とする）を新設する。

| | write-scope-guard（`/canon` 用） | canon-update-scope-guard（機能X 用） | self-optimize-scope-guard（自己再生成用・§13.2.1） |
|---|---|---|---|
| in-flight 判定材料 | `work/.session-ts` | `work/.canon-update-ts` | `work/.self-optim` |
| sanctioned（書込許可） | `output/<ts>/`・`work/<ts>/` | `docs/`・`work/<ts>/`・`output/<ts>/`（`.gate/**` 除く） | `output/<ts>/`・`work/<ts>/`（`.gate/**` 除く） |
| 保護（書込 deny） | `docs/`・`gates/`・`.claude/` | `.claude/`・`gates/`・`tests/`・両設計書 | `.claude/`・`gates/`・`tests/`・`docs/`・両設計書・**`generations/`** |
| `docs/` への追加関門 | （対象外） | `output/<ts>/.gate/approvals/canon-update.approved` 存在まで deny | （対象外・保護に含む） |
| **終端マーカー後の扱い** | **保護を解く**（run 外は素通り） | 同左 | **保護を解かない**（sentinel が在る限り継続。§13.2.1 が理由） |
| run 外（sentinel 不在） | 素通り | 素通り | 素通り |

**相互排他**: `work/.session-ts`・`work/.canon-update-ts`・`work/.self-optim` の**いずれか2つ以上**が同時に in-flight（終端マーカー未鋳造／sentinel 存在）になることは想定しない。`tools/new-ts.js`・`tools/new-canon-ts.js`・`tools/selfopt.js` はそれぞれ他方が in-flight なら異常終了する（§13.1・§13.2.1）。これにより「一方の run 中に他方が保護対象を書き換え、判定基準が実行中に動く」という事故を構造的に防ぐ。3ガードは同一の `matcher`（`Write|Edit|NotebookEdit|Bash|PowerShell|Monitor`）に相乗りし、`.claude/settings.json` の同じ PreToolUse ブロックに並置する（基本設計書 §14）。

**書込操作の判定式は3ガード共有 SSoT とする**: 3ガードはそれぞれ独立に「コマンド文字列が書込操作らしいか」を判定する正規表現（`>`/`tee`/`cp`/`mv`/`rm`/`mkdir`/`sed -i`/`Set-Content`/`Out-File`/`New-Item`/`Remove-Item`/`Add-Content`/`node -e`/`writeFileSync`/`appendFileSync` 等）を持っていたが、実体はリテラルの3重複だった（§11.4 が禁じる「代表例で書く」列挙漏れの単一障害点と同型）。これを `gates/lib/shell-write.js` へ集約し、3ガードは import する。あわせて **fd 複製形（`2>&1`・`>&2`・`1>&2` 等）を書込操作と誤検知していた**問題を修正した。判定は「コマンド文字列から fd 複製トークン（`\d*>&\d?` 相当）を除去してから」既存パターンを当てる規約とする。`1>out.txt`（実ファイル書込）は fd 複製形と字面が異なるため除去対象にならず、検出力は落ちない。

**保護パスの判定は「出現」でなく「宛先」で行う**: 上記 SSoT は当初「コマンド文字列のどこかに書込操作がある」×「どこかに保護パス文字列がある」の AND で deny していたが、両者の**位置関係を見ない**ため、(a) heredoc 本文に保護パス文字列を含む sanctioned への書込（`cat > work/<ts>/project_profile.md <<'EOF' … .claude/rules/… EOF`）、(b) `2>/dev/null` を伴う読取（`grep -rn … docs/ .claude/ 2>/dev/null | head`）を誤って deny した（2026-09-04・ライブ run `20260903_091044` で実測）。§11.4 の「判定対象の識別子自身への自己一致を疑う」（`WRITE_OP_RE` が `2>&1` の `>` に誤反応した L023）と同系統の変種である。ゆえに判定規約を次へ改める。

- `gates/lib/shell-write.js` の `analyzeShellWrite(command, cwd)` が**書込宛先の集合**を抽出する: リダイレクト宛先（`>`/`>>`/`N>`/`&>`/`>|` の直後の語）、書込コマンド（`cp`/`mv`/`rm`/`mkdir`/`sed -i`/`tee`/`Set-Content`/`Out-File`/`New-Item`/`Remove-Item`/`Add-Content` 等）の引数、`cd`/`Set-Location`/`pushd` を追跡して解決した相対宛先。null シンク（`/dev/null`・`$null`・`NUL`）は宛先に含めない。
- 宛先は `toRepoRelative()` でリポジトリ相対へ正規化し、**Write/Edit 分岐と同一のパス分類**（保護ディレクトリ配下か・`.gate/` 配下か）で判定する。これにより sanctioned 配下の `output/<ts>/generated/.claude/**` が保護パスと誤認されない。
- **同定不能な書込構文**（`node -e`・`sh -c`・`Invoke-Expression`・`xargs`・`find -exec`・`$VAR` 等の動的宛先）が1つでもあれば `unresolved` とし、**従来どおりの広域スキャンへフォールバックする**。
- heredoc 本文は、opener 行がファイルリダイレクトを持つ場合（＝本文はデータであり行き先はリダイレクト宛先）に限り判定対象から除去する。リダイレクト先を持たない heredoc（`bash <<'EOF'` ＝本文が即実行される）は除去しない。
- シェル分岐は blocklist のまま据え置く（Write/Edit 分岐の「sanctioned 以外は全 deny」は持ち込まない。シェルは `/tmp` 等へ正当に書くため）。
- **安全不変条件**: 新判定が allow を返し旧判定が deny を返すのは「コマンド中の**すべて**の書込構文の宛先を同定でき、そのどれも保護パスでない」場合に限る。難読化・任意コード実行に対する検出力は不変であり、`rm -rf docs`（末尾スラッシュ無し）・`cd docs && echo x > foo.md` は逆に新たに deny される（正味では締まる）。

### 11.4 判定の出典と自己適用

- **判定の出典は必ず正典 docs**: 照合表（frontmatter 必須キー・正規ツール名・パス規約）はハードコードせず `gates/conformance_tables/` として `docs/` から生成する（正典更新に追従）。**例外は3つ**: G11 は `requirements.md` 由来、**G13 は本設計書 §11.3 由来の自己規律**（正典は「ワーカーにコマンド実行系ツールを与えるな」とは言っていない。claude-canon 固有のガード設計から導かれる制約である）、**G3 の「skill ディレクトリ名＝name 一致」1項目のみが本設計書由来の自己規律**（正典 `L2_SKILLS.md` は「既定: ディレクトリ名」と述べるのみで、`name` 明示時の一致までは要求していない。`gates/conformance_tables/paths.json` の `design_derived_requirements` に `status: accepted_by_human` として記録済み。G3 の他の判定項目は通常どおり正典由来）。
- **自己適用可能**: G1〜G12 は claude-canon 自身の `.claude/`（agents/skills/settings.json）にも適用でき、ブートストラップの橋になる（§15）。
- **G13 だけは向きが逆**: G1〜G12 は**生成物の検証**が本務で、claude-canon 自身への適用は「できる」という副次的性質（自己適用）である。対して **G13 は claude-canon 自身の検証が本務であり、生成物へ適用してはならない**（対象プロジェクトの Subagent がコマンド実行系ツールを持つのは正当・§11.2）。ゆえに G13 は「自己適用可能」の枠でなく **preflight 系統という別枠**に置く。**ゲートの二面性（生成物検証 ⇔ 自己検証）が交差する唯一の箇所**なので、適用範囲をパスで截然と分ける（§11.2 の表）。
- **非スキーマ `.md` の判定は `gates/lib/non-schema.js` を唯一の SSoT とする**: `CLAUDE.md`／`.claude/README.md`／`.claude/settings.json` はワーカー定義（agent/skill/rule）ではなく G10（README 整合）の担当であり、G3（配置ファミリー）・G4（種別スキーマ）の対象外である。この除外判定を複数箇所へ独立に複製すると、新しい生成物が実在した際に波及漏れが発火する。`gates/lib/non-schema.js` へ集約し、`gates/g12_output_perfile.js` の `KNOWN_NON_SCHEMA`・`gates/g10_readme.js` のインライン比較・`tools/promote.js` の `KNOWN_NON_SCHEMA`・自己適用テストはすべてここから import する（`gates/lib/shell-write.js` が3ガードの重複を解消した前例と同型）。**固定名3件のほかに、パターンでしか書けない非スキーマ領域も同モジュールが持つ**（2026-09-03 追加）: (a) **skill パッケージの supporting files**（`.claude/skills/<name>/template.md`・`examples/*.md` 等。正典 `L2_SKILLS.md §2.1` の明示的許可。形状判定は `gates/lib/artifact.js` の `skillPathRole()` へ委譲し複製しない）、(b) **`.claude/hooks/**`**（hook ハンドラ実体。`settings.json` と同じく「配線・実行体」でありワーカー定義ではない・§10.1）。除外集合を呼び出し側へ散らさないという本 bullet の趣旨は、固定名かパターンかによらず同じである。

### 11.5 ランタイム・カナリア（配線生存の証明）

`.claude/settings.json` が壊れれば Hooks が発火せず、**全ゲートが沈黙して vacuous pass** する（違反が「検出されない」のでなく「検査自体が走らない」）。これは**ゲート自身では原理的に検出できない**:

- G12 の「output ツリー不在は違反（vacuous pass 防止）」（§11.2）は**ゲートが走った場合**の話であり、走らない場合を救わない。
- SessionStart の self-check 案も、`settings.json` が壊れれば **SessionStart 自体が発火しない**ので無効。

ゆえに**帯域外に出す**。次の2つは役割が異なり**両方要る**:

| 手段 | いつ | 何を証明するか | 限界 |
|---|---|---|---|
| **配線テスト**（`npm test`・§15.3） | run の前（開発・CI・セットアップ時） | 3ガードと G バッチが違反入力に対し期待どおり deny／exit 2 すること | テスト実行後に `settings.json` が壊れた場合を救えない |
| **ランタイム・カナリア**（本節） | 各 run の工程1の直前 | **その run の実行中に**ガードが現に生きていること | ガードの有無のみを見る（判定内容の正しさは配線テストの担当） |

**カナリアの仕様**:

- **実行主体**: `/canon`（オーケストレータ）。**inline のメイン Claude なので自らツールを発行でき、その deny/allow を観測できる**。これがパイプライン内部から発火の生存を証明できる唯一の手段である（ワーカーは Subagent で結果しか返さず、またコマンド実行系ツールも持たない・基本設計書 §5.3）。
- **手順**: 工程1の前に **sanctioned 外への意図的な書込を1回試み**、**deny されなければ「ガードが死んでいる」と判断して run を中断**する（人間へエスカレーション）。deny されたら正常として工程1へ進む。
- **書込先**: `output/<ts>/.gate/.canary` を使う。`.gate/**` は deny-all（§11.3）なので必ず deny されるべき対象であり、かつ**万一 allow された場合の残骸が無害**（`output/` は gitignore・基本設計書 §14）である。`docs/` 等の実害あるパスをカナリアの的にしてはならない。
- **順序の制約（重要）**: カナリアは §11.3 の「ガードの有効条件」（run in-flight のみ deny）に依存するため、**`<ts>` 採番の後・工程1の前**に置かなければならない。採番前は `.session-ts` が無く run 外と判定されてガードが素通りするので、カナリアが偽陽性（「ガードが死んでいる」と誤判定）を起こす。基本設計書 §2 の工程表では工程1の直前、`output-path-resolver` による `<ts>` 確定の直後が唯一の正しい位置である。
- **記録**: カナリアの結果は `.gate/processed.log`（基本設計書 §4.5）へ追記し、run ごとに「配線が生きていたこと」を監査可能にする。

肝: 配線テストは「**ガードが正しく判定できる**」ことを run の外で確かめ、カナリアは「**そのガードが今この run で現に発火する**」ことを run の中で確かめる。前者だけでは settings.json の事後破損に無防備、後者だけでは判定内容の正しさが未検証。**vacuous pass は claude-canon の最も静かな失敗様式**であり、この二段で初めて塞がる。

**G13 との関係（run 開始前の2重の門）**: G13（§11.2）とカナリアは、いずれも「**この run を始めてよいか**」を run の実体が動く前に確定する preflight である。守る対象が異なり、両方要る:

| 門 | 発火 | 証明すること | 破れたときの症状 |
|---|---|---|---|
| **G13** | `UserPromptExpansion@/canon`（run 開始時・ブロック可） | **ワーカーがガードを迂回する手段（コマンド実行系ツール）を持たない**こと | ガードは生きているが、ワーカーがその外側から書ける |
| **カナリア** | 工程1直前（`<ts>` 採番後） | **ガードが現に発火する**こと | ワーカーはコマンド実行系ツールを持たないが、ガード自体が沈黙している |

順序は **G13 →（`<ts>` 採番）→ カナリア → 工程1**。G13 が先なのは、`UserPromptExpansion` が `/canon` の展開時＝採番より前に発火する自然な帰結であり、かつ**カナリアはガードの生存しか見ない**ため、ワーカーの権限逸脱を先に潰しておく必要があるからである。逆にカナリアが G13 より前に来ることはできない（採番前は run 外と判定されガードが素通りする・§11.3）。

**コーディネータの turn 中断（vacuous pass の送り側）**: G13 との2重の門（本節上記）は「ガードが生きているか」を守るが、**ガードの前段——完了リクエストと成果物そのものが書かれるか——は別の脆弱点である**。`investigator`／`eval-reviewer`／`generator`（唯一 `Agent` ツールを持つ3コーディネータ）が配下ワーカーを spawn した直後、結果を回収せずに turn を終えると、`.requests/<stage>` が書かれないまま SubagentStop が発火し、stage-guard/gen-guard は「対象リクエストなし」として exit 0 で通過する（実測: run 20260903_091044 で investigator・eval-reviewer が各1回）。G13 が「ワーカーの外側からガードを迂回する経路」を塞ぐのと対称に、この経路は「ガードの内側（判定ロジック）に判定対象を渡さない」ことで検査を沈黙させる——G13 と同様に**発火機会が構造的にゼロ**になる帰結だが、成因は逆（G13は権限の逸脱・本件はコーディネータの turn 完走義務の欠如）である。ゲートは呼ばれて初めて判定できるため、この経路をゲート自身では検出できない。ゆえに帯域外の契約（`.claude/agents/{investigator,eval-reviewer,generator}/*.md` の完走義務・`.claude/rules/worker-definitions.md`）とオーケストレータ側の実在確認（`.claude/skills/canon/SKILL.md` の各工程末尾）で塞ぐ。G1 の investigation 段（`existing_customizations.md` 実在検査）は「リクエストは書かれたが成果物が無い」場合を機械的に捕らえるが、「リクエストも成果物も書かれない」場合は機械検査の射程外であり、オーケストレータの確認と人間ゲート P1・P6・P7 が最終防波堤となる。

---

## 12. 成果物 README / MANIFEST 生成機能

「読むだけで使いこなせる」を担保する。生成工程（工程7）の**最終ステップ**（独立工程にしない）。generator が `readme-writer` を sub-worker として spawn し（深さ: orchestrator→generator→readme-writer・5以内）、完了後に `.requests/generation` を書く。

### 12.1 4文書の役割分担（output 内）

| 文書 | 内容 | 読者 | 読むタイミング |
|---|---|---|---|
| spec.md | なぜこの構成か（要件・意図） | 設計を追う人 | — |
| design-map.md | どう設計したか（レイヤー・判定） | 設計を検証する人 | — |
| MANIFEST.md | 何が変わったか（新規/改修/維持/廃止） | 配置を承認する人 | 配置時に1回 |
| **README.md** | どう使うか | 日常的に使う開発者 | 配置後に繰り返し |

spec/design-map は「作った側の記録」、README は「使う側の説明書」。README に設計判断の理由は書かない。

### 12.2 README がカバーする5要素

1. **何ができるか**: ユーザーの行動語彙で（設計語彙でなく）。
2. **どう起動するか**: frontmatter から正典ルールで導出（§12.4）。
3. **前提セットアップ**: experimental 依存フラグ・MCP secret／OAuth など「動かす前にやること」。
4. **使用例**: spec §8 の functional（A1）を転用。検証したことと使い方説明が一致。
5. **注意・制約**: 副作用操作・Hook のブロック挙動・スコープ（paths）。

README は作文でなく**規則適用**で書く（起動方式を正典から一意に導く）。これにより G10 で機械照合できる。

### 12.3 配置と MANIFEST

- README は `output/<ts>/generated/.claude/README.md`。管理パス集合（§10.1）に含まれ、canon が生成した README で置換される。
- MANIFEST は `output/<ts>/MANIFEST.md`。新規/改修/維持/廃止の差分サマリを記す。**廃止を明示**して「管理パス集合の全置換で黙って消える」事故と区別する。

### 12.4 起動方式の導出ルール表（frontmatter → 起動方式）

readme-writer は design-map 各コンポーネントの frontmatter を読み、正典ルールで起動方式を機械導出する（`L2_SKILLS.md §2.1`・`L3_AGENTS.md §2.1`）。

| 種別 | 判定する frontmatter | 導出される起動方式 | README での書き方 |
|---|---|---|---|
| Slash Command Skill | `disable-model-invocation: true` | 手動 `/名前` のみ | 「`/名前 引数` で明示起動（自動では発動しない）」。argument-hint あれば引数例も |
| Skill（通常） | `disable-model-invocation` 未設定/false | 自動発動＋手動 `/` | 「〜と依頼すると自動発動。`/名前` でも起動可」 |
| Skill（参考知識） | `user-invocable: false` | 起動不可 | **ユーザー向け一覧に載せない**。「内部で参照される知識」に留める |
| Subagent | description ベース委譲 | メイン Claude が自動委譲 | 「〜のときメインが自動的に使う」。ユーザー直接起動の UI 手順は書かない |
| Hook | イベント種別 | 自動発火 | 起動でなく**挙動予告**：「〜のとき自動で走る/ブロックされる」 |
| MCP Server | `${VAR}` secret / OAuth の有無 | 接続（要初回セットアップ） | secret/OAuth あればセットアップ手順へ誘導 |

肝: (a) `disable-model-invocation` は Skill の起動方式に直結（自動ロード抑止）。Subagent は description ベース委譲で制御し `user-invocable` フィールドを持たない（種別を先に確定してから読む）。(b) `user-invocable:false` の Skill は起動一覧に出さない。(c) Hook はユーザーが起動しないため「なぜ止められたか」で困らない挙動予告として書く。

**preload 専用 Skill は `user-invocable: false` を明示する**: 別の Subagent/Skill に `skills:` で preload されるだけで、ユーザーが `/名前` で直接起動する経路を持たない Skill（例: designer に preload される `layer-design`）は、`user-invocable: false` を明示し既定値 `true` への暗黙依存を避ける。preload・モデル自動発動のいずれにも影響しない（`disable-model-invocation` とは独立の軸）。未指定のまま既定 `true` に流れると、`/` メニューに「ユーザーが直接呼ぶ意味を持たない」Skill が露出し、上表の(b)（内部専用は一覧に出さない）が機械的に強制されない。

### 12.5 セットアップ欄の自動導出

design-map 全コンポーネントの frontmatter・依存を走査して「動かす前に」を機械抽出する:
- `context: fork` を使う Skill → `agent:` 指定の存在確認（正式機能だが actionable 指示必須・`L2_SKILLS.md §2.2`）
- ネスト委譲 → 深さ5以内であることの確認（`L3_AGENTS.md §2.1`）
- MCP `${VAR}` secret → 初回環境変数設定手順
- MCP OAuth → ブラウザ認可手順
- Hooks 配線 → `.claude/settings.json` への配線と参照スクリプトの実行権限付与

experimental 禁止プロジェクトなら該当フラグを使う設計は G11 で弾かれている。セットアップ欄に experimental 依存が並ぶのは `requirements.md` で許可されている場合のみで、README とゲートがここで整合する。

---

## 13. 機能X（正典更新）／機能Y（自己最適化）

### 13.1 機能X（正典更新・データプレーン）

`canon-updater`（`.claude/agents/canon-updater/`）。工程パイプラインの**外**の独立した保守エージェントで、オーケストレータの委譲チェーンに乗らない。対象が対象プロジェクトでなく外部一次ソース（`docs/SOURCES.md` の URL）、出力が使い捨ての `work/` でなく **`docs/`（SSoT・git 管理・全成果物の判定基準）** を書き換える点が決定的に違う。ゆえに「判定しない・人間ゲート必須」を厳格にする。

- **実行系統**: `/update-docs` Skill（`.claude/skills/update-docs/`・`disable-model-invocation:true`・`user-invocable:true`。`context: fork` は付与しない＝Subagent を起動するため）が `canon-updater` を起動する。`canon-updater` の `tools:` は **`WebFetch WebSearch Read Write Edit`** のみ（コマンド実行系ツールを持たない＝G13 適合）。
- **名前空間**: `/canon` の run（`work/.session-ts`）とは別系統の `work/.canon-update-ts`（`tools/new-canon-ts.js`・`npm run canon:ts` が採番）。**両系統は相互排他**——一方が in-flight（終端マーカー未鋳造）のとき、他方の新規採番は異常終了する。
- **更新フロー（フェーズ）**: ① 相互排他確認・`npm run canon:ts` で `<ts>` 採番 ② `canon-updater` が `docs/SOURCES.md` の一次ソースを WebFetch/WebSearch で調査し `work/<ts>/canon-diff-proposal.md`（下記フォーマット）へ差分候補を列挙（**判定しない・`docs/` にはまだ書かない**）③ **更新ゲート**（人間が `npm run approve -- <ts> canon-update` で採否と breaking 判定を確定・`docs/` 書換の唯一の関門）④ 承認後、`canon-updater` が承認差分のみ `docs/` へ反映し `gates/build-conformance-tables.js` を再生成 ⑤ 完了リクエスト `work/<ts>/.requests/canon-update` → G14〜G16（§11.2）→ 通過で `output/<ts>/.gate/markers/canon-update.done` 鋳造（機能X run の終端マーカー）。
- **`work/<ts>/canon-diff-proposal.md` の固定フォーマット**（G14〜G16 の判定入力契約）:
  `## メタ`（調査日・確認バージョン・`[要確認]` 実マーカー総数）／`## 差分候補`（採否は人間・列挙のみ）／`## 旧表現→新表現`（表・G15 の走査対象）／`## 一次ソースとの矛盾`（判定せず明示するのみ）。
- **`work/<ts>/impact-report.md`**: G15 が生成する波及 stale の検出結果（`.claude/**`・`gates/**`・`tests/**`・両設計書中の旧値残存）と、影響のある過去 `output/*/` への通知を集約する。**機能X は検出のみ**——修正するか・過去成果物を再生成するかは人間が判断する（するなら通常の工程パイプラインを新規実行）。
- **安全制約**: edit 範囲を `docs/`・`work/<ts>/` に限定（`.claude/`・`gates/`・`tests/`・両設計書を絶対に書き換えない・PreToolUse で deny）／差分抽出は読むだけ／食い違いは矛盾として明示するのみ。
- **両設計書の frontmatter `canon_version` は機能X が更新しない**（上の安全制約の帰結）。この値は正典 `docs/` の「確認したClaude Codeバージョン」を指す（基本設計書 冒頭「正典の位置づけ」）。正典バージョンが上がったとき、両設計書に残る旧値は G15 が `impact-report.md` へ**検出するのみ**であり、追従は impact-report を読んだ**人間が手で行う**。機能X 側にこれを自動化する余地は無い——自動化すれば `canon-update-scope-guard.js` が deny する設計であり、それが意図である。
- **ガードとの関係**: 専用の逆極性ガード **`gates/canon-update-scope-guard.js`** が機構的に強制する（§11.3「ガードの3系統」）。write-scope-guard（`/canon` 用）とは判定材料・保護対象が入れ替わっており、`docs/` への書込自体は更新ゲート承認まで deny、`.claude/`・`gates/`・`tests/`・両設計書は常時 deny（機能X run 中は「システム本体」がそのまま保護対象になる）。**「判定しない・人間ゲート必須」は規律だけでなくガードと G14〜G16 で機械強制される**。
- **調査手順の実測知見（`docs/SOURCES.md` へ反映必須）**: WebFetch は長大な公式ページの網羅列挙で不安定（実在しないコマンド名の混入を複数回観測済み）。単発の WebFetch 結果を鵜呑みにせず、複数回の突合または公式が総数を明記するページを優先する。ツール総数・Hook イベント数などの**数え値**は毎回再計数する（`docs/TOOLS.md` が既に明記する規律を全数え値へ拡張）。

### 13.2 機能Y（自己最適化・コントロールプレーン）

3リスク: (1) 自己コード改変 (2) 検証主体が検証対象を兼ねる自己欺瞞 (3) ロールバック不能。成立条件（世代分離）は次のとおり実装する。

- **世代レイアウト**: `generations/`（配下は全て .gitignore・レイアウト契約は本節が権威）配下に `generations/candidate-*/`（次世代候補）・`generations/archive/<ts>/`（昇格時の退避先）を置く。現行世代（稼働中の `.claude/`）は自分を書き換えず、次世代は `generations/candidate-*/.claude/` として独立に生成する。ディレクトリ自体が消えていても `gates/lib/generations.js` の `writeCurrent`／`tools/stage-candidate.js` が `mkdirSync(..., { recursive: true })` で次回昇格・ステージング時に再作成する。
- **検証ゲートは最適化対象外に固定**: G1〜G13 は `gates/`（`.claude/` の外・不変土台）に置かれ機能Yの改変対象外（§14.2 が既に定める物理実装）。
- **G13 の世代適用（自己欺瞞封鎖の実体）**: `gates/g13_worker_privilege.js` に root 省略可能な注入口を追加し、既定は現行動作（`<canon_root>/.claude/agents/**`）を保ったまま、`tools/promote.js` の**昇格前検証**から `generations/candidate-*/.claude/agents/**` を指定して呼び出せるようにする。次世代が自分にコマンド実行系ツールを与える経路は、この昇格前 G13 が拒否することで塞がれる。
- **昇格機構（`tools/promote.js` / `npm run promote -- <gen>`）**: ① `/canon` run・機能X run のいずれも in-flight でないことを確認（相互排他） ② **乖離検出**（下記） ③ 候補世代へ G3〜G6＋G13 を全実行し**1件でも違反があれば昇格を拒否** ④ 現行 `.claude/` を `generations/archive/<ts>/` へ退避 → 候補を `.claude/` へスワップ → `CURRENT` 更新 ⑤ **`npm test` を自動実行**（配線の生存は自己検証できないため・§11.5・§15.3）。失敗したら自動ロールバック ⑥ `npm run smoke:arm`／`smoke:check`（実発火確認）は人間の手順として必須提示。
- **乖離検出（promote の構造的な穴の封鎖）**: `stage-candidate.js` が候補を取り込んだ**後**に稼働中 `.claude/` を直接 hot-fix すると、候補は派生元から静かに乖離し、昇格するとその乖離（陳腐化した記述・矛盾する手順など）が**気づかれないまま**本番へ入る。`promote.js` は候補の `SOURCE_RUN` から `<ts>` を得て `output/<ts>/design-map.md`（`parseExistingDisposition`）を読み、候補と現行 `.claude/` の差分（`added`/`removed`/`modified`。ハッシュは `sha256File` を再利用）を算出する。**disposition が `keep` のファイルが `modified` に現れたら昇格を拒否する**（keep の定義＝バイト同一に反する＝live が staging 後に変わった証拠）。`--accept-divergence` を明示すればこの拒否を上書きできる。`--dry-run` は成功・拒否いずれの場合も差分表を標準出力へ必ず表示する（不可逆操作の前に人間が全変更を見られるようにする）。`SOURCE_RUN` 不在・design-map 不在は「乖離なし＝合格」と読まない（§11.5 の vacuous pass 封鎖の精神を踏襲）。
- **ロールバック（`tools/rollback.js` / `npm run rollback`）**: `generations/archive/` の直近世代から復元し `CURRENT` を戻す。旧世代は退避により温存されるためロールバック可能。
- **前提**: ゲートが完成し実運用で信頼できるようになってから昇格機構を使う。LLM による次世代 `.claude/` の自己生成そのものは §13.2.1 の対象（候補生成まで）。

#### 13.2.1 自己再生成（候補生成）

`.claude/skills/self-optimize/`（`/self-optimize <label>`）。工程パイプライン（`/canon`）を対象プロジェクトでなく**claude-canon 自身**に向けて走らせ、`generations/candidate-<label>/.claude/` へ次世代候補を生成する。§13.2 の3リスクのうち (1) 自己コード改変・(2) 自己欺瞞は「候補は稼働中の `.claude/` の外に生成され、生成後も別ガードで隔離される」ことで塞ぐ。**実昇格（(3) を左右する行為）は本節のスコープ外**——`tools/promote.js`（既存・§13.2）が担い、着手は人間が判断する。

- **起動経路**: `/canon` は「claude-canon 自身のリポジトリを棚卸ししない」ことを前提にしており（基本設計書 §5.1）、対象を自己に向ける経路を持たない。ゆえに**専用 Skill** `.claude/skills/self-optimize/`（`disable-model-invocation:true`・`user-invocable:true`・`context: fork` 不付与＝基本設計書 §4.1 と同じ理由）を新設する。工程1〜9 は `/canon` と同一（対象は claude-canon 自身のルート）。**工程10（デプロイ）は行わない**——対象自身への退避スワップは稼働中の実行体を破壊しうるため、工程10 を「世代ステージング」（下記）に差し替える。
- **名前空間**: `work/.self-optim`（`tools/selfopt.js`・`npm run selfopt:begin -- <label>` / `selfopt:end`）。判定材料は sentinel ファイル1個（label を記録）。**`/canon` run・機能X run と3方向で相互排他**——いずれかが in-flight なら他の開始を拒否する（`tools/new-ts.js`・`tools/new-canon-ts.js`・`tools/selfopt.js` が相互に確認）。
- **第3の極性ガード（`gates/self-optimize-scope-guard.js`・PreToolUse）**: `write-scope-guard`・`canon-update-scope-guard` に続く3本目。判定材料は `work/.self-optim`。sanctioned は `output/<ts>/`（`.gate/**` 除く）・`work/<ts>/`。保護（deny）は `.claude/`・`gates/`・`tests/`・`docs/`・両設計書・**`generations/`**（候補の取り込みは CLI 一本化・下記）。**write-scope-guard と異なり、終端マーカー（`generation`）到達後も sentinel が在る限り保護を続ける**——自己最適化では工程7通過の直後こそ「直接 `.claude/` を直したくなる」局面であり（3リスク(1)の露出点）、通常の run 外緩和はここでは適用しない。§11.3「ガードの3系統」に対照表がある。
- **世代ステージング（工程10 の代替・`tools/stage-candidate.js`・`npm run stage -- <output-dir> <label>`）**: `output/<ts>/.gate/markers/generation.done` と `.gate/approvals/generation.approved`（G7〜G12 通過済み・P6 承認済み）を前提条件とし、`deploy/pre-deploy-check.js` が export する `computeVanishing(outputDir, targetDir)`（§10.2・既存 SSoT を再利用）で `targetDir = CANON_ROOT` として取りこぼしを照合、**uncaptured ≥ 1 なら候補への取り込みを拒否**する。通過したら `generated/.claude/` を `generations/candidate-<label>/.claude/` へコピーする（`generations/candidate-*/` は run の sanctioned 外のため、この CLI だけが書ける）。
- **`--resync-keep <label>`**: `promote.js` の乖離検出（§13.2）が拒否した場合の**定義上正しい修復手段**。design-map で disposition が `keep` のファイルのうち、候補と稼働中 `.claude/` が差分を持つものだけを **live → 候補** へ再同期する（keep＝「変更しない」なので、この方向の同期だけが定義と整合する）。実施した各ファイルを1件ずつ標準出力に出す。候補へ書ける CLI を増やさない（`stage-candidate.js` への機能追加に留める）。
- **`deploy/` の自己指定拒否**: `deploy/deploy.js`・`deploy/pre-deploy-check.js`・`deploy/emit-run-manifest.js` は `<target-repo-dir>` が `CANON_ROOT` と一致する場合 exit 1 で拒否する（§10.2 に追記）。**世代ステージングと退避スワップ配置は別経路**であり、対象自身への退避スワップは promote の G13・`npm test`・自動ロールバックを丸ごと迂回して稼働中の実行体を破壊しうるため、経路として存在させない。
- **`tools/promote.js` の追加前提**（既存の G13・G3〜G6 検査に追加）: 候補に `.claude/settings.json` が無ければ拒否（配線消滅時の vacuous pass を事前封鎖）。`work/.self-optim` sentinel が在る間は拒否（run 途中の昇格を防ぐ）。`--dry-run` を追加し、スワップ・`npm test` を伴わずに検査のみ行えるようにする（実昇格せずに候補の健全性を確認する手段）。
- **スコープ**: 候補世代 `generations/candidate-<label>/.claude/` を実 run で生成し `--dry-run` を通すところまで。稼働中の `.claude/` はこの経路のどこでも書き換わらない。実昇格（`npm run promote -- <label>` の本実行・スワップ・`npm test` 自動実行）の着手は §13.3 と同じくユーザー判断に残す。

### 13.3 ブートストラップの順序

初版は手書き（最初の agent/skill/hook は人間が書く）→ 安定稼働を確認 → 機能Xで正典最新化 → 機能Yの世代基盤・昇格機構・自己再生成（候補生成）を整備 → 実運用の信頼が積み上がった段階で、生成された候補を実際に**昇格**するかを判断する。飛ばすと「検証されていないもので検証されていないものを作る」多重の不確実性に陥る。

---

## 15. 自己検証と運用制約

> 節番号は §15.2 から始まる（§15.1 は実装史の記述で、dc9db51 の版の考古学削除で本節ごと除去した。以降の参照は §15.2/§15.3 のため採番は詰めていない）。

G1〜G12 は**生成物**の検証であり、claude-canon 自身の正しさは別に担保する（**G13 のみ例外**で、自身のワーカー権限を検証するゲート・§11.2）。ファイル駆動（基本設計書 §4.2）ゆえ各工程を単体で切り出してテストしやすい。

### 15.2 現状の運用制約と将来スコープ

- **非機能要件の定量化**: 1実行あたりのコスト/所要時間/LLM 呼び出し規模は運用後に実測して判断する。
- **並行実行の排他**: 同一 `<ts>` 衝突・同一対象への同時実行の排他は設けない。**逐次実行前提**を維持する。
- **中断実行の自動再開**: ファイル駆動（`work/`・`output/`）ゆえ原理的に再開可能だが、人間が `output/<ts>/.gate/markers/*.done` を確認して当該工程から手動再開する運用を維持する。
- **ミューテーションテスト**: 引き続きスコープ外（代表シナリオ試走で代替・§15.3）。
- **恒久 CI**: `.github/workflows/ci.yml` が `npm test` と照合表の鮮度検査（`npm run build:tables` 後の `git diff` 無変化）を通す（基本設計書 §14 参照）。段階的リリース運用（canary deploy）はスコープ外——§11.5 の「ランタイム・カナリア」（vacuous pass 検出のための run 内自己診断）とは別物であり、用語が重なるため注記する。
- **テストハーネスの運用制約**: `npm test` は **`--test-concurrency=1` によるファイル直列実行**を前提とする——ガードテスト群は実 `work/`・`output/`（特に共有の `work/.session-ts`）を変更するため、ファイル並列だと run in-flight 判定が競合し偽陰性になる（本番でもガードはツール呼出ごとに逐次発火するため直列が正しいモデル）。恒久策として検討したルート注入口（テストごとに `CANON_ROOT` を差し替える引数注入）は、既存件数・所要時間に対し便益より回帰リスクが大きいという判断で降スコープとした。実 `work/<ts>`・`output/<ts>` を触るテストの ts 日付プレフィックスをファイル間で重複させない運用規約は、`tests/helpers/ts.js`（`TS_NAMESPACES` レジストリ）と `tests/ts_namespace.test.js` により**機械検査へ格上げ**した。

### 15.3 claude-canon 自身の検証（受け入れテスト）

- **工程単体テスト（ゴールデン方式）**: `fixtures/sample-repos/` の固定入力に各工程ワーカーを単独実行し、出力を同ディレクトリ配下の `expected-output/`・`expected-work/`（`tests/helpers/fixtures.js` ほかが参照する期待値）と突合。LLM 非決定性を考慮し、完全一致でなく**構造・キー・機械検証可能な不変条件**で判定する。
- **配線テスト（ガードの発火確認）＝ `npm test`・必須**: 違反入力を与え、PreToolUse 3ガードと G バッチが期待どおり deny／exit 2 することを確認する。**settings.json の自己検証は原理的に不可能**（壊れれば hooks が発火せず、SessionStart self-check すら走らない・§11.5）ため、これを帯域外の必須手続きとする。最低限のケース:
  - sanctioned 外書込（`Write`）→ write-scope deny
  - **`Bash` による保護パス書込（`echo x > docs/foo.md`）→ write-scope deny**（§11.3）
  - **`.gate/**` への書込（Write/Edit/Bash いずれも）→ deny-all**（§4.4）
  - spec 未承認で design-map 書込 → approval deny／spec 承認済みで spec.md 書込 → 凍結 deny
  - 旧ツール名を含む生成物 → G5 検出
  - **run 外（`.session-ts` 不在／終端マーカー有）では上記が素通りすること**（ガードの有効条件の確認・§11.3。保守ループが通ることの確認）
  - **リクエスト残留時に G バッチが再判定せず削除のみ行うこと**（`.requests/` 消費規約の冪等性・基本設計書 §4.5）
  - **ワーカー定義に `tools: Bash` を混入させた fixture → G13 が run 開始をブロックすること**、かつ **`output/<ts>/generated/.claude/agents/**` 側に `Bash` を持つ生成物を置いても G13 が発火しないこと**（機械強制と適用範囲・§11.2）
- **ランタイム・カナリア（各 run 内）**: `npm test` は run の前の検証であり、**その後に settings.json が壊れた場合を救えない**。各 run の工程1直前に `/canon` がカナリアを撃ち、deny されなければ中断する（§11.5）。配線テストとカナリアは**代替でなく補完**であり両方要る。
- **自己適用の回帰スイート化**: G1〜G12 を claude-canon 自身の `.claude/` に適用し、初版 agent/skill/settings の改変時にパス規約・frontmatter・ツール名を再検証する。**G13 はここに常設する**（`npm test` に含める）: ワーカー定義の改変で `tools: Bash` が混入していないかを、run を起こさずとも検出できるようにする。G13 は run 開始時（`UserPromptExpansion`）にも発火する（§11.2）が、**run 前に落とせるものは run 前に落とす**（`/canon` を叩いて初めて弾かれるより、保守作業の直後に気づける方が早い）。**ただし `npm test` は run 外で走るため G13 の唯一の門にはできない**（テスト後にワーカー定義が改変されうる）。カナリアと配線テストの関係（§11.5）と同型で、run 内の門（`UserPromptExpansion`）と run 外の門（`npm test`）は補完関係にある。
- **両設計書 frontmatter `canon_version` の正典追従（`npm test`・stale 検出）**: 両設計書の `canon_version` が `extractCanonVersion(CANON_FILES)`（G14・`build:tables` と同一 SSoT）の値と一致することを検査する。**機能X はこの値を直せない**（`canon-update-scope-guard.js` が `design/` を常時 deny・§13.1）ため追従は人手であり、G15 は非ブロッキングかつ旧値抽出を照合表の git 差分と proposal 申告に依存する。正典 bump が機能X を経由しなかった場合は G15 に検出機会が無く、乖離は §7 経由で `spec.md` の `canon_version` へ静かに伝播する。run の外で落とせるものは run の外で落とす（本節の G13 と同型）。キー欠落も違反扱いとする（vacuous pass 防止・§11.5）。
- **代表シナリオ最低3本**: (1) 既存なしの新規、(2) 既存あり（維持/改修/統廃合/廃止が混在＝5条件・G2・G8 を通す）、(3) 制約強め（`requirements.md` constraints で hooks 禁止・experimental 禁止＝G11 と縮退設計を通す）。
- **テストハーネスの構成契約**: パス解決（`ROOT`／`outputDir`／`workDir` 等）・sentinel 退避復元（`withRun`／`withCanonUpdateRun`／`withSelfOptim`）・fixture 生成（agent/skill frontmatter・サンプルリポ配置）・ts 発行は `tests/helpers/*` に集約し、各テストファイルはここから import する（`gates/lib/*.js` を個別に再導出しない・`.claude/rules/gates-and-tests.md` 「同じ判定ロジックを複数箇所へ複製しない」の適用）。**ただしガード自体の呼出しは子プロセス起動**（`tests/helpers/hook.js` の `hookRun`/`decide`）**のまま保つ**——in-process import に変えると「ロジックが正しい」と「hook として発火する」の区別が消える（§11.5 の趣旨と同型）。3ガード（write-scope-guard／canon-update-scope-guard／self-optimize-scope-guard）が共有する `gates/lib/shell-write.js` 由来の振る舞い（fd 複製の誤検知回避・コマンド実行系3ツールの網羅性等）は `tests/shell_guard_ssot.test.js` にテーブル駆動で集約し、極性固有の検証のみ各ガードの専用テストに残す。

---

## 16. eval 品質検査（工程9）の実装契約

基本設計書 §2・§3.2・§8.4・詳細設計書 §15 は eval を骨子で述べるのみで、本節が実行可能な精度に落とす。**§9 は design-map の節であり工程9 の節ではない**（節番号と工程番号は対応しない）。

### 16.1 位置づけ — 決定論ゲートとの分離線

工程8（決定論ゲート G1〜G13・真偽のみ）と工程9（eval・意味判断）は**別系統**であり、eval は決定論ゲートの代替にしない（基本設計書 §2）。分離線は次で截然と引く:

| 判定の性質 | 担い手 | 例 |
|---|---|---|
| 機械的に真偽が決まる | 決定論ゲート（`gates/`） | frontmatter スキーマ・ツール名・sha256 バイト同一・参照実在・C1/C3/C5 の実データ照合 |
| 意味を要する | eval（`.claude/agents/eval-*`） | **C2 要件非抵触・C4 強度整合**の意味的妥当性・merge 統合先の妥当性・受け入れ基準 `functional`(A1)・コンテキスト効率 |

- **eval は決定論ゲートが既に見た項目を再判定しない**。再判定は「非決定論の判定が決定論の判定を上書きしうる」経路を作り、真偽の権威を壊すからである。
- **eval の出力は前進ゲートの権威にならない**。eval はマーカーを鋳造せず（基本設計書 §2・§16.7）、その結果は P7（および C2 については P5）で**人間が読む材料**である（基本設計書 §8.4 の三段担保の中段）。
- **eval が沈黙しても決定論ゲートは無傷**である（逆は成り立たない。決定論ゲートが沈黙すれば eval は生成物の正しさを担保できない）。

### 16.2 判定5軸（基本設計書 §3.2 の具体化）

`eval-reviewer`（コーディネータ）が並列 spawn する（基本設計書 §14 のツリー）:

| 軸 | agent | 見るもの | 見ないもの（決定論ゲートの領分） |
|---|---|---|---|
| correctness | `eval-correctness` | 生成物が spec §8 の `functional`(A1) を満たすか・プロジェクト実態に接地しているか | 参照実在（G7）・スナップショット完全性（G9） |
| security | `eval-security` | 権限設計の妥当性（最小権限の実質・過剰な `tools:`）／`constraints.organization_policy`（自由文の組織ポリシー）への準拠（G11 が機械判定できず見送る唯一の経路） | secret ハードコード・`${VAR}` 展開（G6） |
| canon | `eval-canon` | 正典の**趣旨**への適合（段階的開示・description の委譲トリガー品質） | frontmatter キー・ツール名・パス規約（G3〜G5・G12） |
| context | `eval-context` | コンテキスト効率（重複・冗長・200行規律の実質） | 行数の機械的上限 |
| **keep-review** | `eval-keep-review` | **C2/C4 の意味判断**・merge 統合先の妥当性（基本設計書 §8.2・§8.4） | C1/C3/C5 の実照合（G2）・非退行（G8） |

**較正の重点**: 5軸すべてを定義・実装するが、ラベル付きコーパスによるメタ評価（§16.6）は **keep-review 軸に最も厚く**当てる。理由は、C2/C4 が「eval にしか判定できず、かつ判定を誤れば誤った現状維持が diff に出ないまま通る」（基本設計書 §8.2）唯一の経路であり、正解ラベルを客観的に定義できるからである。残り4軸（correctness / security / canon / context）にも最小のラベル付きコーパスとメタ評価を持つが、較正は**客観的に defensible な違反に限定**する（下表）。canon の趣旨適合・context の効率は本質的に主観を含むため、無理に主観判断をラベル化して甘い較正を作らず、明白な違反例だけを較正対象にする（測れる範囲に絞る方向であり、閾値を緩める方向ではない）。

- **4軸の採点単位＝`(target, null)`**（生成物1件＝1ラベル。`condition` は keep-review の C2/C4/merge_target に対し、4軸は `null`・§16.4）。採点ロジック（`meta-eval.js` の `score`）と verdict 検証（`verdict.js`）は軸非依存であり4軸で流用する。
- **4軸の violation/clean のラベル基準（客観化できる範囲）**:

  | 軸 | violation（明白なもののみ） | clean |
  |---|---|---|
  | correctness | spec §8 の `functional`(A1) 要件に生成物が明白に未達（要件が要求する対象に触れない等）・プロジェクト実態と矛盾 | 接地して A1 を満たす |
  | security | 明白な過剰権限（read-only で足るワーカーに `Edit`/`Write`・不要な広域 `tools:`）。**G6 の領分（secret・`${VAR}`）とは重ならない軸に限る** | 最小権限 |
  | canon | 委譲トリガー（description）が空虚で発火しない・段階的開示を無視した肥大。**G3〜G5 の機械検査（キー・ツール名・パス）とは別の趣旨違反に限る** | 趣旨適合 |
  | context | 明白な重複（同一内容が2ファイル）・読まれない冗長 | 効率的 |

### 16.3 判定入力バンドル（決定論・`eval/bundle.js`）

judge に「何を見るか」を**決定論的に確定**させる。judge が入力を探し損ねて何も見つけられず clean と答える経路を塞ぐため、入力収集は LLM に任せない。

- **入力**: `output/<ts>/design-map.md`（`existing_disposition`）・`output/<ts>/spec.md`（§2 新要件・§4 統合方針）・`work/<ts>/requirements.md`（`conflicts`・`strength_needed`・`constraints`）・系統A/B・対象原本（`resolveTargetRoot(ts)` 経由）。
- **出力**: `work/<ts>/eval-bundle/<axis>/<case>.md`（1 keep/merge レコード＝1バンドル）。
- **宣言除去規約（最重要・恒真バグの構造的封鎖）**: バンドルから **designer が立てた `keep_conditions` の boolean とその rationale を機械的に除去**する。除去しなければ judge は「C2: true」という**判定対象自身の主張**に自己一致して常に clean と答え、検査が恒真（vacuous）になる。これは G6 の experimental 開示検査が環境変数名 `..._EXPERIMENTAL_...` に自己一致した恒真バグと同型であり、同じ手法（判定対象の主張を本文から除去してから判定条件を当てる）で塞ぐ。merge レコードも同様に「統合元 → 統合先」の対応のみを渡し、妥当性の主張は落とす。
- 除去が効いていることは**テストで固定**する（バンドル本文に `keep_conditions` / `C2:` 等が現れないことを検査）。

**4軸への一般化**: バンドル生成を4軸（correctness / security / canon / context）へ広げる。各軸が「何を見るか」（§16.2 の「見るもの」列）を決定論で確定してから judge に渡す原則は keep-review と同じである。

- **軸ごとの入力**: correctness / canon / context は**生成物の実体＋接地材料**（spec §8 の A1・`work/<ts>/project_profile.md`）、security は**生成物の frontmatter `tools:` ＋設計意図**。判定対象は生成物そのものであり、keep-review のように「対象プロジェクトの既存原本」ではない。
- **自己一致封鎖の横展開（§16.3 の核心を4軸にも適用）**: keep-review は designer の `keep_conditions` 主張を除去した。4軸でも同型のリスク＝**design-map の `rationale`（designer が生成物を良しとした自己弁護）をバンドルに含めない**。judge が「設計者がこう正当化している」に自己一致して clean を返す恒真化を、判定対象の主張を構造的に読まないことで塞ぐ。除去はテストで固定する。
- **採点との関係**: これらのバンドルは**メタ評価のライブ収録**（judge にラベル・`fixtures/` を見せずバンドルのみで起動）にも、本番パイプライン工程9 の judge 入力にも使える。採点は §16.6・`meta-eval.js` を軸非依存に流用する。

### 16.4 verdict スキーマ（judge ↔ harness の唯一の契約）

各 judge は `output/<ts>/eval/<axis>.md` に、人間可読の本文＋**```json フェンス1個**を書く。パースは `gates/lib/markdown.js`（`firstFencedBlock` / `computeFenceMask`）を再利用する（依存ゼロ維持）。

```json
{
  "axis": "keep-review",
  "ts": "YYYYMMDD_hhmmss",
  "coverage": [".claude/agents/foo/foo.md", ".claude/skills/bar/SKILL.md"],
  "findings": [
    { "target": ".claude/agents/foo/foo.md", "condition": "C2",
      "verdict": "violation", "confidence": "high",
      "rationale": "…", "evidence": ["spec.md#R2", "requirements.md#conflicts[0]"] }
  ]
}
```

- `axis` ∈ 5軸名 ／ `verdict` ∈ `violation` | `clean` ／ `condition` ∈ `C2` | `C4` | `merge_target` | `null`（keep-review 以外） ／ `confidence` ∈ `high` | `medium` | `low`。
- `coverage` は**判定した対象の全列挙**であり必須。これが無いと「見なかった」と「見て問題なし」を区別できない。
- **パース不能・フェンス不在・スキーマ違反を「違反なし」と読んではならない**（§11.5 の vacuous pass と同型）。harness はこれを eval の失敗として報告する。

### 16.5 `eval-report.md` とカバレッジ規約（`eval/report.js`）

`eval-reviewer` が全軸の verdict を `output/<ts>/eval-report.md` へ集約する（基本設計書 §14）。harness は次を決定論的に検査する:

- **カバレッジ**: G2 が回付した対象（design-map の `disposition: keep` 全件 × C2/C4、`merge` 全件 × 統合先）が keep-review の `coverage` に**全件**現れること。未判定を pass と読まない。
- **回付0件を「eval 実施済み」と誤認しない**: keep 0件・design-map 不在は G2 と同じく成功と扱わない（§11.2 G2 実装契約の vacuous 規約と同一）。
- 軸ファイルの欠落・スキーマ違反は eval の失敗であり、**「判定不能（judge が判定できなかった）」として `notes` と `violations` の両方に現れる**（軸名は戻り値の `undecided` に載る）。判定不能な軸は `forcedReview` に1件も寄与しないため、**violation 0件を「違反なし」と読んではならない**——`ok` を見ずに `forcedReview` だけ読む経路の誤読を防ぐのが notes の役割である。keep-review が判定不能なら coverage 検査そのものが成立しないので、回付対象を条件単位で全件名指しして「全て未判定」と報告する（沈黙すると「回付されたのに誰も見ていない対象」が出力のどこにも現れなくなる）。
- `verdict: violation` の findings を **P5/P7 の強制表示リスト**として抽出する（基本設計書 §8.4「C2 が eval 未通過の維持は P5 で強制表示」の実体）。

### 16.6 メタ評価 — judge の較正（`eval/meta-eval.js`）

**judge は測定器であり、測定器は較正しなければ測定値を信用できない。** ラベル付きコーパスに対する judge の precision/recall を測る:

- **コーパス**: `fixtures/eval-corpus/<axis>/cases/<case-id>/` に最小の run 断片（design-map / spec / requirements / 系統A・B ＋ 対象原本）と `label.json`（期待 verdict。違反例は期待 `target` × `condition`）。**正例（clean）と違反例を必ず混在**させる。
- **採点単位**: `(target, condition)` の対。混同行列 → precision / recall / F1。
- **合否閾値**:
  - **違反例の recall = 1.0（必須）** — 違反を1件でも見逃す judge は不合格。これが「検出器が生きている」ことの証明であり、故意の違反注入なしに「検出0件」を成功と読む失敗を塞ぐ。
  - precision ≥ 0.75 — 過剰検出は P5 の「注意の集中」（基本設計書 §8.4）を壊すため。
  - **vacuous 検出**: 全件 clean（recall 0）・全件 violation（precision 極低）は専用メッセージで落とす。judge が入力を読まず定型を返す退化を名指しで捕らえる。
- 閾値未達は **exit 2**。較正の実体は**agent プロンプトの改訂と再測定**であり、実測値（混同行列）を記録に残す。
- **メタ評価器自身の検証（測定器の測定器）**: 合成 judge（oracle / always-clean / always-violation / 1件見逃し）を食わせ、**それぞれ期待どおり合否が出ること**を `npm test` で固定する。これが無いとスコアラの恒真バグ（常に合格を返す）を検出できない。

**4軸への較正の共通化**: 較正対象を keep-review から4軸へ広げる。閾値（recall=1.0・precision≥0.75）と vacuous 検出（正例/違反例の混在必須・全件 clean/violation の退化を名指し）は**共通**であり、`meta-eval.js` の `--axis` で軸を切り替える（スコアラは軸非依存で無改修）。ただし2つの限界を正直に明記する:

- **ground-truth の主観性**: 4軸、とりわけ canon（趣旨適合）・context（効率）は本質的に主観を含み、keep-review の C2/C4 のように客観ラベルを与えづらい（§16.2 が keep-review に較正を厚く当てた理由そのもの）。**客観的に defensible な違反だけをラベル化**し、主観判断を無理にラベル化して甘い較正を作らない。閾値未達が出ても即 agent 改訂とせず、まず**ラベルの客観性を疑う**。
- **「見つけていない」を「無い」と書かない**: judge が満点なら、それは「このコーパスで見逃しが無かった」であって「judge が見逃さない」ではない。judge が実際に誤る境界を発見できていないなら、そう記録する。境界を発見したら、`eval-*` agent と `quality-checklist` skill のプロンプト改訂→再測定で対処する（測定器をコーパスに合わせない）。

### 16.7 発火と冪等 — eval は G バッチを再発火させない

- **eval-\* は `work/<ts>/.requests/` に何も書かない**。工程9 は「マーカー書かない・G バッチ非発火」（基本設計書 §2）である。
- eval-\* の完了で **SubagentStop は発火する**が、`.requests/` に残留があっても基本設計書 §4.5 ① の冪等演算（マーカー有 → 判定を再実行せず削除のみ）により**ブロックラッチの偽陽性は生じない**。この性質は配線テストで固定する（残留 request を置いて stage-guard / gen-guard を起動し、マーカー鋳造0・ラッチ0 を確認）。
- **P7 の表現**: `npm run approve -- <ts> eval`（承認の唯一の鋳造経路・基本設計書 §4.4）。eval 承認は前進ゲート（approval-guard）の条件には使わない（工程10 は run 外の CLI 工程・§10.2）。
- **eval ハーネス（`eval/`）は hooks から発火しない**。`gates/` が「hooks が発火させる不変土台」であるのに対し、`eval/` は CLI と `npm test` から回る別系統であり、ゆえに別ツリーに置く（基本設計書 §14）。
- **eval ハーネスの起動経路**: `output/<ts>/eval-report.md` の集約検証（`eval/report.js` `checkEvalReport`）は `npm run eval:report -- <ts>` として CLI 起動できる（`main()` を持つ）。違反があれば exit 2。オーケストレータは工程9 の手順3（`.claude/skills/canon/SKILL.md`）でこれを実行し、5軸ファイルの欠落・`eval-report.md` の不在／空／集約漏れを検出する。

### 16.8 スクリプト構成

| ファイル | 責務 | 決定論 |
|---|---|---|
| `eval/bundle.js` | 判定入力バンドル生成（§16.3・宣言除去） | ○ |
| `eval/verdict.js` | verdict のパース＋スキーマ検証（§16.4） | ○ |
| `eval/report.js` | eval-report 集約検証・カバレッジ・強制表示リスト抽出（§16.5） | ○ |
| `eval/meta-eval.js` | メタ評価スコアラ・閾値判定（§16.6） | ○ |
| `.claude/agents/eval-*` | 意味判断（judge） | ✕（LLM） |
| `.claude/skills/quality-checklist` | 5軸の観点定義・決定論ゲートとの境界（`eval-reviewer` に preload） | — |

`npm run eval:bundle -- <ts>` / `npm run eval:meta -- [--verdicts <dir>]` で起動する。
