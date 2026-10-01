---
title: claude-canon 成果物と検査の契約
purpose: run が作る成果物のフォルダ構成と書式、既存カスタマイズの扱い（keep 条件 K1〜K5）、MANIFEST と README の生成規則、verify の検査 V1〜V9、review-bundle、deploy の契約を定める。Phase・工程・責務・handoff.md・git 運用は architecture.md に置く。
audience: [ai, human]
canon_version: v2.1.280
---

# claude-canon 成果物と検査の契約

本書は [architecture.md](architecture.md) と対をなす。工程番号（1〜9）・人間ゲート（P1〜P5）・Phase（A〜D）は architecture.md §2 の定義に従う。

書式を機械で読むのは、スクリプト（`verify.js`・`slice.js`・`copy-keep.js`・`emit-manifest.js`・`review-bundle.js`・deploy 系）である。各節の「値の語彙」はスクリプトとワーカー定義の双方が守る契約で、書き方の揺れはそのまま判定の誤りになる。

**CLI の終了コード（全スクリプト共通）**: 0＝合格・成功／1＝違反・拒否・失敗（入力の不在・自己指定の拒否・deploy の拒否と巻き戻しを含む）／2＝引数不正（引数が無い・`<ts>` の形式違い）。呼び出し側は 2 を「コマンドの渡し方の誤り」、1 を「中身の問題」と読む。

---

## 1. work/ と output/

```text
work/<ts>/
├─ handoff.md                      run の状態・承認・差し戻し・申し送り・canon 課題候補（architecture.md §6）
├─ investigation/
│   ├─ existing.md                 工程1: 既存カスタマイズの棚卸し（§2.1）
│   ├─ profile.md                  工程1: プロジェクトの実態（浅く広く・§2.2）
│   └─ focused.md                  工程3: 要件に関係する箇所の深掘り（§2.3）
├─ requirements.md                 工程2: 合意した要件（§3）
├─ slices/                         Phase C: design-map のワーカー別スライス（§5.4）
└─ review-bundle/                  Phase C: レビューの判定入力（§9）

output/<ts>/
├─ spec.md                         工程4（P2 の対象・§4）
├─ design-map.md                   工程5（P3 の対象・§5）
├─ generated/                      工程6: 対象へ配置するファイル一式（P4 の対象）
│   ├─ CLAUDE.md・.claude/{rules,skills,agents,hooks}/・.claude/settings.json・.mcp.json・plugin/
│   └─ .claude/README.md           生成物の使い方（§7.3）
├─ MANIFEST.md                     何が変わるか（§7.2）
├─ verify-report.md                工程7（§8.1）
├─ review/                         工程8（§9.3）
│   └─ review.md・keep-review.md・prompt-audit.md・security-review.md・code-review.md
└─ deploy/                         Phase C・D（§10）
    ├─ managed-paths.list・retired.list          Phase C で emit-manifest.js が出力
    ├─ RUN.md・pre-deploy-report.txt             工程9（P5 の対象は pre-deploy-report.txt）
    └─ deploy-result.json・deploy-attempt.json   配置時に deploy.js が出力
```

- **work は工程の中間物、output は人間が承認するものと対象に届くもの**。承認の対象（spec・design-map・generated・pre-deploy-report）はすべて output にある。例外の requirements.md（P1 の対象）は、対象に届けるものではないので work に置く。
- 承認状態は成果物の中に持たせない。承認は handoff.md の承認行に記録する（architecture.md §6.2）。
- 対象プロジェクトのパスは handoff.md の frontmatter `target` が持つ。

---

## 2. investigation（工程1・工程3）

調査は**事実の抽出に徹し、判定しない**。keep にするかどうかも、参照が健全かどうかも、ここでは決めない。調査の対象は `target` の配下だけで、claude-canon 自身のリポジトリは調べない。

### 2.1 existing.md（既存カスタマイズの棚卸し）

対象の `CLAUDE.md`・`.claude/rules/`・`.claude/skills/`・`.claude/agents/`・`.claude/hooks/`・`.claude/settings.json`・`.mcp.json`・`plugin/` を正典の分類軸で分解する。

```markdown
## サマリ
総数 <n>（L1 <n> / L2 <n> / L3 <n> / L4 <n> / L5 <n>）／正典から外れている疑い（事実のみ）

## レコード（1ファイル1件）
- path: <対象ルート相対>
  layer: L1|L2|L3|L4|L5
  kind: <claude-md|rule|skill|agent|hook|settings|mcp|plugin|…>
  strength: advisory|deterministic|enforced
  purpose_verbatim: "<frontmatter description の転記>"
  frontmatter_keys / declared_tools / declared_model / declared_skills
  depends_on:
    customization_refs: [<他のカスタマイズ・設定への参照>]     # K3 が見る
    project_refs:                                              # K5 が見る
      - kind: paths_glob       value: "src/**/*.ts"            # Rules の paths:
      - kind: supporting_file  value: "./scripts/x.sh"         # Hook スクリプトなど
      - kind: path_reference   value: "src/legacy/"
  referenced_by: [<逆参照>]
  canon_conformance:                                           # K1 が見る
    frontmatter_keys_valid: true|false
    unknown_frontmatter_keys: []
    tool_names_valid: true|false
    deprecated_notation: []
```

- `depends_on` は、カスタマイズ同士の依存（customization_refs）とプロジェクトの実体への参照（project_refs）に分ける。前者は K3、後者は K5 の判定入力になる。
- `layer` はパスと一致させる: `CLAUDE.md` と rules の `.md` は L1、`skills/<名前>/SKILL.md` は L2、agents の `.md` は L3、`.claude/hooks/**` は L4。scripts・settings.json・README などは分類に裁量があるので固定しない。
- サマリの総数と層ごとの内訳は、レコードの件数と一致させる。

### 2.2 profile.md（プロジェクトの実態・浅く広く）

```markdown
## profile
languages / frameworks / build / package_manager
test: { frameworks / test_dirs / runner_cmd }
ci / conventions（naming・lint・format）/ repo_scale / existing_docs
learning_history: <対象プロジェクト自身の学習履歴ファイルの有無と所在>
```

`learning_history` は、対象が過去に踏んだ落とし穴（依存関係の罠・CI の既知の失敗など）をヒアリングで踏まえるためにある。名前はプロジェクトごとに違う（`tasks/lessons.md`・`docs/lessons.md` など）ので固定パスで探さず、README や CLAUDE.md からの言及を手がかりにする。無ければ空欄でよい。

### 2.3 focused.md（要件に関係する箇所の深掘り）

要件が確定した後にだけ書く。

```markdown
## focused
requirement_ref / scope
findings:
  - topic: <論点>
    evidence_paths: [src/a.ts:12-40, src/b.ts]
    summary: <要約>
extractable_templates:
  - source / as / note          # Skill の supporting file にできる素材
ref_resolution:                 # existing.md の project_refs を実リポジトリに照合した結果（K5 の入力）
  - ref: "src/**/*.ts"     kind: paths_glob       resolved: true   match_count: 42  sample: "src/app.ts"
  - ref: "./scripts/x.sh"  kind: supporting_file  resolved: false  reason: "not found"
```

`evidence_paths` は幻覚を防ぐための根拠で、必須である。`extractable_templates` は生成物をプロジェクトに接地させる素材になる。

### 2.4 値の語彙

