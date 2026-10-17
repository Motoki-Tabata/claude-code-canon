# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §6.4）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には設計書2冊（architecture.md・artifacts.md）だけを置く。未対応の backlog は本台帳だけに置く。
- **一部だけ反映したら書き直す**: 項目の一部を直したコミットの中で、項目を残りの部分だけに書き直す（直した部分を残さない）。
- **canon 本体の要求だけを置く**: 対象プロジェクト側の生成物や文書の直しは、対象の台帳への申し送りにして本台帳に置かない。
- **主張の確度を書く**: 根拠を実物（コード・成果物・transcript）で確かめたか、文言（分析ファイル・他の台帳の記述）だけかを `確度` に書く。数値・行番号は起票の前に数え直す。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・Phase <A〜D> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 確度: 実物で確認 | 文言のみ（<出典>） | 推測
- 提案: <行き先（ファイルと節）と直し方を1〜3行。行き先は1つに決める>
- 未決: <行き先や直し方を決めきれないときだけ、論点を1行で。決まっていれば書かない>
- 予定: <解消する予定の作業があるときだけ（例: tasks/<dir>/ の段階N）>
```

---

## 2026-10-10 Phase ごとに別セッションで /canon-a〜/canon-d を起動する実経路が未検証（run 20261010_014620・Phase D）
- 種別: 規律昇華
- 何が起きたか: この run は1セッションで各 SKILL.md の手順を代行した。`disable-model-invocation` の挙動、セッション分離、B〜D の開始手順（`canon_commit` の比較・`approvals check`）は通していない。Hook の発火も未検証（この run は Hook を生成していない）。
- 確度: 文言のみ（run 20261010_014620 の `work/`・`output/` は残っておらず、照合できない。v2 の Phase Skill を別セッションで通した記録は、その後の2回の run の handoff の `## セッション` にある）
- 提案: 小さな対象で `/canon-a`〜`/canon-d` を別セッションで通し、手順の抜けを本台帳に起票する。1セッション通しで検証するときに省いてよい手順は SKILL.md に書かない（実運用の経路と混ざるため）。plan mode を使う Skill が経路に入るときは、計画の承認を対話のセッションで確かめる（`claude -p` では承認の画面が使えない。正典 `canon-reference/references/features/permissions.md` の §3.3・§4）。
- 予定: v3 刷新（tasks/20261016-canon-v3/）の段階6 のベンチマーク run を、別セッションの実際の経路で通す

## 2026-10-12 designer のコンテキストが約12kから約313kまで増え、入力の94%がキャッシュ読みになる（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の designer の総入力は 9,485,334 で、そのうち 8,911,375（94%）が cache_read だった。コンテキストは約12kから約313kまで単調に増え、後半の約18ターンは 206k 以上だった。増加の主因は、入力外の読み込み（agent 8体・Phase Skill 4件・generation の references）と、`lib/`・`tests/`・canon-reference の grep の出力だった（`retro/session-analysis-B.md`）。
- 確度: 実物で確認（`work/20261012_030955/retro/session-analysis-B.md` の56〜67行。キャッシュの作り直しと advisor の上乗せは推測）
- 提案: v3 は designer を廃止し、`/canon-design` を inline にした（段階4）。同じ増え方が inline のメインで起きないかを、大の経路を通したときに `npm run tokens` で実測する。増えるなら、change-plan を節ごとに書いて1回の Write を小さくし、読む正典の節を `design` Skill の references に置く。
- 未決: 大の経路の実測が無い（段階6のベンチマークは小の経路）
- 予定: 大の経路の最初の run
## 2026-10-15 K5 がプレースホルダの参照を未解決と数え、内容を変えない既存ファイルを keep にできない（run 20261014_232320・Phase B）
- 種別: 欠陥修正
- 何が起きたか: 対象の focused.md は `specs/NNN-<slug>/spec.md` などのプレースホルダの参照を `resolved: false` にした（`work/20261014_232320/investigation/focused.md` 152〜158・197行）。K5（`.claude/skills/design/references/existing-disposition.md` 36行）は「`project_refs` がすべて `resolved: true`」なので、内容を変えない22件（P3 の時点。Phase C で keep を直した後は23件・`output/20261014_232320/design-map.md` 498行）が keep にならず modify に回った（`output/20261014_232320/design-map.md` の `## 生成上の制約`）。builder が大きな `drift-scan.mjs` まで逐語で書き写すことになり、写し違いの危険と生成コストが増える。
- 確度: 実物で確認
- 提案: investigation の語彙で、プレースホルダ（`<...>`・`NNN` などの規約の書き方）を `kind: placeholder` のように実在の参照と区別させ、K5 の照合（existing-disposition.md と verify V7）から除く。あわせて、K5 だけが理由の modify を `copy-keep` でコピーできる経路を用意するかを決める。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で K5 は廃止し、プレースホルダの区別を棚卸しと参照整合の検査に移す

