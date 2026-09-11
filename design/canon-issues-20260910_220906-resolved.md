# canon-issues-20260910_220906 対処記録

`design/canon-issues-20260910_220906.md` の実測欠陥9件（S1:2・S2:3・S3:4）を別 run で全件対処した。
`npm test` は 455→496 緑（新規41件）。以下、項目ごとの対処内容と実地検証。

## S1-1（keep が機構的に成立しない） — 対処済み

- `gates/lib/investigation.js` の `parseSystemA()` を、`gates/lib/markdown.js` の新設
  `matchPathHeading()`/`parseInlineSlashFields()` 経由の書式へ差し替えた。`$` アンカーを
  廃し、1行形式（`- path: X / layer: L5 / kind: … / strength: …`）も複数行形式も両方
  正しく `path` を切り出す。`gates/lib/design-map.js` の同型パーサも同じ関数に統一した
  （同一ロジックの複製排除）。
- `gates/g1_stage_order.js` に、path に `layer:`/`kind:`/`strength:`/`disposition:` の
  キー残骸が混入していれば違反にする検出を追加（工程1の時点で見出し破壊を検出）。
- `gates/g2_keep_judgement.js` に、keep 0件かつ系統A 0件（既存改修モード限定）を
  vacuous pass にせず警告する検査を追加（推奨③）。
- `existing-customization-analyzer` の出力契約に、レコード見出しは1行にパスだけを書く旨を明記。
- 実地検証: `- path: .claude/settings.json / layer: L5 / kind: settings / strength: mandatory（…）`
  形式で書かれた系統Aから keep が実際に成立し、G8 の sha256 照合が走ることをテストで固定
  （`tests/g2_keep.test.js` S1-1 系）。

## S1-2（G8 が frontmatter name にしか対応しない） — 対処済み（種別ごとの検査手段）

- `gates/lib/interface-signature.js` を新設。種別ごとに対外インタフェース署名を定義:
  frontmatter name（SKILL.md・Subagent）/ rules の `paths:` 値集合 / `CLAUDE.md`・
  `.claude/README.md` の見出し構造 / JSON のトップレベルキー集合 / `.mjs`・`.js` の
  export 識別子集合。検査手段が無い対象は違反にせず「検査対象外」として通過メッセージ・
  gen-guard の stderr（`notes`）へ必ず出す。
- `gates/g8_non_regression.js` を署名比較へ差し替え。`.claude/settings.json` のような
  frontmatter を持たないファイルでも `interface_change: none` を宣言でき、かつ実照合される。
- `gates/g2_keep_judgement.js` の C3 実照合コメントと `existing-disposition` Skill に、
  C3⇔G8 の連鎖を明記。
- 実地検証: JSON のトップレベルキー不変/変化、rules の paths 集合不変/変化、CLAUDE.md の
  見出し構造不変/変化、壊れた JSON（unverified 扱い）の6ケースを `tests/g8_non_regression.test.js`
  に追加。

## S2-1（eval judge の出力契約違反が再発） — 対処済み（自動補正＋復旧経路の是正）

- `eval-reviewer` の `tools:` に `SendMessage` を追加（正典の正規ツール名・G5 で確認済み）。
  `/canon` skill が規定する復旧手順(a)が実行可能になった。
- `eval/verdict.js` に、判定内容を毀損しない3種の書式逸脱（未知のトップレベルキー・
  `condition` の enum 外・`findings[].target` の `coverage` 不記載）を自動補正して
  `warnings` に落とす経路を追加。フェンス不在・必須キー欠落等は従来どおり判定不能。
- `eval/report.js` が `warnings` を `notes` へ出す（黙って補正しない）。
- `quality-checklist` に NG 例を追加し、`coverage`/`target` に `constraint:<キー名>` 接頭辞で
  非ファイル対象を表せるようにした。
- 実地検証: `tests/eval_verdict.test.js` に自動補正3種と、据え置き（axis/verdict enum 外）が
  引き続き判定不能になることを両方固定。

