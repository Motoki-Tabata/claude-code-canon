# eval / keep-review: c4-strength-gap

対象: `.claude/skills/secret-hygiene/SKILL.md`（disposition: keep, 回付条件: C2 / C4）

判定材料はバンドル記載の事実のみ。designer の `keep_conditions` 宣言・rationale はバンドルに
含まれていないことを確認済みで、判定に用いていない（§16.3）。

## 事実の整理

- 対象の実体（原本全文）は「`.env` を使う・`.gitignore` に入れる・**コミット前に目視で確認する**」
  の3点を案内する手順書であり、本文自身が「**強制力は無く、読み手の遵守に依存する**」と明記している。
- 系統A: `layer: L2` / `kind: skill` / `strength: advisory` / 参照は customization・project とも無し。
- spec R1: 「認証情報を含むコミットを機械的に阻止する（**人の注意に依存しない**）」。
  rationale は API キーの2度のコミットと履歴書き換え。project_grounding は hooks 未設定。
- 統合方針: 阻止の担い手は新設 PreToolUse Hook。既存の手順書 Skill は
  「**Hook が弾いたときの背景説明**」として位置づけ、役割の重複は無いものとして扱う。
- requirements: R1 の `strength_needed: deterministic` / `priority: must`。
  constraints は hooks のみ allowed（決定論的阻止のため）。conflicts は無し。

## C2（要件非抵触）

新要件 R1 の「阻止」という責務は新設 Hook が単独で担い、統合方針が既存 Skill を
「Hook が弾いたときの背景説明」と**明示的に役割分担している**。したがって
「同じ責務の置き場が2つになる」型の重複には当たらない。領域（secret の取り扱い）が
近接しているだけで違反にはしない、という判定規準にも合致する。

また constraints 上 hooks は allowed であり、既存 Skill を維持することが
新要件の方針（一本化・機械的阻止）を妨げる構造にもなっていない。conflicts も空である。

→ **clean（confidence: medium）**。ただし「重複無し」は統合方針の宣言によって成立している
ものであり、既存本文が Hook の存在に一切言及しない点は C4 側の問題として下に切り出す。

## C4（強度整合）

R1 の `strength_needed` は `deterministic`、priority は `must`。一方この既存の
`strength` は `advisory` である。判定規準は「統合方針が既存を補助的役割に位置づけているなら、
強度差は**それ自体では**矛盾にならない」と定めており、本件は確かに補助的役割づけがある。

しかし本件には「強度差それ自体」を超える具体的な不整合がある。

1. 実体の本文は自らを「認証情報をリポジトリに入れないための**手順**を説明する」と定義し、
   その手段として「**コミット前に目視で確認する**」を案内している。これは R1 の want に
   括弧書きで明記された「**人の注意に依存しない**」という要求と正面から食い違う手段である。
2. disposition が `keep`（＝一字も変えない）である以上、この本文は将来も
   「目視確認が防止手段である」と読み手に提示し続ける。統合方針が言う
   「Hook が弾いたときの背景説明」という位置づけは spec 側の文書にしか存在せず、
   成果物自身には Hook への参照も、阻止の担い手が別にある旨の記述も無い
   （`customization_refs: []` がその裏づけ）。
3. 結果として、deterministic が要求される must 要件の領域で、advisory の成果物が
   「防止の手順書」を名乗ったまま残る。これは「手順書（advisory）で deterministic な要件を
   担う」という典型的な矛盾の形に該当する。補助化は宣言されているが、成果物には反映されていない。

なお、Hook の実在性や参照解決は決定論ゲート（G6/G7/G8）の領分であり、ここでは再判定していない。
指摘しているのは「keep された advisory 成果物の記述内容が、R1 の strength と食い違う」点のみである。

補助的役割づけという反対解釈が明示的に判定規準に存在するため、確信度は medium とする
（握り潰さず P5 の人間確認に回す方が、非対称なリスクに照らして適切である）。

→ **violation（confidence: medium）**。keep ではなく modify（本文から目視確認を防止手段として
提示する記述を外し、Hook を担い手として明示する）であれば整合しうる。

```json
{
  "axis": "keep-review",
  "ts": "20260723_LIVE",
  "coverage": [".claude/skills/secret-hygiene/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/secret-hygiene/SKILL.md",
      "condition": "C2",
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "統合方針が阻止の担い手を新設 PreToolUse Hook に一本化し、既存 Skill を「Hook が弾いたときの背景説明」として明示的に役割分担しているため、同じ責務の置き場が2つになる重複には当たらない。conflicts も空で、維持が新要件の方針を妨げる構造も無い。",
      "evidence": ["spec: 統合方針（§4）", "requirements: conflicts（なし）", "系統A: customization_refs: []"]
    },
    {
      "target": ".claude/skills/secret-hygiene/SKILL.md",
      "condition": "C4",
      "verdict": "violation",
      "confidence": "medium",
      "rationale": "R1 は strength_needed: deterministic かつ must で、want に「人の注意に依存しない」と明記されている。一方 keep 対象は strength: advisory で、本文が防止手段として「コミット前に目視で確認する」を案内し「強制力は無く、読み手の遵守に依存する」と自認している。統合方針は補助化を宣言するが、keep は無改変であり成果物側に Hook への言及も担い手の移譲も無い（customization_refs: []）ため、advisory の手順書が deterministic な must 要件の防止手段を名乗ったまま残る。",
      "evidence": ["対象の実体（コミット前に目視で確認する／強制力は無く、読み手の遵守に依存する）", "系統A: strength: advisory", "requirements: R1 strength_needed: deterministic, priority: must", "spec: R1 want（人の注意に依存しない）"]
    }
  ]
}
```
