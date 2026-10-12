# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

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

## 2026-10-10 Phase ごとに別セッションで /canon-a〜/canon-d を起動する実経路が未検証（run 20261010_014620・Phase D）
- 種別: 規律昇華
- 何が起きたか: この run は1セッションで各 SKILL.md の手順を代行した。`disable-model-invocation` の挙動、セッション分離、B〜D の開始手順（`canon_commit` の比較・`approvals check`）は通していない。Hook の発火も未検証（この run は Hook を生成していない）。
- 提案: 小さな対象で `/canon-a`〜`/canon-d` を別セッションで通し、手順の抜けを本台帳に起票する。1セッション通しで検証するときに省いてよい手順は SKILL.md に書かない（実運用の経路と混ざるため）。plan mode を使う Skill が経路に入るときは、計画の承認を対話のセッションで確かめる（`claude -p` では承認の画面が使えない。正典 `canon-reference/references/features/permissions.md` の §3.3・§4）。

## 2026-10-10 canon 自身の investigator を haiku・effort high の役に分けられるかを実地で評価していない（保守作業）
- 種別: 効率化
- 何が起きたか: `.claude/skills/design/references/model-selection.md` の haiku の条件は、事実の抽出に徹して後段で検証される作業に haiku・`effort: high` を使える形になった。canon 自身の investigator は existing・profile（事実の抽出）と focused（要件に照らした推論）を1体で担うので、sonnet のまま据え置いている。haiku と sonnet の出力の実地比較はしていない。
- 提案: 小さな対象で existing・profile を haiku・`effort: high` で動かし、sonnet の出力と比べる。採るなら existing・profile 用の agent を分け、`tests/self_application.test.js` の agent 8体の固定（EXPECTED_AGENTS）と Agent の例示に `model=` を書かない検査、`.claude/skills/canon-a/SKILL.md` の工程1、`design/architecture.md` の Agent 表を同じ変更で直す。

## 2026-10-10 ユーザー設定のトップレベル effortLevel が Opus 5.5 に効かないことを検出する検証ルールが無い（保守作業）
- 種別: 効率化
- 何が起きたか: トップレベルの `effortLevel` は、ユーザー設定（`~/.claude/settings.json`）に書いたときだけ Opus 5.5 に効かない。プロジェクト・local・managed の設定と `--settings` に書いた値は全モデルに効く（正典 `canon-reference/references/features/settings.md` の §4）。生成物がユーザー設定向けにトップレベルの `effortLevel` を案内しても、verify は検出しない。
- 提案: 生成物がユーザー設定にトップレベルの `effortLevel` を書くよう案内している箇所を検出し、`modelSettings` を促す V ルールを足すかを決める（JS が要る）。足すなら canon-reference の V- ID と `design/artifacts.md` の verify の表を同じ変更で直す。

## 2026-10-12 handoff の申し送りを直す操作が npm run handoff に無い（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の終わりに足した申し送りの件数（breaking の modify 14件→13件）を直す操作が `tools/handoff.js`（mark・set・note・session）に無く、handoff.md を Edit で直した。
- 提案: `tools/handoff.js` に節の項目を置き換える操作を足すか、canon-b〜d の SKILL.md に「申し送りの誤りは note で訂正の項目を足す」と書く。
