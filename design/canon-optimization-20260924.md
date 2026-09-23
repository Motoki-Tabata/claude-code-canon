# claude-canon 改修まとめ（2026-09-24）— 5時間枠対策・モデルルーティング・対話承認化

読者: 今後この repo を保守する人。対象コミット（すべて main）: 489c153・bb722f3・9295c5a・d13b458・b644fdc・6482a15
（`git log c97e35d..HEAD`）。設計書への反映先は基本設計書 §2・§4.4・§4.6〜§4.8・§14・付録、詳細設計書 §9.3〜§9.5・§10.2・
§11.2・§11.5・§12.3・§13.2.1・§15.2・§16、手順は `guide/setup.md` の手順4・5・6・8。

---

## ① 背景 — run 20260922 が約2時間で5時間枠に到達した

run 20260922_172924 は開始から約2時間04分で5時間枠の上限に達し、eval の judge 5体が空振りした。`npm run tokens`
（`tools/token-usage.js`・Phase 0 で新設）で2 run の transcript を集計した基準値が `design/canon-token-baseline-20260924.md` にある。
総入力 = input + cache_creation + cache_read。

| 指標 | run 20260919_023121 | run 20260922_172924 |
|---|---|---|
| 総入力の合計 | 76,871,036 | 68,152,025 |
| main（Opus）/ 全体比 | 27,856,424 / 36.2%（139ターン） | 32,794,815 / 48.1%（178ターン） |
| designer（Opus） | 12,468,773 / 16.2% | 7,838,266 / 11.5% |
| generator | 9,098,688 / 11.8%（Opus で動いた） | 7,590,288 / 11.1%（sonnet） |
| spec-writer | 3,880,254 / 5.0%（Opus で動いた） | 1,093,856 / 1.6%（sonnet） |
| eval 5軸＋reviewer（2周） | 12,294,721（12.3M） | 13,370,744（13.4M） |
| design-map.md の Read 回数 | 30 | 19 |
| 5時間枠の上限到達 | なし（13h43m・うち承認待ち約7.4h） | あり（約2時間04分） |

読み取れること:

- **メイン会話の履歴の再読込が最大**（36〜48%）。1セッションで10工程を回すと、毎ターン全履歴を cache_read で読み直す。
- **designer・generator の文脈が大きい**。design-map（約96KB）を generator・builder・readme-writer・eval judge が全文 Read し（19〜30回）、
  読んだ内容が各エージェントの以後の全ターンで積み上がる。
- **eval が約16〜20%**（上表の eval 行を総入力で割った値: 12,294,721/76,871,036≒16.0%、13,370,744/68,152,025≒19.6%）。2周目も全量を読み直していた。
- **モデルの食い違い**: run 20260919 では frontmatter が sonnet の spec-writer・generator が Opus で走った（オーケストレータが Agent 起動時に
  `model:"opus"` を渡したため）。frontmatter が opus の eval-keep-review は sonnet で走った（基準値の文書は原因を個別には書いていないが、
  対策は同じく「起動時に `model` 引数を渡さない」）。
- **差し戻しのコスト**: 差し戻しでワーカーを `SendMessage` で再開すると、キャッシュ切れの状態で蓄積文脈を読み直す。`/canon` SKILL.md には
  「差し戻し分は総入力の約25%」とあるが、基準値の文書にはこの内訳の記録が無いため、本書では数値として扱わない。

## ② 方針

消費そのものを減らす施策と、1セッションに積もる量を区切る施策を併用する。

1. **4セッション分割**: `/canon` を S1 工程1-4（Opus）/ S2 工程5-6（Opus）/ S3 工程7-9（Sonnet）/ S4 工程10（Sonnet）に分け、
   区間ごとに新しいセッションで `/canon resume <ts>` する。状態はファイルが持つ（基本設計書 §4.2）ので会話履歴を引き継がなくてよい。
2. **対話承認**: 承認サイドカー（`npm run approve`・`.gate/approvals/`）を廃止し、承認はチャットで取って `work/<ts>/state.md` に記録する。
   人間ゲートを P2・P4・P5・P6+7・P8 に絞る（P1・P3 は報告のみ、P6 と P7 は1回に統合）。
