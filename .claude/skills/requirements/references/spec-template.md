# spec.md（工程4・P2）

spec-writer が `output/<ts>/spec.md` に書く。次の2つを満たす: (1) designer がこれだけで design-map を引ける、(2) 検証とレビューが受入基準の出典にできる。

## 入力（プロンプトで渡されるパス。すべて Read する）

`work/<ts>/investigation/existing.md`・`profile.md`・`focused.md`、`work/<ts>/requirements.md`、`gates/conformance_tables/index.json`（`canon_version` の出典。参照だけで、inputs には数えない）。

## テンプレート

```markdown
## §0 メタ
spec_id: <ts>
canon_version: <index.json の canon_version をそのまま写す>
inputs: [work/<ts>/investigation/existing.md, work/<ts>/investigation/profile.md, work/<ts>/investigation/focused.md, work/<ts>/requirements.md]

## §1 目的とあるべき全体像
purpose / strength の内訳 / scope_layer

## §2 新要件
- id: R1 / want / rationale / project_grounding（focused.md の findings から、evidence 付きで）

## §3 既存資産の棚卸し
existing.md の全レコードを参照する。keep か modify かは決めない（事実のみ）。

## §4 統合方針
既存と新要件の競合・重複の方向づけ（最終判定は design-map）。
### 未解決の参照
focused.md の ref_resolution で resolved: false の参照を、ref の文字列のまま1件ずつ挙げ、
「是正候補（直す方向を書く）」か「意図的な未解決（理由を書く）」かを分ける。

## §5 プロジェクト接地素材
paths_hints / model_hint / supporting_file_candidates

## §6 スコープ外
やらないこと

## §7 制約
security / cost / experimental（依存フラグの可否）

## §8 受入基準
- A1-1: <functional。生成物が実際に満たす振る舞い>  [mandatory]
- A2-1: <non_regression。keep した既存が変わらない>
- A3-1: <canon_conformance>
- A4-1: <snapshot_integrity>

## §9 未決事項
<人間の判断が要る論点。無ければ散文で「なし」と書く>
```

## 書き方

- **canon_version** は `gates/conformance_tables/index.json` の `canon_version` を Read して写す。推測で書かない。設計書の frontmatter から写さない（設計書は人が保守するので、正典より遅れうる）。
- **§3 と §4 は方向づけまで**。既存を維持する・改修する・廃止する、といった判定は書かない。
- **§4 の「未解決の参照」**は全件を挙げる。黙って落とすと、陳腐化した参照が未完了のまま残る。
- **§8 の受入基準**は4カテゴリで、担い手が決まっている: A1 functional＝reviewer（correctness）、A2 non_regression＝verify V7、A3 canon_conformance＝verify V1〜V6、A4 snapshot_integrity＝verify V8。1行1基準で `- A1-1: …` の形に書く。
  - 必ず満たすべき基準には行末に `[mandatory]` を付け、反映先の生成物と挿入位置を名指しする。designer は mandatory を取捨の対象にできず、design-map の反映追跡に載っていなければ止まる。
  - 行数・件数を合否条件にしない（「CLAUDE.md が N 行を超えない」など）。要件を反映すると L1 は必然的に増えるので、数の条件は他の基準と衝突する。質（同じ内容が2か所に無い・振る舞い）で書き、数は参照値として本文に添える。量の目安（CLAUDE.md の200行など）は reviewer が context の観点で見る。
- **§9 未決事項が空でなければ、P2 に出せない**。「なし」の場合は箇条書きを使わず散文で書く（`- ` で始まる行はすべて未決項目として数えられるので、確定済みの論点を箇条書きで並べると未決扱いになる。確定済みの論点を挙げたいときは、読点でつないだ1つの段落にする）。

## 差し戻されたとき

オーケストレーターが、handoff.md の「差し戻し」に書いた人間の指摘（逐語・直す箇所・直さない箇所）を渡して、spec-writer を新規に起動する。既存の spec.md を Read し、指示が指す箇所だけを Edit する。指示の無い節を書き換えない。受入基準の件数や番号が変わるときは、参照している他の節も整合させる。
