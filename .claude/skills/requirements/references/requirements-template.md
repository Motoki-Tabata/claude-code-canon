# requirements.md（工程2・P1）

ヒアリングで合意した内容の記録。オーケストレーターが、合意の直後に `work/<ts>/requirements.md` へ自分で書く。合意の前には書かない。

## テンプレート

```markdown
## メタ
confirmed_at: <YYYY-MM-DD hh:mm>
confirmed_by: <承認者名>

## 確定要件
- id: R1
  want: <ユーザーの言葉で、達成したいこと>
  strength_needed: advisory|deterministic|enforced
  priority: must|should|could
  outside_managed: [<管理パス集合の外で変更してよいパス。無ければこの行ごと書かない>]

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true|false, reason: "..." }
  mcp:          { allowed: true|false, reason: "..." }
  plugins:      { allowed: true|false, reason: "..." }
  experimental: { allowed: true|false, reason: "..." }
  organization_policy: <その他、組織ポリシー由来の制約（自由文）>

## 制約と要件の衝突
conflicts: []
```

## 書き方

- `strength_needed` と `priority` は、上の語彙の値だけを書く。推測で新しい値を作らない。`strength_needed` は正典 `docs/00_INDEX.md` の強度3段階（advisory＝CLAUDE.md、deterministic＝Hooks、enforced＝permissions）に対応する。
- `constraints` は要件とは独立した環境条件で、機能選定の分岐を先に絞る。`experimental` は Agent Teams・Channels・Monitors・Themes・`context: fork` と、プレビュー段階の組込み Skill（`/design` など）への依存をまとめて許可するかを表す。組込み Skill への依存は、生成物には本文の起動の案内として現れるだけなので、verify の V9 は機械で検出しない（design-map の `## Experimental Dependencies` に書かれたときだけ止める）。
- **`allowed: false` は「生成物のどこにも現れてはならない」を意味する**（verify の V9 が機械で強制する）。既存改修で「既存が使っていて維持したいが、新規には足さない」場合は `allowed: true` にし、`reason` に「既存を維持・新規追加なし」と書く。`allowed: false` にすると、既存の keep 対象がその機能を使っているだけで違反になる。
- 禁止したときの波及を、合意の前にユーザーへ伝える。MCP を禁止すると外部連携を含められない（手動手順を L1・L2 に書く形で代える）。Hooks を禁止すると決定論のガードレールを含められない（permissions による承認に下げるか、断念する）。Plugins を禁止すると L5 の配布はできず、個別ファイルの配置だけになる。experimental を禁止すると `context: fork` などは使えない。
- `conflicts` は、未解消で、かつ `constraints` の実在キーが `allowed: false` で当該要件を禁止しているものだけ。形は次のとおり。無ければ `conflicts: []` と明示する（ブロック自体が無いのと空とは区別される）。

```yaml
conflicts:
  - requirement: R1
    constraint: hooks
    note: <deterministic が使えない。advisory へ下げるか、断念するか。選択肢を示す。判定はしない>
```

- 解消済みの衝突の経緯・`constraints` に由来しない方針の相違・配置後の手作業メモは、`conflicts` に入れず `## 制約と要件の衝突` の下に散文の小節として書く。記録は残しつつ、機械の照合対象から外すためである。
- **管理パス集合の外を改修対象にするとき**: ユーザーが「スコープ外（テスト設定・CI・scripts/ など）でも、要件の実現に要るなら変えてよい」と認めた要件にだけ `outside_managed:` を書き、変えてよいパス（ディレクトリでもよい）を列挙する。認めた範囲を広げて書かない。designer はこの範囲の中でだけ `## 管理パス外の変更` を設計し、Phase D で1件ずつ適用と確認を記録する（artifacts.md §5.6）。機械はこの行を読まない。
- 散文の小節を足してよい（`## 経緯` など）。parser は見出しでなく `- id:` のレコードと `constraints:`・`conflicts:` のキー行を読むので、足した小節は機械の照合に影響しない。
- 書いた直後に `npm run check -- <ts> requirements` で、件数・強度と優先度の内訳・constraints・conflicts を確かめる。
- 承認状態（承認した・しない）は書かない。
