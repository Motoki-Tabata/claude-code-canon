# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §8）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には `architecture.md` 1冊だけを置く。未対応の backlog は本台帳だけに置く。
- **一部だけ反映したら書き直す**: 項目の一部を直したコミットの中で、項目を残りの部分だけに書き直す（直した部分を残さない）。
- **canon 本体の要求だけを置く**: 対象プロジェクト側の生成物や文書の直しは、対象の台帳への申し送りにして本台帳に置かない。
- **主張の確度を書く**: 根拠を実物（コード・成果物・transcript）で確かめたか、文言（分析ファイル・他の台帳の記述）だけかを `確度` に書く。数値・行番号は起票の前に数え直す。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・<plan|design|build> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 確度: 実物で確認 | 文言のみ（<出典>） | 推測
- 提案: <行き先（ファイルと節）と直し方を1〜3行。行き先は1つに決める>
- 未決: <行き先や直し方を決めきれないときだけ、論点を1行で。決まっていれば書かない>
- 予定: <解消する予定の作業があるときだけ（例: tasks/<dir>/ の段階N）>
```

---

## 2026-10-12 designer のコンテキストが約12kから約313kまで増え、入力の94%がキャッシュ読みになる（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の designer の総入力は 9,485,334 で、そのうち 8,911,375（94%）が cache_read だった。コンテキストは約12kから約313kまで単調に増え、後半の約18ターンは 206k 以上だった。増加の主因は、入力外の読み込み（agent 8体・Phase Skill 4件・generation の references）と、`lib/`・`tests/`・canon-reference の grep の出力だった（`retro/session-analysis-B.md`）。
- 確度: 実物で確認（`work/20261012_030955/retro/session-analysis-B.md` の56〜67行。キャッシュの作り直しと advisor の上乗せは推測）
- 提案: v3 は designer を廃止し、`/canon-design` を inline にした（段階4）。同じ増え方が inline のメインで起きないかを、大の経路を通したときに `npm run tokens` で実測する。増えるなら、change-plan を節ごとに書いて1回の Write を小さくし、読む正典の節を `design` Skill の references に置く。
- 未決: 大の経路の実測が無い（段階6のベンチマークは小の経路）
- 予定: 大の経路の最初の run

## 2026-10-15 評価などで run の作業ディレクトリを使う作業が、本番の work/<ts>/ を動かして run を壊した（run 20261014_232320・Phase B）
- 種別: 規律昇華
- 何が起きたか: Phase B の開始時に `work/20261014_232320/investigation/` が無かった。別セッション（18e72daa、haiku の investigator 評価）が、本番ファイルの上書きを避けるためにそのスクラッチパッドへ退避し、戻さずに止まっていた。復旧は手順の外で行った（ユーザーの承認を得て `cp -a` で戻し、退避時の `inv.sha` と照合）。入力の実在の確認は、`npm run preflight`（段階4）が行うようになった。
- 確度: 実物で確認
- 提案: 評価などで run の作業ディレクトリを使う作業は、本番の `work/<ts>/` を動かさず写しで行う、と書く。
- 未決: 規則の置き場（`.claude/rules/workflow.md` か、評価を行う Skill）が決まっていない

## 2026-10-17 paths.json に Agent の入れ子の配置が無い（v3 段階2）
- 種別: 欠陥修正
- 何が起きたか: canon 自身の Agent は `.claude/agents/<name>/<name>.md`（8体）に入れ子で置いてあり、`claude -p` で `subagent_type: builder` が実際に起動した。しかし `data/paths.json` の配置は `.claude/agents/*.md` だけで、`inventory` は8体を subagents でなく分類外に出す（`feature_hint` で subagents と示すようにはした）。architecture.md §2.1 の条件2「機能のファイルが0件か」の判定を `inventory` の機能別の件数だけで行うと、小の経路の対象が大に倒れうる（この点は `check` が分類外のヒントを足して解消した）。
- 確度: 実物で確認（`npm run inventory` の出力と起動の実験）。入れ子の配置が公式で認められているかは未確認（`lib/features.js` の EXTRA_PATHS のコメントは subagents.md §3 を挙げるが、そこに該当の記述は見つからなかった）
- 提案: 入れ子の配置が公式で認められるかを `features/subagents.md` と公式で確かめ、認められるなら paths.json の欠けとして正典側に送る。条件2の判定は、`check` が機能別の件数に分類外の `feature_hint` の件数を足して行うようにした（段階3）。

## 2026-10-17 /canon-build の `git -C <worktree> …` が allow 規則に当たらず、実行のたびに許可を求められる見込み（v3 段階4）
- 種別: 効率化
- 何が起きたか: `.claude/settings.json` の allow は `Bash(git diff *)`・`Bash(git status*)` など `git` の直後がサブコマンドの形だけを許す。`/canon-build` は worktree の diff・status・差分の書き出し（`git -C <worktree> diff <base>..HEAD > …`）を `git -C <worktree>` で呼ぶので、規則に当たらない。実際に許可の画面が出るかは対話のセッションで確かめていない（`claude -p` の実験は段階2の Edit の規則だけ）。
- 確度: 推測（allow 規則の文字列と Skill の手順の照合。画面は未確認）
- 提案: 対話で `/canon-build` を通して確かめる。出るなら、`worktree` スクリプトに `diff`（`--out` でファイルへ書き出す）を足して `npm run` に寄せるか、`Bash(git -C * diff*)` の読み取りだけの allow を足すかを決める。
- 予定: tasks/20261016-canon-v3/ の段階6 のベンチマーク
