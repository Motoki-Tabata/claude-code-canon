# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §6.4）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には設計書2冊（architecture.md・artifacts.md）だけを置く。未対応の backlog は本台帳だけに置く。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・Phase <A〜D> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

---

## 2026-10-10 V4 の Agent Teams 検査と V9 の experimental 検出に data の根拠が無い（保守作業）
- 種別: 規律昇華
- 何が起きたか: `v4-security.js:20,41`（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` の開示検査）と V9 の `CLAUDE_CODE_EXPERIMENTAL_*`・`isolation: subagent` の検出は、canon-reference の data（`env-vars`、`isolation` は `worktree` のみ）に根拠が無く、「canon 独自の規則」と明記して残してある。廃止するかが未決。
- 提案: 正典の最新版で env-vars と isolation の値を確かめ、根拠が無いままなら該当検査を廃止して canon-reference の V- ID だけに揃える。

## 2026-10-10 Phase ごとに別セッションで /canon-a〜/canon-d を起動する実経路が未検証（run 20261010_014620・Phase D）
- 種別: 規律昇華
- 何が起きたか: この run は1セッションで各 SKILL.md の手順を代行した。`disable-model-invocation` の挙動、セッション分離、B〜D の開始手順（`canon_commit` の比較・`approvals check`）は通していない。Hook の発火も未検証（この run は Hook を生成していない）。
- 提案: 小さな対象で `/canon-a`〜`/canon-d` を別セッションで通し、手順の抜けを本台帳に起票する。1セッション通しで検証するときに省いてよい手順は SKILL.md に書かない（実運用の経路と混ざるため）。plan mode を使う Skill が経路に入るときは、計画の承認を対話のセッションで確かめる（`claude -p` では承認の画面が使えない。正典 `canon-reference/references/features/permissions.md` の §3.3・§4）。

## 2026-10-10 生成物の README の一覧に出力スタイルが載らない（保守作業・刷新レビュー）
- 種別: 欠陥修正
- 何が起きたか: `.claude/skills/canon-c/scripts/emit-manifest.js` の `collectComponents` は Skill・Subagent・Rule・Hook・MCP・plugin だけを集め、`.claude/output-styles/*.md` を拾わない。output-styles の担当が生成した出力スタイルは、`generated/.claude/README.md` の生成物一覧と使い方に現れない。
- 提案: `collectComponents` に出力スタイル（`frontmatter:output-style` の `name`・`description`）を足し、README の一覧と使い方（`/config` か settings の `outputStyle` で選ぶ）に載せる。artifacts.md §7.3 と emit-manifest のテストを合わせて直す。

## 2026-10-10 canon 自身の investigator を haiku・effort high の役に分けられるかを実地で評価していない（保守作業）
- 種別: 効率化
- 何が起きたか: `.claude/skills/design/references/model-selection.md` の haiku の条件は、事実の抽出に徹して後段で検証される作業に haiku・`effort: high` を使える形になった。canon 自身の investigator は existing・profile（事実の抽出）と focused（要件に照らした推論）を1体で担うので、sonnet のまま据え置いている。haiku と sonnet の出力の実地比較はしていない。
- 提案: 小さな対象で existing・profile を haiku・`effort: high` で動かし、sonnet の出力と比べる。採るなら existing・profile 用の agent を分け、`tests/self_application.test.js` の agent 8体の固定（EXPECTED_AGENTS）と Agent の例示に `model=` を書かない検査、`.claude/skills/canon-a/SKILL.md` の工程1、`design/architecture.md` の Agent 表を同じ変更で直す。

## 2026-10-10 ユーザー設定のトップレベル effortLevel が Opus 5.5 に効かないことを検出する検証ルールが無い（保守作業）
- 種別: 効率化
- 何が起きたか: トップレベルの `effortLevel` は、ユーザー設定（`~/.claude/settings.json`）に書いたときだけ Opus 5.5 に効かない。プロジェクト・local・managed の設定と `--settings` に書いた値は全モデルに効く（正典 `canon-reference/references/features/settings.md` の §4）。生成物がユーザー設定向けにトップレベルの `effortLevel` を案内しても、verify は検出しない。
- 提案: 生成物がユーザー設定にトップレベルの `effortLevel` を書くよう案内している箇所を検出し、`modelSettings` を促す V ルールを足すかを決める（JS が要る）。足すなら canon-reference の V- ID と `design/artifacts.md` の verify の表を同じ変更で直す。

## 2026-10-12 new-run が canon 自身を対象に受け付け、配置できないことが Phase D まで分からない（run 20261012_030955・Phase A）
- 種別: 欠陥修正
- 何が起きたか: `/canon-a /home/motoki-tabata/work/claude-code-canon` で `new-run.js` は exit 0 で run を作った。一方、canon-d の3つの CLI は `self-target-guard.js` で canon 自身を対象にした配置を exit 1 で拒否する（artifacts.md §10.5）。拒否されることは工程3の focused 調査で初めて分かり、P1 を取り直した。調査①・ヒアリング・P1 の分が手戻りになった。
- 提案: `.claude/skills/canon-a/scripts/new-run.js` の入口で `self-target-guard.js` の判定を使う。canon 自身が対象なら、exit 1 で止めて「canon 本体の改修はブランチ・npm test・PR で行う」と案内するか、run を作ったうえで警告し、配置は手作業になることを handoff に記録する。canon-a の SKILL.md の工程0 にも同じことを書く。

## 2026-10-12 handoff の申し送りを直す操作が npm run handoff に無い（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の終わりに足した申し送りの件数（breaking の modify 14件→13件）を直す操作が `tools/handoff.js`（mark・set・note・session）に無く、handoff.md を Edit で直した。
- 提案: `tools/handoff.js` に節の項目を置き換える操作を足すか、canon-b〜d の SKILL.md に「申し送りの誤りは note で訂正の項目を足す」と書く。

## 2026-10-12 canon 自身を対象にした run では、emit-manifest の README が canon の .claude/README.md と別物になる（run 20261012_030955・Phase B）
- 種別: 欠陥修正
- 何が起きたか: emit-manifest は `generated/.claude/README.md` を生成物の一覧から作り直し、design-map が README を modify 以外にすると止まる。canon の `.claude/README.md` は手書きの説明（Phase の推奨モデル・Rule の表など）なので、canon 自身を対象にした run の generated/ をそのまま重ねると置き換わる。この run の配置手順では README を重ねる対象から外した。そのため README の推奨モデルの列と `claude --model <opus|sonnet>` の案内は、Phase Skill の推奨（model と effort）に追従していない。
- 提案: 上の「new-run が canon 自身を対象に受け付け…」の項目と合わせて、canon 自身を対象にした run の README の扱いを決める。それまでは保守作業で `.claude/README.md` の推奨モデルの列と起動の案内に effort（canon-a・canon-b は opus・medium、canon-c・canon-d は sonnet・medium）を足す。
