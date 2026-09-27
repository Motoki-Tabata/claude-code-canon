# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`gates/`・`tools/`・`eval/`・`deploy/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  `/canon` の run 中（`generation.done` まで）はガードが run の外への書込を deny するため、
  `work/<ts>/canon-issues-candidates.md` に同じ書式で書き、S4 の最後に本台帳へ転記する。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約。旧台帳の `L0xx` 番号がコード・設計書に残っているため、番号は再利用しない。
- `design/` には run の観測記録と改修まとめを置く。未対応の backlog は本台帳だけに置き、`design/` 側からは参照する。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・S<n> | 旧 <文書>#<ID>）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript 先頭8桁:L行・コード path:line）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

transcript の略号: run 20260925_004359 = S1 `918d6a9a`・S2 `d95e77b5`・S3 `5ca33ae1`・S4 `45b10f1a`・配置後 `8b8a6f1a`／
run 20260927_003229 = S1 `41da6176`・S2 `1122beb9`・S3 `a192b7cf`・S4 `f3dd5ca1`
（`~/.claude/projects/-home-motoki-tabata-work-claude-code-canon/`）。

---

## 2026-09-27 G9・slice が design-map の層見出しから新規ファイルを1件も拾っていない（run 20260925_004359・20260927_003229・S3）
- 種別: 欠陥修正
- 何が起きたか: `gates/lib/design-map.js` の `h2Section` は見出しの完全一致で探すが、designer は `## L1（l1-builder）`・`## Skills（skill-builder）` と書く。両 run とも layer-heading 由来の宣言が0件で、新規ファイル（12件・8件）が `targets-all.txt` と G9「宣言⇒実在」から漏れた（vacuous pass。5ca33ae1:L452・a192b7cf:L290）。
- 提案: `listDeclaredArtifacts` の見出し照合を `design-slices.js` の `layerH2Text` と同じ前方一致に揃え、G9 は layer-heading 由来0件を違反にする。designer.md に見出しの語彙契約を書く。括弧付き見出しの fixture で回帰テスト。

## 2026-09-27 Stop・SubagentStop hook が同じ違反で無限に再ブロックする（run 20260927_003229・S3）
- 種別: 欠陥修正
- 何が起きたか: G8 違反の後、S3 メインに同じ gen-guard の通知が44回注入され（a192b7cf:L384〜L718、上限到達3回）5.07M、generator 修正モードでも9回・1.0M。`gates/gen-guard.js` は `readHookInput()` を捨てて `stop_hook_active` を見ず、`gates/lib/run.js` は失敗したリクエストを再判定の契機として残す。
- 提案: gen-guard・stage-guard で `stop_hook_active` が true、または同一違反のブロックラッチが既にあるときはブロックせず通知だけにする（`gates/lib/run.js` にヘルパー）。2回目の Stop が exit 0 になる回帰テスト。

## 2026-09-27 generator が builder をバックグラウンド起動し、Glob でポーリングし、同じ担当を二重に振った（run 20260927_003229・S3）
- 種別: 効率化
- 何が起きたか: builder 5体が `run_in_background` 未指定で非同期化し、generator が Glob を約45回ポーリング（49ターン・6.22M）。起動中の builder と同じ担当ファイルを別の builder 2体に振り直し、4体が同じファイルを交互に上書きした（a192b7cf の generator a6c54:L39〜L394）。
- 提案: `.claude/agents/generator/generator.md` に「`run_in_background: false` を必ず明示する」「Glob 等でのポーリング禁止」「起動中の builder と同じ担当を別 builder に振らない」を明記し、`tests/self_application.test.js` で文言を固定する。

