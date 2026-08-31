# canon 軸 判定: canon-good-desc

対象: `.claude/agents/migration-rollback-reviewer/migration-rollback-reviewer.md`（Subagent 定義、L3）

## 1. 段階的開示（L2_SKILLS.md の原則を L3 定義に照らして確認）

`L2_SKILLS.md` が定める「SKILL.md を入口とし詳細を必要時に開く」段階的開示は、本来 SKILL.md（複数ファイル・参照資料を持ちうるワークフローパッケージ）を対象にした原則である。本ターゲットは L3 Subagent 定義であり、単一ファイル（`name`/`description`/`tools`/`model` の frontmatter + 2文のシステムプロンプト）で完結している。

内容を見ると、確認すべき観点（down スクリプト有無・データ喪失防止・保守時間帯）を列挙するのみで、具体的な検査手順・コマンド列・大量の参照資料を1ファイルに詰め込んでいる形跡はない。むしろ `tools: Read Grep Glob` の読み取り専用構成と合わせ、「専門ドメインを反復的に委譲する」L3 のミニマルな定義として適正な分量である（`L3_AGENTS.md` §5.1 の Example 1/2 も同程度の分量）。詰め込み過多は認められない。段階的開示の観点で問題なし。

## 2. `description` の委譲トリガー品質（L3_AGENTS.md）

```
description: Review database migration PRs for rollback safety — down-script presence, data-loss guards, and maintenance-window timing. Use when a PR adds or edits files under migrations/.
```

- **具体性**: 対象ドメイン（DB migration PR）、確認観点3点（down-script presence / data-loss guards / maintenance-window timing）、発火条件（`migrations/` 配下のファイル追加・編集）が明記されている。`L3_AGENTS.md` §2.1 の公式 Example 2（"Review code for security vulnerabilities including injection, auth issues, and data exposure. Delegate for security-focused code review."）と比較しても、本ターゲットは "Use when ..." による明示的なトリガー条件を追加で持ち、委譲判断に使う情報量がむしろ上回る。
- **識別可能性**: 一般的な "code review" や "security review" 系の subagent とは、DB migration の rollback 安全性という狭い専門領域で明確に切り分けられており、責務が重複して誤発火する曖昧さは見られない。
- **広すぎ／狭すぎのバランス**: `migrations/` 配下編集という具体的なファイルパス条件で発火範囲を絞りつつ、確認観点は3点に限定されており、抽象的すぎて発火しない／広すぎて誤発火するいずれの失敗様式にも該当しない。

委譲トリガー品質は良好。

## 3. レイヤーの当てはまり（00_INDEX.md §4）

- 本責務は「反復的に発生する専門ドメインのレビュー（PR ごとの巻き戻し安全性チェック）」であり、`00_INDEX.md` §4.2 の分岐（実装作業を伴う・並列不要・逐次専門タスク → L3 Subagent）に合致する。
- `L3_AGENTS.md` §5.1 の「Subagent を作るべきケース」の3.（ツール制限が必要な read-only ワーカー）・4.（専門ドメイン: security review 等）にそのまま当てはまる。`tools: Read Grep Glob` で書き込み系ツールを持たせていない点も、read-only verification の設計と整合する。
- L1（常時ロードの静的知識）に置くべき性質のものではない（PR ごとに条件発火する専門レビューであり「毎セッション必ず必要」ではない）。L2 Skill（メイン Claude が使う繰り返しチェックリスト）としても成立し得るが、「専門担当を継続的役割として持たせ、結果のみ返却させたい」という設計は `00_INDEX.md` §4.1 の L2/L3 使い分け表（「専門担当の継続的役割（タスク委譲が主）」→ L3）にも合致し、L3 選択が不当とは言えない。

レイヤーの取り違え（L1 に手続きを詰め込む・L3 に静的知識を置く等）は見当たらない。

## 結論

3観点いずれも canon の趣旨に適合しており、違反は検出されなかった。

```json
{
  "axis": "canon",
  "ts": "corpus",
  "coverage": [".claude/agents/migration-rollback-reviewer/migration-rollback-reviewer.md"],
  "findings": [
    {
      "target": ".claude/agents/migration-rollback-reviewer/migration-rollback-reviewer.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "high",
      "rationale": "単一ファイルの Subagent 定義として分量が適正であり、手順や参照資料を過剰に1ファイルへ詰め込んでいる形跡はない（読み取り専用ツール構成とも整合）。段階的開示の観点で問題なし。",
      "evidence": ["L2_SKILLS.md#1.1", "L3_AGENTS.md#2.1 frontmatter完全リファレンス"]
    },
    {
      "target": ".claude/agents/migration-rollback-reviewer/migration-rollback-reviewer.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "high",
      "rationale": "description が対象ドメイン・確認観点3点・発火条件（migrations/配下の追加編集）を具体的に明記しており、他の code review / security review 系 subagent と役割が識別可能。公式 Example よりトリガー情報が明示的で、抽象的すぎる／広すぎるいずれの失敗様式にも該当しない。",
      "evidence": ["L3_AGENTS.md#2.1 frontmatter完全リファレンス（description: 最大1536文字、delegation判断に使う）", "L3_AGENTS.md#2.1 公式コード例 Example 2"]
    },
    {
      "target": ".claude/agents/migration-rollback-reviewer/migration-rollback-reviewer.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "反復的・専門ドメイン・read-only verification という性質は00_INDEX §4.2およびL3_AGENTS §5.1のSubagent採用基準に合致し、L1（常時静的知識）やL2（メインが直接使う繰り返しチェックリスト）との取り違えは認められない。ただしL2 Skillとしても成立し得る責務であり、L3選択の絶対的な必然性までは判断材料から確定できないためconfidenceはmediumとする。",
      "evidence": ["00_INDEX.md#4.2 サブツリー: 並列性・隔離（L3への分岐）", "L3_AGENTS.md#5.1 Subagentを作るべきケース"]
    }
  ]
}
```
