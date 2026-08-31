# eval: keep-review 判定結果（ts: corpus・judge 改訂後 再収録 2026-08-12）

対象: `.claude/skills/db-rollback-steps/SKILL.md`（disposition: merge / judge_conditions: merge_target）

## merge_target — violation (high)

統合元 db-rollback-steps の中核責務は**巻き戻し**（down スクリプト確認・revert 手順・巻き戻し後
スモーク・ダンプ復元）。統合先 db-migration-guide の実体が内包するのは作成・適用・適用状況確認のみで、
**巻き戻しの中核手順が一切存在しない**。共有されるのは「適用前にダンプ」「本番は保守時間帯」だけで、
これはいずれも適用（up）側の記述であり、巻き戻し（down）側の中核手順ではない。

トピックの近さと周辺記述の一致があるだけで、巻き戻しの中核責務はゼロ＝部分吸収。R1（作成・適用・
巻き戻しを1つに集約）の巻き戻しも未達になる。これを「生成の未完成＝別軸の問題」として見送ることは
merge_target 規準が明示的に禁じており（吸収を見る検査は他に無い）、merge_target 違反と判定する。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/db-rollback-steps/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/db-rollback-steps/SKILL.md", "condition": "merge_target",
      "verdict": "violation", "confidence": "high",
      "rationale": "統合元 db-rollback-steps の中核責務は『巻き戻し』（down スクリプト確認・revert 手順・巻き戻し後スモーク・ダンプ復元）だが、統合先 db-migration-guide の実体には巻き戻し手順が一切無く、作成・適用・適用状況確認のみ。共有されるのは適用側の『保守時間帯・ダンプ』のみで中核責務を吸収していない部分吸収であり、R1 の『巻き戻しを集約』も未達になる",
      "evidence": ["統合先の実体(db-migration-guide 本文に rollback 節が無い)", "spec.md#R1", "統合方針"] }
  ]
}
```