## S2-2（recheck の冪等スキップ誤読） — 対処済み

- `tools/recheck.js` を、`:idempotent-cleanup` 検出時に「検査していない」旨を明示し
  exit 3（成功と区別）にした。マーカーが成果物の mtime より古ければ事前警告も追加。
- 実地検証: `tests/reopen.test.js` に固定。

## S2-3（G1 の §9 箇条書き判定が未文書化） — 対処済み

- `spec-writer` 定義に、§9「なし」は散文で書く旨と機械判定の具体を明記。G1 側は緩めていない。
- 実地検証: `tests/g1_g7.test.js` に箇条書き/散文の両ケースを追加。

## S3-1（requirements-recorder 未登録） — 対処済み（要検証）

- `model: haiku` → `sonnet` へ変更（19体中 haiku・未登録がこの1体だけという相関に基づく）。
  波及先（`canon`/`model-selection` Skill・`design/basic-design.md`）も更新。
- **この修正の効果は本セッション内では検証できない**（agent レジストリの再読込にセッション
  再起動が要る）。新セッションで `requirements-recorder` が `subagent_type` として現れるかを
  確認すること。解消しなければ `model-selection` Skill に記した手順でフォールバックする。

## S3-2（disposition の値語彙にガードが無い） — 対処済み

- `gates/lib/design-map.js` に `DISPOSITION_VALUES`（5値: keep/modify/merge/retire/out_of_scope）
  を新設。`gates/g2_keep_judgement.js` が値語彙・`out_of_scope` の管理集合外条件・
  manifest_note 必須を実照合する。
- `existing-disposition` Skill に5判定目として明記。
- 実地検証: `tests/g2_keep.test.js` に不正値・管理集合内での誤用・正しい使用の3ケースを追加。

## S3-3（write-scope-guard の宛先同定不能） — 対処済み（真因を特定して修正）

- **issue 文書の「`&&` 連結が原因」という推測は誤りだった**。`analyzeShellWrite()` は
  既に `&&`/`;`/`|` で分割済み。実際の原因は `tokenize()` がクォートを剥がすため、
  `sed -i '65{/^<\/content>$/d}' file` の**データ引数**に含まれる `<`/`>` を
  リダイレクト演算子と誤認し、引数走査を打ち切っていたこと。
- `gates/lib/shell-write.js` の `tokenize()` にクォート済みかどうかのフラグを持たせ、
  `<`/`>` の判定をクォートされていないトークンだけに限定した。
- 副次的改善として `analyzeShellWrite()` を `unresolvedSegments` を返す形に整理し、
  3ガード（write-scope-guard・canon-update-scope-guard・self-optimize-scope-guard）の
  フォールバック広域スキャンを「コマンド全文」から「宛先を同定できなかったセグメントの本文のみ」
  へ絞った。`.gate/` を `ls` するだけで無関係な別セグメントに巻き込まれて deny される摩擦を解消。
- 実地検証: 報告された実コマンドが allow されること、緩めた側の対（クォート内に隠した実書込・
  クォート無し `<>` は従来どおり打ち切り）が deny を維持することを `tests/write_scope_guard.test.js`
  に追加（計6件の新規テスト）。

## S3-4（scratchpad とガードの矛盾が未文書化） — 対処済み

- `/canon` skill に、run in-flight 中は一時ファイルも `work/<ts>/` に置く旨を明記
  （ガード側は緩めていない）。

---

対処順は issue 文書の「着手順の推奨」にほぼ従ったが、S3-1 は当初「登録」自体を疑っていたのに対し、
実測（19体中 haiku がこの1体だけ）から `model` を第一容疑として先に潰した。
S3-3 は issue 文書の推測（`&&` 連結）を裏取りで否定し、真因（`tokenize()` のクォート無視）を
特定してから直した——「申し送りを鵜呑みにしない」の実例。
