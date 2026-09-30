---
title: claude-canon アーキテクチャ
purpose: claude-canon の全体像を定める。Phase A〜D と工程1〜9・人間ゲート P1〜P5、Agent と Skill の責務、handoff.md による状態と承認の引き継ぎ、run の git 運用、標準 Skill の取り込み、フックを使わない理由を扱う。成果物の書式・verify の検査契約・deploy の契約は artifacts.md に置く。
audience: [ai, human]
canon_version: v2.1.280
---

# claude-canon アーキテクチャ

claude-canon の設計は本書と [artifacts.md](artifacts.md) の2冊にまとまっている。

| 文書 | 扱う範囲 |
|---|---|
| architecture.md（本書） | 位置づけ・Phase と工程・人間ゲート・責務・オーケストレーションの原則・handoff.md・git 運用・標準 Skill・フック全廃の理由・リポジトリ構成 |
| [artifacts.md](artifacts.md) | work/ と output/ の構成・各成果物の書式・既存カスタマイズの扱い（keep 条件 K1〜K5）・MANIFEST と README の生成規則・verify の検査 V1〜V9・review-bundle・deploy の契約 |

節番号は冊ごとに §1 から振る。もう一方の冊を参照するときは「artifacts.md §8」のように冊名を付けて書く。

frontmatter の `canon_version` は、本書を書いたときに参照していた正典のバージョン（`docs/` のメタ情報表にある「確認したClaude Codeバージョン」）である。本書自体の版ではない。正典が更新されたら、人が手で追従させる。docs/ の値と一致していることは `tests/settings_wiring.test.js` が検査する。

---

## 1. 位置づけ

### 1.1 目的

claude-canon は、Claude Code のカスタマイズ一式（CLAUDE.md・Rules・Skills・Subagents・MCP・Hooks・必要なら Plugin）を、対象プロジェクトごとに**半自律で構築するメタジェネレータ**である。工程ごとに人間の承認を挟み、無人で最後まで走らせることはしない。

- **SSoT**: 正典 `docs/`（`00_INDEX`・`L1_CONTEXT_MANAGEMENT`・`L2_SKILLS`・`L3_AGENTS`・`L4_AUTOMATION`・`L5_DISTRIBUTION`・`ORCHESTRATION`・`TOOLS`・`BEST_PRACTICES` の9ファイルと、一次ソースの一覧 `SOURCES.md`）。生成物の正しさの基準はすべてここから導く。
- **成果物**: 対象プロジェクトに配置できるファイル一式（`output/<ts>/generated/`）と、なぜその構成にしたかの記録（spec・design-map・MANIFEST）、使い方の説明（README）、配置の手順と照合結果。

### 1.2 2つのモード

| mode | 状況 | 進め方 |
|---|---|---|
| `new` | 対象にカスタマイズが無い | 要件から最適な構成をゼロから設計する |
| `refactor` | 既存のカスタマイズがある | 既存と新しい要件を入力に**全体を設計し直す**。差分パッチは作らない（全量スナップショット方式・artifacts.md §6） |

### 1.3 設計の3つの柱

| 柱 | 内容 |
|---|---|
| 正典駆動 | `docs/` を唯一の参照源にする。verify の判定表も `docs/` から生成する（`gates/conformance_tables/`・`npm run build:tables`） |
| 責任の局所化 | Agent と Skill はそれぞれ1文で言える責任を持つ。判定は design-map を作る工程5に集める（調査は判定しない → spec は方向づけまで → design-map が確定する） |
| 決定論と意味判断の分離 | 機械的に真偽が決まる検査（verify の V1〜V9）と、意味の判断を要するレビュー（reviewer・keep-reviewer・標準 Skill のレビュー）を別系統に置く。レビューの非決定性で決定論の判定を汚さず、レビューは verify が見た項目を判定し直さない |

---

## 2. Phase 構成

### 2.1 全体表

1つの Phase を1つのセッションで行い、各 Phase をユーザーが起動するオーケストレーター Skill が進める。

