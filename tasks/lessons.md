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

## 2026-10-03 「別プロジェクトのカスタマイズ一式を参考に作る」入力を受ける欄が無い（run 20261003_033830・Phase A）
- 種別: 規律昇華
- 何が起きたか: 対象（skillweave-mhwilds）とは別の参照元プロジェクト（vehicle-intake-management）の一式を移植の基準にする依頼だった。new-run・investigator（existing・focused）・requirements-template のいずれにも参照元の欄が無く、requirements.md の散文小節と handoff の申し送りに絶対パスを書いて後工程へ運ぶしかなかった（focused の `project_refs` は対象内の参照の解決用で、外部プロジェクトの一式は扱わない）。
- 提案: `.claude/skills/requirements/references/requirements-template.md` に任意の `## 参照元` 節（パスと「移植の基準・生成物には書かない」の別）を足し、`canon-a` 工程3・4 と designer・builder への受け渡しでこの節を読む旨を書く。investigator に `mode: reference`（参照元の一式の棚卸し）を足すかは、要否を次の同種の run で判断する。

## 2026-10-03 builder が書いたテストを実行する工程が canon-c に無く、必ず失敗するテストが工程8まで残った（run 20261003_033830・Phase C）
- 種別: 効率化
- 何が起きたか: builder（Read・Write・Edit・Glob だけ。シェルなし）が書いた `agent-write-guard.test.mjs` の新規テスト1件が、フィクスチャの欠陥（root を `os.tmpdir()` 直下に作り tmpdir も同値を渡すため、`../` が常に許可側に解決される）で環境に関わらず失敗した。verify（V1〜V9）は実行を伴わないので通り、工程8-6 の現物実行をオーケストレーターが手で行って初めて見つかった。参照元の同種のテストは通っていたので、移植元との差分が原因の切り分けになった。
- 提案: `.claude/skills/canon-c/SKILL.md` の工程7 に、「生成物に `*.test.mjs` があれば、`generated/` を対象のコピーに重ねた一時ディレクトリで `node --test` を全件実行し、失敗を verify の違反と同じに扱う」を足す（オーケストレーターが手で行う手順を明文化する。実装は `npm run` の道具にしてもよい）。

## 2026-10-07 spec.md・design-map.md の点検に道具が無く、大きいファイルを何度も読んでいる（run 20261003_033830・Phase A・B）
- 種別: 効率化
- 何が起きたか: spec.md（33KB）を Phase A のオーケストレーターが3回（6bd7bab8 L339 は sed の出力 58KB で退避・L350・L359）、Phase B で2回（3204de3a L47・L59）、designer も2回読んだ。design-map（31KB）も2回読んだ（3204de3a L81・L88）。点検の中身（§9 が空か、mandatory の件数、mandatory が「要件→生成物の対応」に全部あるか等）は機械で判定できる。`canon-a/SKILL.md:73-76`・`canon-b/SKILL.md:40-48` には「読んで確かめる」としか書いていない。【中】
- 提案: `lib/` のパーサを使う `npm run check -- <ts> spec|design-map` を作り、両 SKILL のチェックリストを機械判定に置き換える。オーケストレーターが全文を読むのは、P2・P3 の要旨を作るときだけにする。

## 2026-10-07 requirements.md を書いた直後に書式を検証する手段が無く、node -e の手作業になった（run 20261003_033830・Phase A）
- 種別: 効率化
- 何が起きたか: オーケストレーターは `lib/requirements.js` を読み、過去 run の節構成を調べ、`node -e` で `parseRequirementsDoc` を呼んで確かめた（6bd7bab8 L179〜L212）。途中で `outside_managed` の値を sed で直している（L206）。`canon-a/SKILL.md:56` は「verify がこの書式を機械で読む」と書くだけで、崩れは Phase C の V9 まで見つからない。テンプレートは、散文の節を足してよいかにも触れていない。【中】
- 提案: `npm run requirements-check -- <ts>` を作る。要件の件数、強度・優先度の内訳、constraints を出力させ、canon-a 工程2-5・2-6（件数の数え直し）に組み込む。requirements-template.md に「散文の小節を足してよい（parser は見出しに依存しない）」を1行足す。

