# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`gates/`・`tools/`・`eval/`・`deploy/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中（run ブランチの worktree）で見つけたら `work/<ts>/handoff.md` の「canon 課題候補」に同じ書式で書き、
  Phase D の最後に本台帳へ転記する（`design/architecture.md` §6.4）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約。旧台帳の `L0xx` 番号がコード・設計書に残っているため、番号は再利用しない。
- `design/` には設計書2冊（architecture.md・artifacts.md）だけを置く。未対応の backlog は本台帳だけに置く。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・Phase <A〜D> | 旧 <文書>#<ID>）
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
- 提案: 次の `/canon` 実 run の各セッションで `npm run tokens -- <session-id>` を取り、改修前の基準値（git 履歴の `design/canon-token-baseline-20260924.md`「改修後の実測」）と比べる。確かめる点: S3 メインの Stop 再通知が0回か・generator の Glob ポーリングが0回か・Explore 等が sonnet で動いたか・G9 の layer-heading 由来の宣言が0件でないか・resume が handoff_notes を出し S3 が実施したか・S4 が RUN.md「2a」「4」を実行・逐語提示したか・`canon-issues-candidates.md` が S4 で台帳に転記されたか。

## 2026-09-27 requirements-recorder の model を haiku に戻すかの判定が未了（run 20260910_220906・S3）
- 種別: 欠陥修正
- 何が起きたか: `model: haiku` の agent が `subagent_type` として未登録になる症状と相関したため、切り分けとして requirements-recorder を sonnet に上げたまま（定義: `.claude/agents/requirements-recorder/requirements-recorder.md` frontmatter）。新セッションでの登録確認が未実施。
- 提案: 新セッションで haiku に戻して登録を確認する。解消していれば haiku に戻し `.claude/skills/model-selection/SKILL.md`「本システムでの確定割当」の haiku 行を更新、再発すれば model 以外の原因を探す。どちらでもこの項目を削除する。

## 2026-09-27 生成物に未定義の参照・作者向けメモ・経緯 ID が残る（vehicle-intake-management への配置物の監査）
- 種別: 欠陥修正
- 何が起きたか: 配置先の `.claude/**` に、定義の無い「Skills 共通規約」（tsod-implement/plan/table-design/screen-design/spec）、canon 要件 ID（R6〜R11）と事故番号（機能006）の理由代わりの記載、frontmatter の編集メモ（`disable-model-invocation` は付けない 等）、「移設した節（逐語）」「旧運用は廃止」の差分表現が残っていた。配置先では 2026-09-27 に手修正済み（未コミット）。
- 提案: generator・skill-builder・agent-builder の生成規約に「読み手が解決できない参照（要件 ID・run 外の事故番号・未定義の規約名）を本文に書かない」「生成元向けの編集メモを成果物に入れない」を追加し、次回の run では配置先の修正版を keep の原本として扱う。

## 2026-09-30 `npm run tokens -- <session-id>` が対象プロジェクトの transcript を解決できない（run 20260930_192946・S1）
- 種別: 欠陥修正
- 何が起きたか: requirement-elicitation の手順どおり対象（vehicle-intake-management）の session-id を渡すと「transcript が無い: ~/.claude/projects/-home-motoki-tabata-work-claude-code-canon/<id>.jsonl」で失敗した。解決先が canon 自身のプロジェクトディレクトリに固定されている（tools/token-usage.js）。jsonl の絶対パスを渡せば動く。
- 提案: tools/token-usage.js で session-id を対象側プロジェクトディレクトリ（v2 では handoff.md の `target` から導く）でも探す（または ~/.claude/projects/* を横断して一意に解決する）。ヒアリング手順（v2 では requirements Skill）にも「対象の transcript は jsonl パスで渡す」を併記する。run 20260930_192946 は v2 刷新のため放棄し、この候補だけを転記した。
