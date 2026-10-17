# change-plan.md の大の経路の節

大の経路の change-plan.md は、小の経路の節（`## ファイル`・`## 影響の語`・`## 参照元の扱い`・`## 検証コマンド`。書式は requirements Skill の [change-plan-template.md](../../requirements/references/change-plan-template.md)）に加えて、`## 機能と責務`（8KB まで）と `## モデル割当`（3KB まで）を持つ。G2（設計の承認）の対象は change-plan.md の全体で、人間は機能選定の理由を読んで承認する。

## `## 機能と責務`

機能ごとに小節を置く（使わない機能は書かない）。各小節に次を書く。

```markdown
### <機能名>（<要件 ID>）
- 選んだ理由: <selection.md の手順のどこで、なぜこの機能か。1〜2文>
- カスタマイズ: `<path>` — <1文責任>
- 強度: advisory|deterministic|enforced（要件の strength_needed との対応）
```

末尾に次の項を足す（該当するときだけ）。

- **組み合わせ**: 採用した型（委譲・並列・強制・配布。`patterns.md` の節番号）、誰が誰を呼ぶか、何を渡し何を返すか（ファイルか応答か）、依存の向き。
- **書込スコープ**: [structure.md](structure.md) の4点。役割分担が無ければ「N/A（役割分担なし）」。
- **Experimental 依存**: 依存する箇所と、constraints の `experimental` が `allowed: true` であること。無ければ「なし」。
- **配置後の手作業**: 人間がマージのあとにすること（実行権限・OAuth・環境変数・信頼の承認など）。hooks か `permissions` を含むときは、対象のワークスペースの trust を承認しないと効かないことを書く（verify の V9 の警告と対応する）。

## `## モデル割当`

生成物に割り当てる Subagent・Skill ごとに1行。`<path>: <model>・<effort> — <根拠>`。根拠は [model-selection.md](model-selection.md) の語彙（haiku の3条件・effort の方針）で書く。

## `## ファイル` の書き方（大の経路）

- 機能ごとの小節のカスタマイズが、`## ファイル` の `op: new`（または既存の `modify`）の1件に対応する。小節にあるのに `## ファイル` に無いもの、その逆は、G2 の前に直す。
- 要件の `files`（見込み）と `## ファイル` のパスが違うときは、理由を `instruct` に1行書く。
- `instruct` は何を・なぜだけ。新しい本文は builder が書く。
