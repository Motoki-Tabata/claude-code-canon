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
- 確度: 実物で確認（`npm run inventory` の出力と起動の実験）。入れ子の配置は公式で確認した（run 20261019_190415・plan の `investigation/official-check.md`。sub-agents ページの Choose the subagent scope に「Claude Code scans `.claude/agents/` and `~/.claude/agents/` recursively」とある）
- 提案: paths.json の欠けとして正典側に送り、`features/subagents.md` に再帰的な走査を書く。条件2の判定は、`check` が機能別の件数に分類外の `feature_hint` の件数を足して行うようにした（段階3）。

## 2026-10-17 /canon-build の `git -C <worktree> …` が allow 規則に当たらず、実行のたびに許可を求められる見込み（v3 段階4）
- 種別: 効率化
- 何が起きたか: `.claude/settings.json` の allow は `Bash(git diff *)`・`Bash(git status*)` など `git` の直後がサブコマンドの形だけを許す。`/canon-build` は worktree の diff・status・差分の書き出し（`git -C <worktree> diff <base>..HEAD > …`）を `git -C <worktree>` で呼ぶので、規則に当たらない。実際に許可の画面が出るかは対話のセッションで確かめていない（`claude -p` の実験は段階2の Edit の規則だけ）。
- 確度: 推測（allow 規則の文字列と Skill の手順の照合。画面は未確認）
- 提案: 対話で `/canon-build` を通して確かめる。出るなら、`worktree` スクリプトに `diff`（`--out` でファイルへ書き出す）を足して `npm run` に寄せるか、`Bash(git -C * diff*)` の読み取りだけの allow を足すかを決める。
- 段階6 の結果: run 20261019_190415 の build（01b70c47）のメインは `git -C <worktree> …`（status・diff・`--name-only`・`rev-parse`）を6回の Bash 呼び出し（`git -C` は計12回）で実行し、すべて結果を得た。許可の画面が出たかは transcript には残らないので、まだ分からない
- 予定: 次の対話の `/canon-build` で、画面が出たかを人間が確かめる

## 2026-10-19 investigator の findings.md の Write がハーネスに拒否され、成果物をメインが書き写した（run 20261019_190415・plan）
- 種別: 欠陥修正
- 何が起きたか: `/canon-plan` の計画2 の3で起動した investigator が書込先 `work/20261019_190415/investigation/findings.md` へ Write したところ、ツールが「Subagents should return findings as text, not write report files」と拒否した。findings は応答の本文で返り、メインが手順の外で書込先に保存した（約 3 万字の転記でメインの出力トークンを使った）。
- 確度: 拒否は実物で確認（plan の transcript 7f4f7a65 の `subagents/agent-ab5b01a3d20307…` の Write の結果が `tool_use_error`）。同じ日の build（01b70c47）では、reviewer 4体・prompt-auditor・session-analyst の `work/<ts>/review/`・`retro/` への Write はすべて成功した。拒否の条件は分かっていない。run 20261020_192336・plan（session 4c0e6f27）でも同じ文言で拒否され再発した（書込先 `work/20261020_192336/investigation/findings.md`、プロンプトに書込先の絶対パスを明記）。同じ回の claude-code-guide 2体は書込を伴わない。同じ回の build（1b1a6954）でも reviewer 2体・prompt-auditor・session-analyst 2体の Write は成功し、2回の run で拒否されたのは investigator の `findings.md` だけだった。拒否文（本文を最終応答に含めよ）は、`.claude/agents/investigator/investigator.md` の制約「本文を会話に再掲しない」と逆のことを求める。転記の費用は、plan のメインの Write の入力 26,609 字（4c0e6f27 のターン17/48）が残り30ターンの文脈に残る分
- 提案: 拒否が investigator だけに起きる条件（書込先の名前・プロンプトの言い方・定義の文面）を、`claude -p` で investigator を findings.md と別名の書込先で起動して切り分ける。条件が分かるまでは、canon-plan の「ワーカーの起動規則」に「Write が拒否されたら、応答の本文を書込先に保存してから続ける」を足す。

