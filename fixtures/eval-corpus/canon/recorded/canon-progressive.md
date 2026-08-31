# canon 判定: canon-progressive

対象: `release-deploy` Skill 一式（`SKILL.md` + `reference/{prepare,deploy,verify}.md`）4件。

## 段階的開示（L2_SKILLS.md §2.1「Progressive Disclosure Loading」・§4.1/§4.2）

`SKILL.md` の本文は概要3行＋番号付き3段構成のみで、各段の詳細は
`[prepare](./reference/prepare.md)` のように**直接 markdown リンク**で参照している。これは
L2_SKILLS.md §4.2 の DON'T「Supporting files を『手動で Read してください』と指示する
（Claude は忘れる）→ SKILL.md 本文に直接 `[xxx.md](./xxx.md)` 形式で参照する」に正しく
整合するパターンであり、§2.1 の Progressive Disclosure Loading（body 内で参照される
supporting files は Claude が必要判断時に Read/Glob で取得）そのものの実装になっている。
`SKILL.md` が入口として機能し、実行フェーズ（準備・配信・確認）に応じて必要な参照だけを
開く設計であって、すべてを1ファイルに詰め込んでいない。§4.1 の「SKILL.md body は500行
以下推奨、参照は Progressive Disclosure に委ねる」の趣旨にも反しない（全体を合算しても
500行に遠く及ばない）。

一点だけ留保する。3本の reference ファイルは各2〜3行と極小で、`SKILL.md` 本体に
インライン化しても分量的には全く問題にならない規模である。canon が明示的に「小さい
内容の分割を禁止する」とは書いていないため違反とはしないが、分割の実務的な便益
（フェーズごとに必要な詳細だけ読む）は理屈上成立するものの実際の分量差はごく小さく、
段階的開示の「意義」がここではやや薄いボーダーラインケースである。この点のみを理由に
confidence を medium に留める。

## description の委譲トリガー品質（L2_SKILLS.md §2.1 トリガー方式・§4.1）

```yaml
description: Cut and deploy a release of this service. Use when publishing a new version to production.
disable-model-invocation: true
```

- `description` は「何をするか」（release を切って配信する）と「いつ使うか」（本番へ新版を
  publish するとき）の両方を明示しており、L2_SKILLS.md §4.1 DO「具体的なトリガーフレーズを
  含める」を満たす。§4.2 DON'T の「description を曖昧にする（"Helpful skill" など）」には
  該当しない。
- `disable-model-invocation: true` は §2.1 の設計マトリクスで「Claude が発動: ❌ / ユーザーが
  発動: ✅」＝副作用ある操作向けの型であり、§4.1 DO「副作用ある操作は
  `disable-model-invocation: true`: deploy/commit/send-message 等のタイミング制御」に
  文字通り合致する。deploy は当該 DO 例に明記された典型ケースであり、レイヤー選択・
  トリガー制御の両面で正しい。
- 他ロールとの識別可能性: バンドルには比較対象となる他の skill/agent が含まれておらず、
  衝突の実例は確認できない。単体で見る限り具体性は十分（「release」「production」
  「publish」という固有語彙があり "Helpful skill" 的な空疎さはない）。

## レイヤーの当てはまり（00_INDEX.md §4 の趣旨・L2_SKILLS.md §1.3）

リリース手順は「多段手順・繰り返しワークフロー」であり L1 CLAUDE.md（常時前提となる
静的事実）向きの内容ではない。L4 Hooks（強制ブロック）を要求するほどの決定的検査でも
なく、`disable-model-invocation: true` によるタイミング制御で十分機能する。L2 Skill への
配置は妥当。

## 結論

4件とも段階的開示・description の委譲トリガー品質の両観点で canon の趣旨に反する
明確な違反は無い。reference ファイルの極小分割のみ、実務上は問題ないがやや過剰分割
気味という低〜中程度の留保を SKILL.md の finding に付記した。

```json
{
  "axis": "canon",
  "ts": "corpus",
  "coverage": [
    ".claude/skills/release-deploy/SKILL.md",
    ".claude/skills/release-deploy/reference/deploy.md",
    ".claude/skills/release-deploy/reference/prepare.md",
    ".claude/skills/release-deploy/reference/verify.md"
  ],
  "findings": [
    {
      "target": ".claude/skills/release-deploy/SKILL.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "本文は概要のみで3つのreferenceへ直接markdownリンク（[prepare](./reference/prepare.md)等）しており、L2_SKILLS.md §4.2の推奨形（手動Read指示ではなくリンク参照）に合致する正しい段階的開示。descriptionも『何を』『いつ』を具体的に書き、disable-model-invocation:trueはdeployという副作用ある操作の典型DOケースに合致する。ただしreference各ファイルが2〜3行と極小で、SKILL.md本体へのインライン化でも500行制限には遠く及ばないため、分割の実効的な便益（フェーズごとの選択的ロード）はあるが薄く、過剰分割気味というボーダーライン性を考慮しconfidenceをmediumに留めた。",
      "evidence": ["L2_SKILLS.md §2.1 Progressive Disclosure Loading", "L2_SKILLS.md §4.1 DO（disable-model-invocation:trueの用途／具体的トリガーフレーズ）", "L2_SKILLS.md §4.2 DON'T（supporting filesはSKILL.md本文に直接リンク参照）"]
    },
    {
      "target": ".claude/skills/release-deploy/reference/deploy.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "配信フェーズ（タグ打ち・パイプライン起動）に限定した内容で、SKILL.mdの概要を重複記述していない。Claudeが配信フェーズ実行時にのみ読む設計として段階的開示の趣旨に沿う。分量が極小である点はSKILL.md側の留保と同様。",
      "evidence": ["L2_SKILLS.md §2.1 Progressive Disclosure Loading（supporting filesはClaudeが必要判断時にRead）"]
    },
    {
      "target": ".claude/skills/release-deploy/reference/prepare.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "準備フェーズ（バージョン更新・CHANGELOG要約）に限定した内容で、他フェーズの詳細を混在させておらず責務が明確。SKILL.md本体との重複もない。",
      "evidence": ["L2_SKILLS.md §2.1 Progressive Disclosure Loading"]
    },
    {
      "target": ".claude/skills/release-deploy/reference/verify.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "medium",
      "rationale": "確認フェーズ（スモークテスト・ロールバック手順）に限定した内容で、責務が明確に分離されている。SKILL.md本体との重複もない。",
      "evidence": ["L2_SKILLS.md §2.1 Progressive Disclosure Loading"]
    }
  ]
}
```
