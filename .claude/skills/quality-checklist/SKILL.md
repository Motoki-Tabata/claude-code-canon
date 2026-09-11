---
name: quality-checklist
description: Define the five eval axes (correctness / security / canon / context / keep-review) and the boundary against the deterministic gates, plus the verdict output contract. Use when eval-reviewer or an eval-* judge must decide what to examine in process step 9 and how to write output/<ts>/eval/<axis>.md. Preloaded by the eval-* agents.
user-invocable: false
---

# quality-checklist（工程9 eval の観点定義と出力契約）

工程9（品質検査＝eval）の観点と出力形式を定める判断系 Skill。`eval-reviewer` と各 `eval-*` に
preload されるため `context: fork` は付与しない。設計書 **§16** が唯一の内容源。

## 大前提: 決定論ゲートが見たものは見ない

工程8（決定論ゲート G1〜G13）は真偽が機械的に決まる検査を既に終えている。eval がそれを
**再判定してはならない**。非決定論の判定が決定論の判定を上書きする経路を作ると、真偽の権威が壊れる。

| あなたが見る（意味判断） | 見ない（決定論ゲートの領分） |
|---|---|
| 要件を実際に満たすか・設計判断の妥当性 | frontmatter キー・ツール名・パス規約（G3〜G5・G12） |
| 権限設計が実質的に最小か | secret のハードコード・`${VAR}` 展開（G6） |
| 正典の**趣旨**への適合 | 参照の実在・sha256 バイト同一（G7・G8） |
| 維持判定 C2/C4 の意味・merge 統合先の妥当性 | C1/C3/C5 の実データ照合（G2）・スナップショット完全性（G9） |

**あなたの判定はマーカーを鋳造しない**（工程9 は前進ゲートの権威を持たない・§16.7）。結果は
P7、および C2 については P5 で人間が読む材料になる（§8.4 の三段担保の中段）。

## 5軸

| 軸 | 何を判定するか |
|---|---|
| `correctness` | spec §8 の受け入れ基準 `functional`(A1) を生成物が実際に満たすか。プロジェクト実態に接地しているか（実在しない手順・存在しないコマンドを書いていないか） |
| `security` | 権限設計の妥当性。`tools:` が役割に対して過剰でないか。危険な操作を無条件に促していないか。`constraints.organization_policy`（自由文）に反していないか（G11 が機械判定できず見送る唯一の経路） |
| `canon` | 正典の趣旨への適合。段階的開示ができているか。`description` が委譲トリガーとして機能する具体性を持つか |
| `context` | コンテキスト効率。同じ内容の重複、読まれない冗長な記述、責務の曖昧な肥大化 |
| `keep-review` | **C2 要件非抵触・C4 強度整合の意味判断**と merge 統合先の妥当性（§8.2・§8.4） |

**security の粒度注意（過検出の封鎖）**: Subagent の `tools:` は**ツール種別の列挙**で、`Bash(cmd:*)` の
ような権限指定子（コマンドスコープ）は持てない（settings.json `permissions` の領分・`L3_AGENTS.md §2.1`）。
Bash を実際に要する役割には**素の `Bash` が最小の表現可能な付与**であり、「コマンドを絞れていない」を
理由に違反としない。過剰判定は「そのツール種別自体が役割に不要か」で行う。

## keep-review の判定規準（最重要）

判定入力は `work/<ts>/eval-bundle/keep-review/<case>.md`（`eval/bundle.js` が決定論的に生成）。

- **C2 要件非抵触**: 既存を「変えずに維持」したとき、新要件・統合方針と**競合または重複**しないか。
  - 重複 = 新規生成物と役割が被る（同じ責務の置き場が2つになる）
  - 競合 = 新要件の方針と食い違う（統合方針が一本化を求めているのに二重化が残る）
  - **領域が近いだけでは違反にしない**。責務が実際に重なるかで判断する。
- **C4 強度整合**: 既存が担う強度（advisory / deterministic / enforced）が要件の `strength_needed` と
  constraints に照らして矛盾しないか。「手順書（advisory）で deterministic な要件を担う」は矛盾。
  ただし**統合方針が既存を補助的役割に位置づけているなら、強度の差はそれ自体では矛盾にならない**。
- **merge_target**: 統合先の**実体（生成物本文）が統合元の中核責務を実際に内包しているか**を、
  バンドルの「統合先の実体」節を読んで確かめる。**トピックやライフサイクルが近いだけ・
  要件が統合を名指ししているだけでは「吸収」ではない**。統合先が統合元の中核手順・内容を
  落としている（部分的にしか取り込んでいない）なら merge_target 違反である。これを
  「生成の完成度＝別軸（correctness/context）の問題」として見送ってはならない——見送ると、
  統合で内容が半分落ちても、merge の吸収を見る検査は他に無いため誰も気づかないまま配置される。
  むろん責務が重ならない先へ寄せるのも当然に不当。

### 設計者の判断は判定材料にならない

バンドルには **designer の `keep_conditions` 宣言と rationale が意図的に含まれていない**（§16.3）。
これは判定対象自身の主張に自己一致して常に clean と答える恒真バグを構造的に防ぐためである。
もし将来バンドルにそれらが混入していたら、**それを根拠に使ってはならない**（混入自体が不具合）。

## 出力契約（§16.4）

