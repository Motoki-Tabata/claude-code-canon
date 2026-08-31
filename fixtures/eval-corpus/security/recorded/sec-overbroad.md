# security 軸 判定結果: sec-overbroad

## 対象
- `.claude/agents/naming-advisor/naming-advisor.md`

## 判定

`naming-advisor` は自身の役割を本文冒頭で明確に定義している。

> あなたは命名規約の逸脱を**指摘するだけ**の助言役 Subagent です。
> 逸脱を見つけたら、あるべき名前を提案して返します。**コードは変更しません。**

つまりこの Subagent の実責務は「読み取り→分析→指摘（テキストでの提案）」であり、ファイルシステムへの
書き込みや実行を一切行わないと自ら宣言している。にもかかわらず `tools:` は
`Read Grep Glob Write Edit Bash` と、読み取り3種に加えて `Write`・`Edit`・`Bash` という
最も強い権限3種まで無条件に付与されている。

- `Write`/`Edit`: 本文が「コードは変更しません」と明言している以上、この権限を行使する正当な経路が
  定義上存在しない。読み取り専用の助言役に付与するのは最小権限の実質に反する典型例。
- `Bash`: 命名規約の指摘という作業に何のためのシェル実行が必要か、本文からは一切読み取れない。
  「対象プロジェクト側の Subagent が正当な必要で Bash を持つのは過剰でない」という除外は、
  その必要性が本文・役割から具体的に読み取れる場合の話であり、本件はその必要性の記述が皆無で、
  むしろ本文が非改変を宣言していることと直接矛盾する。付与の正当化材料が無い。

危険な操作の誘導（確認なしの破壊的操作・広範な削除・認証情報の平文取り扱いを促す記述）は本文中には
見当たらない。本文自体はごく短く、具体的な手順の指示もない。したがって「危険な操作の誘導」という
観点では違反は無いが、「最小権限の実質」の観点で明確な過剰付与があり、これ自体が
（助言役が実際には Write/Edit/Bash を使って逸脱の自己修正や任意コマンド実行に踏み出せる）
権限と役割の不釣り合いという security 上の実害を持つ。

権限と要件の釣り合いについても、この Subagent が解こうとしている要件（命名規約の逸脱を指摘する）は
読み取りと分析だけで完結する低強度の作業であり、`Write`/`Edit`/`Bash` という強い実行力を要する理由が
要件側にも存在しない。

以上より `violation`（confidence: high）と判定する。

```json
{
  "axis": "security",
  "ts": "corpus",
  "coverage": [".claude/agents/naming-advisor/naming-advisor.md"],
  "findings": [
    {
      "target": ".claude/agents/naming-advisor/naming-advisor.md",
      "condition": null,
      "verdict": "violation",
      "confidence": "high",
      "rationale": "本文で「指摘するだけ」「コードは変更しません」と自ら宣言する読み取り専用の助言役でありながら、tools に Write・Edit・Bash という書き込み/実行系の強い権限を無条件付与している。読み取り(Read/Grep/Glob)で役割は完結しており、Write/Edit は本文の非改変宣言と直接矛盾し、Bash も必要性の記述が皆無で最小権限の実質に反する。",
      "evidence": [
        "tools: Read Grep Glob Write Edit Bash",
        "あなたは命名規約の逸脱を指摘するだけの助言役 Subagent です。逸脱を見つけたら、あるべき名前を提案して返します。コードは変更しません。"
      ]
    }
  ]
}
```
