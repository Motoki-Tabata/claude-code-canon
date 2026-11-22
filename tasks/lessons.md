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

## 2026-10-20 plan のメインの1ターン目の総入力が run のたびに増える（run 20261020_192336・plan、20261021_185834 で再測）
- 種別: 効率化
- 何が起きたか: plan のメイン（opus）の1ターン目の総入力は、7f4f7a65 の 46,972 → 4c0e6f27 の 53,936 → 7489e50d（run 20261021_185834）の 59,062 と増えている。×49ターンで約 +0.25M に当たる。増えた理由は確かめていない。plan 段のメイン全体は 6.43M（49ターン）で、前回の 7.55M より減った。
- 確度: 数値は実物で確認（`npm run tokens -- <id> --turns`）。増えた理由は確かめていない
- 提案: 次の plan の run で、1ターン目の内訳（システムプロンプト・CLAUDE.md・Skill 一覧・最初の Skill 本文）を、transcript の先頭の入力で切り分ける。canon 側で減らせる部分（Skill 本文の長さ）が主因なら、そこを直す。
## 2026-10-20 依存の導入を要する検証コマンドの経路を v3 で一度も通していない（v3 段階6）
- 種別: 規律昇華
- 何が起きたか: 大の経路の実 run（20261021_185834）で、worktree の許可の画面・builder の `op: new` の Write・大の経路は通った。通していないのは、依存の導入を要する検証コマンド（`/canon-build` 構築2 の1 の導入の手順）だけである。この run の検証コマンドは `node --test` と `git grep` で、導入は要らなかった。
- 確度: 実物で確認（`work/20261021_185834/change-plan.md` の `## 検証コマンド`）
- 提案: 依存の導入を要する対象（`package.json` の依存を `pnpm install` などで入れてから検証する対象）の run で通し、導入の手順の許可の画面とエラーの扱いを確かめて、本項目を消す。
## 2026-10-21 「直近の transcript」を日付で選ぶと、対象のワークフローを回していないセッションを選ぶ（run 20261021_185834・plan）
- 種別: 規律昇華
- 何が起きたか: 要件の材料に「対象の直近数件」を選んだとき、メインは日付の新しい順に 10/19・10/18・10/09 を挙げた。tokens と冒頭の依頼を見ると、canon-plan の中断・git 操作・デザインシステムの刷新で、TSOD の段を回したものは無かった。全33件の冒頭の依頼をメインが node のワンライナーで一覧にして、10/06 の1周に選び直した。
- 確度: 実物で確認（`work/20261021_185834/tokens-*.txt`）
- 提案: `.claude/skills/requirements/references/interview.md` の「transcript の分析を要件の材料に指定したとき」に、候補は日付でなく冒頭の `<command-name>`（対象側の段のコマンド）で選び、ワークフローの1周を単位にする、と足す。候補の一覧（日付・サイズ・冒頭の依頼）を出すスクリプトを `npm run tokens` に足すかは未決。
- 未決: 一覧を tokens のオプションにするか、別のスクリプトにするか

## 2026-10-21 「canon の構成から提案して」という依頼の手順が無く、メインが対象を直接読んだ（run 20261021_185834・plan）
- 種別: 規律昇華
- 何が起きたか: ユーザーは要件を述べず、「canon の刷新で得た構成やセッション履歴から、適用できる内容を提案してほしい」と頼んだ。interview.md の質問は、ユーザーが want を持っている前提である。提案を作るため、メインが対象の CLAUDE.md・settings.json・Skill と Agent の分量・frontmatter の hooks・canon-boundary.md・`.claude/README.md` を Bash で直接読んだ（調査はワーカーに任せる、という SKILL の方針の外）。
- 確度: 実物で確認（このセッションの transcript）
- 提案: `interview.md` に「提案を求められたとき」の節を足す。材料は inventory の要約・profile・session-analysis・`design/architecture.md` とし、提案は仮説として示し、採ったものを investigator で確かめてから確定する。メインが対象を直接読むのは、inventory.json の抜き出しと分量の計測に限る。

## 2026-10-21 canon-design の入力の列挙に session-analysis が無く、plan の申し送りが指す分析ファイルを読むと手順の外になる（run 20261021_185834・design）
- 種別: 欠陥修正
- 何が起きたか: canon-design/SKILL.md の設計1 の1と design/SKILL.md の「読む範囲」は、入力を requirements.md・inventory.json・investigation/ だけとする。一方で plan の段の申し送りは「判断の材料は … session-analysis-build.md の拒否の内訳の表」と分析ファイルを指し、R11 の判断にはその表（hook の拒否11件の内訳）が要った。design の段は、手順の外で work/<ts>/session-analysis-build.md を読んだ。
- 確度: 実物で確認（handoff.md の申し送り・両 SKILL.md の該当行）
- 提案: canon-design/SKILL.md の設計1 の1の入力に「handoff の申し送りが指す work/<ts>/session-analysis-*.md（指された節だけ）」を足し、design/SKILL.md の「読む範囲」をそれに合わせる。

