# keep-review 判定: .claude/skills/ship-checklist/SKILL.md

## 事実の整理
- 対象 ship-checklist は「版番号を上げる／npm publish で送り出す／GitHub Releases で周知する」= **リリース公開手順そのもの**。strength は advisory。
- R1 want: リリース公開の手順（バージョン付け・レジストリ公開・アナウンス）を **CLAUDE.md に一元化し唯一の出典にする**。strength_needed: advisory。
- 統合方針: 「リリース公開の手順は CLAUDE.md に集約し、**他所には残さない**」。主眼は手順が複数箇所にあってバージョン規則が食い違う事故を止めること。

## C2 要件非抵触 → violation (high)
この skill を「変えずに維持」すると、リリース公開手順が CLAUDE.md とこの skill の**二箇所**に残る。統合方針は明示的に「他所には残さない」と一本化を要求しており、その rationale はまさに「手順が複数箇所にあるとバージョン付け規則が食い違う」こと。対象の中身（版番号を上げる規則を含む）は R1 が集約したい責務と**実際に重なる**。領域が近いだけでなく責務が同一なので、維持は統合方針との**競合**かつ**重複**にあたる。high confidence の violation。

## C4 強度整合 → clean (high)
R1 の strength_needed は advisory、対象の strength も advisory。既存の強度が要件の求める強度・constraints と矛盾しない（advisory な手順を advisory な要件が担う）。強度の観点では矛盾は生じない。C4 は clean。ただし C2 で維持自体が否定されるため、この clean は「強度差の矛盾は無い」ことのみを意味する。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/ship-checklist/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/ship-checklist/SKILL.md", "condition": "C2",
      "verdict": "violation", "confidence": "high",
      "rationale": "統合方針が『リリース公開手順を CLAUDE.md に集約し他所には残さない』一本化を求めているのに、この skill はバージョン付け・npm publish・GitHub Releases 周知という同一責務を保持し続け、手順が二箇所に残る。rationale の『複数箇所でバージョン規則が食い違う』事故そのものを再現するため、維持は方針と競合かつ責務重複。",
      "evidence": ["spec.md#R1", "統合方針: 他所には残さない", "対象: 版番号を上げる/npm publish/GitHub Releases"] },
    { "target": ".claude/skills/ship-checklist/SKILL.md", "condition": "C4",
      "verdict": "clean", "confidence": "high",
      "rationale": "R1 の strength_needed=advisory に対し既存も advisory。強度の観点では要件・constraints と矛盾しない（強度差の矛盾は無い。ただし維持の可否自体は C2 で否定される）。",
      "evidence": ["requirements#R1 strength_needed=advisory", "系統A strength=advisory"] }
  ]
}
```