3. **モデルルーティング**: モデル・effort の正を各 agent の frontmatter の一箇所に置き、起動時に `model` 引数で上書きしない。
   判断の重い区間・agent だけ Opus（designer・eval-keep-review、S1・S2 のメイン）。
4. **読む量の削減**: design-map をスライスに切る、eval の2周目は差分だけ、集約はコード、中継役（investigator・eval-reviewer）を廃止、
   差し戻しは新規 spawn＋修正指示ファイル。

## ③ フェーズ別の変更点

### Phase 0 — 計測器とモデル/effort（489c153）

- `tools/token-usage.js`（`npm run tokens -- <session-id | jsonl> [--json]`）: メイン／agentType×model 別に集計。`message.id` 重複は最後のレコードを採る。
  design-map.md への Read 回数も数える。基準値 `design/canon-token-baseline-20260924.md` を記録。
- ネイティブ起動の Agent 例示から `model` 引数を除去し、全 agent に `effort` を明示（designer・eval-keep-review=opus/high、spec-writer=sonnet/high、
  requirements-recorder・readme-writer=low、他 medium。canon-updater は opus/medium）。`tests/self_application.test.js` が回帰を固定（詳細設計書 §9.4）。

### Phase 1・2 — 承認サイドカー廃止・investigator 廃止（bb722f3）

- `tools/approve.js`・`gates/approval-guard.js`・`.gate/approvals/` を削除。工程順の機械担保は「完了マーカーの順序」へ移した:
  G1 が前段マーカーを要求し、advance-guard が `spec.done` なしの design-map 書込・`design.done` なしの `generated/**` 書込を deny する。
  承認後の成果物の凍結は廃止。`tools/reopen.js` は `<stage>` 以降のマーカーを連鎖削除する。
- 機能X は採番時の `docs/` スナップショットを提案フェーズ完了時に照合、機能Y は stage の前提を `generation.done`・ラッチ0件・`eval-report.md` に置換。
- `investigator` を廃止し、系統A/B をメインが直接並列 spawn、各ワーカーが自分の成果物を書く。G1 に系統A サマリの件数照合（S2-4）。

### Phase 3 — 4セッション分割・resume・差し戻し（9295c5a）

- `gates/lib/run-status.js`（`deriveRunStatus`）: ディスクの成果物・完了マーカー・ブロックラッチ・未消費リクエスト・state.md から現在地を導く。
  state.md は待ち状態の判定にだけ使う。承認は承認対象の確定（マーカー等の mtime）より後に記録されたものだけ有効。
- `gates/lib/run-exclusion.js`（3方向の相互排他）、`tools/resume.js`（`npm run resume`・JSON で現在地）、`tools/record-state.js`
  （`npm run state:record`・実時刻と固定書式・承認対象未確定なら拒否・`--revision`）。`work/<ts>/state.md`・`work/<ts>/revisions/<stage>-<n>.md`。
- SKILL.md: S1〜S4 の区切りと推奨モデル、区間の終わりの停止と案内、P1・P3 の報告化、P6+7 の統合。
- 差し戻しは SendMessage でなく新規 spawn＋修正指示ファイル注入。spec-writer・designer・generator・requirements-recorder に「修正モード」節。
- recheck の鮮度判定を run-status へ移し、focused 追記後の誤警告を解消（S3-1）。`/self-optimize` の run は S4 が世代ステージング（`isSelfOptimizeRun`）。

### Phase 4 — design-map スライス・G9 拡張（d13b458）

- `tools/slice-design-map.js`（`npm run slice`）・`gates/lib/design-slices.js`: design-map を common／write-scopes／l1・skills・agents・l4・l5／
  disposition-other／responsibilities／other-sections／targets-* に決定論で切り出す（S3 冒頭・`design.done` 必須・出力先を掃除）。
  generator・builder・readme-writer・eval-context/correctness はスライスを読む。
