## 判定根拠

### 対象
- `.claude/skills/pr-guide/SKILL.md`（design-map の1文責務: 「PR を出すときの作法（本文の書き方・レビュー依頼）」）
- `.claude/skills/test-guide/SKILL.md`（design-map の1文責務: 「テストの実行方法と失敗時の読み方」）

### 重複の事実確認
両ファイルの「## テストの回し方」節は、見出しから本文まで一字一句同一である。

```
`npm test` は統合テストを含むため docker が要る。落ちたら `logs/test.log` の末尾の
スタックトレースから読む。特定の1本は `npm test -- --grep <名前>`。カバレッジは `npm run cov`。
```

これは典型的な「同じ内容が複数ファイルに書かれ、更新時に片方が腐る」構造である。たとえば
`npm test` の docker 要件が変わった、`--grep` の使い方が変わった、`npm run cov` のコマンドが
変わった、といった更新が発生したとき、片方（多くの場合コピー先である `pr-guide`）だけが
更新されず古い手順が残る恒常的リスクを抱える。

### 責務の帰属判定
design-map は `test-guide` にのみ「テストの実行方法と失敗時の読み方」という責務を割り当てて
おり、`pr-guide` の1文責務は「PR を出すときの作法（本文の書き方・レビュー依頼）」である。
`pr-guide/SKILL.md` の実体（本文3節）を見ると、`## PR 本文` と `## レビュー依頼` の2節は
1文責務に対応するが、`## テストの回し方` 節はまるごと `test-guide` の責務を模写したもので、
`pr-guide` 自身の1文責務には無い内容である。これは「1文の責務に対し実体が別の責務まで
抱えている」責務肥大に該当する。しかも中身が要約や参照ではなく `test-guide` と一字一句同一の
全文コピーであるため、読まれない冗長というより「更新経路が二重化された重複」の方が実態に近い。

一方 `test-guide/SKILL.md` は、design-map の1文責務（テストの実行方法と失敗時の読み方）と
本文の内容（`## テストの回し方` 節のみ）が過不足なく一致しており、それ自体に肥大・重複・
冗長の兆候はない。重複問題の発生源は `pr-guide` 側がテスト手順を複製して抱え込んだことに
あり、`test-guide` 単体のファイル構造には問題がない。

### preload の妥当性
両ファイルとも SKILL.md 本体であり preload 前提の常時ロード判定は今回のバンドルの対象外
（Skill 全体を常時読み込むかどうかの設計情報がバンドルに含まれていない）。判定は保留する
のではなく、この観点についてはバンドルに判定材料が無いため対象外として扱う。

```json
{
  "axis": "context",
  "ts": "corpus",
  "coverage": [".claude/skills/pr-guide/SKILL.md", ".claude/skills/test-guide/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/pr-guide/SKILL.md", "condition": null,
      "verdict": "violation", "confidence": "high",
      "rationale": "design-map の1文責務は「PR を出すときの作法（本文の書き方・レビュー依頼）」だが、本文には test-guide/SKILL.md の『## テストの回し方』節と一字一句同一の全文（docker 要件・logs/test.log の読み方・--grep・npm run cov）がまるごと複製されている。これは1文責務を超えた責務肥大であり、かつ同一内容が2ファイルに存在するため、テスト手順が変わった際に片方だけが更新され他方が腐る構造になっている。",
      "evidence": ["pr-guide/SKILL.md ## テストの回し方 節", "test-guide/SKILL.md ## テストの回し方 節（内容が完全一致）", "design-map: pr-guide の1文責務＝PR 作法（テスト手順を含まない）"] },
    { "target": ".claude/skills/test-guide/SKILL.md", "condition": null,
      "verdict": "clean", "confidence": "high",
      "rationale": "design-map の1文責務（テストの実行方法と失敗時の読み方）と本文（## テストの回し方 節のみ）が過不足なく一致しており、責務肥大や読まれない冗長は見られない。ただし同一内容が pr-guide/SKILL.md に複製されており、重複問題の発生源はコピー先である pr-guide 側の責務肥大にある。",
      "evidence": ["test-guide/SKILL.md 本文が1文責務の範囲に収まっている", "design-map: test-guide の1文責務＝テスト実行方法と失敗時の読み方"] }
  ]
}
```
