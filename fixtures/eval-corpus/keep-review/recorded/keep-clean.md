# eval 判定結果: keep-review 軸

- ts: `20260723_LIVE`
- case_id: `claude_skills_release_notes_SKILL_md`
- target: `.claude/skills/release-notes/SKILL.md`
- disposition: `keep`
- 回付条件: C2, C4

## 対象の事実整理

対象は L2 Skill `release-notes`（strength: advisory）。責務は「タグ間のマージ済み PR 題名を
集めてリリースノートの下書きを作る手順の提示」であり、判断は人間に委ねる雛形提示に留まる。
`customization_refs` は空、`project_refs` も無し。他カスタマイズとの参照結合は無い。

新要件は R1 のみ:「テスト実行手順（`npm test` の前提と落ちたときの見方）を CLAUDE.md に
明記する」。`strength_needed: advisory` / `priority: must`。統合方針は「CLAUDE.md にテスト手順の
節を新設する。既存の Skill 群には手を入れない」。conflicts は無し。

## C2 要件非抵触

- **責務の重複が無い**。R1 が扱うのはテスト実行手順（`npm test` の前提・失敗時の読み方）で、
  置き場は L1 の CLAUDE.md。対象 Skill が扱うのはリリースノートの下書き作成手順で、
  リリース準備時に発火する L2 の作業手順。両者は発火契機（テスト実行時 / リリース準備時）も
  扱う対象（テスト結果の解釈 / マージ済み PR 題名）も重ならない。「同じ責務の置き場が2つになる」
  状態は生じない。
- **方針との競合が無い**。統合方針は R1 の受け皿を CLAUDE.md に一本化すると同時に、
  「既存の Skill 群には手を入れない」と明示している。維持は方針そのものと一致しており、
  一本化を求められている観点を二重に保持する構図にもならない。
- 「開発ワークフロー周辺」という点で領域は近いが、判定規準どおり領域の近さのみでは違反にしない。
  責務が実際に重なる箇所は無い。

→ C2: clean（confidence: high）

## C4 強度整合

- R1 の `strength_needed` は `advisory`。R1 の担い手は新設される CLAUDE.md のテスト手順節であり、
  対象 Skill は R1 の担い手ではない。よって「advisory な既存が deterministic な要件を担ってしまう」
  という典型的な矛盾は発生しない。
- 対象 Skill 自身の強度 advisory は、その責務（人間が判断する下書きの雛形提示）に対して整合的で、
  この責務に deterministic/enforced を要求する要件も constraints も存在しない。
- constraints（hooks: true、mcp/plugins/experimental: false）は、対象が素の L2 Skill であるため
  いずれにも抵触しない。強度を引き上げる必要を生む constraints も conflicts も無い。

→ C4: clean（confidence: high）

## 総評

回付された2条件とも違反なし。維持は統合方針の明示（既存 Skill 群には手を入れない）と一致し、
責務・強度いずれの面でも R1 と干渉しない。低確信として残すべき論点も見当たらなかった。

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/release-notes/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/release-notes/SKILL.md",
      "condition": "C2",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "R1 はテスト実行手順を CLAUDE.md に置く要件で、本 Skill のリリースノート下書き責務とは発火契機も対象も重ならない。統合方針も『既存の Skill 群には手を入れない』と明示しており、維持は方針と競合しない",
      "evidence": ["spec.md#R1", "統合方針", "系統A: strength=advisory, customization_refs=[]"]
    },
    {
      "target": ".claude/skills/release-notes/SKILL.md",
      "condition": "C4",
      "verdict": "clean",
      "confidence": "high",
      "rationale": "R1 の strength_needed は advisory で担い手は CLAUDE.md 側。本 Skill は R1 を担わず、自身の advisory 強度も『人間が判断する雛形提示』という責務に整合する。強度引き上げを要求する constraints も conflicts も存在しない",
      "evidence": ["requirements#R1.strength_needed=advisory", "constraints", "conflicts=(なし)", "系統A: strength=advisory"]
    }
  ]
}
```
