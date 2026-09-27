# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`gates/`・`tools/`・`eval/`・`deploy/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  `/canon` の run 中（`generation.done` まで）はガードが run の外への書込を deny するため、
  `work/<ts>/canon-issues-candidates.md` に同じ書式で書き、S4 の最後に本台帳へ転記する。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約。旧台帳の `L0xx` 番号がコード・設計書に残っているため、番号は再利用しない。
- `design/` には run の観測記録と改修まとめを置く。未対応の backlog は本台帳だけに置き、`design/` 側からは参照する。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・S<n> | 旧 <文書>#<ID>）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript 先頭8桁:L行・コード path:line）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

transcript の略号: run 20260925_004359 = S1 `918d6a9a`・S2 `d95e77b5`・S3 `5ca33ae1`・S4 `45b10f1a`・配置後 `8b8a6f1a`／
run 20260927_003229 = S1 `41da6176`・S2 `1122beb9`・S3 `a192b7cf`・S4 `f3dd5ca1`
（`~/.claude/projects/-home-motoki-tabata-work-claude-code-canon/`）。

---

## 2026-09-27 陳腐化した参照（ref_resolution の resolved:false）が spec の是正候補に上がらない（旧 canon-issues-20260919_023121#参考）
- 種別: 規律昇華
- 何が起きたか: 対象側 lessons R16 の付記。実装済みの指示が CLAUDE.md の条文に未完了のまま残る陳腐化が再発しうるが、profiler の ref_resolution で `resolved: false` になった参照は spec の是正候補に自動では上がらない（canon-issues-20260919_023121.md:164-170）。
- 提案: spec-writer 定義に「project_profile の ref_resolution で resolved:false の参照は spec の是正候補節に列挙する」を書き、G4 系で ref_resolution の resolved:false が spec に現れることを照合する。

## 2026-09-27 spec に designer の優先順位判断の対象外にする必達（mandatory）の区別が無い（旧 canon-issues-20260922_172924#参考）
- 種別: 規律昇華
- 何が起きたか: 対象側 lessons の3件が反映されないリスクがあり、P4 差し戻しで spec に A1-8（反映先と挿入位置を名指しし、designer の優先順位判断の対象外と宣言する節）を手作業で足した。既存改修モードでは毎回起きうる（canon-issues-20260922_172924.md:238-245）。
- 提案: spec-writer のテンプレートに mandatory 節を構造化し、designer 定義に「mandatory 節の項目は取捨の対象外」を書く。ゲートで「mandatory の各項目が design-map のレコード（反映追跡）に対応しているか」を機械照合する。

## 2026-09-27 受入基準の合否条件に行数・件数を使ってしまう（旧 canon-issues-20260922_172924#参考）
- 種別: 規律昇華
- 何が起きたか: 当初 spec A1-4 は「常時ロード L1 が 242行を超えない」だったが、教訓の反映は L1 を必然的に増やすため A1-1／A1-8 と衝突し、P4 で「同一内容が2箇所以上に無いこと」＋「242行は参照値で合否条件ではない」に書き換えた（canon-issues-20260922_172924.md:246-248）。
- 提案: spec-writer 定義に「行数・件数を合否条件に使わない（正典の上限は G 系ゲートが見る）。受入基準は質（重複の無さ・振る舞い）で書く」を書く。