1. **`evidence_paths`** は対象ルート相対のパスを裸で書く（バッククォートで囲まない。パーサはダブルクォートは外すがバッククォートは外さない）。複数あるときは `[a, b]` の角括弧が必須で、角括弧が無いと行全体が1つのパスとして扱われる。末尾に行番号 `:N` や行範囲 `:N-M` を付けてよい。1項目の中にカンマ区切りの複数行番号（`path:12,40`）は書かない（角括弧の中ではカンマが項目の区切りになる）。複数行を示すときは行範囲にするか、findings を分ける。
2. **`deprecated_notation`** の「無し」は `[]`（または空・未定義）だけで表す。「なし」などの自然文は clean と見なされない。`tool_names_valid` は `tools:` を宣言していないレコードでも `true` と書く（検査対象が無いので適合）。
3. **existing.md の `project_refs[].value` と focused.md の `ref_resolution[].ref` は文字列の完全一致で突き合わせる**。まとめ書き（`"design.md §8, §8.1"`）や圧縮表記（`"a.js, b.js"`）はせず、1参照につき1エントリを両方で同じ文字列で書く。
4. **`kind: settings`（frontmatter を持たない JSON）** のレコードは `unknown_frontmatter_keys: []` に固定する。JSON のトップレベルキーを未知の frontmatter キーとして報告しない。

---

## 3. requirements.md（工程2・P1）

ヒアリングで合意した内容の記録。オーケストレーターが対話の直後に書く。

```markdown
## メタ
confirmed_at / confirmed_by

## 確定要件
- id: R1
  want: <ユーザーの言葉で、達成したいこと>
  strength_needed: advisory|deterministic|enforced
  priority: must|should|could

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true|false, reason: "..." }
  mcp:          { allowed: true|false, reason: "..." }
  plugins:      { allowed: true|false, reason: "..." }
  experimental: { allowed: true|false, reason: "..." }   # Agent Teams・Channels・Monitors・Themes・context: fork
  organization_policy: <その他、組織ポリシー由来の制約（自由文）>

## 制約と要件の衝突
conflicts:
  - requirement: R1
    constraint: hooks
    note: <deterministic が使えない。advisory へ下げるか、断念するか。選択肢を人間に示す>
```

- `strength_needed` は正典 `00_INDEX.md` の強度3段階（advisory＝CLAUDE.md、deterministic＝Hooks、enforced＝permissions）に対応し、制約との衝突の検出に使う。
- `constraints` は要件とは独立した環境条件で、機能選定の分岐を先に刈り込む。制約は、調査での検出（Hook が無い・MCP の設定が無い・ポリシーの痕跡）とヒアリングでの確認（禁止なのか、使っていないだけなのか）を合わせて拾う。
- `conflicts` は方向づけまでにとどめ、判定しない。
- **`conflicts` のブロック自体が無いのと、空（`conflicts: []`）とは区別する**。衝突が無ければ `conflicts: []` と明示する。ブロックが無いのは記録漏れで、V9 が違反にする（§8.2）。
- **`allowed: false` は「生成物のどこにも現れてはならない」を意味する**（V9 が機械で強制する）。refactor モードで「既存が既に使っていて、維持はしたいが新規には足さない」場合は、`allowed: false` にしない。`allowed: true` にして、`reason` に「既存を維持・新規追加なし」と書く。`allowed: false` にすると、既存の keep 対象がその機能を使っているだけで違反になる。ヒアリングでこの区別をユーザーに確かめる。
- 禁止したときの波及: MCP を禁止すると外部連携を含められない（手動手順の L1・L2 化で代える）。Hooks を禁止すると決定論のガードレールを含められない（permissions による承認に下げるか、断念する）。Plugins を禁止すると L5 の配布はできず、個別ファイルの配置だけになる。experimental を禁止すると `context: fork`・Agent Teams・Channels・Monitors・Themes は使えない。

---

## 4. spec.md（工程4・P2）

design-map をこれだけで引けること、検証とレビューが受入基準の出典にできること、の2つを満たす。

| 節 | 内容 |
|---|---|
| §0 メタ | spec_id / canon_version / inputs（investigation の3ファイルと requirements.md のパス）。**canon_version は `gates/conformance_tables/index.json` の `canon_version` を写す**（正典の「確認したClaude Codeバージョン」から生成された値）。設計書の frontmatter から写さない（人が保守するので正典より遅れうる） |
| §1 目的とあるべき全体像 | purpose / strength の内訳 / scope_layer |
| §2 新要件 | id / want / rationale / project_grounding（focused.md の findings から、evidence 付きで接地させる） |
| §3 既存資産の棚卸し | existing.md の全レコードを参照する。keep か modify かは決めない（事実のみ） |
| §4 統合方針 | 既存と新要件の競合・重複の方向づけ（最終判定は design-map）。focused.md の `ref_resolution` で `resolved: false` になった参照を全件挙げ、直す候補か意図的な未解決かを分ける |
| §5 プロジェクト接地素材 | paths_hints / model_hint / supporting_file_candidates |
| §6 スコープ外 | やらないこと（全体の設計し直しが際限なく広がるのを防ぐ） |
| §7 制約 | security / cost / experimental（依存フラグの可否） |
| §8 受入基準 | 4カテゴリ（下表）。必ず満たすべき基準に `[mandatory]` を付ける |
| §9 未決事項 | 人間の判断が要る論点。空でなければ P2 に出さない |

| 受入基準 | 判定する担い手 |
|---|---|
| `functional`（A1） | reviewer（correctness 観点） |
| `non_regression`（A2） | V7（keep の非回帰） |
| `canon_conformance`（A3） | V1〜V6 |
| `snapshot_integrity`（A4） | V8 |

**責務の三段分離**: 調査は判定しない → spec は方向づけまで → design-map が確定する。判定を design-map の1か所に集める。

---

## 5. design-map.md（工程5・P3）

### 5.1 位置づけ

- 承認済みの spec を入力に、**全体を引き直す**。前回の run の design-map を出発点にしない。
- keep・modify・merge・retire の判定を確定する（§6）。
- requirements.md の constraints で、機能選定フローチャート（`docs/00_INDEX.md`）の分岐を先に刈り込む。
- 「output は design-map の射影である」ことが全量スナップショット方式の裏付けになる。生成の唯一の設計入力であり、verify の V7・V8 と emit-manifest の宣言源でもある。

### 5.2 構造

```markdown
# design-map.md

## メタ
spec_ref: output/<ts>/spec.md
layers: 2層|3層 / rationale: <層数の理由>            # docs/ORCHESTRATION.md

## Used Features
<L1〜L5 の8機能のうち使うもの。使わないものは N/A。起動する builder の層がここで決まる>

## L1 / ## L2 / ## L3 / ## L4 / ## L5                  # 層ごとの節（見出しは層名で始める）
<その層の生成物を1件ずつ宣言する。L2 は disable-model-invocation と context: fork の可否、
 L3 は責務・tools・model・preload skill、L4・L5 は constraints が許すときだけ>

## レイヤー構成
<カスタマイズごとの1文責任。L1: … / L2: … / L3: … / L4: … / L5: …。
 `### Responsibility Map` を含めてよい（reviewer が責務の膨張を見る材料。slice.js が `responsibilities.md` に切り出す）>

## Write Scopes
<役割ごとの常設の書込範囲・共有する構成ファイル（依存追加・実行時設定）の扱い。
 役割分担が無い設計（Subagent が1体だけ、L2 だけなど）は「N/A（役割分担なし）」と書く>

## 既存判定
existing_disposition:
  - path: .claude/agents/reviewer/reviewer.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "..."
  - path: .claude/skills/old-test-gen/SKILL.md
    disposition: retire            # または merge
    reason_code: superseded_by_new
    superseded_by: .claude/skills/test-gen/SKILL.md
    manifest_note: "old-test-gen は廃止し、test-gen へ移行"
  - path: .claude/skills/lint/SKILL.md
    disposition: modify
    interface_change: none
    rationale: "本文に節を足すだけ。frontmatter の name は変えない"