## 2026-09-27 場当たりの Explore が親の Opus を継承して大量消費した（run 20260925_004359・20260927_003229・S1）
- 種別: 効率化
- 何が起きたか: 工程2で過去 transcript を分析させた Explore が `model` 未指定で Opus を継承し、run 0925 で 3.8M、run 0927 で2体 105ターン 12.56M（S1 の 50.8%）。出力の保存も JSONL の掘り返しで行った（918d6a9a:L233〜L281・41da6176:L407）。
- 提案: `/canon` SKILL.md の subagent_type 対応に「frontmatter を持たない Explore・general-purpose は `model: "sonnet"` を明示する。『model 引数を渡さない』は canon の agent に限る」を書く。`requirement-elicitation` に transcript 分析の手順（先に `npm run tokens`・読む範囲を絞る・`work/<ts>/session-analysis-*.md` に逐語保存）を書く。

## 2026-09-27 designer が他 run の design-map や canon のゲート実装まで読み、修正モードでも全文を読み直す（run 20260927_003229・S2・S3）
- 種別: 効率化
- 何が起きたか: S2 designer が前回 run の design-map を3回、`gates/g2_keep_judgement.js`・`gates/lib/*.js` 等を読み 13.8M・55ターン。S3 の修正モード（disposition 2件の変更）でも 175KB の design-map を5回読んだ（1122beb9 aeaf6:L36〜L79・a192b7cf a9940:L16〜L32）。
- 提案: `.claude/agents/designer/designer.md` に「他 run の `output/*/design-map.md` と `gates/**` を読まない」「修正モードは Grep と該当スライスだけを読む」「rationale は簡潔に書き design-map の肥大を抑える」を明記する。

## 2026-09-27 ワーカー定義に完了リクエストの書式が無く、毎回探し回る（run 20260925_004359・S1／20260927_003229・S2・S3）
- 種別: 効率化
- 何が起きたか: spec-writer 修正モードが書式を探して6回エラー（basic-design.md の上限超過 Read・過去 run の `.requests` 参照。918d6a9a a78817c:L53〜L77）。designer・generator も計約12回探した（1122beb9 aeaf6:L329〜L340・a192b7cf a6c54:L428〜L440）。
- 提案: `.requests/<stage>` を書く全ワーカー定義に、ファイル内容の規約を実例1行で直書きする（§4.3 への参照だけにしない）。

## 2026-09-27 recheck が「検査していない」と誤表示し、不要な reopen を招いた（run 20260927_003229・S1）
- 種別: 欠陥修正
- 何が起きたか: `tools/recheck.js:129` がマーカー名に `markerKey` でなく `${stage}` を使い、実際には SubagentStop で pass・`investigation.focused.done` 鋳造済みなのに「investigation.done が既に存在するため冪等スキップ」と出した。不要な `reopen investigation.focused` と再 recheck が1往復増えた（41da6176:L652〜L662）。
- 提案: 表示を `${markerKey}.done` に直し、processed.log から直前の pass を見つけたら「SubagentStop で検査済み（pass）」と区別して出す。

## 2026-09-27 G1 の evidence_paths 抽出が summary 本文中の語まで拾う（run 20260927_003229・S1）
- 種別: 欠陥修正
- 何が起きたか: `gates/g1_stage_order.js:306` の `/evidence_paths\s*:\s*(.+)/g` が行頭に固定されておらず、summary 本文の「evidence_paths …」を evidence として読み「実在しない」と誤ブロック、profiler を再起動した（41da6176:L613〜L618）。
- 提案: 行頭固定の `/^\s*evidence_paths\s*:\s*(.+)$/gm` にし、本文中の語を拾わない回帰テストを置く。

## 2026-09-27 G1 が系統A のレイヤー誤分類を検出しない（run 20260927_003229・S1）
- 種別: 欠陥修正
- 何が起きたか: existing_customizations.md の39件すべてのレイヤー表記が1段ずれていたが G1 を通過し、オーケストレータが目視で見つけて修正させた（41da6176:L323・L771）。
- 提案: G1（investigation）で `gates/lib/design-map.js` の `layerOfPath` から導いたレイヤーと各レコードの `layer` を照合する。analyzer 定義にパス→レイヤーの対応表を載せる。

