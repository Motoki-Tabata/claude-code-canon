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

## 2026-09-27 承認時の申し送りが次セッションに届かない（run 20260925_004359・S2→S3）
- 種別: 欠陥修正
- 何が起きたか: P5 記録の「S3 の P6+7 で生成 ui-design.md を原本と diff し意味不変を確認して提示」が S3 で実施されず、配置後セッションで未実施と判明した（state.md P5 行・8b8a6f1a:L180）。resume の出力に state.md の要旨が出ない。
- 提案: `gates/lib/run-status.js`・`tools/resume.js` の JSON に state.md の承認・差し戻し行の要旨を `handoff_notes` として含め、SKILL.md の再開手順に「handoff_notes を next_action より先に実施し、結果をゲートの提示に含める」を書く。

## 2026-09-27 P8 の提示に退避件数が無く、オーケストレータが推測で誤案内した（run 20260927_003229・S4）
- 種別: 欠陥修正
- 何が起きたか: 「対象に管理ファイルが無いため退避は0件で .bak は作られない見込み」と案内したが、実際は退避39件（f3dd5ca1:L69・L81・L92）。dry-run も未実行のまま P8 を求めた（L51）。
- 提案: `deploy/pre-deploy-check.js` のレポートに「上書き（退避）予定 N件」を出す。SKILL.md 工程10に「.bak の有無を推測で案内しない。配置予定を提示してから P8 を求める」を書く。

## 2026-09-27 SessionStart が配置前の run を「完了済み」と表示する（run 20260925_004359・S4）
- 種別: 欠陥修正
- 何が起きたか: S4 冒頭で「work/.session-ts は完了済み run を指している」と出た（45b10f1a:L4）。generation.done 後・配置前であり実態と合わない。
- 提案: `gates/session-init.js` で `.deploy/deploy-result.json` の有無により「工程7通過済み（ガード非適用）・配置未了」と「配置済み」を出し分ける。

## 2026-09-27 G12 がツール呼び出しの書式片（`</content>` 等）を検出しない（旧 canon-issues-20260919_023121#S1-2）
- 種別: 欠陥修正
- 何が起きたか: run 20260919 で agent-builder の生成物に `</content>` が残ったが G12 は検出しなかった。`gates/` に書式片の検査は無い（2026-09-27 に grep で再確認）。
- 提案: G12 に「コードフェンスの外で `</content>`・`</parameter>`・`<parameter name=` が現れたら違反」を加え、本文末尾・frontmatter 直後・コードフェンス内の3位置に注入して前2者だけが違反になる回帰テストを置く。

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