| Phase | 起動 | 工程 | 人間ゲート | 推奨モデル |
|---|---|---|---|---|
| A | `/canon-a <target>` | 1 調査①（existing と profile を並列）→ 2 要件ヒアリング（inline）→ 3 調査②（focused）→ 4 spec | P1 要件承認・P2 spec 承認 | opus |
| B | `/canon-b <ts>` | 5 機能選定と設計（design-map） | P3 design-map 承認 | opus |
| C | `/canon-c <ts>` | 6 生成 → 7 検証（verify）→ 8 品質検査と修正ループ | P4 生成物とレビューの承認 | sonnet |
| D | `/canon-d <ts>` | 9 配置前照合 → P5 → 配置（人間が sandbox の外で `--confirm`）→ 配置後の手順・lessons への転記 | P5 配置承認 | sonnet |

- 各 Phase は、最後の人間ゲートの承認を handoff.md に記録してコミットしたら止まる。次の Phase は新しいセッションで起動する。
- 推奨モデルは、判断の精度が要る Phase（ヒアリング・spec の精査・keep と retire の議論）を opus、委譲と機械的な手順が中心の Phase を sonnet とした。強制はしない。Phase C で意味の判断が要るのは keep-reviewer（opus）だけで、これは Agent の frontmatter で指定する。

### 2.2 この分け方にした理由

- **セッション＝Phase**: 1つのセッションで全工程を回すと、メインの会話履歴を毎ターン読み直すコストが積み上がり、利用枠を使い切る。状態はすべてファイル（handoff.md と各成果物）が持つので、Phase の境界でセッションを切っても失うものは無い。
- **spec を Phase A に置く**: 「何を作るか」を A で確定し、B は承認済みの spec を唯一の入力にする。B を始めた時点で要件の議論が終わっていれば、設計の議論が要件に戻って発散することがない。
- **ヒアリング（工程2）はワーカーに任せない**: ヒアリングは人間との往復そのものである。Subagent や `context: fork` に隔離すると、会話履歴を継承しないため往復が成立しない（`docs/L2_SKILLS.md`）。オーケストレーター（inline のメイン Claude）が調査結果を示しながら直接対話し、合意した内容を自分で `requirements.md` に書く。
- **検証（工程7）と品質検査（工程8）を分ける**: レビューの非決定性で決定論の検査を汚さないため。検証が通ってから品質検査に進む。
- **調査を2段にする**: 調査①は浅く広く（要件の前）、調査②は確定した要件に関係する箇所だけを深く（spec の前）。要件が調査の範囲を絞るので、調査の読み込みすぎを防げる。全量スナップショット方式では既存の取りこぼしが配置時の消失につながるため、調査①の既存カスタマイズ棚卸しは省略できない。

---

## 3. Phase ごとの流れ

各 Phase の開始時にすることは共通である（§6.3）: handoff.md を読む → 承認の sha256 を照合する → 申し送りを先に片付ける。

### 3.1 Phase A（工程1〜4・P1・P2）

1. `canon-a/scripts/new-run.js` が `<ts>` を採番し、run の worktree とブランチ（§7）、`work/<ts>`・`output/<ts>` の骨格、handoff.md の雛形を作る。以降の工程はこの worktree の中で行う。
2. **工程1 調査①**: investigator を `existing` モードと `profile` モードで同一 turn に並列 spawn する。それぞれが `work/<ts>/investigation/existing.md`・`profile.md` を自分で書く。オーケストレーターは両ファイルの実在を確かめてから次に進む。
3. **工程2 要件ヒアリング**: オーケストレーターが requirements Skill の質問セットと調査結果を使い、ユーザーと直接対話する。合意したら `work/<ts>/requirements.md` を書き、**P1** で承認を取る。
4. **工程3 調査②**: investigator を `focused` モードで spawn し、確定した要件と existing.md の project_refs を渡す。`work/<ts>/investigation/focused.md` が書かれる。
5. **工程4 spec**: spec-writer を spawn し、`output/<ts>/spec.md` を書かせる。オーケストレーターは spec の未決事項が空であることを確かめてから **P2** に出す。
6. handoff.md に承認を記録し、Phase A の終わりのコミットをして、Phase B の起動方法（モデル指定を含む）を案内する。