## 2026-09-27 resume の stale 判定がハーネスの `.cc-writes` で誤検知する（run 20260925_004359・S4）
- 種別: 欠陥修正
- 何が起きたか: `generated/.claude/.cc-writes`（ハーネスが作るディレクトリ）の mtime が generation.done より新しく、`stale: generation` と出た。オーケストレータが独断で「誤検知」として先へ進み、SKILL の手順が形骸化した（45b10f1a:L33・L45・L54・L79）。
- 提案: `gates/lib/run-status.js` の `maxMtimeMs` でドット始まりのエントリとディレクトリ自身の mtime を除外し、通常ファイルの mtime だけで判定する。

## 2026-09-27 承認時の申し送りが次セッションに届かない（run 20260925_004359・S2→S3）
- 種別: 欠陥修正
- 何が起きたか: P5 記録の「S3 の P6+7 で生成 ui-design.md を原本と diff し意味不変を確認して提示」が S3 で実施されず、配置後セッションで未実施と判明した（state.md P5 行・8b8a6f1a:L180）。resume の出力に state.md の要旨が出ない。
- 提案: `gates/lib/run-status.js`・`tools/resume.js` の JSON に state.md の承認・差し戻し行の要旨を `handoff_notes` として含め、SKILL.md の再開手順に「handoff_notes を next_action より先に実施し、結果をゲートの提示に含める」を書く。

## 2026-09-27 MANIFEST の「P8 の追加手順」と配置後の手作業が S4 に引き継がれない（run 20260925_004359・20260927_003229・S4）
- 種別: 欠陥修正
- 何が起きたか: run 0927 は design-map・MANIFEST が定めた lessons-ledger の check/apply を S4 で一度も実行しなかった（f3dd5ca1 の Bash 5回）。run 0925 は「反映済み5件を台帳から削除」が「lessons.md の削除」に言い換わり、台帳ごと消えて main にマージされた（5ca33ae1:L466・45b10f1a:L97・L121）。
- 提案: `deploy/emit-run-manifest.js` で MANIFEST の「P8 の追加手順」節と README の「配置後の手作業」節を RUN.md へ逐語転記し、`resume` の `next_action` にも出す。deploy.js が生成物記載のコマンドを自動実行する案は、LLM 生成の任意コマンド実行になるため採らない。

## 2026-09-27 P8 の提示に退避件数が無く、オーケストレータが推測で誤案内した（run 20260927_003229・S4）
- 種別: 欠陥修正
- 何が起きたか: 「対象に管理ファイルが無いため退避は0件で .bak は作られない見込み」と案内したが、実際は退避39件（f3dd5ca1:L69・L81・L92）。dry-run も未実行のまま P8 を求めた（L51）。
- 提案: `deploy/pre-deploy-check.js` のレポートに「上書き（退避）予定 N件」を出す。SKILL.md 工程10に「.bak の有無を推測で案内しない。配置予定を提示してから P8 を求める」を書く。

## 2026-09-27 G2 の C5 判定が ref_resolution の記録漏れで実在する参照先を立証できない（run 20260925_004359・S2）
- 種別: 欠陥修正
- 何が起きたか: ui-design.md の参照先 `design/ui-design-standard.md` は実在したが、系統B の ref_resolution に無く C5 を G2 で立証できず、巻き戻しを避けて「形式上の modify」で回避した（d95e77b5:L160・L229・state.md P5 行）。
- 提案: `gates/g2_keep_judgement.js` で、ref_resolution に参照が無いときは `target.txt` のルートから参照先の実在を直接確かめる代替経路を足す（実在・不在の両方をテスト）。