## Model Assignments
<各実行単位の model（spec §5 model_hint から・§5.5）>

## Interface Contracts
<カスタマイズ間の入出力と依存の向き>

## 生成上の制約
<builder への指示。対象プロジェクトの非管理ファイルへの参照は行番号でなく節見出しで書く（V6）など>

## 要件→生成物の対応
<spec §8 の [mandatory] を付けた受入基準 ID ごとに、それを満たす生成物>

## 配置時の追加手順
<配置の前後に人間が行う手作業（任意）。emit-manifest.js が MANIFEST へ写し、RUN.md が逐語で転記する>

## Experimental Dependencies
<context: fork・Agent Teams・Channels・Monitors・Themes への依存箇所（constraints が許すときだけ。V9 が見る）>

## 依存フラグ
<ネストの段数・isolation: worktree の要否>
```

- keep の `keep_conditions` は5条件を並べ、1つでも false なら keep にできない構造にする（判定を裁量でなく規則の適用に近づける）。
- retire と merge のレコードには `manifest_note` を必ず書く。

### 5.3 `interface_change`

`modify` のレコードでだけ意味を持つ任意のフィールドで、値は `none`（対外インタフェースを変えない）か `breaking`（変える、または分からない）の2値。**書かなければ `breaking` とみなす**。`retire`・`merge` のレコードに書くのは誤り（実体が消えるので無意味）。designer は設計の時点で生成物を見られないので、宣言を自分では確かめられない。実照合は V7 が行う（§8.2）。

### 5.4 スライス

design-map は大きくなり（実測で約96KB）、全文を各ワーカーが読むと読み込みが積み上がる。Phase C の冒頭で `slice.js` が `work/<ts>/slices/` にワーカー別のスライスを書く。

- **出力**: `common.md`（メタ・Used Features・レイヤー構成・Model Assignments・Interface Contracts・生成上の制約・要件→生成物の対応・Experimental Dependencies・依存フラグ）／`write-scopes.md`／`responsibilities.md`（レイヤー構成の `### Responsibility Map`。無ければ無い旨の1行）／層ごとの `l1.md`・`skills.md`・`agents.md`・`l4.md`・`l5.md`（その層の節と、その層の modify・merge レコード）／`disposition-other.md`（keep・retire・out_of_scope と、どの層にも属さない modify・merge。`plugin/**` は L5 に属し、`.claude/README.md` は層に属さず宣言一覧にも出ない）／`other-sections.md`（どこにも属さない節の受け皿）／`targets-l1.txt`〜`targets-l5.txt`・`targets-other.txt`・`targets-all.txt`（宣言された生成物。V8 と同じ宣言源）／`INDEX.md`。
- **規約**: 切り出しは節見出しと disposition レコードの単位で行い、記述を1文字も変えない。未知の節は `other-sections.md` に集め、黙って落とさない（全スライスの和が design-map の全節を覆う）。`## Used Features` が無ければ失敗する。書き出す前に出力先を空にする（古いスライスを読ませない）。差し戻しで design-map を直したら、スライスを作り直す。
- **層の節の照合**: 見出しは完全一致を優先し、無ければ前方一致で拾う（`## L1（builder）` のような書き方を取りこぼさない）。この照合は V8 と共有する。
- **読み手**: 各 builder は自分の層のスライスと `common.md`・`write-scopes.md`、reviewer はスライス一式を読む。design-map の全文は読ませない。builder は書く前に自分の層の `targets-l<n>.txt` の件数と書くファイルの数を突き合わせる。

### 5.5 モデル割当の根拠

正典 `L3_AGENTS.md`・`BEST_PRACTICES.md` に基づき、Opus / Sonnet / Haiku の3段階で割り当てる。haiku は次の**すべて**を満たす役割にだけ使う。

1. 設計判断や文脈の推論を伴わない（機械的な構造化・固定書式の出力に限る）。
2. 正典 `docs/` を参照せずに完結する（生成や判断の Skill を preload しない）。
3. 失敗のコストが低い（後段の工程かレビューが出力を検証する）。

`fable` は公式のエイリアスとして指定できるが、既定では採用しない。詳細は design Skill が持ち、designer が `## Model Assignments` に記録する。

---

## 6. 既存カスタマイズの扱い

### 6.1 全量スナップショット方式

refactor モードでは、差分パッチを当てずに「既存＋新しい要件」から全体を設計し直し、output に**配置後の全量**を置く。配置は管理パス集合を退避スワップで置き換える（§10）。

- **keep は再生成せず、既存の実体を output へバイト単位でコピーする**。Phase C の冒頭で `copy-keep.js` が行い、sha256 を照合する。LLM に Read → Write させると写し違いが起きるので使わない。
- 「keep＝再生成しない」を「output に置かない」と読んではならない。配置は管理パス集合の全置換なので、output に無いファイルは対象から消える。
- 廃止は MANIFEST に明示する。全置換で黙って消える事故と区別するためである。

### 6.2 既存の判定

designer が existing.md の各レコードに1つを割り当てる。管理パス集合の中のレコードは keep・modify・merge・retire の4択で、out_of_scope は集合の外の実体にだけ使う（集合の外のものを retire にすると、配置で消える対象と誤読される）。

| 判定 | output での扱い |
|---|---|
| keep | 既存の実体をそのままコピーする |
| modify | 新しい内容で生成する |
| merge | 他と統合する（複数を1つに、または新規のものに吸収する）。統合される側は output に置かない |
| retire | output に置かない。MANIFEST と `retired.list` に明示する |
| out_of_scope | 管理パス集合の外にある既存の実体。output に置かず、配置でも触れない（設計の判断として言及するだけ）。`manifest_note` に管理対象外の理由を書く |

### 6.3 keep の5条件（K1〜K5）

modify・merge・retire は「変える」判断なので差分に出て、人間がゲートで気づける。**keep は「変えない」判断なので差分に出ない**。誤った現状維持は誰にも気づかれずに通る。とくに全量スナップショットでは、陳腐化した keep が最も見つけにくい。そこで keep にだけ厳しい条件を課し、次のすべてを満たすときだけ keep を許す。

| 条件 | 内容 | 判定元 | 担い手 |
|---|---|---|---|
| **K1 正典適合** | existing.md の `canon_conformance` が clean（frontmatter_keys_valid・tool_names_valid が true、unknown_frontmatter_keys・deprecated_notation が空） | 事実照合 | V7 |
| **K2 要件非抵触** | spec の新要件・統合方針と競合も重複もせず、requirements.md の conflicts に現れない | 意味判断 | keep-reviewer（→ P4） |
| **K3 依存健全** | existing.md の `customization_refs` の参照先が、今回の design-map で retire・merge にならない。modify になる場合は、そのレコードが `interface_change: none` を宣言している | 事実照合 | V7 |
| **K4 強度整合** | 既存が担う強度が、requirements.md の `strength_needed` と constraints に矛盾しない | 意味判断 | keep-reviewer（→ P4） |
| **K5 実態整合** | existing.md の `project_refs` がすべて focused.md の `ref_resolution` で `resolved: true`（陳腐化した参照が無い） | 事実照合 | V7 |

