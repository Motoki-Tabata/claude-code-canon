# eval: keep-review 判定結果

- ts: `20260723_LIVE`
- axis: `keep-review`
- 対象: `.claude/skills/api-error-catalog/SKILL.md`（disposition: keep）
- 回付条件: C2, C4

## C2 要件非抵触

新要件 R1 は「新しい API エンドポイントを追加する**手順**（ルータ登録・バリデーション・テスト）」を
新規 Skill 化するもの。対象の既存 Skill は「このサービスが返すエラーコード（E1001〜E1042）の**意味**と
一次切り分け」を引くための参照表であり、原本本文に「実装の変更手順は扱わない」と責務境界が
明示されている。frontmatter の `description` も委譲トリガーを「4xx/5xx レスポンスのデバッグ時」に
限定しており、エンドポイント追加作業では引かれない。

両者は `src/routes` という同じプロジェクト領域に接地している点で**領域は近い**が、
判定規準どおり「領域が近いだけでは違反にしない」。責務は
「障害時にコードの意味を引く参照資料」と「変更作業の実行手順」で実際には重ならず、
同じ責務の置き場が2つになる状態は生じない。

統合方針も「エンドポイント追加の手順を新規 Skill に置く。既存のエラーコード表は参照される側の
資料であり、手順書とは別の責務として維持する」と明示的に役割分割を宣言しており、一本化を
求めていない。したがって競合（方針との食い違い）も認められない。

→ **clean / confidence: high**

## C4 強度整合

系統A の棚卸し事実では既存の `strength` は `advisory`。要件 R1 の `strength_needed` も `advisory`
（priority: must）であり、強度の要求水準は一致する。

constraints は hooks / mcp / plugins / experimental をすべて `allowed: false` としているが、これらは
いずれも deterministic・enforced 側の強度を実現する機能であり、既存が advisory のままであることと
矛盾しない（むしろ組織ポリシー上、advisory 以上の強度を既存に求める余地がない）。
conflicts は「なし」で、強度に関する未解決の衝突も記録されていない。

対象は L2 Skill（参照資料）であり、advisory 以外の強度を担う設計にはなっていないが、
そもそも deterministic な要件を負っていないため「手順書（advisory）で deterministic な要件を担う」
類の矛盾は発生しない。

→ **clean / confidence: high**

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/api-error-catalog/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/api-error-catalog/SKILL.md",
      "condition": "C2",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "R1 は「エンドポイント追加手順」、既存は「エラーコードの意味の参照表」で責務が実際には重ならない。既存本文に『実装の変更手順は扱わない』と境界が明記され、統合方針も両者を別責務として維持すると明示的に役割分割している。src/routes という領域の近さだけでは重複とみなさない。",
      "evidence": ["spec.md#R1", "統合方針", ".claude/skills/api-error-catalog/SKILL.md 本文『実装の変更手順は扱わない』", "系統A: project_refs src/routes"]
    },
    {
      "target": ".claude/skills/api-error-catalog/SKILL.md",
      "condition": "C4",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "既存 strength は advisory、R1 の strength_needed も advisory で一致する。constraints は hooks/mcp/plugins/experimental を不可としており deterministic・enforced 強度を要求する経路自体が存在せず、conflicts も記録なし。advisory な参照資料が deterministic な要件を担う構図にはならない。",
      "evidence": ["系統A: strength: advisory", "requirements#R1 strength_needed: advisory", "constraints（hooks/mcp/plugins/experimental すべて allowed: false）", "conflicts: なし"]
    }
  ]
}
```