## 2026-10-07 handoff の進捗・frontmatter の更新が毎回 sed・python の手作業で、印の付け違いもあった（run 20261003_033830・Phase A・B）
- 種別: 効率化
- 何が起きたか: 進捗の印と frontmatter を `sed -i` や python で書き換えている（6bd7bab8 L63・L222・L243・L320・L377、3204de3a L42・L119）。L222 では印を付け済みの「工程1」にもう一度 sed をかけた（工程2 のつもりと推測。L243 で別に付けたので実害は無い）。new-run が作る進捗は工程1〜4だけで（`.claude/skills/canon-a/scripts/new-run.js`、`lib/handoff.js:43-46`）、後の行は各 Phase が手で挿入している。`lib/handoff.js` にはパーサがあるが CLI が無い。【低〜中】
- 提案: `npm run handoff -- <ts> mark <工程N>｜set phase=… status=…｜note "<申し送り>"` を作る。new-run の時点で工程1〜9と P1〜P5 の行をすべて作っておく。

## 2026-10-07 skills 層の builder が参照元の大きなスクリプトを打ち直し、26分かかって Phase C の律速になった（run 20261003_033830・Phase C）
- 種別: 効率化
- 何が起きたか: L2 の builder（c52db209 の subagent agent-a7c7b4600c812efeb）は 05:44〜06:10 に稼働し、文脈は最大約53万トークンに達した。参照元の `bash-write.mjs`（40KB）・`agent-write-guard.test.mjs`（45KB）などを Read で全文読み、Write で書き直した。配置後に比べると `agent-write-guard.mjs` は参照元との差が8行しかない。1体で50件を書き、L4 は1件だった。対象全体を `**/*` で Glob して node_modules も拾った。バイト単位のコピーは keep にしか無く（`generation/SKILL.md:42`）、builder は1層1体に固定されている（`canon-c/SKILL.md:51`）。上の「参照元の入力欄が無い」と根が同じ。起票済みの「テストが必ず失敗した」件は、この打ち直しの中で入った可能性がある（推測）。【高】
- 提案: design-map に「参照元からほぼ逐語で移すファイル（参照元のパス→生成先）」の欄を設け、copy-keep と同じ仕組みで `generated/` にバイト単位でコピーする。builder には差分だけを Edit させる。宣言件数の多い層は、skill 単位で builder を複数並列にできるようにする。

## 2026-10-07 修正ループで「直さない」を既定にして P4 に持ち込み、差し戻しが2回起きた（run 20261003_033830・Phase C）
- 種別: 規律昇華
- 何が起きたか: 1回目の P4 の提示（c52db209 L473）では、review の指摘1〜3と prompt-audit の F1〜F5 を「直さない」としていた。ユーザーが「review指摘を基本全部是正したい」と差し戻し（L481）、builder の再起動と再レビューで約9分かかった。2回目の P4（L616）でも low 3件を「ご指示があれば直します」として残し、承認後（L619）に Phase D で直すことになった（下の「generated/ を直接編集」の項目につながる）。`canon-c/SKILL.md:77` は、直すかどうかをオーケストレーターが先に決め、結果を P4 にまとめて出す構成になっている。【高】
- 提案: 工程8の直後、P4 の前に指摘の振り分けを1問で取る。既定は全件を直すとし、「直さない」の候補だけを理由付きで示す。P4 の提示には未決の指摘を残さない、と規則に書く。

