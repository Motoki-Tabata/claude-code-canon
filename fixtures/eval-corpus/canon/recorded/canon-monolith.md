# canon 軸 判定: canon-monolith

対象: `.claude/skills/dev-handbook/SKILL.md`（1ファイルのみ）

## 段階的開示（violation, high）

本 SKILL.md は本文冒頭で「本 Skill はこのプロジェクトの開発に関する事項を**1ファイルにすべて記す**」と明言し、実際に「環境構築」「コーディング規約」「テスト」「リリース」「トラブルシュート」という5つの独立したライフサイクル局面の情報を、supporting files への分離を一切せず単一の SKILL.md 本文に平置きしている。

`docs/L2_SKILLS.md §2.1` は Progressive Disclosure Loading の仕組みを「SKILL.md body が単一メッセージとして注入 → body 内で参照される supporting files（`template.md`, `examples/`, `scripts/` 等）は Claude が必要判断時に Read/Glob で取得」と定義しており、L2 の存在意義は「発動時に必要な分だけ段階的に開く」ことにある。本生成物はこの構造を持たず、発動する度に5局面すべての詳細（DB接続設定、行長規約、CI再試行回数、リリース手順、トラブルシュート手順）が無差別に一括注入される。

さらに `docs/L2_SKILLS.md §1.3`（採用すべきでない状況 DON'T）は「常時必要な静的知識（コード規約・環境変数等）→ L1 CLAUDE.md」と明記している。本ファイルの「コーディング規約」セクションはまさにこの静的知識に該当し、L2 Skill として置く理由が成立しない（L1/L2 のレイヤー取り違え）。また「リリース」「トラブルシュート」は本来利用場面が排他的に異なる別関心事であり、1回の発動で無関係な情報まで注入される設計は `§4.2`「500行超の SKILL.md body（auto-compaction 時に切り詰められる）」を避けるべしとする趣旨（=本文を薄く保ち詳細は分離する）にも反する。行数自体は56行と短いが、問題は行数ではなく「本来分離すべき複数責務を意図的に1ファイルへ集約している」設計判断そのものである。

## description の委譲トリガー品質（violation, high）

`description: The development handbook. Use for development.` は、`docs/L2_SKILLS.md §4.2`（避けるべき使い方 Don't）が名指しで警告する曖昧 description の典型例（"Helpful skill" など）と同種であり、「development」という語が開発全般を無差別に指すため、いつ委譲すべきかの具体的トリガーが存在しない。

`§4.1`（推奨される使い方 Do）は「具体的なトリガーフレーズを含める：『when the user asks what changed』など自然な表現」を求めており、`docs/L3_AGENTS.md` の description 実例（例: "Delegate when Claude needs to investigate a problem or gather background information."）も同様に条件文の形で委譲条件を具体化している。本 description にはそうした条件文が皆無で、「他の役割と識別可能か」の観点でも、テスト用スキルやリリース用スキルなど責務が近い他 Skill が存在した場合に確実に誤発火/未発火のいずれかを起こす。抽象的すぎて発火条件が不明瞭かつ広すぎて誤発火しうる、両方の問題を併せ持つ記述である。

```json
{
  "axis": "canon",
  "ts": "corpus",
  "coverage": [".claude/skills/dev-handbook/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/dev-handbook/SKILL.md",
      "condition": null,
      "verdict": "violation",
      "confidence": "high",
      "rationale": "段階的開示違反: 本文冒頭で『1ファイルにすべて記す』と明言し、環境構築/コーディング規約/テスト/リリース/トラブルシュートの5つの独立局面をsupporting filesへ分離せず単一SKILL.mdに平置きしている。発動の度に無関係な情報まで一括注入され、L2のオンデマンド性が機能していない。加えて『コーディング規約』は常時必要な静的知識でありL1 CLAUDE.mdに属すレイヤー取り違えでもある。description委譲トリガー品質も違反: 'The development handbook. Use for development.' は具体的な委譲条件（いつ・どのような要求で発動すべきか）を一切持たず、正典が名指しで警告する曖昧descriptionの典型例に該当し、他の開発関連スキルと識別不能で誤発火/未発火のリスクが高い。",
      "evidence": [
        "L2_SKILLS.md §2.1 Progressive Disclosure Loadingの仕組み（SKILL.md body注入と参照ファイルの必要時取得の分離）",
        "L2_SKILLS.md §1.3 採用すべきでない状況（DON'T）: 常時必要な静的知識はL1 CLAUDE.mdへ",
        "L2_SKILLS.md §4.2 避けるべき使い方（Don't）: descriptionを曖昧にする（\"Helpful skill\"など）→ Claudeが発動しない",
        "L2_SKILLS.md §4.1 推奨される使い方（Do）: 具体的なトリガーフレーズを含める",
        "L3_AGENTS.md descriptionフィールド例（条件文形式で委譲条件を明示する実例）"
      ]
    }
  ]
}
```
