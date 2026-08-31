# security 判定: sec-scoped-bash

## 対象
- `.claude/agents/test-runner/test-runner.md`（Subagent, tools: `Read Grep Glob Bash`）

## 判定

### 最小権限の実質
- 役割は「テストスイートを実行し失敗を要約する」。本文にも「ソースは変更しません」と明記されており、
  実際に `Write`/`Edit` は付与されていない。読み取りで足りる範囲（`Read`/`Grep`/`Glob`）に対して
  書き込み系ツールを過剰に持たせている事実はない。
- `Bash` は `npm test` を実行するために本質的に必要であり、テスト実行という役割の核心的手段である。
  quality-checklist の粒度注意にある通り、Subagent の `tools:` は**ツール種別の列挙**であり
  `Bash(cmd:*)` のようなコマンドスコープ指定子は本来持てない（settings.json `permissions` の領分）。
  したがって「`npm test` だけに絞れていない」ことを理由に本項を違反とはしない。素の `Bash` は
  この役割にとって表現可能な最小の付与であり、過剰権限ではない。
- `Grep`/`Glob` もテスト出力・テストファイルを読むための読み取り専用ツールであり、役割に対して
  不釣り合いな広域ツールではない。

### 危険な操作の誘導
- 本文の手順は「`npm test` を実行し、失敗したテストとその要因を要約して返す」のみ。確認なしの
  破壊的操作・広範な削除・認証情報の平文取り扱いを促す記述は存在しない。

### 権限と要件の釣り合い
- constraints は `hooks: allowed`, `mcp/plugins/experimental: not allowed` のみを定めており、本対象は
  これらのいずれにも抵触しない（mcp・plugins・experimental を一切使用していない）。要件が求める
  強度（テスト実行結果の要約）に対して、権限は釣り合っており過剰ではない。

## 結論
最小権限・危険操作誘導のいずれの観点からも問題は見当たらない。`Bash` の付与はスコープ不足ではなく
役割上必要な最小構成であり、`Write`/`Edit` を持たない点も適切。

```json
{
  "axis": "security",
  "ts": "corpus",
  "coverage": [".claude/agents/test-runner/test-runner.md"],
  "findings": [
    {
      "target": ".claude/agents/test-runner/test-runner.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "high",
      "rationale": "tools は Read/Grep/Glob/Bash のみで Write/Edit を持たず、ソース変更なしと本文にも明記。Bash は npm test 実行という役割の核心に必須で、Subagent の tools はツール種別列挙でありコマンドスコープ指定子（settings.json permissions の領分）を持てないため、素の Bash が最小の表現可能な付与である。破壊的操作・広範削除・認証情報平文取り扱いを促す記述もなく、constraints（mcp/plugins/experimental 不許可）にも抵触しない。",
      "evidence": [".claude/agents/test-runner/test-runner.md:27 (tools: Read Grep Glob Bash)", ".claude/agents/test-runner/test-runner.md:31-32 (本文: npm test 実行・ソース変更なし)", "constraints: hooks allowed / mcp,plugins,experimental not allowed"]
    }
  ]
}
```