## 2026-10-21 plan 段の session-analyst 5起動が総入力の約半分を使う（run 20261021_185834・build）
- 種別: 効率化
- 何が起きたか: plan 段（session 7489e50d）の区分別の消費は、session-analyst（haiku）が5起動・303ターン・総入力 12,242,395 で全体の 49.9%、main（opus）は 26.2%。1起動あたり平均 約60ターン・総入力 約244万。`npm run tokens` の集計表（`work/20261021_185834/retro/tokens-7489e50d-4ce8-4a9a-b66c-e3ca84035f1c.txt`）と `retro/session-analysis-plan-7489e50d.md` の観点3。
- 確度: 実物で確認（tokens の集計表）。ターンが多い原因は未確認。
- 提案: `.claude/agents/session-analyst/session-analyst.md` の「読む範囲」に、渡された観点に関係する行だけを Grep で絞ってから Read する旨と、1起動のターン数の目安を足す。
- 未決: 原因が transcript の大きさか読み方かを、plan 段の session-analyst の transcript で切り分けてから決める。

## 2026-10-21 verify の不合格の原因が canon の検査の誤検出だったときの経路が build の手順に無い（run 20261021_185834・build）
- 種別: 規律昇華
- 何が起きたか: 構築2で V1 が対象のルート `README.md` を「配置の誤り」と判定して不合格になった（原因は `lib/non-schema.js` の除外漏れ）。`canon-build/SKILL.md` 構築2の3は対象のファイルを直す手順だけで、canon の検査側の誤検出の扱いが無いため、メインが手順の外で台帳に起票し、ユーザーに直し方を尋ね、canon に別コミット（`bc94455`）を積んだ。canon の HEAD が run の開始時から変わり、以後の preflight は `WARN canon` を出す。
- 確度: 実物で確認（`canon-build/SKILL.md` に該当の記述が無いことを grep で確かめた）
- 提案: `canon-build/SKILL.md` 構築2の3に、「違反の原因が canon の検査の誤検出なら、台帳に起票してユーザーに『canon を直す』か『対象の変更を外す』かを尋ねる。canon を直すときは別コミットにし、差分のゲートの提示に載せる」を足す。
- 再発（run 20261122_132204・build）: 構築2の verify が V1 6件（`specs/`・`tasks/README.md`・`docs/decisions/` の文書の .md）と V6 1件（`tasks/README.md:25` の「変える」の行が、文面の同じ行を差分が別の位置に照合して「変わっていない」と判定）で不合格になり、同じ経路で、手順に無い問いをユーザーに出して canon を直した（canon の commit 7898978。V1 は `.claude/` の外で種別の慣用句を持たない .md を非スキーマにし、V6 は空行で区切る同じまとまりの変更を直したと見なす）。手順に経路が無いまま2回目になった。
## 2026-10-27 正典に組込みの /design の起動の条件と展開の挙動が無い（run 20261027_111036・plan）
- 種別: 欠陥修正
- 何が起きたか: 対象の台帳の論点（/design の起動のしかた）を investigator が正典で確かめようとしたが、`data/builtin-commands.json` は /design を Skill として列挙するだけで、起動の条件と展開の挙動が無かった。公式（artifacts.md「Draft a design canvas」・skills.md「Run a skill」）には「brief からキャンバスを作り Claude Design の artifact として公開する」「メッセージの先頭に置けば実行し、平文の後では実行しない」がある（`work/20261027_111036/investigation/official-check.md` の R1）。
- 確度: 実物で確認（正典のデータと公式の原文）
- 提案: `canon-reference` の組込み Skill の説明（`/design` の項）に、展開の結果と「先頭に置くと実行・文中では許可のみ」を出典付きで足す。モデルが起動できるかは公式に記述が無いので、無いことを書く。
## 2026-10-27 セッション履歴の分析の対象が20件を超えると、1メッセージでの並列起動が上限で失敗する（run 20261027_111036・plan）
- 種別: 規律昇華
- 何が起きたか: 対象の25セッションを `session-analyst` で1件1体として1メッセージで起動したところ、21件目から「Concurrent subagent limit reached（20）」で失敗した。残りの5件は、先に起動した分析が終わるたびに1件ずつ起動した。`interview.md`「過去のセッション履歴の分析」と canon-plan の起動規則は「1つのメッセージで並列に起動」とだけ書き、上限を超えたときの扱いが無い。
- 確度: 実物で確認（このセッション a228330a の Agent の結果）
- 提案: `.claude/skills/requirements/references/interview.md` の該当節に、同時起動の上限（既定20）を超えるときは20件ずつ起動し、終わった分だけ補充する、を足す。
## 2026-10-27 参照元の扱いの答えを、手順に無い python で change-plan.md に差し込んだ（run 20261027_111036・plan）
- 種別: 効率化
- 何が起きたか: impact の該当は504件（144ファイル）だった。メインは答えの方針（変える行の一覧と、場所ごとの「変えない」の理由）を決め、python で impact.json から ID を引いて `## 参照元の扱い` の186行を作り、change-plan.md に差し込んだ。canon-plan の計画3は書き方を定めるだけで、多数の該当を答える道具が無い。主張の一覧（claims-*.md）と分析の観点のファイルも、手順に無い Write で work/<ts>/ に置いた。
- 確度: 実物で確認（work/20261027_111036/change-plan.md、check は OK）
- 提案: `tools/impact.js` に、変える行の ID 一覧と「変えない」の理由の規則（パスの接頭辞ごと）を受けて `## 参照元の扱い` の下書きを出すオプションを足し、canon-plan の計画3からそれを使う。