- `gates/lib/design-map.js` に `listDeclaredArtifacts`・`splitDispositionRecords`・`layerOfPath`。
- G9 に「design-map の宣言 ⇒ generated/ 実在」（S1-4）と「MANIFEST `## 全ファイル` ⇔ generated/ の双方向一致」（S1-3・`gates/lib/manifest.js`）を追加。
- `eval/bundle.js` の責務欄が実在しない `output/<ts>/responsibilities.md` を読んでいた既存の穴を、`slices/responsibilities.md` へ修正。

### Phase 5 — eval の差分再判定・決定論集約（b644fdc）

- `eval-reviewer` を廃止し、5 judge をメインが直接並列起動。集約は `eval/aggregate.js` ＋ `npm run eval:report -- <ts> --write` が決定論で行う。
- `eval/round.js`: round 1 は前の試行の判定・バンドルを消してスナップショット r1 を保存。round N≥2 は変更ファイルと前 round の違反対象だけを再判定
  （security は変更があれば常に再判定、他は前 round に違反があった軸のみ、keep-review は回付対象が変わったときも）。`mergeVerdict` で合成し、
  再判定すべき対象が coverage に無ければ未判定として落とす。有効な判定を `effective-r<N>.json` に保存。各 judge に round 2 モード。
- `eval/bundle.js`: 出力先を書き出し前に掃除（S2-2）、keep 対象を名指しする生成物の箇所を file:line で逆引き同梱（S2-5）。
  `quality-checklist` に「不在を根拠にする前に探す」。

### Phase 6 — deploy の堅牢化（6482a15）

- `deploy/deploy.js`: 事前検査 `probeMovable`（EBUSY 等で退避できないファイルがあれば無変更で拒否）、step1 を try の内側へ、restore は実際に置いた・退避したファイルだけ。
  旧実装は `managed-paths.list` の全エントリを削除しており未退避の元ファイルを消しうった（変異注入で再現・テストで固定）。復元失敗時は `.bak` を残し `state: partial`。
  退避0件のとき `.bak` を案内しない（S3-6）。成功時のみ `.deploy/deploy-result.json`（resume の配置済み判定）、毎回 `deploy-attempt.json`。
- RUN.md に「実行環境の注意」（`--confirm` はサンドボックスの外・push は対象リポジトリのセッションで・SSH は github.com:22）。
- 工程8に「実行を要する検証はオーケストレータが行う」（S2-3）、`layer-design` にも検証の主体を明記。

補足: 作業ツリーに未コミットの `.claude/skills/canon/SKILL.md` の1行（S3-3・`git add <パス>` で対象を明示する注意）がある。

## ④ 判断とトレードオフ

- **凍結の喪失と順序ガード**: 旧設計は承認済みの spec.md・design-map.md を書換不可に凍結していた。差し戻しで成果物を書き直すには凍結が邪魔になり、
  かつ承認の記録（サイドカー）は「オーケストレータが CLI を叩いた」ことしか証明しなかった。凍結を捨て、工程順は捏造できない完了マーカーの順序で守る。
  代償として、マーカー鋳造後に成果物を手で書き換えてもガードは止めない。これは run-status の `stale`（成果物がマーカーより新しい）で検出し、
  resume が報告して `reopen`→再検査を促す。検出はするが遮断はしない、という選択である。
- **state.md を判定材料にしない理由**: state.md は LLM（オーケストレータ）が書ける記録で、承認の真偽を機械的に確かめられない。ゆえにゲートの通過には使わず、
  「再開時に人間の返事待ちか」の判定にだけ使う。記録は CLI が実時刻・固定書式で書き、承認は承認対象の確定より後のものだけ有効とする
  （作り直した成果物に古い承認が付いたままになる事故を防ぐ）。state.md に承認が並んでいても、マーカーが無ければ工程は進まない（違反注入テストで固定）。
- **security 軸だけ常時再判定**: round 2 で全軸を再判定すると eval のコストが戻る。前 round で clean だった軸を引き継ぐと、変更で生じた新しい違反を見落としうる。
  見落としのコストが最も高い security だけは変更があれば必ず再判定し、他の軸の見落としは P6+7 の人間の確認に委ねる。既知のトレードオフとして詳細設計書 §16.9 に明記した。