### 3.2 Phase B（工程5・P3）

1. **工程5 機能選定と設計**: designer を spawn する。入力は承認済みの spec・requirements・investigation の3ファイル。designer は design Skill（機能選定フローチャート・層数と責務・オーケストレーションのパターン・モデル割当・既存の処遇）に従って `output/<ts>/design-map.md` を書く。
2. **P3**: 提示の重点は artifacts.md §6.5 に従う（retire の全件、意味の判断に疑いがある keep、merge の統合先）。
3. 承認を記録してコミットし、Phase C を案内する。

### 3.3 Phase C（工程6〜8・P4）

1. **準備**: `canon-c/scripts/copy-keep.js` が keep の既存実体を output へバイト単位でコピーし、`slice.js` が design-map をワーカー別のスライスに切り出す（artifacts.md §5.4）。
2. **工程6 生成**: design-map の Used Features にある層ごとに builder を同一 turn で並列 spawn する（層は引数で渡す）。各 builder は自分の層のスライスと共通スライスを読み、`output/<ts>/generated/` の担当範囲だけを書く。L2 を書く builder は skill-creator の執筆指針に従う（§8）。全 builder が終わったら `emit-manifest.js` が MANIFEST・README・`deploy/*.list` を決定論で生成する（artifacts.md §7）。
3. **工程7 検証**: `npm run verify -- <ts>` が V1〜V9 を実行し、`output/<ts>/verify-report.md` と exit code を返す（artifacts.md §8）。違反があれば、該当する層の builder を新規 spawn して直させ、verify を再実行する。
4. **工程8 品質検査**: 次を行う。
   - `review-bundle.js` で判定入力を作る（artifacts.md §9）。
   - reviewer を spawn する（correctness・security・正典の意図・context の4観点）。refactor モードでは keep-reviewer も spawn する（K2・K4 と merge 先の妥当性）。両者は同一 turn で並列に動かす。
   - オーケストレーターが標準 Skill のレビューを直接実行する: `generated/` に対する `/claude-api prompt-audit`、run ブランチと main の差分に対する `/security-review` と `/code-review`（§8）。
   - 結果は `output/<ts>/review/` に置く。
5. **修正ループ**: 直すと決めた指摘は、handoff.md の「差し戻し」に逐語で記録し、該当層の builder を新規 spawn して直させる → verify → 変更した箇所だけを再レビュー、を指摘が尽きるまで繰り返す。
6. **P4**: 生成物・verify-report・レビュー結果を1回で提示する。生成物を単独で見ても判断材料が揃わないので、レビュー結果と分けずに出す。P4 に出す前に、verify-report に記録された generated/ のハッシュが現在の generated/ と一致することを確かめる（修正後に verify を回し忘れていないことの確認・§9.3）。
7. 承認を記録してコミットし、Phase D を案内する。

### 3.4 Phase D（工程9・P5）

1. **工程9 配置前照合**: `canon-d/scripts/emit-run-manifest.js` が配置手順書 `output/<ts>/deploy/RUN.md` を作り、`pre-deploy-check.js` が対象の現物と output を突き合わせて `pre-deploy-report.txt` を書く（artifacts.md §10）。
2. **P5**: 消える予定のファイル（retired / uncaptured）を人間が確認する。uncaptured が1件でもあれば配置しない（Phase A の調査または Phase B の設計へ差し戻す）。
3. **配置**: 人間が sandbox の外で `deploy.js --confirm` を実行する。オーケストレーターは実行しない。sandbox がファイルをバインドマウントしていると退避の rename が失敗するためである。
4. **配置後**: RUN.md の配置後の手順を案内する。handoff.md の「canon 課題候補」を main の `tasks/lessons.md` へ転記し、件数と見出しを報告する。コミットするかはユーザーの指示を待つ。
5. Phase C で済ませた `/security-review` などのレビューは再実行しない。

---

## 4. 責務

### 4.1 Agent（6体）

いずれも**コマンド実行系ツール（`Bash`・`PowerShell` など）を持たない**。スクリプトの実行はオーケストレーターが行う（§5.4）。model は frontmatter の1か所で決め、起動時に上書きしない。

