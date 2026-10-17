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

## 2026-10-10 canon 自身の investigator を haiku・effort high の役に分けられるかを実地で評価していない（保守作業）
- 種別: 効率化
- 何が起きたか: `.claude/skills/design/references/model-selection.md` の haiku の条件は、事実の抽出に徹して後段で検証される作業に haiku・`effort: high` を使える形になった。canon 自身の investigator は existing・profile（事実の抽出）と focused（要件に照らした推論）を1体で担うので、sonnet のまま据え置いている。haiku と sonnet の出力の実地比較はしていない。
- 確度: 実物で確認（profile の比較は `work/20261014_232320/eval/haiku/profile.md` に1件だけある）
- 提案: 小さな対象で existing・profile を haiku・`effort: high` で動かし、sonnet の出力と比べる。採るなら existing・profile 用の agent を分け、`tests/self_application.test.js` の agent 8体の固定（EXPECTED_AGENTS）と Agent の例示に `model=` を書かない検査、`.claude/skills/canon-a/SKILL.md` の工程1、`design/architecture.md` の Agent 表を同じ変更で直す。
- 予定: v3 刷新（tasks/20261016-canon-v3/）の段階4（T4-3）。段階1で、existing は `inventory` のスクリプトに、profile は haiku・high の `profiler` に分け、haiku を採る基準を「model-selection の3条件を満たし、本番の出力と同じ事実の項目が揃うこと」と決めた（`design/architecture.md` §6.1）

## 2026-10-12 designer のコンテキストが約12kから約313kまで増え、入力の94%がキャッシュ読みになる（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の designer の総入力は 9,485,334 で、そのうち 8,911,375（94%）が cache_read だった。コンテキストは約12kから約313kまで単調に増え、後半の約18ターンは 206k 以上だった。増加の主因は、入力外の読み込み（agent 8体・Phase Skill 4件・generation の references）と、`lib/`・`tests/`・canon-reference の grep の出力だった。Write（出力 46k トークン）の直後にキャッシュが全量作り直された（推測）。advisor の2回の呼び出しで約0.5M が上乗せされたと見られる（推測）（`retro/session-analysis-B.md`）。
- 確度: 実物で確認（`work/20261012_030955/retro/session-analysis-B.md` の56〜67行。キャッシュの作り直しと advisor の上乗せは推測）
- 提案: design-map を節ごとに書かせて、1回の Write の出力を小さくする。designer が入力外の `lib/`・`tests/` を読まずに済むよう、必要な事実を design Skill の references に置く（README の扱いは PR 24 で置いた）。実測してから決める（推測を含む）。
- 未決: 施策は実測してから決める
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（小の経路では designer を使わない・入力を圧縮する・節ごとに Write する）

## 2026-10-14 README の前提セットアップ節と配置手順に、ワークスペースの trust 承認が出ない（run 20261014_232320・Phase A）
- 種別: 欠陥修正
- 何が起きたか: 対象 skillweave-mhwilds の `tasks/lessons.md`（2026-10-03 の項目）によると、trust dialog を承認していないワークスペースでは、Subagent の frontmatter の hooks と `.claude/settings.json` の `permissions.allow` が警告なしで捨てられた（`claude -p --debug-file` のログで確認済み）。`.claude/skills/canon-c/scripts/emit-manifest.js` の `setupItems`（195行〜）は、settings の hooks・fork・MCP は拾うが、frontmatter hooks・permissions を持つ構成に trust の前提を出さない。そのため README は「なし」と書いた。canon-d の配置手順にも、信頼状態の確認（`~/.claude.json` の `projects[<root>].hasTrustDialogAccepted`）が無い。
- 確度: 文言のみ（trust 未承認で hooks と permissions が捨てられる点は、対象の `tasks/lessons.md` の記録。canon 側では再現していない）。`setupItems` に trust の項目が無いことは実物で確認
- 提案: `setupItems` に、生成物が hooks（settings・frontmatter のどちらでも）か `permissions` を持つときは「対象リポジトリで Claude Code を対話起動して trust dialog を承認する」を出す項目を足す（`tests/emit_manifest.test.js` に故意の注入で発火を示すテストを足す）。canon-d の配置後の実発火確認の最初に、信頼状態の確認を置く。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（README の生成は廃止し、verify の警告と差分のゲートで示す）