## 2026-10-07 reviewer が判定対象の全件を見ていなくても、工程8が完了扱いになる（run 20261003_033830・Phase C）
- 種別: 欠陥修正
- 何が起きたか: `reviewer.md:27` は「INDEX.md の判定の対象を全件見る」と定める。ところが `output/20261003_033830/review/review.md` は、本文を読んでいない対象（他の rules・SKILL.md・references・`*.test.mjs` など）を自分で挙げている。対象79件に対して Read は34回だった（c52db209 の subagent agent-ad97675b4e3c1a1f7）。オーケストレーターは P4 で未読の範囲を開示しただけだった（L473）。reviewer は1体だけ起動され（`canon-c/SKILL.md:65`）、網羅していなかったときの扱いが決まっていない。【中】
- 提案: review-bundle で対象を一定件数（例: 20件）ずつに分け、reviewer を並列に起動する。「未判定」が報告されたら工程8は未完了とし、その分の reviewer を追加で起動する、と規則にする。

## 2026-10-07 prompt-audit をメインの文脈で実行し、約80k トークンが残りの全ターンに載り続けた（run 20261003_033830・Phase C）
- 種別: 効率化
- 何が起きたか: claude-api の Skill 本文（c52db209 L159）と prompt-audit の報告（L170）が文脈に入り、cache_read が 72k（L118）から 152k（L212）に増えたまま最後まで載り続けた。オーケストレーターの走査が「現状は存在」の語だけを見ていたため F2 を取りこぼし、builder の追加起動と再レビューに約3.5分かかった（L546）。書き出した prompt-audit.md を python で書き換えており（L288）、「要約せずにそのまま書き出す」（`canon-c/SKILL.md:68`）と食い違う。【中】
- 提案: prompt-audit の実行と書き出しを専用のワーカー（Read・Grep・Write と Skill）に任せ、報告はファイルで受け取る。時点に依存する語の grep パターンは canon 側に固定して持つ。

## 2026-10-07 V6 の warning 65件がほぼノイズで、P4 の「全件を示す」とも食い違った（run 20261003_033830・Phase C）
- 種別: 欠陥修正
- 何が起きたか: 14件は「委譲トリガー節が無い」という警告だった。`v6-ref-integrity.js:54` の `DELEGATE_TRIGGER_RE = /Delegate (when|for)/i` は英語だけを見るため、日本語の description（「…ときに委譲される」）は必ず警告になる。生成規約（`generation/references/agents.md:14`）は「いつ委譲するか」を書けとだけ言う。残り49件は、地の文の `spec.md` などのパス様トークンだった。`canon-c/SKILL.md:59` は「P4 で全件を示す」としているが、実際の P4 は種別ごとの要約だった。【中】
- 提案: 正規表現に日本語の委譲条件（「委譲される」「委譲する」など）を足し、故意の違反を注入するテストで発火を確かめる。対象リポジトリに実在するパスで解決できるトークンは、警告から除く。canon-c:59 を「種別ごとの件数と、代表例を示す」に改める。

## 2026-10-07 管理パス外の変更が散文でしか渡されず、変更後のファイルは Phase D でその場で作られた（run 20261003_033830・Phase C・D）
- 種別: 欠陥修正
- 何が起きたか: RUN.md の 3a 節（`.claude/skills/canon-d/scripts/emit-run-manifest.js:160-165`）は、design-map の変更内容を散文で写すだけである。ユーザーが「管理パス外の変更をoutputフォルダ配下に作成して」と依頼し（774bc4a2 L275）、オーケストレーターがその場で `output/<ts>/outside-managed/` を作り、対象の README をコピーして編集した（L292〜L311）。変更後のファイルを作る工程は、canon-c にも canon-d（`canon-d/SKILL.md:58`）にも無い。そのファイルは P4 の承認の外にある。【中】
- 提案: Phase C で、変更後のファイル（または patch）を `output/<ts>/outside-managed/` に作る工程を設け、P4 の対象（ハッシュ）に含める。RUN.md の 3a 節には、そのファイルを適用するコマンドを書く。