| Agent | 1文責任 | preload する Skill | 書込先 | model |
|---|---|---|---|---|
| `investigator` | 対象プロジェクトを読み取り専用で調べ、モード（`existing`・`profile`・`focused`）に応じた調査結果を書く | investigation | `work/<ts>/investigation/<mode>.md` | sonnet |
| `spec-writer` | 調査結果と承認済みの要件を統合し、spec を書く | requirements | `output/<ts>/spec.md` | sonnet |
| `designer` | 承認済みの spec から機能を選び、層・責務・既存の処遇・モデル割当を design-map に確定する | design | `output/<ts>/design-map.md` | opus |
| `builder` | 指定された層の生成物を design-map のスライスどおりに書く | generation | `output/<ts>/generated/` のうち担当する層の範囲 | sonnet |
| `reviewer` | 生成物を correctness・security・正典の意図・context の4観点で判定する | review | `output/<ts>/review/review.md` | sonnet |
| `keep-reviewer` | keep と merge の妥当性（K2・K4・統合先）を、designer の主張を除いた入力だけで判定する（refactor モードのみ） | review | `output/<ts>/review/keep-review.md` | opus |

- designer は機能選定と設計を一続きに行う。機能選定の結果はそのまま design-map に載るので、分けて spawn する利点が無い。
- builder は層ごとにオーケストレーターが直接起動する。builder をまとめる中継役は置かない（§5.1）。
- 読み取り専用の調査を担う investigator に Edit は与えず、Write も自分の成果物ファイルに限る（定義で書込先を明示する）。

### 4.2 Skill（9件）

| Skill | 種別 | 内容 |
|---|---|---|
| `canon-a`〜`canon-d` | Phase オーケストレーター（4件） | `disable-model-invocation: true`（ユーザーが `/名前` で起動したときだけ動く）。本文は500行未満。入口スクリプトは各 Skill の `scripts/` に置く。`context: fork` は付けない（ヒアリングが成り立たなくなる・§2.2） |
| `investigation` | 知識（investigator が preload） | 3モードのテンプレートと値の語彙（artifacts.md §2） |
| `requirements` | 知識（spec-writer が preload。Phase A のオーケストレーターも参照する） | ヒアリングの質問セット・用語の誤マッピング一覧・requirements と spec のテンプレート |
| `design` | 知識（designer が preload） | 機能選定フローチャート・層数と責務・オーケストレーションのパターン・モデル割当・既存の処遇（K1〜K5）・design-map のテンプレート。それぞれ `references/` に分ける |
| `generation` | 知識（builder が preload） | L1・Skills・Agents・L4・L5 の生成規約（`references/`）、skill-creator の使い方、「読み手が解決できない参照・作者向けの編集メモ・経緯を示す ID を書かない」規約 |
| `review` | 知識（reviewer・keep-reviewer が preload） | 観点の定義、verify との境界、出力の契約 |

- 知識 Skill はユーザーが直接起動するものではないので `user-invocable: false` を明示する。
- 書式の実例（テンプレート）は各知識 Skill の `references/` に置く。

### 4.3 スクリプトの置き場

| 置き場 | 内容 |
|---|---|
| `.claude/skills/canon-a/scripts/` | `new-run.js` |
| `.claude/skills/canon-c/scripts/` | `verify.js`・`slice.js`・`copy-keep.js`・`emit-manifest.js`・`review-bundle.js` |
| `.claude/skills/canon-d/scripts/` | `emit-run-manifest.js`・`pre-deploy-check.js`・`deploy.js` |
| `lib/`（リポジトリ直下） | 複数のスクリプトが共有するパーサと管理パス集合（1か所にだけ置く） |
| `gates/build-conformance-tables.js`・`gates/conformance_tables/` | `docs/` から判定表を生成する |
| `tools/token-usage.js` | セッションのトークン消費を集計する |

入口はすべて `package.json` の scripts から呼べるようにする。

---

## 5. オーケストレーションの原則

### 5.1 メイン Claude が直接 spawn する

