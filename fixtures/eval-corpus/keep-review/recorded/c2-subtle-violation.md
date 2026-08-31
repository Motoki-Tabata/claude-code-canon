# eval: keep-review 判定結果（ts: 20260723_LIVE）

対象: `.claude/skills/onboarding-guide/SKILL.md`（disposition: keep / judge_conditions: C2, C4）

## C2 要件非抵触 — violation (high)

統合方針は「**テスト手順の記述は CLAUDE.md に集約し、他所には残さない**」と明示的に一本化を
求めている。R1 の rationale も「テスト手順の記述が複数箇所にあり、Docker 前提の記述が古いまま
残っている箇所がある」であり、要件の主眼は重複した手順の除去そのものである。

対象の実体には `## テストの回し方` セクションが存在し、以下を具体的に記述している。

- `npm test` は統合テストを含むため Docker が要る
- 失敗時は `logs/test.log` の最後のスタックトレースから読む
- 単体実行は `npm test -- --grep <名前>`

これは R1 の want（「テストの実行方法と失敗時の読み方」を CLAUDE.md に記載し唯一の出典にする）と
**責務が完全に一致する**。領域が近いだけではなく、実行方法・失敗時の読み方という同一の責務の
置き場が CLAUDE.md と本 SKILL.md の2箇所になる。したがって重複であり、かつ「他所には残さない」
という統合方針との競合でもある。

さらに、`project_grounding` は「package.json の test は docker compose 経由」とあり、本ファイルの
「Docker が要る」という記述自体は現時点では誤りではないが、要件が止めようとしている事故
（重複した手順が古びて誤った案内になる）の当事者がまさにこの記述である。無変更での維持は
要件の目的を直接損なう。

なお、統合方針は「参加者向けの案内そのものは引き続き必要」とも述べており、この skill の存在
自体（環境構築・ディレクトリの地図・連絡先）は否定されていない。違反はファイル全体ではなく
`## テストの回し方` セクションを無変更で残す点に限局される。しかし disposition が keep（変えずに
維持）である以上、そのセクションが残ることが確定するため、C2 は違反と判定する。

## C4 強度整合 — clean (high)

系統A の `strength: advisory` に対し、R1 の `strength_needed: advisory` であり強度は一致する。
R1 は「唯一の出典にする」という文書配置の要件であって、フックによる機械的強制を求めていない。
constraints は hooks のみ allowed だが、要件側が deterministic/enforced を要求していないため
advisory のままで矛盾しない。conflicts も (なし)。強度の観点での矛盾は認められない。

（C2 で指摘した問題は「どこに書くか」の重複であり、強度不足に起因するものではないため、
C4 に転嫁して二重に計上しない。）

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/onboarding-guide/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/onboarding-guide/SKILL.md",
      "condition": "C2",
      "verdict": "violation",
      "confidence": "high",
      "rationale": "統合方針が『テスト手順の記述は CLAUDE.md に集約し、他所には残さない』と一本化を明示しているのに、本ファイルの『テストの回し方』セクション（npm test の Docker 前提・logs/test.log の読み方・--grep 実行）が R1 の want と同一責務を担い続ける。無変更での維持は責務の重複であり統合方針との競合でもある。",
      "evidence": ["spec.md#R1", "統合方針: テスト手順の記述は CLAUDE.md に集約し、他所には残さない", "対象実体: ## テストの回し方 セクション"]
    },
    {
      "target": ".claude/skills/onboarding-guide/SKILL.md",
      "condition": "C4",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "系統A の strength: advisory と R1 の strength_needed: advisory が一致し、R1 は文書の出典一本化であって機械的強制を要求していない。conflicts も (なし) で、強度上の矛盾は認められない。",
      "evidence": ["系統A: strength: advisory", "requirements#R1 strength_needed: advisory", "conflicts: (なし)"]
    }
  ]
}
```