- 1つでも欠ければ keep にできず、modify・merge・retire のいずれかにする。
- K5 は、Python をやめた後も残る `paths: "src/**/*.py"` や、消えた supporting file への参照などを捕まえる。
- K3 の `interface_change: none` の宣言は、設計の時点では確かめようがない。宣言だけで keep が通る抜け道にしないため、生成後に V7 が原本と output の対外インタフェースを照合する。
- K2・K4 は意味の判断を要するので、verify ではなく keep-reviewer が判定する。keep-reviewer には designer が立てた boolean と rationale を渡さない（§9.1）。

### 6.4 modify・merge・retire の切り分け

どれも差分に出るので相対的に緩くてよい。目安は次のとおり。

- **modify**: 機能は要る。単体で成立し、正典からの逸脱や新しい要件との差を直せば使える（K1 違反・K2 抵触の多く）。
- **merge**: 複数の既存が同じ目的で重複している、または新規のものがその役割を包含する。1つに寄せる。
- **retire**: 機能そのものが要らない、または統合後の全体像に居場所が無い。**最も慎重に扱う**（MANIFEST への明示と人間の確認が必須）。

### 6.5 P3 での提示

全件を精査させると負荷が高いので、注意を要するものに絞って示す。

- **retire の全件**: 事故が最も重い。1件ずつ確認する。
- **merge の統合先**: どこに寄せたかの妥当性。
- **K2・K4 に疑いがある keep**: designer が判断に迷ったものを明示する。K2・K4 の独立した判定は Phase C の keep-reviewer が行い、疑いありとされた keep は P4 で必ず示す。

5条件を明らかに満たす keep（新しい要件と無関係なもの）は要約だけにし、人間の注意を「判断が割れた箇所」と「取り消せない廃止」に集める。

---

## 7. MANIFEST・README・配置リストの生成

工程6の最後に `emit-manifest.js` が design-map と生成物の frontmatter から**決定論で**生成する。LLM に書かせない。

### 7.1 4文書の役割

| 文書 | 内容 | 読み手 | 読むとき |
|---|---|---|---|
| spec.md | なぜこの構成か（要件・意図） | 設計を追う人 | — |
| design-map.md | どう設計したか（層・判定） | 設計を検証する人 | — |
| MANIFEST.md | 何が変わるか（新規・改修・維持・廃止） | 配置を承認する人 | 配置時に1回 |
| README.md | どう使うか | 日常的に使う開発者 | 配置後に繰り返し |

spec と design-map は作った側の記録、README は使う側の説明書である。README に設計判断の理由は書かない。

### 7.2 MANIFEST.md

`output/<ts>/MANIFEST.md`。

- **差分の要約**: 新規・改修・維持・廃止（retire と merge の統合元）を分けて列挙し、廃止には `manifest_note` を添える。
- **`## 全ファイル` 節**: `generated/` の全ファイルを1行1件（`` - `<generated/ からの相対パス>` ``）で列挙する。V8 が generated/ の実ファイルと双方向に照合する。MANIFEST は人間が「何が変わるか」を判断する唯一の記録なので、存在するだけでは足りず、中身が generated/ と一致していなければならない。
- **`## 配置時の追加手順` 節**: design-map の同名の節を写す（無ければ「なし」）。RUN.md がこれを逐語で転記する（§10.4）。

### 7.3 README（`generated/.claude/README.md`）

README は管理パス集合に含まれ、配置のたびに生成したもので置き換わる。作文ではなく**規則の適用**で書く。扱う要素は次の5つ。

1. **何ができるか**: 設計の語彙ではなく、利用者の行動の語彙で書く。
2. **どう起動するか**: frontmatter から正典の規則で導く（下表）。
3. **前提のセットアップ**: 動かす前にやること（§7.4）。
4. **使用例**: spec §8 の `functional`（A1）を転用する。検証したことと使い方の説明を一致させる。
5. **注意と制約**: 副作用のある操作・Hook がブロックする挙動・適用範囲（paths）。

`emit-manifest.js` は、design-map が `.claude/README.md` を `modify` 以外（`out_of_scope` を除く）にしていると失敗する。README は配置のたびに作り直すので、既存の README は modify として扱う。

起動方式の導出（`L2_SKILLS.md`・`L3_AGENTS.md`）:

| 種別 | 見る frontmatter | 起動方式 | README での書き方 |
|---|---|---|---|
| Skill（手動専用） | `disable-model-invocation: true` | `/名前` でのみ起動 | 「`/名前 引数` で起動する（自動では動かない）」。argument-hint があれば引数の例も |
| Skill（通常） | `disable-model-invocation` が未設定か false | 自動発動と `/名前` | 「〜と頼むと自動で使われる。`/名前` でも起動できる」 |
| Skill（参照知識） | `user-invocable: false` | 起動できない | **利用者向けの一覧に載せない**。「内部で参照される知識」に留める |
| Subagent | description による委譲 | メイン Claude が自動で委譲 | 「〜のときメインが自動で使う」。利用者が直接起動する手順は書かない |
| Rule | `paths:` の有無 | 自動で読み込まれる | 「常に読み込まれる」または「<paths> を扱うときに読み込まれる」 |
| Hook | イベント | 自動で発火 | 起動ではなく挙動の予告:「〜のとき自動で走る／ブロックされる」 |
| MCP サーバー | `${VAR}` の secret・OAuth の有無 | 接続（初回のセットアップが要る） | secret や OAuth があればセットアップ手順へ誘導する |

- 種別を先に確定してから frontmatter を読む。Subagent は `user-invocable` を持たない。
- **「一覧に載せない」の範囲**: 禁じるのは利用者向けの一覧への掲載（見出し行・表の第1セル・箇条書きの先頭の区分に識別子として立つこと）と、`/名前` という起動の表記（使用例のコードフェンスの中も含む）である。散文での言及と、`.claude/skills/<name>/scripts/<script>` のようなパスの表記は許す（Hook の実体の在り処を README から辿れる必要がある）。逆に、一覧に載る Skill の `/名前` が README に無いのは誤りである。
- 別の Agent や Skill に preload されるだけの Skill は、`user-invocable: false` を明示する（既定の true に流れると `/` メニューに出てしまう）。

### 7.4 セットアップ欄の導出

design-map の全コンポーネントの frontmatter と依存から、動かす前に要ることを機械的に拾う。

- `context: fork` の Skill → `agent:` の指定があること。
- ネストした委譲 → 既定の深さの上限（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で変更可）に収まること。
- MCP の `${VAR}` → 環境変数を設定する手順。MCP の OAuth → ブラウザでの認可の手順。
- Hooks → `.claude/settings.json` への配線と、参照するスクリプトへの実行権限の付与。

experimental 依存がセットアップ欄に並ぶのは、requirements.md で許可されているときだけである（禁止なら V9 が生成物を弾いている）。

### 7.5 配置リスト（`deploy/managed-paths.list`・`deploy/retired.list`）

- `managed-paths.list`: output が対象へ配置するファイル。generated/ の全ファイルを、対象ルート相対のパスで1行1件に列挙する。
- `retired.list`: 対象から意図的に消えるファイル。disposition が retire のものと、merge で統合される側のものを、対象ルート相対のパスで列挙する。merge の統合元も統合先に集約されて対象から消えるので、retire と同じく「想定内の消失」として載せる（載せないと pre-deploy-check が uncaptured と誤検出する）。
- どちらも **glob ではなく実在するファイルを1行1件**で書く。deploy.js は各行をそのままコピー元とコピー先に使い、展開しない。

---

## 8. verify の検査契約（工程7）

### 8.1 共通規約

`npm run verify -- <ts>`（`canon-c/scripts/verify.js`）は、V1〜V9 を1本の CLI で実行する。

