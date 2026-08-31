# eval: keep-review 判定結果（ts: corpus・judge 改訂後 再収録 2026-08-12）

対象: `.claude/skills/db-migration/SKILL.md`（disposition: merge / judge_conditions: merge_target）

## merge_target — violation (high)

統合元 db-migration の中核責務は DB マイグレーションの作成・適用・巻き戻し（適用前ダンプ、down
スクリプト存在確認、本番は保守時間帯限定）。統合先 contribution-rules の実体はコミット件名
フォーマットと PR 本文要件のみで、**マイグレーションに関する記述は一切ない**。spec の統合方針は
「コミット規約と PR 規約を contribution-rules へ統合する。スキーマ運用の手順は本要件の対象外」と
明記しており、この skill を contribution-rules へ寄せる根拠は spec 内に存在しない。

統合先は統合元の中核責務を**全く内包していない**（部分的吸収ですらなくゼロ）。トピックも
ライフサイクルも重ならない（コミット/PR 作法 vs スキーマ運用手順）。責務が重ならない先へ寄せる
不当な merge であり、merge_target 違反。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/db-migration/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/db-migration/SKILL.md", "condition": "merge_target",
      "verdict": "violation", "confidence": "high",
      "rationale": "統合先 contribution-rules はコミット/PR 規約のみを扱い、統合元 db-migration の中核責務（マイグレーションの適用・巻き戻し・ダンプ・保守時間帯運用）を一切内包していない。統合方針(§4)自身が『スキーマ運用の手順は本要件の対象外』と明言しており、責務が重ならない先へ寄せる不当な merge。トピック・ライフサイクルとも重ならず吸収は成立しない。",
      "evidence": ["統合先の実体（contribution-rules 本文にマイグレーション記述なし）", "spec 統合方針§4（スキーマ運用は対象外）", "対象の実体（db-migration の中核手順）"] }
  ]
}
```
