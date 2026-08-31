# keep-review 判定: .claude/skills/schema-guard/SKILL.md（disposition: keep）

## 対象の要点

既存 `.claude/skills/schema-guard/SKILL.md` は系統A の棚卸しで `strength: deterministic` とされ、
本文でも自らを「`.claude/settings.json` の PreToolUse Hook（`ops/hooks/deny-schema-edit.js`）と
**対で使う**」ものと定義している。すなわちこの Skill 単体は自立した文書ではなく、
Hook が編集を deny した後の誘導文という従属的な役割で書かれている。

## C4 強度整合

requirements の constraints は `hooks: { allowed: false, reason: "組織ポリシーで Hooks の利用を禁止" }`
であり、`organization_policy` も「自動実行される仕組みは監査ログの対象にできないため不可」と明示する。
統合方針も「決定論的な阻止の仕組みは今回の環境では採用できない」と述べ、R1 の
`strength_needed` は `advisory` である。

対してこの既存は `strength: deterministic` であり、その決定論性の実体は禁止された Hook
（`ops/hooks/deny-schema-edit.js`）そのものに由来する。これを「変えずに維持」すると、
constraints が禁じた Hook を前提とする決定論的阻止の構成が設計に残ることになり、
要件の強度（advisory）とも組織ポリシーとも正面から矛盾する。

統合方針が既存を補助的役割に置いているなら強度差は矛盾にならないが、本件の統合方針は
既存を補助として位置づけておらず、逆に決定論的阻止そのものを不採用と宣言している。
よって強度差の免責は成り立たない。→ **C4: violation / confidence: high**

## C2 要件非抵触

R1 は「生成物の扱い（再生成手順・手編集しない約束）を文書で案内する」ことを求め、統合方針は
その置き場を L1/L2 の文書に一本化する。既存 Skill も `npm run codegen` への誘導と
「手編集を禁じる」約束を記述しており、R1 に応える新規文書と責務が実質的に重なる
（同じ責務の置き場が二つになる）。

さらに既存は「Hook が編集を deny したときに」という発動前提を明記しているため、Hook を採らない
方針の下では発動条件が満たされない案内が残る。これは単なる領域の近接ではなく、
統合方針が示す一本化と食い違う競合である。ただし新規文書の具体的な責務境界が
バンドル上で完全には確定していないため、重複の断定は confidence: medium に留める。
→ **C2: violation / confidence: medium**

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/schema-guard/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/schema-guard/SKILL.md",
      "condition": "C4",
      "verdict": "violation",
      "confidence": "high",
      "rationale": "既存の strength は deterministic で、その決定論性は constraints が禁止した Hook（ops/hooks/deny-schema-edit.js）に依存する。R1 の strength_needed は advisory、統合方針も決定論的阻止を不採用と明言しており、既存を補助的役割に位置づけてもいないため、強度差は免責されず矛盾となる。",
      "evidence": ["系統A: strength: deterministic", "constraints.hooks.allowed=false", "requirements R1 strength_needed=advisory", "統合方針: 決定論的な阻止の仕組みは採用できない"]
    },
    {
      "target": ".claude/skills/schema-guard/SKILL.md",
      "condition": "C2",
      "verdict": "violation",
      "confidence": "medium",
      "rationale": "既存も手編集禁止と npm run codegen への誘導を記述しており、R1 に応える新規文書と責務が重複する。加えて『Hook が deny したとき』という発動前提は Hook 不採用の統合方針と食い違い、文書への一本化に反する二重化が残る。",
      "evidence": ["対象本文: Hook と対で使い、deny されたときに npm run codegen へ誘導", "spec R1: 再生成手順・手編集しない約束を文書として整える", "統合方針: 生成物の扱いは文書(L1/L2)で案内する"]
    }
  ]
}
```
