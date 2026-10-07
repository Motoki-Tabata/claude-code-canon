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

## 2026-10-07 Phase D の逸脱が台帳に書かれず、run 全体の振り返りの工程も無い（run 20261003_033830・Phase D）
- 種別: 規律昇華
- 何が起きたか: Phase D の終わり（774bc4a2 L343）では、既存の4件を数えただけだった。上の「generated/ を直接編集」「P5 が中身を束縛しない」「コマンドの挙動の裏取り」は Phase D の中で起きていたのに、起票されていない（`canon-d/SKILL.md:26` は「気づいたらその場で書く」と定める）。本台帳の上の項目は、run の後に手作業で transcript を解析して見つけた。session-analyst は Phase A の要件ヒアリング専用である（`requirements/references/interview.md:31`）。自分が手順から外れたことを自分で申告するのには限界がある、というのは推測。【中】
- 提案: Phase D の終わりに、この run の4セッションの transcript を session-analyst（1セッション1体、並列）に分析させ、台帳に書く候補を作らせる工程を足す。あわせて「SKILL.md の手順の外で行った操作」を列挙する自己点検を、Phase の終わりの必須項目にする。
