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


## 2026-09-27 2026-09-27 の改修の効果と実発火は、次の実 run でしか確かめられない（改修ブランチ feat/canon-optimization-20260927）
- 種別: 規律昇華
- 何が起きたか: 2 run の分析から入れた改修（Stop の同一違反抑止・G9 の見出し照合・copy-keep・RUN.md の逐語転記・resume の handoff_notes・generator のポーリング禁止・場当たり agent の sonnet 明示等）は、単体テストと実 run の出力への再適用でロジックを確かめただけで、hook 経路での実発火とトークン削減は未確認。
- 提案: 次の `/canon` 実 run の各セッションで `npm run tokens -- <session-id>` を取り、`design/canon-token-baseline-20260924.md`「改修後の実測」の表に列を足す。確かめる点: S3 メインの Stop 再通知が0回か・generator の Glob ポーリングが0回か・Explore 等が sonnet で動いたか・G9 の layer-heading 由来の宣言が0件でないか・resume が handoff_notes を出し S3 が実施したか・S4 が RUN.md「2a」「4」を実行・逐語提示したか・`canon-issues-candidates.md` が S4 で台帳に転記されたか。
