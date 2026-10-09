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

## 2026-10-10 生成規約の「ルールには理由を添える」が正典 skills §4 の「理由の語りは入れない」と食い違う（保守作業・run 20261010_014620 の持ち越し）
- 種別: 規律昇華
- 何が起きたか: `.claude/skills/generation/references/no-leaks.md:20` は「ルールには理由を添える」とし、`canon-reference/references/features/skills.md:156` は「経緯や理由の語りは入れない」とする。run 20261010_014620 では verify も reviewer も指摘せず、生成したルール（`esm-src.md` など）には理由の文が入った。どちらが正かを決めていない。
- 提案: 正典 §4 の範囲（Skill 本文か、ルールや CLAUDE.md を含むか）を確かめ、no-leaks.md か契約語の検査のどちらかを揃える。

## 2026-10-10 V4 の Agent Teams 検査と V9 の experimental 検出に data の根拠が無い（保守作業）
- 種別: 規律昇華
- 何が起きたか: `v4-security.js:20,41`（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` の開示検査）と V9 の `CLAUDE_CODE_EXPERIMENTAL_*`・`isolation: subagent` の検出は、canon-reference の data（`env-vars`、`isolation` は `worktree` のみ）に根拠が無く、「canon 独自の規則」と明記して残してある。廃止するかが未決。
- 提案: 正典の最新版で env-vars と isolation の値を確かめ、根拠が無いままなら該当検査を廃止して canon-reference の V- ID だけに揃える。

## 2026-10-10 Phase ごとに別セッションで /canon-a〜/canon-d を起動する実経路が未検証（run 20261010_014620・Phase D）
- 種別: 規律昇華
- 何が起きたか: この run は1セッションで各 SKILL.md の手順を代行した。`disable-model-invocation` の挙動、セッション分離、B〜D の開始手順（`canon_commit` の比較・`approvals check`）は通していない。Hook の発火も未検証（この run は Hook を生成していない）。
- 提案: 小さな対象で `/canon-a`〜`/canon-d` を別セッションで通し、手順の抜けを本台帳に起票する。1セッション通しで検証するときに省いてよい手順は SKILL.md に書かない（実運用の経路と混ざるため）。

## 2026-10-10 生成物の README の一覧に出力スタイルが載らない（保守作業・刷新レビュー）
- 種別: 欠陥修正
- 何が起きたか: `.claude/skills/canon-c/scripts/emit-manifest.js` の `collectComponents` は Skill・Subagent・Rule・Hook・MCP・plugin だけを集め、`.claude/output-styles/*.md` を拾わない。output-styles の担当が生成した出力スタイルは、`generated/.claude/README.md` の生成物一覧と使い方に現れない。
- 提案: `collectComponents` に出力スタイル（`frontmatter:output-style` の `name`・`description`）を足し、README の一覧と使い方（`/config` か settings の `outputStyle` で選ぶ）に載せる。artifacts.md §7.3 と emit-manifest のテストを合わせて直す。

## 2026-10-10 V7 の署名に出力スタイルの種別が無い（保守作業・刷新レビュー）
- 種別: 欠陥修正
- 何が起きたか: `lib/interface-signature.js` の `interfaceSignature` は `.claude/output-styles/*.md` を `unknown`（検査できない）にする。既存の出力スタイルを modify で残し `interface_change: none` を宣言すると、V7 が必ず違反にする（artifacts.md §8.2 V7 の署名表の「上記以外」）。
- 提案: 出力スタイルの署名（frontmatter の `name`。無ければファイル名）を署名表と `interfaceSignature` に足し、テストで固定する。
