# keep-review 判定: .claude/skills/pr-size-guide/SKILL.md

対象: `.claude/skills/pr-size-guide/SKILL.md`（disposition: keep、strength: advisory）

## C2 要件非抵触 → violation（confidence: high）

統合方針（§4）が決定的です。方針は以下を**明示的に**述べています。

- レビュー準備手順は「新規 Skill（pr-self-check）に**一本化**する」
- 差分の大きさに関する既存の断片的指針は、新 Skill が扱う「差分の大きさの目安」に「**吸収する**」
- 「準備手順の置き場は新 Skill **ただ一つ**にする」

一方、対象 `pr-size-guide` の実体は「差分の大きさの目安」「分割の仕方」「レビュー依頼のとき」で構成され、まさに新 Skill が吸収対象とする「差分の大きさの目安」そのものを保持しています。これを**変えずに維持**すると、同一の責務（PR サイズのセルフチェック指針）の置き場が旧 `pr-size-guide` と新 `pr-self-check` の**2つ**になります。

これは「領域が近いだけ」ではなく、統合方針が名指しで吸収・一本化を求めている責務の**実体的重複**であり、かつ「置き場はただ一つ」という方針との**競合**です。keep ではなく merge/drop が妥当な対象を keep 宣言している、典型的な C2 違反と判断します。

## C4 強度整合 → clean（confidence: high）

対象の強度は advisory。R1 の `strength_needed` も advisory。強度は一致しており、constraints（hooks 可・mcp/plugins/experimental 不可）とも矛盾しません。conflicts も「なし」。強度面での不整合は認められません。C2 の問題は強度差ではなく責務重複なので、C4 単体は clean です。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/pr-size-guide/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/pr-size-guide/SKILL.md", "condition": "C2",
      "verdict": "violation", "confidence": "high",
      "rationale": "統合方針は準備手順を新規 Skill(pr-self-check) に一本化し、差分の大きさの既存指針をそこへ吸収し、置き場をただ一つにすると明示している。pr-size-guide を変えずに維持すると『差分の大きさの目安』の責務が旧新2つの Skill に重複し、一本化方針と競合する。領域近接ではなく責務の実体的重複。",
      "evidence": ["spec.md#R1", "統合方針(§4): 新規Skillに一本化・既存の差分の大きさ指針を吸収・置き場はただ一つ", "対象実体: 差分の大きさの目安/分割の仕方/レビュー依頼"] },
    { "target": ".claude/skills/pr-size-guide/SKILL.md", "condition": "C4",
      "verdict": "clean", "confidence": "high",
      "rationale": "対象の強度は advisory、R1 の strength_needed も advisory で一致。constraints(hooks 可/mcp・plugins・experimental 不可)とも矛盾せず conflicts もなし。強度面の不整合は認められない。",
      "evidence": ["系統A: strength=advisory", "requirements: R1 strength_needed=advisory", "conflicts: (なし)"] }
  ]
}
```