## 2026-09-27 G8 が paths: の無い rule の interface_change を照合できず素通りする（run 20260925_004359・S3）
- 種別: 欠陥修正
- 何が起きたか: gen-guard が「interface_change: none を宣言したが検査手段が無く実照合しなかった2件: research-discipline.md, tsod-workflow.md（rule-paths）」と注記したまま通過した（5ca33ae1 generator:L178・L214）。
- 提案: `gates/g8_non_regression.js`・`gates/lib/interface-signature.js` で、paths の無い rule は「paths が無いこと」と `##` 見出し構造を署名として比べる。

## 2026-09-27 keep の verbatim コピーを LLM が Read/Write で行っている（run 20260927_003229・S3）
- 種別: 効率化
- 何が起きたか: generator が keep 10件の原本を Read して Write した（a192b7cf a6c54:L51〜L132）。トークンの浪費であり、写し違いは G8 違反になる。
- 提案: `tools/copy-keep.js`（`npm run copy-keep -- <ts>`）で design-map の keep レコードを決定論的にコピーし、SKILL.md 工程7・generator.md 手順3 を置き換える。sha256 一致のテスト。

## 2026-09-27 SessionStart が配置前の run を「完了済み」と表示する（run 20260925_004359・S4）
- 種別: 欠陥修正
- 何が起きたか: S4 冒頭で「work/.session-ts は完了済み run を指している」と出た（45b10f1a:L4）。generation.done 後・配置前であり実態と合わない。
- 提案: `gates/session-init.js` で `.deploy/deploy-result.json` の有無により「工程7通過済み（ガード非適用）・配置未了」と「配置済み」を出し分ける。

## 2026-09-27 G12 がツール呼び出しの書式片（`</content>` 等）を検出しない（旧 canon-issues-20260919_023121#S1-2）
- 種別: 欠陥修正
- 何が起きたか: run 20260919 で agent-builder の生成物に `</content>` が残ったが G12 は検出しなかった。`gates/` に書式片の検査は無い（2026-09-27 に grep で再確認）。
- 提案: G12 に「コードフェンスの外で `</content>`・`</parameter>`・`<parameter name=` が現れたら違反」を加え、本文末尾・frontmatter 直後・コードフェンス内の3位置に注入して前2者だけが違反になる回帰テストを置く。

## 2026-09-27 managed-paths.list と generated/ の逆方向照合が無い（旧 canon-issues-20260922_172924#S1-3 推奨2）
- 種別: 欠陥修正
- 何が起きたか: G9 は managed-paths.list→generated/ の片方向と MANIFEST⇔generated/ の双方向だけを見ており、generated/ にあるのに managed-paths.list に無いファイル（配置されるが管理集合外）は検出しない（`gates/g9_snapshot_completeness.js`）。
- 提案: G9 に「generated/ の実ファイルが managed-paths.list の管理集合に含まれる」照合を足し、違反注入テストを置く。

## 2026-09-27 SubagentHandback の受信を完了と取り違え、ゲート判定前に並行調査した（run 20260925_004359・S3）
- 種別: 規律昇華
- 何が起きたか: generator の報告（06:00:37）を完了と受け取り、SubagentStop の G10 blocked（06:00:42）を generator の自己修正中に並行調査、完了通知（06:02:02）後の recheck は exit 3 で空振りした（5ca33ae1:L104〜L214）。
- 提案: SKILL.md 共通契約・工程7に「ワーカーの報告受信は完了ではない。task-notification（completed）を受けてからマーカーとラッチを確かめる。blocked はワーカーの自己修正中でありうる」を書く。

## 2026-09-27 judge の完了待ちに ScheduleWakeup を乱発し、区間終了後も残った（run 20260925_004359・S3／20260927_003229・S3）
- 種別: 効率化
- 何が起きたか: S3 で ScheduleWakeup 10回（うち5回は重複通知への noop）、S4 開始後の 06:22 にも S3 の wakeup が発火した（5ca33ae1:L296〜L379・L479）。run 0927 でも judge ごとに「報告受領」と「完了通知」で2ターンずつ消費（a192b7cf:L197〜L258・L795〜L836）。
- 提案: SKILL.md 工程9に「judge は同じメッセージで並列に起動し、`run_in_background` が提供される環境では false にする。ScheduleWakeup・loop で待たない。重複通知に応答しない」、区間の終わりの作法に「設定済みの wakeup を止めてから案内する」を書く。round 2 の再判定軸の予告は `round.json` を見てから行う（a192b7cf:L741 で keep-review を誤って予告）。