## 2026-10-19 計画3 で、変更前の検証コマンドの結果と impact の長い入力を、手順の外の操作で扱った（run 20261019_190415・plan）
- 種別: 規律昇華
- 何が起きたか: change-plan の `## 検証コマンド` を書く前に、worktree で `node --test` の4本と `verify.mjs --dry-run` を実行して、変更前の基準（drift-scan.test は 33 pass・1 fail）を取った。手順に無い操作だったが、build が「変更前から落ちていた fail」と「変更で落ちた fail」を区別するのに要る。また、30件のファイルと11語を `impact` に2回渡すため、`work/<ts>/.files`・`.terms` の一時ファイルに書いて使い、終わってから消した。run 20261020_192336・plan（session 4c0e6f27）でも再発: 計画2 の確認で worktree の `node --test` 3本・`verify.mjs --dry-run`・`drift-scan.mjs 004`（`/tmp/tsod-drift/004.md` を書く）を手順の外で実行し、変更前の基準を `## 検証コマンド` に書いた。impact の該当（ファイル単位で答える 85 ファイル分）を読むため、`impact.json` を node でファイル別に整形して scratchpad に書き出した。
- 確度: 実物で確認（このセッションの操作）
- 提案: canon-plan の計画3 の1に「検証コマンドを変更前の worktree で1回実行し、結果（pass・fail の件数と、変更前から落ちているもの）を `## 検証コマンド` に書く」を足す。impact の入力は、`impact` が change-plan.md の `## ファイル`・`## 影響の語` を直接読む `--from-plan` を持てば、一時ファイルが要らない。

## 2026-10-20 計画3 の「影響の語」が要件ごとに1つ以上あるかを検査せず、R5 の参照元2行が impact に出なかった（run 20261020_192336・build）
- 種別: 欠陥修正
- 何が起きたか: change-plan の `## 影響の語` 12語のうち、R5・R6・R7・R12 に対応する語が無い（手で数えた）。R5 は「委譲より前に書く」の例外を足す変更で、同じ規則を述べる `impact-scope/SKILL.md:62` と `tsod-workflow/references/direct-edit.md:40` が impact に出ず、build の reviewer が medium で指摘した（work/20261020_192336/review/review-1.md の指摘2）。R6・R7・R12 で同様の取りこぼしがあるかは確かめていない。
- 確度: 実物で確認（R5 の2行）。R6・R7・R12 の取りこぼしは推測
- 提案: canon-plan の計画3 の2（`.claude/skills/canon-plan/SKILL.md`）に、「requirements.md の各要件に影響の語を1つ以上置く。置けない要件は理由を change-plan に書く」を足し、`tools/check.js` に要件ごとの語の有無の検査を足す。

## 2026-10-20 reviewer の「参照先の実在」が変えたファイルだけに効き、触らないファイルの存在しない節への参照を2回続けて見逃した（run 20261020_192336・build）
- 種別: 欠陥修正
- 何が起きたか: 対象の `.claude/skills/tsod-workflow/references/canon-boundary.md:3`・`:11` は `.claude/README.md` の「管理境界」節を正として指すが、README の見出し（`#`〜`###`）にその節は無い。この run では canon-boundary.md は参照元（変えない）で、reviewer は `work/20261020_192336/review/review-1.md:249` で「台帳と境界の説明で手順は不変」として問題なしにし、prompt-auditor（範囲は変えたファイル）も挙げていない。1回目の run 20261019_190415 では canon-boundary.md が変えるファイルだったので prompt-auditor が H3 で挙げ、reviewer は見逃した。`.claude/skills/review/references/perspectives.md:8` の「参照先の実在」は「変えたファイルの中の」参照に限っている。
- 確度: 実物で確認（worktree の README の見出し・canon-boundary.md・review-1.md・perspectives.md）
- 提案: perspectives.md の「参照先の実在」を、担当の参照元のうち impact の該当行と同じファイルにある節名・パスの参照にも広げる（全行ではなく、reviewer が読んだ参照元のファイルの中だけ）。広げると reviewer の入力が増えるので、効果と増分は次の run で測る。

