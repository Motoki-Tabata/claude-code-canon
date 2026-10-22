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
