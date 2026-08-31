# eval: keep-review（ts: 20260723_LIVE）

判定対象: `.claude/skills/pr-review-checklist/SKILL.md`（disposition: keep / 回付条件: C2, C4）

## C2 要件非抵触 — violation（confidence: high）

対象 Skill の実体は、本文で「命名・エラーハンドリング・テスト追加・依存追加の妥当性・公開 API の
後方互換の5観点」を自ら列挙し、さらに「観点の追加はこのファイルを編集して行う」と明記している。
すなわちこの Skill は **レビュー観点の保持場所そのもの**であり、単に領域が近いだけの存在ではない。

一方、spec の統合方針は「レビュー観点の置き場を **code-reviewer Subagent の1箇所に寄せる**。
観点を保持する既存カスタマイズは、集約後に同じ役割を二重に持たない状態にする」と明示している。
確定要件 R1 も priority: must で「レビュー観点を code-reviewer Subagent に一本化する」と定めている。
R1 の rationale（観点が複数箇所に散り、どれが最新か分からない）と project_grounding
（`.github/pull_request_template.md` と Skill に同じ観点が重複記載）は、この Skill が
まさに解消対象の重複源の一方であることを事実として示している。

この既存を**変えずに維持**すると、レビュー観点の置き場が code-reviewer Subagent と本 Skill の
2箇所に残る。これは quality-checklist の定義における「重複（同じ責務の置き場が2つになる）」に
そのまま該当し、同時に「統合方針が一本化を求めているのに二重化が残る」という競合にも該当する。
統合方針は本 Skill に別役割を割り当てて役割分担を明示してもいない（統合方針は「同じ役割を
二重に持たない状態にする」と、むしろ逆を要求している）。したがって C2 は満たされない。
確信度は高い — 対象の実体・統合方針・R1 の三つが同一方向を指しており、解釈の余地が乏しい。

## C4 強度整合 — clean（confidence: high）

系統A の棚卸し事実では本対象の `strength: advisory`、L2 Skill。確定要件 R1 の
`strength_needed: advisory` と一致しており、強度の不足も過剰もない。constraints
（hooks: true / mcp・plugins・experimental: false）は L2 Skill の advisory 運用と抵触せず、
conflicts も「（なし）」で強度に関する衝突は登録されていない。
「advisory の手順書で deterministic な要件を担う」型の矛盾は存在しない。

なお C2 で指摘した重複は**責務の配置**の問題であり、強度そのものの矛盾ではないため、
C4 側では violation としない（軸を混ぜて二重計上しない）。

## 総括

C4 は整合するが、C2 が high 確信の violation。維持は「変えない」判断ゆえ diff に現れないため、
この二重化は P5 の人間確認で明示的に扱われるべきである。是正の方向としては
keep ではなく merge（merge_target: code-reviewer Subagent）または retire が自然だが、
disposition の決定は本 judge の権限外であり、ここでは条件不成立の事実のみを記録する。

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/pr-review-checklist/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/pr-review-checklist/SKILL.md",
      "condition": "C2",
      "verdict": "violation",
      "confidence": "high",
      "rationale": "対象 Skill 自身がレビュー観点5点を列挙し「観点の追加はこのファイルを編集して行う」と観点の保持場所であることを明言している。統合方針は観点の置き場を code-reviewer Subagent の1箇所に寄せ既存が同じ役割を二重に持たない状態を求めており、変えずに維持すると観点の置き場が2箇所に残るため重複かつ一本化方針との競合になる。",
      "evidence": ["spec.md#R1", "統合方針", "対象の実体（観点5点の列挙と編集手順の記述）"]
    },
    {
      "target": ".claude/skills/pr-review-checklist/SKILL.md",
      "condition": "C4",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "系統A の strength: advisory は R1 の strength_needed: advisory と一致し、constraints にも conflicts にも強度上の矛盾はない。advisory で deterministic 要件を担う型の不整合は存在しない。",
      "evidence": ["系統A#strength", "requirements#R1.strength_needed", "constraints", "conflicts（なし）"]
    }
  ]
}
```