- オーケストレーターは inline のメイン Claude である。ワーカーはすべてオーケストレーターが直接 spawn し、深さは2に留める。独立したワーカー（調査①の2モード、各層の builder、reviewer と keep-reviewer）は同一 turn で並列に起動する。
- 中継役（ワーカーを束ねるワーカー）は置かない。深さ2の子の報告が呼び出し元ではなくメインに届く、中継役が子の結果を回収せずに turn を終える、といった失敗が起きやすく、中継役が担っていた集約は、ワーカー自身がファイルに書くこととスクリプトによる決定論の生成で置き換えられるためである。
- ワーカーの応答は「書いた旨」の短い報告だけにし、成果物の本文は会話に通さない。オーケストレーターはワーカーが終わるたびに成果物の実在を確かめる。

### 5.2 ファイル駆動

工程間の状態は、オーケストレーターの文脈ではなく `work/`・`output/` のファイルが持つ。各工程は「入力ファイルを読み、出力ファイルを書き、終わったことを返す」だけにする。調査結果・requirements・spec・design-map がそのまま工程間のインターフェースになる。正典に handoffs の機構は無く、1本の文脈チェーンで全工程を回すと調査の大量のファイルで文脈があふれる（`docs/BEST_PRACTICES.md`）。

### 5.3 差し戻しは新規 spawn

人間やレビューが修正を求めたら、ワーカーを `SendMessage` で再開せず、**新しく spawn** する。再開は、キャッシュが切れた状態で蓄積した文脈を読み直すことになり、初回の起動より重くなる。修正指示は handoff.md の「差し戻し」に逐語で書き（直す箇所・直さない箇所を含む）、そのパスと入力一式を渡す。ワーカーは指示された箇所だけを Edit し、全体を作り直さない。

### 5.4 起動方式とツールの制限

- ワーカーは登録済みのネイティブ `subagent_type` で起動し、`model` 引数を渡さない（渡すと frontmatter の指定より優先される）。
- `general-purpose` に定義を読ませて代行させる起動はしない。`general-purpose` はコマンド実行系ツールを持つため、次の項目の前提が崩れる。
- **ワーカーはコマンド実行系ツールを持たない**。ワーカーの書込先は定義と tools で縛るが、シェルを持てばその外へ書ける。sha256 の計算やスクリプトの実行といった execute を要する処理は、オーケストレーターが Phase Skill のスクリプトとして行う。この制約は `tests/` の自己適用テストが `.claude/agents/**` の `tools:` を検査して守る。対象プロジェクト向けの生成物の Subagent（`output/<ts>/generated/.claude/agents/**`）は対象外である（テスト・ビルドなど、対象側でシェルを使うのは正当）。

---

## 6. handoff.md

### 6.1 役割

`work/<ts>/handoff.md` は run の状態を持つ唯一のファイルで、オーケストレーターだけが直接編集する。進捗・承認・差し戻し・申し送り・canon 課題候補を1か所に集め、Phase をまたいで引き継ぐ。

### 6.2 書式

```markdown
---
ts: <YYYYMMDD_hhmmss>
target: <対象プロジェクトの絶対パス>
mode: new | refactor
phase: A | B | C | D
status: in_progress | waiting_approval | done
---

## 進捗
<Phase ごとの工程チェックリスト（- [x] 工程1 調査① …）>

## 承認
| ゲート | 日時 | 対象ファイル | sha256(先頭12) | 要旨 |
|---|---|---|---|---|

## 差し戻し
<人間の指摘の逐語・直す箇所・直さない箇所。ゲートまたはレビューの指摘ごとに1ブロック>

## 申し送り
<次の Phase が最初に実施すること>

## canon 課題候補
<claude-canon 本体の欠陥・浪費・規律の穴。書式は tasks/lessons.md 冒頭と同じ>
```

承認の対象ファイルは次のとおり。

| ゲート | 対象 |
|---|---|
| P1 | `work/<ts>/requirements.md` |
| P2 | `output/<ts>/spec.md` |
| P3 | `output/<ts>/design-map.md` |
| P4 | `output/<ts>/generated/`（ディレクトリのハッシュ） |
| P5 | `output/<ts>/deploy/pre-deploy-report.txt` |