## 2026-10-15 評価などで run の作業ディレクトリを使う作業が、本番の work/<ts>/ を動かして run を壊した（run 20261014_232320・Phase B）
- 種別: 規律昇華
- 何が起きたか: Phase B の開始時に `work/20261014_232320/investigation/` が無かった。別セッション（18e72daa、haiku の investigator 評価）が、本番ファイルの上書きを避けるためにそのスクラッチパッドへ退避し、戻さずに止まっていた。復旧は手順の外で行った（ユーザーの承認を得て `cp -a` で戻し、退避時の `inv.sha` と照合）。入力の実在の確認は、`npm run preflight`（段階4）が行うようになった。
- 確度: 実物で確認
- 提案: 評価などで run の作業ディレクトリを使う作業は、本番の `work/<ts>/` を動かさず写しで行う、と書く。
- 未決: 規則の置き場（`.claude/rules/workflow.md` か、評価を行う Skill）が決まっていない
## 2026-10-15 生成する README に「管理境界」節が無く、対象の canon-boundary.md が存在しない節を指す（run 20261014_232320・Phase C）
- 種別: 欠陥修正
- 何が起きたか: 対象の `.claude/skills/tsod-workflow/references/canon-boundary.md` の3行目・11行目は「管理範囲の正は `.claude/README.md` の「管理境界」節」と書くが、`.claude/skills/canon-c/scripts/emit-manifest.js` が書く README の節は「できること」「前提セットアップと配置後の手作業」「使用例」「注意と制約」だけで、「管理境界」節を作らない（`generated/` 全体の grep で、定義はこの md の見出しだけ）。prompt-audit（`output/20261014_232320/review/prompt-audit.md` の F1・信頼度高）が指摘した。この run では canon-boundary.md が内容を変えない modify のため、生成物側では直していない。
- 確度: 実物で確認
- 提案: emit-manifest.js が README に「管理境界」節（管理パス集合・管理外の扱い）を書くか、canon-boundary.md の参照元を README 以外（MANIFEST.md の管理パス一覧）に変える。どちらにするかは `design/architecture.md` の README の責務と合わせて決める。
- 未決: 2案ある（README に節を足すか、canon-boundary.md の参照先を変えるか）
- 予定: v3 刷新（tasks/20261016-canon-v3/）で README の生成を廃止する。対象の canon-boundary.md は対象側で直す（申し送り）

## 2026-10-15 keep→modify に直すとき、spec §3 の「関係する要件」の付与と P2 の取り直しが手順に無い（run 20261014_232320・Phase C）
- 種別: 欠陥修正
- 何が起きたか: keep-review の K2 指摘（R10 で既定の e2e が API を使わなくなった点と triage.md の食い違いなど）で、triage.md・direct-edit.md を keep から modify に直した。`.claude/skills/canon-c/SKILL.md` の「keep に及ぶ修正」は P3 の取り直しだけを書く。spec §3 では両ファイルに「関係する要件」が付いておらず、A2-1（関係する要件が無いファイルは内容が変わらない）の字面と食い違うため、spec §3 に要件を足して P2 も取り直した。さらに、triage.md を参照する test-investigator（keep）は、triage.md が modify（interface_change: breaking）になると K3 が成り立たず、designer が keep→内容を変えない modify に連鎖して直した（`work/20261014_232320/investigation/existing.md` の customization_refs）。
- 確度: 実物で確認（spec §3 の付与の経緯は、retro の分析の記述による）
- 提案: 「keep に及ぶ修正」に、(1) spec §3 の該当ファイルへの「関係する要件」の付与と P2 の取り直し、(2) 直す対象を `customization_refs` で参照する keep の K3 の再判定（連鎖して modify になりうる）を足す。
- 未決: K3 の再判定を canon-c と design のどちらに書くか
- 予定: v3 刷新（tasks/20261016-canon-v3/）で keep の判定を廃止し、impact と reviewer で置き換える

## 2026-10-15 canon-d の手順に、配置後の lessons-ledger apply と対象の作業ブランチの担当が無い（run 20261014_232320・Phase D）
- 種別: 欠陥修正
- 何が起きたか: 台帳の `apply` は、この run の RUN.md 2a（生成物の MANIFEST の転記）にだけ書かれていた。`.claude/skills/canon-d/SKILL.md` の「配置後」節は `apply` に触れない（grep で `apply` の記載なし）。作業ブランチも RUN.md の3「配置」が「切ります」と書くだけで担当が無く、人間の「作業ブランチは切って」で初めて実行した（`retro/session-analysis-D.md` の観点2。transcript 6de8c990 の 99 行）。生成物の MANIFEST に `apply` が無い run では、誰も `apply` を実行しない。あわせて、`lessons-ledger` の監査行は「N 件の削除」と言うが `git diff --stat` は行数（今回は13件・64行）で、人間が突き合わせにくい。
- 確度: 実物で確認（canon-d に `apply` の記載が無いこと）。「64行」は照合していない
- 提案: `.claude/skills/canon-d/SKILL.md` の「配置（人間が実行する）」に、(1) 配置前の作業ブランチの作成（この Phase が `switch -c` を実行するか、人間に案内するかの担当）と、(2) 生成物に `lessons-ledger` があれば、配置後に `apply` を実行して `diff --stat` を示す手順を足す。生成物側（lessons-ledger Skill）の監査行は、削除した見出しの件数を数えて表示する形にする。
- 未決: 作業ブランチを Phase が切るか、人間に案内するか
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（worktree のスクリプトが作業ブランチを作る）。監査行の件数表示は対象側の生成物の課題として対象の台帳に申し送る

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