## 2026-10-20 reviewer の割当を直して減った分を、plan のメイン・investigator・session-analyst の増分が打ち消した（run 20261020_192336・plan と build）
- 種別: 効率化
- 何が起きたか: `npm run tokens` の総入力は 26.56M で、1回目の 26.38M とほぼ同じだった。reviewer は 8.87M（4体）から 5.63M（2体）に、builder は 1.70M から 1.34M に減った。plan のメイン（opus）は 6.87M から 7.55M（48ターン、cache read 7.32M で1ターンあたり約 15万）、investigator は 1.65M から 3.14M（37ターン）、session-analyst は 0.96M（1体）から 2.59M（2体）に増えた。段階1の目安（design/architecture.md §6.2）は、plan のメイン 4.5M・investigator 1.5M・振り返り 1.5M。plan のメインと investigator が増えた理由は、session-analysis-plan-4c0e6f27.md に書かれていない（investigator は R1〜R13 を実物と公式で確かめ直し、7件の文言を直した）。
- 内訳（保守作業で transcript をターンごとに分解。持ち越し＝tool_result の字数×残りターン数）: plan のメインの +0.69M は、(a) impact.json をファイル別に整形して scratchpad から Read した 54,462 字（4c0e6f27 のターン34・35/48、持ち越し 688,995 字ターン。1回目には無い）と、(b) 1ターン目の総入力の増加（7f4f7a65 の 46,972 → 4c0e6f27 の 53,936、×48 で約 +0.33M）でほぼ説明できる。(b) の増えた理由は確かめていない。investigator は 20ターンから 37ターンになり、Grep 53回の結果が計 87,217 字（ターン3 の1回だけで 13,182 字、持ち越し 435,006 字ターン）、Read 42回が 58,112 字だった。どのメインも1ターン目で約 47k〜54k あり、plan（48ターン）では総入力の約3分の1がこの固定分で、ターン数がそのまま効く
- 確度: 数値は実物で確認（plan 4c0e6f27・build 1b1a6954 の `npm run tokens` と、各 jsonl のターンごとの usage・tool_result）。(b) の理由は確かめていない
- 提案: `.claude/agents/investigator/investigator.md` の制約に「Grep は `files_with_matches` か `head_limit` から始め、当たったファイルだけを content で読む」を足す。findings の書き写しは 2026-10-19 の項目で、session-analyst の分は 2026-10-20 の「session-analyst が jsonl の生の行を読む」の項目で直す。
- 未決: (a) の読み方。計画3 の3 は該当のすべてに答えさせるので一覧は要る。答える行（ID）だけを1行ずつ並べたファイルを `impact` が書けば整形の手間は消えるが、読む字数が減るかは測っていない

## 2026-10-20 reviewer が impact.json を1回の Read で読み、約44k字で切れた先の該当を読んでいない（run 20261019_190415・20261020_192336・build）
- 種別: 欠陥修正
- 何が起きたか: reviewer は impact.json を `limit` 無しで1回だけ Read し、結果は約44k字で切れていた。1回目の reviewer 2体（01b70c47 の `subagents/agent-ab2bb5839387858db`・`agent-aaff5c1f238f0eda4`）は 2118行のうち 908行まで、2回目（1b1a6954 の `agent-a362c44a40110152d`）は 3636行のうち 992行までしか見ていない。残りを offset で読み直しても、Grep してもいない。canon-boundary.md の該当は 1回目 1206行〜・2回目 2079行〜で、読めた範囲の外にある。`.claude/agents/reviewer/reviewer.md:17` は impact.json を入力に挙げるだけで、`.claude/agents/builder/builder.md:26` の「`"id": "<path>:` で Grep する。impact.json の全体は読まない」に当たる指示が無い。
- 確度: 実物で確認（3体の jsonl の Read の tool_result の末尾の行番号と、`wc -l`・`grep -n` の行番号）。管理境界の見逃し（2026-10-20 の「参照先の実在」の項目）への寄与は推測（2回目の reviewer は change-plan の `## 参照元の扱い` から canon-boundary.md を判定している）
- 提案: `.claude/agents/reviewer/reviewer.md` の手順に、判定する対象（変えたファイルと担当の参照元）の path ごとに impact.json を `"id": "<path>:` で Grep して該当を読み、全体は Read しない、と書く。

## 2026-10-20 change-plan で「変える」と答えた該当行を builder が直さなくても、機械が検出しない（run 20261020_192336・build）
- 種別: 欠陥修正
- 何が起きたか: `.claude/rules/ui-design.md:14:ui-design-standard` は `work/20261020_192336/change-plan.md:145` で「変える」と答えてあり、impact.json にも ID がある。builder 6体の報告は「計画と一致」だったが、この行は直っておらず、メインが手で見つけて差し戻した（`work/20261020_192336/retro/session-analysis-build-1b1a6954.md` の観点1 の A）。verify は合格していた。
- 確度: 実物で確認（change-plan・impact.json・振り返りの分析）
- 提案: `lib/verify/` の V6 に、change-plan で「変える」と答えた `scope: changed` の該当（`<path>:<line>:<term>`）の行が、`diff.patch` のそのファイルの変更行に含まれるかの照合を足す。含まれなければ違反にする。

