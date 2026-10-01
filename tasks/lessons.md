# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`gates/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §6.4）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には設計書2冊（architecture.md・artifacts.md）だけを置く。未対応の backlog は本台帳だけに置く。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・Phase <A〜D> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

---


## 2026-09-30 `npm run tokens -- <session-id>` が対象プロジェクトの transcript を解決できない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: ヒアリングの手順どおり対象プロジェクトの session-id を渡すと「transcript が無い: ~/.claude/projects/-home-motoki-tabata-work-claude-code-canon/<id>.jsonl」で失敗した。解決先が canon 自身のプロジェクトディレクトリに固定されている（tools/token-usage.js）。jsonl の絶対パスを渡せば動く。
- 提案: tools/token-usage.js で session-id を対象側プロジェクトディレクトリ（v2 では handoff.md の `target` から導く）でも探す（または ~/.claude/projects/* を横断して一意に解決する）。requirements Skill の `references/interview.md` には「対象の transcript は jsonl の絶対パスで渡す」を併記済み（ツール側の修正が済んだら、その併記を外す）。

## 2026-10-01 reviewer 用の review-bundle が未実装で、reviewer が入力を自分で集めている（保守作業）
- 種別: 欠陥修正
- 何が起きたか: artifacts.md §9.1 は reviewer 用のバンドル（生成物の実体と接地材料・design-map の rationale を除く）を定めるが、`.claude/skills/canon-c/scripts/review-bundle.js` は keep-reviewer 用しか作らない。reviewer は generated/・spec・slices・investigation を直接読んでおり、入力を探し損ねて「問題なし」と答える経路と、slices 経由で designer の rationale を読む経路が残っている。
- 提案: review-bundle.js に reviewer 用の出力（`work/<ts>/review-bundle/reviewer/`）を足し、rationale を除くことをテストで固定する。reviewer 定義の「入力」と canon-c の工程8 をバンドルの読みに切り替える。