## 2026-10-27 build 中に計画外のファイルを足すと、計画の再承認が要る（run 20261027_111036・build）
- 種別: 規律昇華
- 何が起きたか: 構築3のレビューの指摘で、change-plan に無い6ファイルを直した。verify は V7（計画に無い差分）で不合格になった（verify-report.md の V7）。change-plan を足すと G1 のハッシュも変わる。（同じ run の V1 の不合格は、文書の .md を非スキーマにした canon の commit 7898978 で解消した。）
- 確度: 実物で確認（verify-report.md、lib/verify/run.js）
- 提案: canon-build の構築3に「指摘が計画外のファイルを指すときの経路」を足す。計画内に収めるなら change-plan を足して G1 を取り直し、収めないなら対象の台帳への申し送りにする。行き先は .claude/skills/canon-build/SKILL.md 構築3の3。

## 2026-10-27 構築3の軽微な修正をメインが worktree で直接編集し、生の git commit --amend も使った（run 20261027_111036・build）
- 種別: 規律昇華
- 何が起きたか: V6 の違反と reviewer の low の修正（tsod-ship/SKILL.md・spec-check.mjs・handoff.mjs）を、builder を起動せずメインが python・sed・Edit で worktree に直接書いた。sha を変えないコミットの文言直しに `git commit --amend` を直接使い、`npm run worktree -- commit` を通さなかった。いずれも SKILL.md の手順（直しは差し戻し→builder、コミットは worktree サブコマンド）の外。
- 確度: 実物で確認（この build セッションの操作）
- 提案: canon-build の構築3に「1〜2行の機械的な修正はメインが直接直してよい。ただし差し戻しの欄に直した箇所を書く」か「必ず builder」かを決めて書く。行き先は .claude/skills/canon-build/SKILL.md 構築3の3。コミットの文言を直す amend は worktree サブコマンドに足すか、禁じるかを決める。
- 未決: 直接編集を許す線をどこに引くか（行数か、スクリプトか文書か）

## 2026-11-22 正典に /model の切り替えとプロンプトキャッシュの関係が無い（run 20261122_132204・plan）
- 種別: 欠陥修正
- 何が起きたか: 参照元の flow-workflow の「途中で /model を切り替えるとキャッシュが効かず履歴を全部読み直す」を investigator が正典で確かめられず、unverified に残った（work/20261122_132204/investigation/facts.md の unverified C5）。prompt-caching のページは sources.json:85 に登録があるが、本文の索引は selection.md:151 の1行だけ。
- 確度: 実物で確認
- 提案: `canon-reference/references/selection.md` のモデル割当の節に、/model の切り替えとキャッシュの関係を公式の原文で足す（公式の確認の結果は同 run の investigation/official-check.md）。

## 2026-11-22 正典に Skill の補助 .md が Skill として扱われないことの明記が無い（run 20261122_132204・plan）
- 種別: 欠陥修正
- 何が起きたか: `.claude/skills/<name>/references/*.md` が別の Skill として一覧に載らないことを、investigator が正典で確かめられなかった（facts.md の unverified C2。skills.md:26,229 は補助ファイルの読み方だけ、paths.json:214 は SKILL.md だけを列挙）。
- 確度: 実物で確認
- 提案: `canon-reference/references/features/skills.md` の配置の節に、Skill として認識されるのは SKILL.md だけで補助の .md は対象外であることを公式の原文で足す（公式の確認の結果は同 run の investigation/official-check.md）。