## 2026-10-20 session-analyst が transcript の jsonl の生の行を読み、1体あたり 1.0M〜1.6M を使う（run 20261020_192336・build）
- 種別: 効率化
- 何が起きたか: 2回目の振り返りの session-analyst 2体の総入力は計 2.59M（1b1a6954 の `agent-a5ad80b6647a1abfd` 1,032,080・`agent-a9b0a20c2f116e554` 1,557,273）。a9b0 は jsonl を Read 28回で 174,662 字、Grep 28回で 67,831 字読み、1回で 3万字前後の Read が2回あった。jsonl の1行は tool_result の全文を含むので、Grep で行を絞っても長い。
- 確度: 実物で確認（jsonl のターンごとの usage・tool_result）
- 提案: `tools/token-usage.js` に、ターンごとの総入力・そのターンのツール呼び出しの要約・tool_result の字数・持ち越し（字数×残りターン数）を出す `--turns` を足し、`.claude/agents/session-analyst/session-analyst.md` の手順1 で先にそれを読んでから jsonl の該当行だけを読むようにする。保守作業で書いた試作は1セッションが約50行に収まった。

## 2026-10-20 change-plan の `## 参照元の扱い` が膨らみ、build のメインと reviewer が全文を読む（run 20261020_192336・build）
- 種別: 効率化
- 何が起きたか: 変えるファイルの中の該当（`scope: changed`）を足したので、change-plan の `## 参照元の扱い` は 6,785 バイト（run 20261019_190415）から 15,196 バイトに、change-plan 全体は 26,728 字になった。build のメイン（1b1a6954 のターン1/38）と reviewer（a362 のターン0）が全文を Read した。reviewer a362 は最初の3ターンで change-plan・impact.json・requirements.md・diff.patch を読み、ターン1・2 だけで cache_creation が 50,867・28,741 増え、これが残り約33ターン持ち越されて、総入力 5,392,288 の約半分になる。
- 確度: 実物で確認（`wc -c`・節ごとの集計・jsonl のターンごとの usage）。「約半分」は (50,867＋28,741)×33 の概算
- 提案: `.claude/skills/canon-build/SKILL.md` の構築1 の1 と `.claude/agents/reviewer/reviewer.md` で、change-plan は `## ファイル` と担当の行だけを Grep で読む、と書く。
- 未決: `## 参照元の扱い` を change-plan から別ファイルに分けるか（`check`・`approvals`・V6 が読む位置が変わる）

## 2026-10-20 `check` の節ごとのサイズの上限を、段階6の実測で見直していない（保守作業）
- 種別: 規律昇華
- 何が起きたか: `design/architecture.md` §4.1 は、`check` の節ごとの上限を R2 の実測から決め、「段階6の実測で見直す」としていたが、段階6では見直さなかった。段階6の2回の run の requirements.md・change-plan.md の節の大きさと上限との比較は、まだ行っていない。v3 の後片付けで §4.1 からその一文を消し、本台帳に移した。
- 確度: 文言のみ（handoff の後片付けの指示と §4.1 の文面）
- 提案: run 20261019_190415・20261020_192336 の requirements.md と change-plan.md を、節ごとの UTF-8 バイト数で数えて §4.1 の表と比べる。上限に近い節か余りすぎる節があれば、`tools/check.js` の上限と §4.1 の表を直す。

## 2026-10-20 v3 で一度も通していない経路が4つある（v3 段階6）
- 種別: 規律昇華
- 何が起きたか: 段階6の2回の run（どちらも小の経路・op は modify だけ・検証コマンドは node の組込みだけで動き、依存の導入が要らなかった）で、次の経路を通していない。(1) 依存の導入を要する検証コマンド（`/canon-build` 構築2 の1 の導入の手順）。(2) 対話のセッションで `~/.claude-canon/wt/**` の allow 規則と `git -C` に許可の画面が出たか（transcript に残らない。2026-10-17 の `git -C` の項目）。(3) builder の Write での新規作成（change-plan の `op: new`。`Edit(~/.claude-canon/wt/**)` の規則が Write に効くかは未確認）。(4) 大の経路（`/canon-design`。2026-10-12 の designer の項目）。
- 確度: 実物で確認（2回の run の change-plan.md の `op` と `## 検証コマンド`）
- 提案: 次の run で、通していない経路を含む対象を選ぶか、`claude -p` で (1)・(3) を単独で確かめる。確かめた経路は、この項目から消す。
