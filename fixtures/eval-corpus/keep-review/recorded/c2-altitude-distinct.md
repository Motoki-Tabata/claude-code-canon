# keep-review verdict: .claude/skills/style-rationale/SKILL.md

## 判定分析（keep-review 軸 / target: `.claude/skills/style-rationale/SKILL.md`）

**対象の実体**: 「なぜこの repo がそのスタイル規約を選んだか」の背景・理由だけを説明する L2 skill（advisory）。本文冒頭で「**個々のエラーの直し方は扱わない**」と自ら責務を限定している。

**C2 要件非抵触** → clean（confidence: high）
- R1 が求める新規生成物は「lint エラーの**具体的な修正手順**」の Skill。
- 統合方針（§4）は明示的に役割を二分している: 修正手順は新規 Skill へ、既存の「なぜこの規約を選んだか」の背景は「**判断の拠り所**」という**別責務**として維持。
- 対象自身も「直し方は扱わない」と宣言しており、新規 Skill（＝直し方）と責務が重ならない。lint/style という**領域が近いだけ**で、置き場が二重化する重複ではない。統合方針が役割を分けているため競合でもない。

**C4 強度整合** → clean（confidence: high）
- 既存の強度は `advisory`。R1 の `strength_needed` も `advisory`。一致。
- constraints（hooks 可・mcp/plugins/experimental 不可）は本対象の強度と無関係。conflicts も「なし」。
- deterministic/enforced を要する要件を advisory で担う、という類の矛盾は存在しない。

両条件とも clean。ただし judge 契約に従い、clean でも finding を1件ずつ記録する。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/style-rationale/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/style-rationale/SKILL.md", "condition": "C2",
      "verdict": "clean", "confidence": "high",
      "rationale": "統合方針が役割を明示的に二分（修正手順=新規Skill / 背景=判断の拠り所として維持）しており、対象自身も『個々のエラーの直し方は扱わない』と責務を限定。新規生成物と責務が重ならず、方針とも食い違わない。lint/styleと領域が近いだけで重複・競合には当たらない。",
      "evidence": ["spec.md#R1", "統合方針(§4)", "対象本文『個々のエラーの直し方は扱わない』"] },
    { "target": ".claude/skills/style-rationale/SKILL.md", "condition": "C4",
      "verdict": "clean", "confidence": "high",
      "rationale": "既存の強度はadvisory、R1のstrength_neededもadvisoryで一致。conflictsはなし。constraintsは本対象の強度と無関係で、advisoryでdeterministic/enforced要件を担うような矛盾は存在しない。",
      "evidence": ["系統A: strength=advisory", "requirements: R1 strength_needed=advisory", "conflicts(なし)"] }
  ]
}
```