## 2026-09-27 インタプリタの -e 内の書込はガードが宛先を同定できず封鎖される（旧 canon-issues-20260919_023121#S3-2）
- 種別: 規律昇華
- 何が起きたか: `node -e` 内の書込で宛先を特定できず広域スキャンにフォールバックして封鎖された。SKILL.md 契約5 に注意が無い（2026-09-27 に grep で再確認）。
- 提案: `/canon` SKILL.md 契約5 に「インタプリタの `-e` 内の書込は宛先を同定できず封鎖される。書込はリダイレクトで行う」を追記する（ガードは緩めない）。

## 2026-09-27 「存在しない」を根拠にした eval の violation をオーケストレータが検算しない（旧 canon-issues-20260922_172924#S2-5 推奨3）
- 種別: 規律昇華
- 何が起きたか: keep-review judge が不在を根拠に事実と異なる violation を出した。バンドル側の対処（推奨1・2）は入ったが、SKILL.md 工程9 に検算の手順が無い。
- 提案: SKILL.md 工程9に「violation の根拠に『存在しない』『言及が無い』が含まれる場合は、提示の前にオーケストレータが横断 grep で裏取りする」を書く。

## 2026-09-27 P6+7 の修正が keep ファイルに及び、G8 ブロックから P5 差し戻しに回った（run 20260927_003229・S3）
- 種別: 規律昇華
- 何が起きたか: 修正指示 `revisions/generation-1.md` が keep の ui-design.md・write-scopes.json を書き換えさせ「MANIFEST の disposition を直せ」と指示したが、G8 の正は design-map のため G8 でブロックされ、designer 再起動と P5 再承認が必要になった（a192b7cf:L371・L381）。区間をまたぐ差し戻しをどのセッションで扱うかの規定も無い。
- 提案: SKILL.md「差し戻し」に「修正対象に design-map の keep が含まれるなら、先に P5 を差し戻す（`reopen design`・disposition 変更）」と「後段の区間で前段のゲートを差し戻すときは、変更が disposition 等の限定的なものなら現セッションで扱ってよい。モデルは各 agent の frontmatter に従う」を書く。

## 2026-09-27 配置後の hook の実発火確認（カナリア）が S4 の手順に無い（run 20260925_004359・S4）
- 種別: 規律昇華
- 何が起きたか: S2 で「agent 単位の hooks が動くかは配置後のカナリアでしか確かめられない（V2）」としたのに、S4 は「全工程が完了」で終えた（d95e77b5:L160・45b10f1a:L121）。
- 提案: SKILL.md 工程10に「生成物に settings・agent の hooks があれば、配置後に対象リポジトリで撃つカナリア手順を案内し、未確認なら『未検証』と明示して終える」を書く。

## 2026-09-27 readme-writer が keep の rule を README の Rules 表に載せず G10 で止まった（run 20260925_004359・S3）
- 種別: 規律昇華
- 何が起きたか: G10「rule 8件（backend-spring 他）が README に登場しない」で generation.blocked（5ca33ae1 generator:L170〜L214）。verbatim コピーの keep rule が漏れた。
- 提案: `.claude/agents/readme-writer/readme-writer.md` に「keep を含め `generated/.claude/rules/*.md` の全件を Rules 表に列挙する（G10 の網羅性）」を書く。

