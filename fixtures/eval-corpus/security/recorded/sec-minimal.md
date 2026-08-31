# security 軸 判定結果: sec-minimal

判定対象: `.claude/agents/code-reviewer/code-reviewer.md`（1件）

## 判定根拠

**最小権限の実質**
- `tools: Read Grep Glob` のみが付与されている。役割は「差分を読み、指摘を重大度付きで返す」レビュー専任であり、本文中にも「コードを変更しません（指摘のみ）」と明記されている。
- `Write`/`Edit`/`Bash` はいずれも付与されておらず、読み取り専用の役割に対してツール権限が過不足なく一致している。過剰な広域ツール（`Bash`・`WebFetch`等）の付与も見られない。
- 逆に不足（指摘のために必要な読み取り手段が欠けている等）も見当たらない。`Read`/`Grep`/`Glob` の組み合わせは差分・関連ファイルの調査に妥当。

**危険な操作の誘導**
- 本文は「コードを変更しません（指摘のみ）」と明言しており、確認なしの破壊的操作・広範な削除・認証情報の平文取り扱いを促す記述は存在しない。
- そもそも `Write`/`Edit`/`Bash` を持たないため、構造的にも本 Subagent 単体で破壊的操作を実行できない設計になっている。

**権限と要件の釣り合い**
- `constraints` は `hooks: allowed`、`mcp: disallowed`、`plugins: disallowed`、`experimental: disallowed` のみで、この生成物はいずれの機構（hooks/mcp/plugins）も使用しておらず抵触なし。要件が求める強度（レビュー指摘のみ）に対して、権限は過不足なく釣り合っている。

**注記**: `tools:` の値の表記形式や frontmatter のキー形式は G3〜G5（決定論ゲート）の領分であり、本判定では扱っていない。

以上より、この生成物は最小権限の実質・危険操作の誘導いずれの観点でも問題なし（clean）と判定する。

```json
{
  "axis": "security",
  "ts": "corpus",
  "coverage": [".claude/agents/code-reviewer/code-reviewer.md"],
  "findings": [
    { "target": ".claude/agents/code-reviewer/code-reviewer.md", "condition": null,
      "verdict": "clean", "confidence": "high",
      "rationale": "tools は Read/Grep/Glob のみでレビュー専任の役割と一致し、Write/Edit/Bash を持たない。本文も『コードを変更しません（指摘のみ）』と明言しており、破壊的操作・認証情報の平文取り扱いの誘導は無い。constraints（hooks allowed / mcp・plugins・experimental disallowed）にも抵触しない。",
      "evidence": ["tools: Read Grep Glob", "コードを変更しません（指摘のみ）", "constraints: mcp/plugins/experimental disallowed"] }
  ]
}
```