- **1回の走査**: generated/ を1回だけ走査し、ファイルごとに V1〜V6 を当て、全体に V7〜V9 を当てる。検査ごとに同じツリーを読み直さない。
- **出力**: `output/<ts>/verify-report.md` を書き、違反が1件でもあれば exit 1、無ければ exit 0 を返す。`<ts>` の形式違い、または `output/<ts>/` が無いときは何も作らず exit 2 を返す。想定外の例外で検査が中断しても、その検査の違反として report に載せる。report には、検査ごとの結果（pass／違反の一覧／warning の一覧／「対象なし」とその理由）、検査した generated/ のハッシュ（architecture.md §6.2 と同じ計算）、実行時刻を載せる。
- **検査対象ゼロは違反**: generated/ が無い・空、design-map・requirements.md が無い、など判定の入力が揃わないときは、合格にせず違反にする。「対象なし」と書けるのは、定義上対象が無いと確定する場合（new モードの V7 など）だけで、その理由を report に明記する。
- **error と warning**: 正典に MUST の明文があるか、規則として確定したものは error（違反）、正典が観測されたパターンとしてしか示していないものは warning（報告のみ）にする。warning も黙って捨てない。
- **判定表の出典**: frontmatter の必須キー・正規のツール名・パス規約はハードコードせず、`docs/` から生成した `gates/conformance_tables/*.json` を使う。判定表が「できない」と自己申告している検査（型の照合が未提供・語彙が open など）は実装しない。正典に根拠が無い規則は §8.3 の例外として出典を明記する。
- **非スキーマのファイル**: `CLAUDE.md`・`.claude/README.md`・`.claude/settings.json`・`.claude/hooks/**`・skill パッケージの supporting files は Agent・Skill・Rule の定義ではないので、V1 の配置種別と V2 のスキーマの対象から外す。この除外の判定は1か所（共有 lib）に置き、各検査で複製しない。
- **レビューに回さない**: V1〜V9 は真偽が機械的に決まる。レビューはこれらを判定し直さない（architecture.md §1.3）。

### 8.2 検査一覧

| 検査 | 内容 | 受入基準 | 出典 |
|---|---|---|---|
| V1 配置パス | 許可されたパスに置かれているか・拡張子と種別が合うか・skill のディレクトリ名が frontmatter の name と一致するか | A3 | 正典（name の一致だけ §8.3 の例外） |
| V2 frontmatter | 必須キー・未知キー・型と語彙・構文エラー（`unparsed_line`・`duplicate_key`・`unterminated_block` は違反。複数行リストは配列として解釈し、ネストしたマップは中身を見ない） | A3 | 正典 |
| V3 ツール名 | 正規のツール名・旧称と非実在の名前・MCP の構文・複数行の値がリストでない場合は違反 | A3 | 正典 |
| V4 secret と展開 | secret の直書き・`${VAR}` 展開・experimental 依存の明示 | A3 | 正典 |
| V5 書式片 | 書込の閉じタグの残骸 | A3 | 本書 |
| V6 参照整合 | preload・supporting files・plugin の参照・非管理ファイルへの行番号引用 | A3 | 正典（行番号引用だけ本書） |
| V7 keep | keep の非回帰（sha256）・廃止の明示・interface の照合・K1/K3/K5・disposition が語彙（keep・modify・merge・retire・out_of_scope）に無い、または未記入なら違反 | A2 | 本書（§6.3） |
| V8 スナップショット完全性 | design-map の宣言・MANIFEST・配置リストと generated/ の一致 | A4 | 本書 |
| V9 constraints | requirements.md の禁止機能が生成物に現れないか | — | requirements.md |

**V1 配置パス**
- 許可されたパス（`paths.json`）に合致するか、拡張子と種別が整合するか。
- skill パッケージの中の supporting files（`template.md`・`examples/`・`scripts/`・`references/` など）は違反にしない。正典 `L2_SKILLS.md` のディレクトリ構造が明示的に許可している（判定表の `kinds.skill.package_layout`）。`SKILL.md` という名前の固定は定義ファイルの名前の話で、同じディレクトリの他のファイルを禁じていない。
- skill のディレクトリ名と frontmatter の `name` の一致を要求する（§8.3 の例外）。

**V2 frontmatter**
- 必須キーがあるか（Subagent は name と description）、未知のキーが無いか、型と語彙が合うか（`frontmatter.json`）。
- 判定表が提供しない検査はしない（agent の型の照合、rule の未知キー検出、model の語彙の閉じた照合など。model は完全な ID も許すので、既知の集合に無い値を拒否しない）。

**V3 ツール名**
- 正規のツール名であるか、MCP ツールが `mcp__<server>__<tool>` の構文に従うか（`tools.json`）。
- 違反にする旧称は、改名されただけのもの（判定表の `deprecated_tools.renamed_only`）に限る。非推奨・既定無効の名前は実在する正規名として通す。
- 大文字小文字だけの違いを専用の違反種別にしない（完全一致しなければ非実在の側に落ちる）。Subagent で使えないツール（AskUserQuestion など）は正規名なので違反にしない。「この環境で使えるか」は判定しない。

**V4 secret と展開**
- `.mcp.json`（と frontmatter のインライン `mcpServers`）の command・args・env・url・headers で、資格情報らしいキー（KEY・TOKEN・SECRET・PASSWORD・CREDENTIAL を含む名前）の値が `${VAR}` 展開になっているか（`L4_AUTOMATION.md`・`BEST_PRACTICES.md`）。キー名の判定は正典が定めていない最小限の推定であり、その旨をコードに残す。
- `Authorization` ヘッダに `${` を伴わないリテラルの Bearer トークンが無いか。
- Agent Teams（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）に依存するファイルが、実験機能であることを本文で明示しているか。**明示の判定では環境変数名そのものを除いてから探す**（名前に EXPERIMENTAL が含まれるので、除かないと自分自身に一致して常に合格になる）。
- 汎用の secret パターン（AWS のキー・`sk-` 系など）の走査はしない。正典にパターンの定義が無いためである。

**V5 書式片**
- 生成物の `.md` で、コードフェンスの外に `</content>`・`</parameter>`・`<parameter name=` が行として現れたら違反（ツール呼び出しの閉じタグが本文に紛れ込んだ残骸）。説明のためのコード例（フェンスの中）は許す。

**V6 参照整合**
1. Subagent の `skills:` で preload する Skill が実在する（`L3_AGENTS.md`）。
2. `disable-model-invocation: true` の Skill を preload していない（preload するとエラーになる）。
3. description による委譲のトリガー: 公式テンプレートのプレースホルダのままなら error。「Delegate when／Delegate for」に当たる委譲条件の節が無ければ warning（正典はこの形を MUST として明文化していない）。
4. supporting files が実在する。SKILL.md 本文のバッククォートで囲まれたパスらしいトークンを2段で扱う。
   - **error**: `./`・`../` で始まるトークン、または第1セグメントが skill ディレクトリ直下に実在するエントリ名と一致するトークン（例: `examples/` があるときの `examples/sample.md`）。構造上、段階的開示の参照と確定するので、実在しなければ違反にする。
   - **warning**: それ以外のトークンは、skill ディレクトリ → generated/ のルート → 対象のルートの順に解決を試み、どこでも解決できないものだけを報告する（リポジトリ相対の地の文の参照や、一般名詞としてのファイル名を違反にしない）。