## 2026-09-27 run 中に見つけた canon 側の課題が記録されずに失われる（run 20260925_004359・S2／20260927_003229・S1・S2）
- 種別: 規律昇華
- 何が起きたか: 「調査2の書き落としを canon 側の不具合として design/ に残す」と約束したが実行されなかった（d95e77b5:L229・L251）。run 0927 でも S1 の5件・S2 の2件をチャットで案内しただけだった（41da6176:L771・1122beb9:L154）。
- 提案: SKILL.md に「発見した時点で `work/<ts>/canon-issues-candidates.md` に追記し、S4 の最後に `tasks/lessons.md` へ転記する」を書き、`tools/resume.js` の出力に候補件数を出す。

## 2026-09-27 区間の終わりの起動案内とセッション名が揺れる（run 20260925_004359・S2・S3）
- 種別: 規律昇華
- 何が起きたか: 案内が `claude --model sonnet`（d95e77b5:L251）と `claude --model claude-sonnet-5`（5ca33ae1:L474）で揺れた。P5 提示の「S2 は Sonnet のセッション」は対象側 TSOD の区間の意味で、canon の S1〜S4 と紛らわしかった（d95e77b5:L160）。
- 提案: SKILL.md の案内文を `claude --model opus|sonnet` のエイリアスに固定し、対象プロジェクト側の区間は「対象側 S<n>」と書き分ける規律を足す。

## 2026-09-27 AskUserQuestion の preview が表示されない環境で「右の」と位置参照した（run 20260925_004359・S1）
- 種別: 規律昇華
- 何が起きたか: ユーザーが「右の割り当てとはどのことですか？」と質問し、preview が表示されていなかったと判明した（918d6a9a:L300・L301・L317）。
- 提案: `.claude/skills/requirement-elicitation/SKILL.md` に「preview は表示されない場合がある。判断材料は質問文か直前の本文に書き、位置で参照しない」を書く。

## 2026-09-27 陳腐化した参照（ref_resolution の resolved:false）が spec の是正候補に上がらない（旧 canon-issues-20260919_023121#参考）
- 種別: 規律昇華
- 何が起きたか: 対象側 lessons R16 の付記。実装済みの指示が CLAUDE.md の条文に未完了のまま残る陳腐化が再発しうるが、profiler の ref_resolution で `resolved: false` になった参照は spec の是正候補に自動では上がらない（canon-issues-20260919_023121.md:164-170）。
- 提案: spec-writer 定義に「project_profile の ref_resolution で resolved:false の参照は spec の是正候補節に列挙する」を書き、G4 系で ref_resolution の resolved:false が spec に現れることを照合する。

## 2026-09-27 spec に designer の優先順位判断の対象外にする必達（mandatory）の区別が無い（旧 canon-issues-20260922_172924#参考）
- 種別: 規律昇華
- 何が起きたか: 対象側 lessons の3件が反映されないリスクがあり、P4 差し戻しで spec に A1-8（反映先と挿入位置を名指しし、designer の優先順位判断の対象外と宣言する節）を手作業で足した。既存改修モードでは毎回起きうる（canon-issues-20260922_172924.md:238-245）。
- 提案: spec-writer のテンプレートに mandatory 節を構造化し、designer 定義に「mandatory 節の項目は取捨の対象外」を書く。ゲートで「mandatory の各項目が design-map のレコード（反映追跡）に対応しているか」を機械照合する。

## 2026-09-27 受入基準の合否条件に行数・件数を使ってしまう（旧 canon-issues-20260922_172924#参考）
- 種別: 規律昇華
- 何が起きたか: 当初 spec A1-4 は「常時ロード L1 が 242行を超えない」だったが、教訓の反映は L1 を必然的に増やすため A1-1／A1-8 と衝突し、P4 で「同一内容が2箇所以上に無いこと」＋「242行は参照値で合否条件ではない」に書き換えた（canon-issues-20260922_172924.md:246-248）。
- 提案: spec-writer 定義に「行数・件数を合否条件に使わない（正典の上限は G 系ゲートが見る）。受入基準は質（重複の無さ・振る舞い）で書く」を書く。