## 2026-10-15 K5 がプレースホルダの参照を未解決と数え、内容を変えない既存ファイルを keep にできない（run 20261014_232320・Phase B）
- 種別: 欠陥修正
- 何が起きたか: 対象の focused.md は `specs/NNN-<slug>/spec.md` などのプレースホルダの参照を `resolved: false` にした（`work/20261014_232320/investigation/focused.md` 152〜158・197行）。K5（`.claude/skills/design/references/existing-disposition.md` 36行）は「`project_refs` がすべて `resolved: true`」なので、内容を変えない22件（P3 の時点。Phase C で keep を直した後は23件・`output/20261014_232320/design-map.md` 498行）が keep にならず modify に回った（`output/20261014_232320/design-map.md` の `## 生成上の制約`）。builder が大きな `drift-scan.mjs` まで逐語で書き写すことになり、写し違いの危険と生成コストが増える。
- 確度: 実物で確認
- 提案: investigation の語彙で、プレースホルダ（`<...>`・`NNN` などの規約の書き方）を `kind: placeholder` のように実在の参照と区別させ、K5 の照合（existing-disposition.md と verify V7）から除く。あわせて、K5 だけが理由の modify を `copy-keep` でコピーできる経路を用意するかを決める。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で K5 は廃止し、プレースホルダの区別を棚卸しと参照整合の検査に移す

## 2026-10-15 Phase B の開始手順が入力の実在を確かめず、別作業に動かされた investigation/ に designer 起動の直前まで気づけない（run 20261014_232320・Phase B）
- 種別: 規律昇華
- 何が起きたか: Phase B の開始時に `work/20261014_232320/investigation/` が無かった。別セッション（18e72daa、haiku の investigator 評価）が、本番ファイルの上書きを避けるためにそのスクラッチパッドへ退避し、戻さずに止まっていた。`approvals check` は requirements.md と spec.md しか見ないので通った。復旧は手順の外で行った（ユーザーの承認を得て `cp -a` で戻し、退避時の `inv.sha` と照合）。
- 確度: 実物で確認
- 提案: `.claude/skills/canon-b/SKILL.md` の開始手順に、工程5 の入力（investigation の3ファイル）が実在するかの確認を足すか、`tools/check.js` に入力の実在を検査する対象を足す。評価などで run の作業ディレクトリを使う作業は、本番の `work/<ts>/` を動かさず写しで行う、と書く場所を決める。
- 未決: 行き先が2案ある（canon-b の開始手順か `tools/check.js` か）。評価で run の作業ディレクトリを使うときの規則の置き場も決まっていない
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（開始時の照合を1コマンドにまとめ、入力の実在を含める）

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

## 2026-10-15 keep の K2（要件との衝突）が Phase C の keep-review で初めて見つかり、P2・P3 の取り直しになった（run 20261014_232320・Phase C）
- 種別: 規律昇華
- 何が起きたか: R10 は既定の e2e の段を API・DB なしの1段にする要件だが、triage.md（keep）の32行目は「api は起動し直し、テスト用コンテナも作り直す」を既定にしていた。Phase B の designer は K2 を true にし、Phase C の keep-reviewer（`output/20261014_232320/review/keep-review.md`）が medium で指摘して、P2・P3 の取り直しと再生成になった。designer の K2 の根拠は、要件が触れるコマンドや挙動を keep の本文で grep する手順を持たない。
- 確度: 実物で確認（keep 時点の triage.md の原本の32行目は照合していない）
- 提案: `.claude/skills/design/` の keep の判定（K2）に、要件の want が変えるコマンド名・既定の挙動・語（例: `--e2e`・`docker`）を keep の本文で grep し、ヒットした keep を K2 の根拠に挙げる手順を足す。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（impact が、要件の語やコマンドに触れる触らないファイルを列挙する）

## 2026-10-15 対象 lessons の文言を実物と照合せずに要件にしたため、P1 の取り直しと P2 前の spec 修正になった（run 20261014_232320・Phase D）
- 種別: 規律昇華
- 何が起きたか: R7（packages/data の tsconfig 分割）と R12(2)（SelectTrigger の sonar 抑止）は、対象の lessons の文言を根拠に P1 で確定したが、focused 調査で実物と食い違い、P1 を取り直した。A1-1 の「警告なしで」も lessons の文言の引き継ぎで、P2 前の公式照合で初めて公式と合わないと分かった（`work/20261014_232320/retro/session-analysis-A.md` の 2-1・2-2。transcript 53741b48 の 283〜319・394〜412 行）。`.claude/skills/canon-a/SKILL.md` の工程には、lessons の文言を要件にする前に実物で確かめる手順が無い（`lessons`・`実物` の grep は33行の起票規則のみ。工程1 全文の通読は分析側では未了）。
- 確度: 実物で確認（P2 の前の公式照合は `0ee45b9` で canon-a に入っている。残りは P1 の前の実物照合と、spec-writer への official-check の受け渡し）
- 提案: refactor で lessons を要件にするとき、P1 の前に、要件1件ごとに lessons の主張（ファイルの形・設定値・挙動）を対象の実物で確かめ、`requirements.md` の根拠欄に「実物で確認」か「文言のみ」を書かせる。「文言のみ」は P1 で確定させず、focused 調査の結果を待つ。spec-writer には official-check.md の結論と食い違う語を受入基準に書かないよう渡す（推測: spec-writer が official-check の結論を取り込まなかった）。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（要件ごとに根拠の確度を書き、「文言のみ」は G1 で確定させない）

