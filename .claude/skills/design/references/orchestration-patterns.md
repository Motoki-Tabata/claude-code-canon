# 機能の組み合わせ方（パターン）

機能が決まったら、組み合わせの型を決め、カスタマイズ間の呼び出しの向きとデータの渡し方を `## Interface Contracts` に書く。型の定義と守るべき制約は `canon-reference/references/patterns.md` にある（委譲§2・並列§3・強制§4・配布。選び方の基本は§1）。ここには写さない。

## design-map への書き方

- `## メタ` の `patterns:` に、採用した型を `委譲`・`並列`・`強制`・`配布` から並べる。単純な構成（Skill 単体など）は `なし（単体）` と書く。`rationale` に、その型を選んだ理由を1〜2文で書く。
- `## Interface Contracts` に、採用した型を `patterns.md` の節番号で示し、次を書く。
  - 誰が誰を呼ぶか（呼び出しの向き）。
  - 何を渡し、何を返すか（ファイルか応答か）。
  - 依存の向き。
- 工程間のやりとりは、応答本文でなくファイルで受け渡す形にする（本文を会話に通すと、呼び出し元の文脈が膨らむ。`patterns.md` §2）。

## 避けること

`patterns.md` の各型の制約を破らない。特に、`design-map` に書く前に次を確かめる。

- 委譲: サブエージェントの nesting の深さ。多段の委譲が要らないサブエージェントには、起動の指示を書かない。
- 委譲: `context: fork` の Skill に具体的なタスクがあること。`disable-model-invocation: true` の Skill を `skills:` で preload していないこと。
- 強制: 確実に止めたいことを CLAUDE.md だけに書かない（強度は advisory）。Hook か permission 規則を組にする。
- 並列: dynamic workflows は自動生成の対象外。採用するなら手動対応の項目として明記する。
