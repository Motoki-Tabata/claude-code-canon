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
- 確度: 拒否は実物で確認（plan の transcript 7f4f7a65 の `subagents/agent-ab5b01a3d20307…` の Write の結果が `tool_use_error`）。同じ日の build（01b70c47）では、reviewer 4体・prompt-auditor・session-analyst の `work/<ts>/review/`・`retro/` への Write はすべて成功した。拒否の条件は分かっていない。run 20261020_192336・plan（session 4c0e6f27）でも同じ文言で拒否され再発した（書込先 `work/20261020_192336/investigation/findings.md`、プロンプトに書込先の絶対パスを明記）。同じ回の claude-code-guide 2体は書込を伴わない
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
- 確度: 数値は実物で確認（plan 4c0e6f27・build 1b1a6954 の `npm run tokens`）。増えた理由は確かめていない
- 提案: plan のメインの1ターンあたりの入力を減らす（investigator の findings をメインが Write で書き写す分〔2026-10-19 の項目〕と、impact.json の全文を読む分が候補）。session-analyst は1体あたり約 1.3M で、目安を見直すか、分析の読む範囲（tool_result の大半を読まない）を定義に書く。どれも次の run の前に transcript で内訳を確かめる。