## 2026-11-22 ワーカーの起動規則の run_in_background: false が、この環境の Agent ツールで指定できない（run 20261122_132204・plan）
- 種別: 欠陥修正
- 何が起きたか: canon-plan の「ワーカーの起動規則」は `run_in_background: false` で結果を待つよう求めるが、Agent ツールにその引数が無く、investigator と claude-code-guide の3体はすべて background で起動し、完了の通知を待って続けた（この plan セッションの操作）。
- 確度: 実物で確認
- 提案: `.claude/skills/canon-plan/SKILL.md` の「ワーカーの起動規則」を、引数の名前ではなく「全員の完了の通知がそろうまで次の工程に進まない」という待ち方で書き直す。
- 再発（run 20261122_132204・build）: `canon-build/SKILL.md` の同じ規則（`run_in_background: false`）でも、builder 9体・reviewer 4体・prompt-auditor・session-analyst 3体の起動がすべて非同期になり、完了の通知を待って続けた。直す行き先は canon-build の「ワーカーの起動規則」にも広がる（`run_in_background` の文言は canon-plan と canon-build に1件ずつあり、canon-design には無いことを grep で確かめた）。

## 2026-11-22 対象が git でないとき new-run が止まるだけで、続け方の案内が無い（run 20261122_132204・plan）
- 種別: 効率化
- 何が起きたか: 対象の project-template が git 管理でなく `new-run` が exit 1 で止まった。手順は「stderr を示して止まる」だけで、ユーザーの了承を得てメインが手順の外で `git init -b main` と初回コミットを行ってから再実行した。
- 確度: 実物で確認
- 提案: `.claude/skills/canon-plan/SKILL.md` の「0. 開始する」に、git でないときは中身（秘密情報の有無・.gitignore）を確かめ、ユーザーの了承を得て git init と初回コミットをしてから再実行する分岐を足す。

## 2026-11-22 builder の tools に Grep が無いのに、定義が Grep を指示し、自己点検も求める（run 20261122_132204・build）
- 種別: 欠陥修正
- 何が起きたか: `.claude/agents/builder/builder.md:4` の tools は `Read, Write, Edit, Glob` で、`:26` は `impact.json` を `"id": "<path>:` で Grep するよう指示し、`:24` の節は書き終えた後の自己点検（`no-leaks` の語の検索）を求める。この run の builder は9体中4体が「Grep が使えず」と報告して、点検または参照元の拾い直しを実行しなかった（settings の builder は change-plan.md を読めないまま、プロンプトの指示だけで書いた）。
- 確度: 実物で確認（builder.md の tools と本文、builder の完了報告）
- 提案: `.claude/agents/builder/builder.md` の tools に `Grep` を足す（読み取り専用でシェルは持たないので、「ワーカーはシェルを持たない」の前提は崩れない）。足さないなら、Grep の指示を Read と Glob でできる手順に直す。行き先は builder.md 1つに決める。

## 2026-11-22 SKILL が Grep ツールを前提にするが、この環境では呼べない（run 20261122_132204・build）
- 種別: 欠陥修正
- 何が起きたか: `canon-build/SKILL.md:35`（`## ` の行番号の取得）・`canon-plan/SKILL.md:64`・`canon-design/SKILL.md:34`（`impact.json` の ID 検索）は Grep の使用を指示する。この環境では `Grep` が `No such tool available` で失敗し、Bash の grep で代えた。
- 確度: 実物で確認（run のメインの呼び出し1回の失敗。ほかの環境では確かめていない）
- 提案: 3つの SKILL の「Grep で」を「grep（Grep ツール、無ければ Bash の grep）で」に直す。

## 2026-11-22 handoff の note が改行を1行につぶし、差し戻しの逐語の指摘の構造が読めなくなる（run 20261122_132204・build）
- 種別: 効率化
- 何が起きたか: `canon-build` は差し戻しを「指摘を逐語で `handoff note 差し戻し` に書く」と定めるが、`lib/handoff.js:245` は `note.trim().replace(/\n/g, ' ')` で改行を空白にする。見出し（`### 1. correctness — medium`）と箇条書きが1行に連なり、約10,000字の1項目になった。builder は review の原文も読めたため作業は止まらなかった。
- 確度: 実物で確認（handoff.md の「差し戻し」）
- 提案: `canon-build/SKILL.md` の差し戻しの手順を、「指摘の要旨と、原文の path・見出し番号を書く」に直す（`handoff note` は1行の項目と割り切る）。