- **eval-reviewer・investigator を廃止した理由**: どちらも「配下を spawn して結果を集約・永続化する」深さ2の中継役だった。実測で配下の報告が中継役に届かず
  メインに届く、`SendMessage` での再開も環境によって封じられる、という failure mode が2 run 連続で起きた（S2-1・R-S2-1）。
  永続化はワーカー自身が書けば済み、eval の集約は「1件も落とさない転記」でコードの方が正確なので、中継役を置く理由が無くなった。
  コーディネータの turn 中断問題（詳細設計書 §11.5）の対象も generator だけになった。

## ⑤ 運用

- **起動**: S1 は `claude --model opus` → `/canon <target>`。区間の終わりのゲートを承認して記録すると、オーケストレータは停止して次の起動を案内する。
  S2 は `claude --model opus`、S3・S4 は `claude --model sonnet` で起動し、`/canon resume <ts>`。
- **resume**: `npm run resume -- <ts>` の JSON（position・expected_model・waiting_gate・next_action・blocked・pending_requests・stale）に従う。
  別の run が in-flight なら拒否（別の `/canon` run からの切替だけ `--force`）。S1〜S3 の開始時はカナリアを撃つ。
- **差し戻し**: `state:record --revision` → `work/<ts>/revisions/<stage>-<n>.md` に修正指示 → `reopen` → 該当ワーカーを新規 spawn（修正モード）→
  recheck → 対話承認の取り直し。P6+7 から戻ったら eval は `eval:bundle --round N`。
- **区間の合間**: `generation.done` までは run 中で、claude-canon 本体（docs/・gates/・.claude/・design/）は編集できない。
- 手順の詳細は `guide/setup.md` 手順5。

## ⑥ 未対応・次の一手

- **S1-2**（agent-builder の書式片 `</content>` を G12 が検出しない）: 未対応。G12 に行単位の書式片検出（コードフェンス外）と3位置注入の回帰テストを加える。
- **S3-2**（`node -e` の書込先をガードが特定できない）: 未対応。SKILL.md 契約5 に「インタプリタの `-e` 内での書込は封鎖される。書込はリダイレクトで行う」を追記する。
- **S2-5 の推奨3**（工程9で「存在しない」を根拠にした violation をオーケストレータが横断 grep で検算する手順）と **S1-3 の推奨2**（managed-paths.list との3者一致）は未実施。
- **実 run での効果測定は未実施**。本改修後に `/canon` を実 run で回しておらず、トークン削減・5時間枠内への収まりは**確認していない**。
  次の実 run で各セッションの `npm run tokens -- <session-id>` を取り、`design/canon-token-baseline-20260924.md` の「改修後に確認する指標」
  （main の総入力・design-map の Read 回数・Opus で動いた agent が designer と eval-keep-review だけか・eval 2周目の総入力・各セッションが5時間枠に収まるか）
  と比較する必要がある。4セッション分割・resume・state:record のハーネス上の実発火（hook 経路・ネイティブ起動での model/effort の効き方）も同じ run で確かめる。
- 個別の対処状況は `design/canon-issues-20260919_023121-and-20260922_172924-resolved.md`（対処済み17件・未対応2件）。

## ⑦ 検証状況

- `npm test`（2026-09-24・WSL/Linux・Node で実行）: **tests 582 / pass 581 / fail 1**。
  失敗1件は `tests/artifact.test.js` の `skillPathRole`「Windows のバックスラッシュ区切りも判定できる」で、Linux で実行すると落ちる OS 依存の既存の失敗
  （`tests/artifact.test.js`・`gates/lib/artifact.js` は今回のコミット群で変更していない）。
- 追加・更新した主なテスト: `tests/token_usage.test.js`・`tests/run_status.test.js`・`tests/resume.test.js`・`tests/slice_design_map.test.js`・
  `tests/eval_round.test.js`・`tests/eval_bundle.test.js`・`tests/g9_g10_g12.test.js`・`tests/g1_g7.test.js`・`tests/deploy_swap.test.js`・
  `tests/deploy_run_manifest.test.js`・`tests/self_application.test.js`・`tests/reopen.test.js`。
- テストが示すのはロジックの正しさであり、実 run での配線の実発火とコスト削減の効果は⑥のとおり未確認である。