ディレクトリのハッシュは、配下の全ファイルを `sha256sum` した一覧をパスの順に並べ、その一覧全体の sha256 を取った値とする（verify-report が記録する値と同じ計算・artifacts.md §8.1）。

### 6.3 承認の無効化（sha256 照合）

承認したあとで対象を作り直した場合、古い承認を無効にしなければならない。そのために承認行に対象の sha256 を残す。

1. 承認を記録するとき、オーケストレーターは対象の sha256 を計算し、先頭12桁を承認行に書く。
2. **次の Phase を始めるとき**、オーケストレーターは前の Phase までの承認行をすべて再計算して照合する。
3. 一致しなければ、その承認は無効である。どのファイルが承認後に変わったかをユーザーに示し、そのゲートで承認を取り直すまで先へ進まない。

同じ Phase の中で差し戻して作り直した場合も、作り直した後に承認を取り直す（承認は対象が確定した後にだけ記録する）。

### 6.4 canon 課題候補の転記

run の途中で claude-canon 本体の問題を見つけたら、見つけたその場で「canon 課題候補」に書く。run は worktree の run ブランチで動くので、main の `tasks/lessons.md` にはその場で書かない。Phase D の最後に main の `tasks/lessons.md` へ転記し、件数と見出しを報告する。

---

## 7. run の git 運用

- **worktree**: Phase A の開始時に `git worktree add ../canon-runs/<ts> -b run/<ts>` で run 専用の worktree を作る。以降の Phase もその worktree でセッションを起動する。run の間は canon 本体のバージョンが固定され、main での保守作業と干渉しない。
- **成果物の追跡**: `work/<ts>`・`output/<ts>` は `.gitignore` の対象だが、run ブランチの上でだけ `git add -f` して追跡する。各 Phase の終わりにコミットし、進捗のチェックポイントにする。Phase C の `/security-review`・`/code-review` はこのコミットの main との差分を対象にする。
- **push しない**: 公開リポジトリなので、run ブランチは push しない。
- **片付け**: run が終わった後の worktree とブランチの削除は、人間が判断する。
- **main の worktree で run をしない**: main の `work/`・`output/` に置いた run の成果物は追跡されず、Phase のチェックポイントも作れない。

---

## 8. 標準 Skill の取り込み

Anthropic が提供する Skill を、プラグインへの依存として取り込む（導入手順は `guide/setup.md`）。

| Skill | 使いどころ |
|---|---|
| `skill-creator` | Phase C で builder が対象向けの Skill を書くときの執筆指針。description の trigger eval と最適化は任意で、使う場合は Phase C でオーケストレーターが `/skill-creator` を直接呼ぶ（eval は並列 spawn を要し、Subagent である builder には回せない） |
| `/claude-api prompt-audit` | Phase C で `generated/` に対して実行する |
| `/security-review`・`/code-review` | Phase C で run ブランチの main との差分に対して実行する |
| `mcp-builder` | MCP サーバーの新規実装が必要なときだけ、handoff の申し送りで対象側に案内する（canon では実装しない） |
| `cost-optimize` | 採用しない |

### 8.1 情報源の優先順位

生成規約は3つの情報源から成る。衝突したら上を優先する。

| 情報源 | 役割 |
|---|---|
| `docs/`（正典） | 何が正しいか（スキーマ・フィールド・制約） |
| `skill-creator` | 良い Skill の書き方 |
| `generation/references/` | canon 固有の契約（design-map を入力にする・書込先・編集メモを書かない） |

Agent・L1・L4・L5 は `generation/references/` だけで生成する。

### 8.2 未確認事項

Agent の frontmatter `skills:` にプラグインの Skill（skill-creator）を指定して preload できるかは確認していない。セッション4の冒頭で公式ドキュメントまたは実際の起動で確かめ、できなければ執筆指針の要約を `generation/references/` に置く。

---

## 9. フックを使わない理由

