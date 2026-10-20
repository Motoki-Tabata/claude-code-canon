# requirements.md（G1 の対象）

ヒアリングで合意した内容の記録。`/canon-plan` のメインが、合意の直後に `work/<ts>/requirements.md` へ自分で書く。合意の前には書かない。サイズの上限は `npm run check` が数える（要件1件 1.5KB・constraints 2KB・全体 20KB）。前の段の本文や調査結果を再掲せず、根拠は `evidence` でパスか節を指す。

## テンプレート

```markdown
## メタ
confirmed_at: <YYYY-MM-DD hh:mm>

## 確定要件
- id: R1
  want: <ユーザーの言葉で、達成したいこと>
  confidence: 実物で確認|公式で確認|文言のみ
  evidence: <根拠の所在。対象のパス:行、investigation/findings.md の節、investigation/official-check.md の節>
  files: [<触る見込みのファイル（対象ルート相対）>]
  accept: <受入基準。diff か実行で確かめられる形で>
  strength_needed: advisory|deterministic|enforced

## 未確定
- id: R2
  want: <まだ確定できない要件>
  confidence: 文言のみ
  evidence: <何を確かめれば確定できるか>
  files: [<見込み>]
  accept: <暫定>

## constraints
constraints:
  hooks:        { allowed: true|false, reason: "..." }
  mcp:          { allowed: true|false, reason: "..." }
  plugins:      { allowed: true|false, reason: "..." }
  experimental: { allowed: true|false, reason: "..." }
  organization_policy: <その他、組織ポリシー由来の制約（自由文）>

conflicts: []
```

## 書き方

- **`confidence`（根拠の確度）は3つだけ**: 「実物で確認」は対象のファイル・コマンド・出力で確かめた、「公式で確認」は Claude Code の公式ドキュメントの原文で確かめた、「文言のみ」は lessons・README・他人の記述を読んだだけ。**「文言のみ」は `## 確定要件` に置かない**（`check` が NG にする）。2回の run の手戻りは、どちらも確かめる前に確定したことが原因だった。
- `evidence` は、その確度の根拠が読める場所を指す。「実物で確認」なら対象のパス（行番号可）か調査の節、「公式で確認」なら `investigation/official-check.md` の節。
- `files` は触る見込みのファイル。`impact` と change-plan の入力になる。`accept` は diff を見るか実行すれば真偽が分かる形で書く（「適切に」「十分に」では書かない）。
- `strength_needed` は任意。`canon-reference/references/selection.md` §4 の強度（advisory＝CLAUDE.md、deterministic＝Hooks、enforced＝permissions）に対応する。`deterministic` を求めるのに hooks を禁止している、のような衝突を見つける材料になる。
- `constraints` は要件とは独立した環境条件で、機能選定を先に絞る。`experimental` は Agent Teams・Channels・Monitors・Themes・`context: fork` と、プレビュー段階の組込み Skill への依存をまとめて許可するかを表す。
- **`allowed: false` は「差分のどこにも現れてはならない」を意味する**（verify の V8 が機械で強制する）。既存改修で「既存が使っていて維持したいが、新規には足さない」場合は `allowed: true` にし、`reason` に「既存を維持・新規追加なし」と書く。`allowed: false` にすると、既存のファイルがその機能を使っているだけで、そのファイルを変える差分が違反になる。
- 禁止したときの波及を、合意の前にユーザーへ伝える。MCP を禁止すると外部連携を含められない。Hooks を禁止すると決定論のガードレールを含められない（permissions による承認に下げるか、断念する）。Plugins を禁止すると配布はできない。experimental を禁止すると `context: fork` などは使えない。
- `conflicts` は、未解消で、かつ `constraints` の実在キーが `allowed: false` で当該要件を禁止しているものだけ。無ければ `conflicts: []` と明示する。

```yaml
conflicts:
  - requirement: R1
    constraint: hooks
    note: <deterministic が使えない。advisory へ下げるか、断念するか。選択肢を示す。判定はしない>
```

- 解消済みの衝突の経緯や、`constraints` に由来しない方針の相違は `conflicts` に入れず、散文の小節（`## 経緯` など）に書く。parser は `- id:` のレコードと `constraints:`・`conflicts:` のキー行を読むので、足した小節は機械の照合に影響しない。
- **`confirmed_at`** には、合意した時点で `date '+%Y-%m-%d %H:%M'` を実行した出力を写す。推測で書かない（現在より後の時刻は `check` が NG にする）。
- 移植の基準にする別プロジェクトの一式があるときは、`## 参照元` の節に `- path: <絶対パス>` と `role:` を書く。基準として読むだけで、参照元のパスや名前は差分に書かない（読み手が解決できない参照になる）。
- 承認状態（承認した・しない）は書かない。