## 2026-10-15 keep→modify の取り直しで P2 と P3 を1つの問いで取っている（run 20261014_232320・Phase D）
- 種別: 規律昇華
- 何が起きたか: Phase C で keep を modify に直したとき、P3 の承認と spec §3 への要件付与・P2 の取り直しを AskUserQuestion の1問に束ねて承認を取り、同じ Bash 呼び出しで spec 編集・`record P2`・`record P3`・`check` を実行した（`retro/session-analysis-C.md` の観点1-1。transcript f7cbf049 の 291・292・301 行）。承認は得ているが、`.claude/rules/workflow.md` の「承認ゲートを独立の関門として扱う」と食い違う。`.claude/skills/canon-c/SKILL.md` の「keep に及ぶ修正」は、P2・P3 を別々に取ることを書かない。
- 確度: 文言のみ（`retro/session-analysis-C.md` の観点1-1。transcript 本体は照合していない）
- 提案: `.claude/skills/canon-c/SKILL.md` の「keep に及ぶ修正」に、P2 と P3 を別の問いで提示して別々に承認を取ること（spec §3 の差分を P2 の問いに、design-map の差分を P3 の問いに示す）を足す。
- 予定: v3 刷新（tasks/20261016-canon-v3/）で P2・P3 の取り直しの経路は無くなる。ゲートを別の問いで取る規則は v3 の Phase Skill に書く

## 2026-10-15 canon-d の手順に、配置後の lessons-ledger apply と対象の作業ブランチの担当が無い（run 20261014_232320・Phase D）
- 種別: 欠陥修正
- 何が起きたか: 台帳の `apply` は、この run の RUN.md 2a（生成物の MANIFEST の転記）にだけ書かれていた。`.claude/skills/canon-d/SKILL.md` の「配置後」節は `apply` に触れない（grep で `apply` の記載なし）。作業ブランチも RUN.md の3「配置」が「切ります」と書くだけで担当が無く、人間の「作業ブランチは切って」で初めて実行した（`retro/session-analysis-D.md` の観点2。transcript 6de8c990 の 99 行）。生成物の MANIFEST に `apply` が無い run では、誰も `apply` を実行しない。あわせて、`lessons-ledger` の監査行は「N 件の削除」と言うが `git diff --stat` は行数（今回は13件・64行）で、人間が突き合わせにくい。
- 確度: 実物で確認（canon-d に `apply` の記載が無いこと）。「64行」は照合していない
- 提案: `.claude/skills/canon-d/SKILL.md` の「配置（人間が実行する）」に、(1) 配置前の作業ブランチの作成（この Phase が `switch -c` を実行するか、人間に案内するかの担当）と、(2) 生成物に `lessons-ledger` があれば、配置後に `apply` を実行して `diff --stat` を示す手順を足す。生成物側（lessons-ledger Skill）の監査行は、削除した見出しの件数を数えて表示する形にする。
- 未決: 作業ブランチを Phase が切るか、人間に案内するか
- 予定: v3 刷新（tasks/20261016-canon-v3/）で（worktree のスクリプトが作業ブランチを作る）。監査行の件数表示は対象側の生成物の課題として対象の台帳に申し送る

## 2026-10-17 paths.json に Agent の入れ子の配置が無い（v3 段階2）
- 種別: 欠陥修正
- 何が起きたか: canon 自身の Agent は `.claude/agents/<name>/<name>.md`（8体）に入れ子で置いてあり、`claude -p` で `subagent_type: builder` が実際に起動した。しかし `data/paths.json` の配置は `.claude/agents/*.md` だけで、`inventory` は8体を subagents でなく分類外に出す（`feature_hint` で subagents と示すようにはした）。architecture.md §2.1 の条件2「機能のファイルが0件か」の判定を `inventory` の機能別の件数だけで行うと、小の経路の対象が大に倒れうる。
- 確度: 実物で確認（`npm run inventory` の出力と起動の実験）。入れ子の配置が公式で認められているかは未確認（`lib/features.js` の EXTRA_PATHS のコメントは subagents.md §3 を挙げるが、そこに該当の記述は見つからなかった）
- 提案: 条件2の判定は、機能別の件数に分類外の `feature_hint` の件数を足して行う（段階3で `check` に実装する）。入れ子の配置が公式で認められるかは `features/subagents.md` と公式で確かめ、認められるなら paths.json の欠けとして正典側に送る。
- 予定: v3 刷新（tasks/20261016-canon-v3/）の段階3
