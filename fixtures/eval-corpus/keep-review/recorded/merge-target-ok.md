# eval: keep-review 判定結果（ts: corpus・judge 改訂後 再収録 2026-08-12）

対象: `.claude/skills/commit-message-rules/SKILL.md`（disposition: merge / judge_conditions: merge_target）

## merge_target — clean (high)

統合元 commit-message-rules の中核責務はコミットメッセージ規約（件名 `<type>: <要約>`／
type=feat/fix/docs/chore／本文72桁折り返し／BREAKING CHANGE を本文先頭）。統合先
contribution-rules の「## コミット」節を実体で確認すると、上記が**一字一句そのまま内包**され、
落ちている中核手順は無い。加えて「## プルリクエスト」節を持ち、統合方針（§4「コミット規約と
PR 規約を contribution-rules へ統合する」）・R1 と役割が正しく合致する。

統合先は統合元の中核責務を**部分的でなく完全に**吸収しており、merge_target は妥当（clean）。
（改訂後の内容吸収規準でも clean を維持＝改訂が「何でも violation」への退化でないことの確認。）

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/commit-message-rules/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/commit-message-rules/SKILL.md", "condition": "merge_target",
      "verdict": "clean", "confidence": "high",
      "rationale": "統合先 contribution-rules の『コミット』節が、対象の中核責務（件名 <type>: <要約>／type=feat/fix/docs/chore／本文72桁折り返し／BREAKING CHANGE を本文先頭）を一字一句そのまま内包しており、中核手順の欠落がない。統合方針(§4)および R1 が両規約の一本化を求めており役割が実際に重なる。",
      "evidence": ["統合先の実体#コミット節", "spec統合方針§4", "requirements#R1"] }
  ]
}
```
