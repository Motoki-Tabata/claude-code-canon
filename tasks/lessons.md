# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`gates/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

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

## 2026-10-03 builder が書いたテストを実行する工程が canon-c に無く、必ず失敗するテストが工程8まで残った（run 20261003_033830・Phase C）
- 種別: 効率化
- 何が起きたか: builder（Read・Write・Edit・Glob だけ。シェルなし）が書いた `agent-write-guard.test.mjs` の新規テスト1件が、フィクスチャの欠陥（root を `os.tmpdir()` 直下に作り tmpdir も同値を渡すため、`../` が常に許可側に解決される）で環境に関わらず失敗した。verify（V1〜V9）は実行を伴わないので通り、工程8-6 の現物実行をオーケストレーターが手で行って初めて見つかった。参照元の同種のテストは通っていたので、移植元との差分が原因の切り分けになった。
- 提案: `.claude/skills/canon-c/SKILL.md` の工程7 に、「生成物に `*.test.mjs` があれば、`generated/` を対象のコピーに重ねた一時ディレクトリで `node --test` を全件実行し、失敗を verify の違反と同じに扱う」を足す（オーケストレーターが手で行う手順を明文化する。実装は `npm run` の道具にしてもよい）。

## 2026-10-07 reviewer が判定対象の全件を見ていなくても、工程8が完了扱いになる（run 20261003_033830・Phase C）
- 種別: 欠陥修正
- 何が起きたか: `reviewer.md:27` は「INDEX.md の判定の対象を全件見る」と定める。ところが `output/20261003_033830/review/review.md` は、本文を読んでいない対象（他の rules・SKILL.md・references・`*.test.mjs` など）を自分で挙げている。対象79件に対して Read は34回だった（c52db209 の subagent agent-ad97675b4e3c1a1f7）。オーケストレーターは P4 で未読の範囲を開示しただけだった（L473）。reviewer は1体だけ起動され（`canon-c/SKILL.md:65`）、網羅していなかったときの扱いが決まっていない。【中】
- 提案: review-bundle で対象を一定件数（例: 20件）ずつに分け、reviewer を並列に起動する。「未判定」が報告されたら工程8は未完了とし、その分の reviewer を追加で起動する、と規則にする。

## 2026-10-07 prompt-audit をメインの文脈で実行し、約80k トークンが残りの全ターンに載り続けた（run 20261003_033830・Phase C）
- 種別: 効率化
- 何が起きたか: claude-api の Skill 本文（c52db209 L159）と prompt-audit の報告（L170）が文脈に入り、cache_read が 72k（L118）から 152k（L212）に増えたまま最後まで載り続けた。オーケストレーターの走査が「現状は存在」の語だけを見ていたため F2 を取りこぼし、builder の追加起動と再レビューに約3.5分かかった（L546）。書き出した prompt-audit.md を python で書き換えており（L288）、「要約せずにそのまま書き出す」（`canon-c/SKILL.md:68`）と食い違う。【中】
- 提案: prompt-audit の実行と書き出しを専用のワーカー（Read・Grep・Write と Skill）に任せ、報告はファイルで受け取る。時点に依存する語の grep パターンは canon 側に固定して持つ。

## 2026-10-07 Phase D の逸脱が台帳に書かれず、run 全体の振り返りの工程も無い（run 20261003_033830・Phase D）
- 種別: 規律昇華
- 何が起きたか: Phase D の終わり（774bc4a2 L343）では、既存の4件を数えただけだった。上の「generated/ を直接編集」「P5 が中身を束縛しない」「コマンドの挙動の裏取り」は Phase D の中で起きていたのに、起票されていない（`canon-d/SKILL.md:26` は「気づいたらその場で書く」と定める）。本台帳の上の項目は、run の後に手作業で transcript を解析して見つけた。session-analyst は Phase A の要件ヒアリング専用である（`requirements/references/interview.md:31`）。自分が手順から外れたことを自分で申告するのには限界がある、というのは推測。【中】
- 提案: Phase D の終わりに、この run の4セッションの transcript を session-analyst（1セッション1体、並列）に分析させ、台帳に書く候補を作らせる工程を足す。あわせて「SKILL.md の手順の外で行った操作」を列挙する自己点検を、Phase の終わりの必須項目にする。
