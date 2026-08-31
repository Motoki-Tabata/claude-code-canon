# correctness 軸 判定: corr-a1-unmet

## 対象
`.claude/agents/auth-reviewer/auth-reviewer.md`（1件）

## 判定: A1 functional 未充足（violation）

spec の新要件 R1 は「認証トークンの失効（expiry / revocation）漏れをレビューする Subagent を用意する」ことであり、A1 の受け入れ基準は「生成された Subagent の指示が、レビュー時に『トークンの失効（expiry / revoked 判定）が実装・テストされているか』を実際に確認する手順を含んでいること」と明記している。

生成物 `auth-reviewer.md` の「見るところ」節は以下の4点のみである。

1. 命名が `src/auth/` の既存規約に沿っているか（キャメルケース・動詞始まり）
2. import の並び順（標準 → 外部 → 内部）
3. コメントが英語で書かれているか
4. 関数が1つの責務に収まっているか（30行超で分割を促す）

いずれも一般的なコードスタイル・構造規約のレビュー観点であり、認証トークンの失効判定（expiry / revocation）、`src/auth/revocation.js` の実装確認、あるいは `tests/auth/` における失効テストの有無を確認する手順は一切含まれていない。`description` は「認証まわりの変更をレビューする」と謳い委譲トリガーとしては機能しうるが、本文の実体は要件が名指しした「失効チェック漏れ」の検出という中核責務を全く覆っていない。これは「それらしい文書がある」だけで基準未達成の典型例であり、A1 は満たされていない。

## プロジェクト接地について

一方で、実在しないコマンド・スクリプト・パスを手順として記載しているわけではない（そもそも `src/auth/`, `npm test`, `tests/auth/` 等の系統B実態への言及自体が本文中に存在しない）。ハルシネーションによる誤った手順の記載という意味での接地違反は見られない。問題は「接地を誤った」のではなく「要件が求める確認手順そのものが欠落している」点にある。

## 結論

A1 は明確に unmet。confidence は high（要件の核心である失効/revocation という語も、それに対応する確認手順も生成物本文に一切出現しないため、解釈の余地がない）。

```json
{
  "axis": "correctness",
  "ts": "corpus",
  "coverage": [".claude/agents/auth-reviewer/auth-reviewer.md"],
  "findings": [
    {
      "target": ".claude/agents/auth-reviewer/auth-reviewer.md",
      "condition": null,
      "verdict": "violation",
      "confidence": "high",
      "rationale": "R1は「認証トークンの失効(expiry/revocation)漏れをレビューするSubagent」を要求し、A1は「失効(expiry/revoked判定)が実装・テストされているかを実際に確認する手順」を含むことを求める。しかし生成物の『見るところ』は命名規約・import順・コメント言語・関数行数という一般的なコードスタイル観点のみで構成されており、src/auth/revocation.jsの失効判定確認やtests/auth/の失効テスト確認に関する手順が一切存在しない。要件が求める中核責務(失効チェック漏れの検出)が生成物の実体に全く反映されていない。",
      "evidence": [
        "spec R1: 認証トークンの失効(expiry/revocation)漏れをレビューするSubagentを用意する",
        "spec A1: トークンの失効(expiry/revoked判定)が実装・テストされているかを実際に確認する手順を含むこと",
        "生成物『見るところ』節: 命名規約/import順/コメント言語/関数行数の4点のみで失効判定への言及なし"
      ]
    }
  ]
}
```
