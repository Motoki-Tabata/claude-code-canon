# keep-review 判定: c2-domain-keyword-clean

**対象**: `.claude/skills/cache-invalidation-faq/SKILL.md`（layer L2 / kind skill / strength advisory / disposition keep / judge_conditions=[C2, C4]）

## C2 要件非抵触 → clean（confidence: high）
- 既存 Skill は本文冒頭で「接続設定そのものは扱わない」と明示し、扱う責務は無効化タイミング・stale 診断・手動削除に限定されている。
- R1 が担うのは接続設定（host/port/auth/TLS）で、責務が実際に重ならない。
- 統合方針が「接続設定＝新規 Skill」「無効化 FAQ＝別責務で維持」と役割を明示的に分離しており、置き場が二重化しない。両者とも Redis という領域が近いだけで、責務は分かれている（領域近接は違反にしない規準どおり）。
- conflicts は「なし」で、競合の根拠もない。

## C4 強度整合 → clean（confidence: high）
- 既存の強度は advisory。R1 の strength_needed も advisory で一致し、矛盾しない。
- constraints（hooks 可 / mcp・plugins・experimental 不可）に既存が抵触する要素はない（既存は素の Skill 手順書で、これらの機能を使っていない）。
- 「advisory な手順書が deterministic な要件を担う」型の強度不足も発生しない。

## 補足
バンドルには designer の keep_conditions 宣言・rationale は含まれておらず（§16.3 どおり）、上記は列挙された事実のみから独立に導いた結論。責務分離と強度一致が事実として確認できたため high とした（迷いを握り潰した clean ではない）。

```json
{
  "axis": "keep-review",
  "ts": "corpus",
  "coverage": [".claude/skills/cache-invalidation-faq/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/cache-invalidation-faq/SKILL.md", "condition": "C2",
      "verdict": "clean", "confidence": "high",
      "rationale": "既存は『接続設定そのものは扱わない』と明示し責務が無効化タイミング・stale診断・手動削除に限定される。R1は接続設定(host/port/auth/TLS)の新規Skillで責務が重ならず、統合方針も両責務を明示的に分離。Redisという領域が近いだけで重複・競合はない。",
      "evidence": ["対象本文『接続設定そのものは扱わない』", "spec#R1", "統合方針(責務分離)", "conflicts=なし"] },
    { "target": ".claude/skills/cache-invalidation-faq/SKILL.md", "condition": "C4",
      "verdict": "clean", "confidence": "high",
      "rationale": "既存の強度advisoryとR1のstrength_needed=advisoryが一致し矛盾しない。constraints(mcp/plugins/experimental不可)に抵触する機能利用もなく、advisoryで担うべき責務に対する強度不足も生じない。",
      "evidence": ["系統A strength: advisory", "requirements R1 strength_needed: advisory", "constraints"] }
  ]
}
```