claude-canon 自身の運用にはフック（`.claude/settings.json` の hooks）を使わない。生成物が対象プロジェクト向けに Hooks を含むことはあり、それとは別の話である。

### 9.1 やめた理由

完了マーカーと書込ガードをフックで回す方式には、次の問題があった。

- **運用負荷**: ワーカーが完了リクエストを書き、停止イベントでゲートが走り、マーカーを発行する流れは、Stop の再ブロックの連打、完了通知待ち、マーカーの巻き戻し・再検査・ブロック解除の手順を生んだ。
- **誤検知**: 書込先ガードはツール入力のパスとコマンド文字列で判定するため、読み取り専用の grep まで拒否するなど、誤検知が最も多い部品だった。
- **承認状態の分散**: 承認の記録・マーカー・ブロックの状態が3か所に分かれ、現在地の導出に専用の CLI が要った。
- **同期コスト**: ゲートを1本足すたびに、ワーカー定義とオーケストレーターの説明文を合わせる必要があり、欠陥の主な原因はこの同期漏れだった。

実際に欠陥を検出した実績があったのは、成果物の中身を見る検査（keep の非回帰・スナップショット完全性・参照整合・制約遵守など）だった。これは発火の経路に依存せず、スクリプトとして実行しても同じ判定ができる。

### 9.2 代わりの担保

| 旧方式が担っていたこと | v2 での担保 |
|---|---|
| 成果物の検査 | `npm run verify`（V1〜V9 を1本の CLI にまとめる・artifacts.md §8） |
| 工程の順序と承認 | 対話と handoff.md。承認後の改変は sha256 で検出する（§6.3） |
| 実行中の canon 本体の保護 | run 専用の worktree による版の固定（§7） |
| ワーカーの権限の制限 | 自己適用テストが `.claude/agents/**` の tools を検査する（§5.4） |

### 9.3 空振り（vacuous pass）への対策

フックをやめると、検査が「走らなかった」ことを見落とす余地が残る。そこで次を契約にする。

- verify は検査対象がゼロのとき（generated/ が無い・空など）を違反にする（artifacts.md §8.1）。
- verify-report.md は検査した generated/ のハッシュを記録する。P4 に出す前に、オーケストレーターはこれが現在の generated/ と一致することを確かめる。一致しなければ verify を回し直す。
- ワーカーが終わるたびに、オーケストレーターが成果物の実在を確かめる（§5.1）。

---

## 10. リポジトリ構成

刷新を終えたときの姿を示す。

```text
claude-canon/
├─ docs/                  正典（SSoT）。判定表の生成元
├─ .claude/
│   ├─ skills/
│   │   ├─ canon-a/ … canon-d/     Phase オーケストレーター（scripts/ を含む）
│   │   └─ investigation/ requirements/ design/ generation/ review/   知識 Skill（references/ を含む）
│   ├─ agents/            investigator・spec-writer・designer・builder・reviewer・keep-reviewer
│   ├─ rules/             claude-canon 自身の開発規律（paths: で読み込む範囲を絞る）
│   ├─ settings.json      permissions のみ（hooks は置かない）
│   └─ README.md          起動方法の説明
├─ lib/                   スクリプトが共有するパーサ・管理パス集合
├─ gates/                 build-conformance-tables.js と conformance_tables/（docs/ から生成・手で編集しない）
├─ tools/                 token-usage.js
├─ tests/                 自己検証（verify の各検査・スクリプト・自己適用）
├─ design/                architecture.md・artifacts.md
├─ guide/                 セットアップと運用の手順
├─ tasks/lessons.md       claude-canon 本体への改修要求の台帳
├─ work/  output/         run の成果物（gitignore。run ブランチでだけ追跡・§7）
└─ package.json・CHANGELOG.md・README.md
```

- **docs/ → conformance_tables/ の生成関係**が SSoT の実装である。判定表は正典から生成し、手で編集しない。正典を更新したら `npm run build:tables` で再生成する。CI は判定表が最新であることを検査する。
- **work/・output/ を gitignore にする理由**: 実行結果は claude-canon 本体の版とは別物である。成果物は最終的に対象プロジェクトの側で版管理される。