5. plugin.json の `skills`・`commands`・`agents`・`hooks`・`mcpServers`・`outputStyles`・`lspServers`・`experimental.themes`・`experimental.monitors` のパスが plugin のルート相対で実在する（`L5_DISTRIBUTION.md`）。
6. skill パッケージに定義ファイル `SKILL.md` が実在する。V1 が supporting files を許す以上、ここで明示的に確かめないと、`Skill.md` のような綴り違いで Skill が読み込まれない失敗が検査をすり抜ける。
7. **非管理ファイルへの行番号引用の禁止**（本書由来の規律）: 生成物が、管理パス集合（§10.1）に属さない対象プロジェクトのファイル（`README.md`・`contracts/README.md` など）を `` `path:N` `` や `` `path:N-M` `` の形で行番号引用していたら error。行番号は対象側の編集で黙ってずれ、生成物の側にはずれを検知する手段が無い。節見出しで参照させる（例: `` `README.md` の「main への直接 push を防ぐ」節 ``）。見出しと行番号の併記も不可。走査するのは generated/ だけで、spec・design-map・review（調査の根拠を行番号で記録する正当な場所）は対象外。管理ファイル同士（生成物同士）の行番号参照は、同じ run で一括生成されてずれる余地が無いので許す。

**V7 keep**（design-map の `existing_disposition` と investigation を読む）
1. **非回帰**: disposition が keep のファイルがすべて output にあり、対象の原本 `<target>/<パス>` と `generated/<パス>` の sha256 が一致する。
2. **廃止の明示**: retire と merge の統合元が output に無く、`deploy/retired.list` に載っている。`manifest_note` が空でない。
3. **keep の宣言**: keep の `keep_conditions` が5つとも true と宣言されている。1つでも false なら違反。
4. **K1**: keep の原本について、existing.md の `canon_conformance` が clean である（§6.3）。
5. **K3**: keep の原本の `customization_refs` の参照先が、同じ design-map で retire・merge になっていない（参照先の実体が消えるので常に違反）。modify になっている場合は、そのレコードが `interface_change: none` を宣言していなければ違反。`interface_change` に `none`・`breaking` 以外の値を書いたもの、retire・merge のレコードに書いたものも違反。
6. **K5**: keep の原本の `project_refs` がすべて、focused.md の `ref_resolution` で `resolved: true` になっている。`ref_resolution` にエントリが無い**具体的なパス**は、対象のルートからの実在で確かめる（調査の書き落としで、実在する参照を立証できないことを防ぐ）。`resolved: false`・glob・まとめ書きの参照は、この実在確認で代えない。
7. **interface の照合**: modify で `interface_change: none` を宣言したレコードは、原本と output の対外インタフェースの署名が一致する。署名は種別ごとに決める。

   | 種別 | 署名 |
   |---|---|
   | SKILL.md・Subagent の定義 | frontmatter の `name` |
   | rule | `paths:` の値（並べ替えた一覧）。`paths:` が無い rule は「無条件に読み込まれること」を署名にする。本文の節の追加は署名に含めない |
   | `CLAUDE.md`・`.claude/README.md` | 見出しの構造 |
   | JSON（settings.json・.mcp.json など） | トップレベルのキーの集合 |
   | 付随スクリプト（`.js`・`.mjs`） | export する識別子の集合 |
   | 上記以外 | 検査できない＝`none` の宣言は違反（宣言と強制がずれることを許さない） |

8. **対象なし**: new モード（existing_disposition が空であるべき）なら、V7 は「対象なし（new モード）」と report に書く。refactor モードで existing_disposition が読めない・0件のときは違反にする。