## 2026-10-07 Phase D でオーケストレーターが generated/ を直接編集し、P4 も自分で取り直した（run 20261003_033830・Phase D）
- 種別: 欠陥修正
- 何が起きたか: ユーザーが「やはりlow 3件を直してから配置したい」と言い（774bc4a2 L80）、オーケストレーターは builder を起動せず、`generated/` の4ファイルを Edit で直した（L124〜L163）。manifest の再生成も再レビューもせず、P4 を Phase D の中で記録し直した（L196）。verify の呼び方も探していた（L164 `npm run | grep`、L171 は引数違いのエラー）。`canon-d/SKILL.md:12`（ワーカーを起動しない）と `:47`（生成物を直すなら `/canon-c` からやり直すよう案内して止まる）に反する。メインが `generated/` に書くのを止める機械の仕組みは無い。low 3件のために新しいセッションでやり直すのは重く、手順を迂回する動機になったと推測する。上の「直さないを既定に P4」の項目が発端。【高】
- 提案: メインセッションから `output/*/generated/**` への Write・Edit を拒否する PreToolUse の hook を canon の `.claude/settings.json` に置く（builder は対象外にする）。canon-d に「軽微な修正」の手順を定める（builder を新しく起動 → manifest → verify → 変更分の再レビュー → P4 → P5）か、canon-c に再入して修正ループだけを回す引数を用意する。

## 2026-10-07 P5 も deploy.js も generated/ の中身を束縛しておらず、P4 が無効でも配置できる（run 20261003_033830・Phase D）
- 種別: 欠陥修正
- 何が起きたか: 774bc4a2 L166 の照合で、P4 は「不一致（承認後に変わった）」なのに P5 は「一致」だった。P5 が持つのは `pre-deploy-report.txt` のハッシュだけで、レポートは件数とパスしか書かないので、ファイルの中身が変わってもハッシュは変わらない（P5 の承認行は2回とも `f85c8fd589f7`）。`deploy.js` は approvals を照合しない（冒頭の「P5 の機械的裏付け」`:25-27`・`:151` は `--confirm` と uncaptured だけ）。【高】
- 提案: pre-deploy-report に `generated/` のツリーハッシュを書き、P5 が中身を束縛するようにする。`deploy.js --confirm` の冒頭で `approvals check --expect P1,P2,P3,P4,P5` 相当を実行し、不一致なら配置を拒否する。

## 2026-10-07 配置先のブランチと未コミットの変更を事前に確かめていない（run 20261003_033830・Phase D）
- 種別: 欠陥修正
- 何が起きたか: 配置は対象の main の作業ツリーに直接行われ、未コミットのまま終わった（774bc4a2 L236・L342）。対象の README では、main は Ruleset で直接 push できない。pre-deploy-check と deploy.js はブランチも未コミットの変更も見ない。RUN.md は「同じ作業ブランチで」と、作業ブランチがある前提で書いている（`emit-run-manifest.js:162`）。【低】
- 提案: 対象が既定ブランチにいるとき、または未コミットの変更があるとき、pre-deploy-check が warning を出す。RUN.md の配置手順の前に、作業ブランチを切る手順（`git switch -c`）を置く。

## 2026-10-07 Phase D の逸脱が台帳に書かれず、run 全体の振り返りの工程も無い（run 20261003_033830・Phase D）
- 種別: 規律昇華
- 何が起きたか: Phase D の終わり（774bc4a2 L343）では、既存の4件を数えただけだった。上の「generated/ を直接編集」「P5 が中身を束縛しない」「コマンドの挙動の裏取り」は Phase D の中で起きていたのに、起票されていない（`canon-d/SKILL.md:26` は「気づいたらその場で書く」と定める）。本台帳の上の項目は、run の後に手作業で transcript を解析して見つけた。session-analyst は Phase A の要件ヒアリング専用である（`requirements/references/interview.md:31`）。自分が手順から外れたことを自分で申告するのには限界がある、というのは推測。【中】
- 提案: Phase D の終わりに、この run の4セッションの transcript を session-analyst（1セッション1体、並列）に分析させ、台帳に書く候補を作らせる工程を足す。あわせて「SKILL.md の手順の外で行った操作」を列挙する自己点検を、Phase の終わりの必須項目にする。