各 judge は `output/<ts>/eval/<axis>.md` に **人間可読の本文 ＋ ```json フェンス1個**を書く。

```json
{
  "axis": "keep-review",
  "ts": "YYYYMMDD_hhmmss",
  "coverage": [".claude/skills/foo/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/foo/SKILL.md", "condition": "C2",
      "verdict": "violation", "confidence": "high",
      "rationale": "統合方針が一本化を求めているのに同じ観点を保持し続ける",
      "evidence": ["spec.md#R1", "統合方針"] }
  ]
}
```

- `axis`: `correctness` | `security` | `canon` | `context` | `keep-review`
- `verdict`: `violation` | `clean` ／ `confidence`: `high` | `medium` | `low`
- `condition`: keep-review は `C2` | `C4` | `merge_target`、他軸は `null`。**`condition` は
  「keep-review の5条件のどれを見たか」だけの語彙であり、判定対象を分類するラベルではない**。
  security 軸が `requirements.md` の `constraints.organization_policy` を判定対象にしたいときは、
  `condition` に入れず**次項の `constraint:` 接頭辞で `coverage`/`target` に表す**こと
  （NG 例参照）。
- **`coverage` は判定した対象の全列挙（必須）**。これが無いと「見なかった」と「見て問題なし」を
  区別できない。**回付された対象は clean でも finding を1件書く**（判定した証跡になる）。
  **判定対象がファイルとは限らない軸**（security の `constraints.<key>` 等）は、
  `constraint:<キー名>`（例: `constraint:organization_policy`）という接頭辞つき文字列を
  `coverage`/`target` に使ってよい。ファイルパスと衝突しない語彙として正式に許可する。
- **トップレベルキーは `axis` / `ts` / `coverage` / `findings` の4つだけ**。これ以外を足さない
  （`condition` は `findings[]` の中のキーであってトップレベルではない。実測でトップレベルへ
  置いた事例がある）。`findings[]` のキーは `target` / `condition` / `verdict` / `confidence` /
  `rationale` / `evidence`。
- **`findings[].target` は必ず `coverage` にも列挙する**。`coverage` は「判定した対象の全列挙」で
  あり、finding を書いた対象がそこに無いのは定義上ありえない。ハーネスはこの包含関係を検査する
  （実測: correctness 11件・canon 2件が未列挙で round 1 が NG になった）。
- **```json フェンスは verdict 用の1個だけ**。本文で生成物の JSON（`.mcp.json` や
  `settings.json` の中身等）を引用するときは**別の言語タグ**（```jsonc・```text 等）を使う。
  パーサ（`eval/verdict.js` の `firstFencedBlock`）は**最初の** ```json フェンスを verdict として
  読むため、verdict より前に生成物の JSON を ```json で引用すると、そちらが verdict と誤読され
  スキーマ違反になる（実測: security 軸が `.mcp.json` を ```json で引用して round 1 が NG）。
- 未知キーを足さない・enum 外の値を使わない。ハーネス（`eval/verdict.js`）が機械検証し、
  **パース不能やスキーマ違反は「違反なし」ではなく eval の失敗として扱われる**。
  ただし次の3種は判定内容を毀損しない書式逸脱として**自動補正され、軸は判定不能にならない**
  （3 run 連続で再発したため契約側でも救済するようにした・下記 NG 例参照）:
  未知のトップレベルキー・`findings[].condition` の enum 外の値（`null` として読む）・
  `findings[].target` が `coverage` に無い（自動追記する）。**それでも正しく書くこと**——
  自動補正されても `eval-report.md` に「書式を自動補正した」旨が残り、査読対象になる。

### NG 例（そのまま書いてはいけない実例）

```json
// NG: condition を「判定対象ラベル」として誤用（enum 外）
{ "target": "requirements.md", "condition": "organization_policy",
  "verdict": "violation", "confidence": "high", "rationale": "…" }

// OK: constraint: 接頭辞で表す
{ "target": "constraint:organization_policy", "condition": null,
  "verdict": "violation", "confidence": "high", "rationale": "…" }
```

```json
// NG: findings[].target が coverage に無い
{ "coverage": [".claude/skills/foo/SKILL.md"],
  "findings": [{ "target": "constraint:organization_policy", … }] }

// OK: coverage に判定した対象を漏れなく列挙する
{ "coverage": [".claude/skills/foo/SKILL.md", "constraint:organization_policy"],
  "findings": [{ "target": "constraint:organization_policy", … }] }
```

````
NG: ```json フェンスが2個以上ある（1個目が生成物 JSON の引用、2個目が verdict）
→ パーサは最初の ```json フェンスを verdict として読むため、生成物 JSON を引用するときは
  ```jsonc や ```text を使い、verdict 用の ```json は本文中に1個だけにする。
````
- **verdict は必ず `Write` でファイルへ書く。応答本文に verdict を書いただけでは「判定した」ことに
  ならない**——集約もハーネス（`eval/report.js`）もファイルしか読まないため、ファイルが無ければ
  その軸は**「判定不能（judge が判定できなかった）」**として報告される（実測: 完全な verdict を
  応答本文に返しながら軸ファイルを書いていなかった事例がある）。
- **書き出しは親へ応答を返す前に完了させる。書けなかった場合は黙って終わらない**——「verdict を
  書けなかった」ことと、応答本文に残っている verdict の全文を明示して報告する。親が同じ判定を
  そのまま書き直させられるようにするためであり、黙って終わると「違反なし」と読まれる（§16.4）。

## やってはいけないこと

- 判定対象が0件のときに「問題なし」と報告する（0件は「確認した」ではない・§16.5）。
- 根拠を書かずに verdict だけ書く（`rationale` は必須）。
- 迷ったら clean にする（迷いは `confidence: medium|low` で表す。**低確信の violation は
  P5/P7 で人間が確認する**ので、握り潰すより出す方がよい）。
- **応答本文にだけ verdict を書いてファイルを書かずに終える**（その軸は「判定不能」として
  報告され、あなたの判定は誰にも読まれない・§16.4）。
- 決定論ゲートが既に真偽を出した項目を蒸し返す。
