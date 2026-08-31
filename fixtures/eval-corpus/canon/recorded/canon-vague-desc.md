# canon 軸 判定結果: canon-vague-desc

## 対象
- `.claude/agents/helper/helper.md`（Subagent 定義、単一ファイル）

## 判定

### `description` の委譲トリガー品質 — 違反

対象の `description` は次の通り。

```
description: Helps with the code. Use when you need help.
```

`docs/L3_AGENTS.md` は自動 delegation の仕組みを「メイン Claude がユーザー要求を分析 → 利用可能な
Subagent の `description` と照合 → マッチしたら delegation」と説明し（§2.1「仕組み」1〜3）、
delegation 経路の表で「（構文なし。Claude が `description` で判断） / description の精度が的中率を
決める」と明記している（§2.1「Subagent の呼び出し経路と識別子」）。同ファイルが挙げる良い例は
「Research a topic by exploring documentation, finding relevant examples, and summarizing
findings. Delegate when Claude needs to investigate a problem or gather background information.」
（research agent の例）や「Review code for security vulnerabilities including injection, auth
issues, and data exposure. Delegate for security-focused code review.」（security-review agent の
例）であり、いずれも「どの領域の・どの種類のタスクで・いつ委譲するか」を具体的に書いている。

これに対し `helper.md` の description は次の点で委譲トリガーとして機能しない。

1. **抽象的すぎて発火条件が不明**: 「Helps with the code」はコードに関するあらゆる作業（実装・
   レビュー・デバッグ・リファクタ・テスト等）を指しうる。「code」以外の限定語が一切なく、対象
   ドメイン・専門性が特定できない。
2. **トリガー句が同語反復**: 「Use when you need help」は「helper」という名前を言い換えただけで、
   具体的な状況（ファイル種別・作業フェーズ・キーワード・エラー種別など）を一切示していない。
   これでは Claude がどの要求でこの Subagent に委譲すべきかを判断する材料にならない。
3. **他ロールとの識別不能**: 本システムには investigation / eval-* / summarizer 等、専門特化した
   多数の Subagent が存在しうる想定だが、この description は「コードに関する困りごと全般」を
   カバーしてしまうため、より専門的な Subagent が担うべきタスクにも広く誤発火しうる。逆に、
   具体性が無いため Claude が「これは helper 向けか」を判断できず、実際には発火せず埋没する
   リスクもある——広すぎる誤発火と、具体性の欠如による不発火の両方の懸念を併せ持つ、
   典型的な「委譲トリガーとして機能しない description」である。

body 側も「困っていることに対応します」の一文のみで、description の曖昧さを補う具体的な役割
定義（対応スコープ・手順・出力形式）が無く、専門委譲先としての識別性をさらに欠く。

### 段階的開示 — 該当性なし（本件では判断材料が不足）

対象は `.claude/agents/<name>/<name>.md` 形式の単一ファイルの Subagent 定義であり、
`docs/L2_SKILLS.md` が扱う SKILL.md の「入口 + 詳細ファイルへの段階的開示」という多階層構成の
問題は、この生成物の構造には直接当てはまらない（L3 の Subagent 定義は 1 ファイル完結が通常の
形態であり、複数ファイルへの分割自体が求められる構造ではない）。本文がわずか1文であることは
内容の空疎さの問題であり、「全てを1ファイルに詰め込んでいる」という段階的開示違反の形とは
異なる。よって段階的開示の観点では明確な違反とは判定しない。ただし description の不備と
併せ、この Subagent 定義全体が L3 に期待される「専門委譲先としての識別可能な役割定義」を
欠いている点は上記の description 違反として計上した。

## 総合

`.claude/agents/helper/helper.md` は **description の委譲トリガー品質で明確な違反**。抽象的すぎる
記述により、他の専門 Subagent との識別ができず、的中率の高い自動委譲を成立させられない。

```json
{
  "axis": "canon",
  "ts": "corpus",
  "coverage": [".claude/agents/helper/helper.md"],
  "findings": [
    {
      "target": ".claude/agents/helper/helper.md",
      "condition": null,
      "verdict": "violation",
      "confidence": "high",
      "rationale": "description が『Helps with the code. Use when you need help.』のみで、対象ドメイン・トリガー条件・他ロールとの識別点を一切示していない。docs/L3_AGENTS.md は自動delegationが『Claude がdescriptionで判断』する仕組みであり『descriptionの精度が的中率を決める』と明記し、良い例として『Research a topic by...Delegate when Claude needs to investigate...』のような具体的トリガー句を挙げている。本対象はこの水準を満たさず、抽象的すぎて発火条件が不明・広すぎて他の専門Subagentとの誤発火/不発火の双方のリスクを持つ。body も『困っていることに対応します』の一文のみで役割の具体化がない。段階的開示については、L3のSubagent定義は単一ファイル完結が通常形態であり、本件の構造単体では明確な違反とは判定しない。",
      "evidence": [
        "docs/L3_AGENTS.md §2.1「仕組み」1〜3（description と照合して delegation）",
        "docs/L3_AGENTS.md §2.1「Subagent の呼び出し経路と識別子」表: 『description の精度が的中率を決める』",
        "docs/L3_AGENTS.md 良い例（research/security-review agent の description: 具体的トリガー句 Delegate when...）",
        "helper.md frontmatter description: 'Helps with the code. Use when you need help.'"
      ]
    }
  ]
}
```