**V8 スナップショット完全性**
1. **design-map の宣言 ⇒ generated/**: design-map の層ごとの節で宣言された生成物と、keep・modify のレコードが、generated/ にすべて実在する（宣言源は `targets-all.txt` と同じ）。層の節の照合は §5.4 のとおり。層の節が1つも無いのに、disposition に無いファイルが generated/ にあれば違反（宣言の0件で素通りさせない）。
2. **MANIFEST ⇔ generated/**: MANIFEST の `## 全ファイル` 節と generated/ の実ファイルが双方向に一致する（節が無い・1行欠けている・実在しない行がある、のいずれも違反）。
3. **空でない**: generated/ にファイルがある。
4. **配置リスト**: `managed-paths.list` の各行が管理パス集合（§10.1）に属し、glob ではなく、generated/ に実在する。generated/ の全ファイルが `managed-paths.list` に載っている（配置されない生成物を作らない）。集合への所属の判定（パターンの照合）と具体性の判定（glob でないこと）は別に行う（`.claude/rules/**` のパターンは glob の行にもマッチしてしまうため）。

**V9 constraints**（requirements.md を読む）

「このプロジェクトで使ってはいけない機能」が生成物に紛れ込んでいないかを判定する。検査対象は generated/ の**すべてのファイル型**（`.md` に限らず `.json`・`plugin/**` も）である。

- **禁止集合の導き方**: 禁止する機能を代表例の列挙で書かない。`constraints` のキーを全部走査し、`allowed: false` のキーごとに**能力の検出器**を当てる。検出器は、その能力が生成物に現れうる**すべての経路**を持つ。1つの経路だけで書くと、他の経路が黙って素通りする。可能な限り正典から導く（hooks のイベント名は `hooks.json` の全イベント、plugin の同梱物は `L5_DISTRIBUTION.md` の自動発見ディレクトリ）。

  | キー | 検出する経路 |
  |---|---|
  | `hooks` | ① 生成した JSON（`.claude/settings.json`・`plugin.json`・`.claude-plugin/plugin.json` など）の `hooks` の宣言 ② その宣言のイベント名を正典の全イベント集合と照合 ③ hook スクリプトの実体（`.claude/hooks/**`・`plugin/hooks/**`） ④ frontmatter の `hooks:` |
  | `mcp` | ① `.mcp.json`（plugin 同梱を含む） ② frontmatter の `mcpServers:` ③ `tools`・`disallowedTools`・`allowed-tools`・`disallowed-tools` の中の `mcp__<server>__<tool>` ④ settings.json の `enabledMcpjsonServers` |
  | `plugins` | ① 管理パス集合の L5 パターン（`plugin/**`）に合う生成物 ② `plugin.json`・`marketplace.json` ③ settings.json の `enabledPlugins` |
  | `experimental` | ① frontmatter の `context: fork` ② 環境変数の**接頭辞** `CLAUDE_CODE_EXPERIMENTAL_`（個別の変数名で書かない） ③ plugin 同梱の `themes/`・`monitors/` ④ design-map の `## Experimental Dependencies` 節が空でない |
  | `organization_policy` | `allowed` を持たない自由文。**機械では判定できない**ことを report に明記する（違反にはしないが、無かったことにもしない）。準拠は reviewer の security 観点が見る |
  | 上記以外のキー | `allowed: false` なら、検出器が無い＝検査できないので**違反** |

- **未知のキーは違反**: 禁止したはずの機能が検査されないまま違反0件で通る経路を塞ぐ。代わりに、constraints に新しいキーを足したら、検出器も同時に実装しなければ run が止まる。この非対称は意図的で、「禁止の宣言」と「禁止の強制」がずれないことを機械で保証する。
- **散文は検出しない**: hooks の検出は構成として現れる経路（JSON の宣言・スクリプトの実体）に限る。本文の語（`Stop`・`Setup` は普通の英単語でもある）は見ない。生成物が「Hooks は使わない」と説明する文を違反にすると、検査が使いものにならない。この限界は report に書く。
- **縮退した設計の検査範囲**: 決定論で見るのは conflicts の登録漏れと整合まで。
  - 登録漏れ: `strength_needed: deterministic` の要件があり、その実現手段（deterministic→Hooks、enforced→permissions）が禁止されているのに、`conflicts` にその要件 id を指すエントリが無ければ違反。
  - 整合: `conflicts[].requirement` が実在する要件 id を指し、`conflicts[].constraint` が実在し、かつ禁止されている constraints のキーを指すこと（無関係な conflicts を1件書けば通る、という形骸化を防ぐ）。
  - design-map の散文との突合はしない。縮退の意味的な妥当性（advisory に下げて要件を満たせるか）は P3・P4 で人間が読む。
- **検査対象ゼロの封鎖**: 次はすべて違反。① requirements.md が無い ② constraints の節が無い ③ constraints のキーが0件 ④ `allowed` が真偽値でない ⑤ generated/ が無いか空 ⑥ `conflicts` のブロック自体が無い（衝突が無いなら `conflicts: []` と明示する）。「制約が書かれていない＝制約なし＝合格」と読まない。すべて `allowed: true` であること（実際に制約が無い）と、制約が記録されていないことは別の事象である。
- **V4 との違い**: V4 は普遍的な安全性（experimental 依存を**明示**しているか）、V9 はこのプロジェクト固有の環境制約（experimental を**使ってよいか**）を見る。同じ `context: fork` でも見るものが違う。

### 8.3 正典に由来しない規則

判定の出典は原則として正典 `docs/` である。例外は次のとおりで、出典をコードと判定表の双方に残す。

| 規則 | 出典 | 扱い |
|---|---|---|
| V1 の「skill のディレクトリ名＝frontmatter の name」 | 本書（設計由来） | 正典 `L2_SKILLS.md` は「既定はディレクトリ名」と述べるだけで、name を明示したときの一致までは求めていない。人間の裁定で検査に含め、判定表 `paths.json` の `design_derived_requirements` に `status: accepted_by_human` として隔離する。違反メッセージに「正典由来でなく設計由来」と明記する |
| V5 書式片 | 本書 | 生成の過程で紛れ込む残骸の検出 |
| V6-7 非管理ファイルへの行番号引用 | 本書 | §8.2 の V6 を参照 |
| V7 keep | 本書（§6.3） | 全量スナップショット方式の帰結 |
| V8 スナップショット完全性 | 本書（§7・§10） | 同上 |
| V9 constraints | requirements.md | プロジェクトごとの環境制約 |

---

## 9. レビューの入力と出力（工程8）

### 9.1 review-bundle

`review-bundle.js` は、reviewer と keep-reviewer が「何を見るか」を決定論で確定し、`work/<ts>/review-bundle/` に書く。入力の収集を LLM に任せると、入力を探し損ねて何も見つけず、問題なしと答える経路ができるためである。

- **keep-reviewer 用**: keep と merge のレコード1件につき1ファイル。入力は design-map の existing_disposition・spec の新要件と統合方針・requirements.md の conflicts・strength_needed・constraints・investigation・対象の原本。
- **reviewer 用**: 生成物の実体と接地材料（spec §8 の A1・profile.md・focused.md）。security 観点には生成物の frontmatter の `tools:` と設計意図を含める。
- **宣言を除く規約（最重要）**: バンドルから、**designer が立てた `keep_conditions` の boolean と rationale を機械的に除く**。除かなければ、判定者は「K2: true」という判定対象自身の主張に引きずられ、常に問題なしと答える（検査が恒真になる）。merge も「統合元 → 統合先」の対応だけを渡し、妥当性の主張は落とす。reviewer 用のバンドルからも design-map の rationale（designer の自己弁護）を除く。除けていることはテストで固定する（バンドルに `keep_conditions`・`K2:` などが現れないこと）。
- **生成物からの逆引き**: 宣言を除くと、判定者は「keep 対象の弱点を補う記述が他の生成物にあるか」を確かめる材料を失い、実在する記述を「無い」と断定しかねない。そこで、keep 対象を名指ししている生成物の箇所を `file:line` で機械的に逆引きして同梱する。designer の主張ではなく生成物の実体なので、恒真にはならない。言及が見つからなければ「Grep で確かめてから不在と言う」旨を添える。
- **書き出す前に出力先を空にする**: 差し戻しで keep が減った後に前回のバンドルが残ると、判定の対象外のファイルを判定してしまう。

### 9.2 判定の境界

| 判定の性質 | 担い手 | 例 |
|---|---|---|
| 機械的に真偽が決まる | verify（V1〜V9） | スキーマ・ツール名・sha256・参照の実在・K1/K3/K5・制約の遵守 |
| 意味の判断を要する | reviewer・keep-reviewer・標準 Skill のレビュー | K2・K4・merge 先の妥当性・受入基準 A1・最小権限の実質・正典の趣旨（段階的開示・委譲トリガーの質）・コンテキスト効率・組織ポリシーへの準拠 |

- レビューは verify が見た項目を判定し直さない（非決定の判定が決定論の判定を上書きする経路を作らない）。
- レビューの結果は工程を進める権威ではなく、P4 で人間が読む材料である。
- 不在を根拠に指摘する前に、Grep で確かめる。

### 9.3 出力（`output/<ts>/review/`）

| ファイル | 書き手 |
|---|---|
| `review.md` | reviewer（4観点） |
| `keep-review.md` | keep-reviewer（refactor モードのみ） |
| `prompt-audit.md` | `/claude-api prompt-audit` の結果をオーケストレーターが保存 |
| `security-review.md`・`code-review.md` | `/security-review`・`/code-review` の結果をオーケストレーターが保存 |

各指摘は「観点・対象（`file:line`）・根拠・重大度・提案」を持つ。修正ループで直した指摘と、直さないと決めた指摘（とその理由）は handoff.md の「差し戻し」に記録する。

---

## 10. deploy の契約（工程9）

配置は canon の外（人間が対象リポジトリに対して実行）で行う。対象に届く前の最後の照合と、失敗しても元に戻せる配置の方式を定める。

### 10.1 管理パス集合

「全量スナップショット」は `.claude/` 全体を消すことではない。canon が生成・維持の対象とする**管理パス集合だけを全置換**し、集合の外には一切触れない。

```text
CLAUDE.md
.claude/rules/**
.claude/skills/**
.claude/agents/**
.claude/settings.json      Hooks などの配線を生成する場合
.claude/hooks/**           Hook ハンドラの実体を生成する場合（L4）
.claude/README.md          生成物の使い方（§7.3）
.mcp.json
plugin/**                  L5 にする場合
```

- パターンの定義は共有 lib の1か所に置き、V8・V9 と pre-deploy-check・deploy が同じものを使う。複製すると一方だけが仕様に追従し、集合の網羅性が崩れて退避スワップが集合外を壊しうる。
- **`.claude/hooks/**` を含める理由**: 正典 `L4_AUTOMATION.md` の公式例は Hook の実体を `${CLAUDE_PROJECT_DIR}/.claude/hooks/` に置く。集合に含めないと、(1) 正典どおりの生成物が V8 の集合検査で弾かれ、canon が正典の示す形を生成できない、(2) settings.json だけが配置されて参照先のスクリプトが配置されない壊れた配線を作る。代わりに `.claude/hooks/**` は退避スワップの管理下（＝廃止もありうる）に入るが、対象側にある canon 管理外の Hook を消す危険は pre-deploy-check の uncaptured（§10.2）が引き受ける。集合の外に置いたままでは、取りこぼしを検出する機会そのものが無い。
- **走査は `node_modules/` へ降りない**: 対象側の実ファイルを列挙する pre-deploy-check・deploy・new-run の mode 判定は、集合の内側（`plugin/` や skill の `scripts/`）にある `node_modules/` を管理対象にも uncaptured にもしない。
- **集合の外は触れない**: CI のワークフロー（`.github/workflows/`）・`CODEOWNERS`・その他プロジェクト固有のファイルは、削除も上書きもしない。
- **`~/.claude/`（ユーザー設定）は含めない**: プロジェクトをまたぐ個人設定で、対象の版管理の外にある。

### 10.2 pre-deploy-check（照合専用）

`pre-deploy-check.js <output-dir> <target-dir>`

keep の verbatim コピーは「調査で把握済みの keep が消える」事故を閉じる。しかし、管理パス集合の中で**調査が取りこぼしたファイル**や、調査から配置までの間に対象側で**増えたファイル**は、design-map にも existing.md にも載らず、置換で黙って消える。これを防ぐには、壊す直前に実物同士を突き合わせるしかない。

- **入力**: 対象の管理パス集合の実ファイル全部（パターンを対象に当てて列挙する）と、output の全ファイル。`managed-paths.list` は「output が配置する集合」を、パターンは「取りこぼしを探す走査範囲」を与え、両者は独立に効く（list だけを読むと取りこぼしを検出できない）。
- **判定**: 集合の中で「対象にあって output に無い」ファイルを列挙し、`retired.list` と一致するものを **retired**（意図した廃止）、それ以外を **uncaptured**（調査の取りこぼし・要注意）に分ける。
- **出力**: `output/<ts>/deploy/pre-deploy-report.txt`（と stdout）。消えるファイルの一覧と区分、件数、配置予定と退避予定（上書き・消失）の件数を載せる。管理パス集合の走査で種別を判定できなかったエントリ（unreadable）は「列挙できなかった範囲」として別に載せる（照合の盲点を黙って落とさない）。
- **終了コード**: uncaptured が1件以上、または `deploy/*.list` に書式欠陥（glob の混入・実在しないエントリ）が1件以上、または `managed-paths.list` に集合外・`..`・絶対パス・未正規化の行が1件以上なら exit 1（配置を止め、調査か design-map へ差し戻す）。retired だけ、または0件なら exit 0。引数不正は exit 2。

### 10.3 deploy（退避スワップ）

`deploy.js <output-dir> <target-dir> [--confirm]`

- **`--confirm` が無ければ配置予定を表示するだけ**で、何も変えない（P5 の人間の承認を機械で裏付ける）。
- 実行時に pre-deploy-check と同じ照合と `managed-paths.list` の再検証（集合外・`..`・絶対パス・未正規化の行は拒否）をやり直し、退避先 `.claude-canon.bak.<ts>` が既にあれば拒否し、**uncaptured が1件でもあれば配置を拒否**する（P5 を飛ばした配置を防ぐ最後の防波堤）。

```text
step0 事前検査: 退避するすべてのファイルが、その場で rename して戻せるかを確かめる。
               1件でも動かせなければ、対象を変えずに拒否する（原因と「sandbox の外で実行」を出力）
step1 退避:    対象の管理パス集合を .claude-canon.bak.<ts>/ へ mv する（削除ではなく退避）
step2 配置:    managed-paths.list の各ファイルを output から対象へコピーする
step3 事後確認: 配置した各ファイルが output と sha256 で一致するかを確かめ、
               配置後の管理パス集合に output に無いファイル（退避漏れ・余分な管理ファイル）が残っていないかも確かめる
step4 成功なら .bak を残す（ローカルで戻すため）。失敗なら .bak から戻す
```

- **原子性**: mv で退避するので「対象にも .bak にも無い」時間を最小にでき、コピーの途中で失敗しても配置前の状態へ戻せる。
- **戻す範囲**: step1 も失敗を捕捉する範囲に入れ、戻すのは**実際に退避したファイルと実際に置いたファイルだけ**にする（まだ退避していない元のファイルを消さない）。全部戻れば `state: restored`、戻せないものがあれば `.bak` を残して `state: partial` と残った問題を返す（黙って片付けない）。どちらも exit 1（拒否も同じ。2 は引数不正だけ）。
- **退避が0件のとき**: `.bak` は退避の副作用でしか作られない。成功時の案内は、`.bak` の実在と退避した件数を確かめてから出す。
- **記録**: 成功したときだけ `deploy/deploy-result.json`（`bak_dir`・`bak_exists`・`baked`・配置件数・廃止）を書く。存在すること＝配置済みである。試行のたびに `deploy/deploy-attempt.json`（状態・動かせなかったファイル・戻せなかったもの）を書く。
- **ロールバック**: 対象側の git で revert するか、直近の `.claude-canon.bak.<ts>/` から手で戻す。`.bak` の掃除は人間が明示的に行う。

### 10.4 RUN.md（配置手順書）

`emit-run-manifest.js <output-dir> <target-dir>` が `output/<ts>/deploy/RUN.md` を書く。

- 配置スクリプトは canon の本体のまま実行し、output には複製しない。スクリプトは管理パス集合の定義（共有 lib）を import しており、複製すると定義が2か所に分かれる（§10.1）。output には手順書だけを置く。
- RUN.md は固定のテンプレートで、変数は `<ts>`・output・対象・canon の絶対パスと、`managed-paths.list`・`retired.list` から読んだ配置集合と廃止集合の要約だけにする（自由に作文しない）。
- MANIFEST の `## 配置時の追加手順` 節と、README の前提セットアップと配置後の手作業の節を**逐語で転記**する。
- 固定文で次を載せる: 「`--confirm` は sandbox の外で実行する」「対象への push は、対象リポジトリで起動したセッションで行う（SSH のリモートなら接続先の許可も要る）」。
- 生成物に書かれたコマンドを deploy.js が自動で実行する方式は採らない。LLM が生成した任意のコマンドの実行になるためである。

### 10.5 自己指定の拒否

`pre-deploy-check.js`・`deploy.js`・`emit-run-manifest.js` は、`<target-dir>` をを実パスに解決した結果が、claude-canon 自身のルート・その配下・それを含む祖先・同一リポジトリの別 worktree のいずれかなら exit 1 で拒否する（git が使えない環境では worktree の判定ができず、実パスと包含の判定までになる）。配置は対象プロジェクトに人間が回す前提であり、canon 自身を対象にすると、稼働中の本体をテストもレビューも通さずに置き換えられてしまう。canon 本体の変更は、ブランチで `npm test` を通し、PR を経て main に入れる。

### 10.6 配置後のドリフト（判断の記録・未実装）

配置の後、対象側で人間が管理パス集合のファイルを手直しすることがある。次の run でそのファイルを再生成すると、手直しが黙って上書きされうる。

- **一部は既存の流れで拾える**: 次の run の調査①は対象の現物を読むので、手直しは既存カスタマイズとして判定に載る。keep なら V7 がバイト同一を強制するので残る。
- **穴は、「配置したまま」と「配置後に手で直した」を区別できないこと**: designer がそれを知らずに modify や retire にしても、どの検査も発火しない。差分が意図的な手直しか見落としかを機械で区別する手段が無い。
- **手書きの申し送りは過少報告になる**: 実測で、申し送りは1件だったのに、実際のドリフトは10ファイルあった。台帳を人手で保つ案は採らない。
- **推奨する機構（未実装）**: deploy.js の事後確認は配置した全ファイルの sha256 を既に計算している。これを対象の管理パス集合の外（例 `.canon-deploy/<ts>.json`。全置換でも消えない）へ書き出せば、次の run の調査で現物と突き合わせ、「配置後に変わったファイル」を機械的に列挙できる。deploy・調査・verify にまたがる追加開発が要るので、別に扱う。
