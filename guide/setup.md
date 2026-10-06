# claude-canon セットアップと運用の手順

claude-canon は、Claude Code のカスタマイズ一式を Phase A〜D・工程1〜9 で半自律に構築するメタジェネレータです。
本書はセットアップ、run の進め方、配置、片付けの手順を示します。設計の全体像は
[../design/architecture.md](../design/architecture.md)、成果物と検査の契約は [../design/artifacts.md](../design/artifacts.md) にあります。

## 前提

- Node.js 22 以上（22・24 で検証済み。`npm test` が `node --test` にグロブ文字列を渡すため、20 系では動きません）
- git
- Claude Code
- 依存パッケージはありません（`npm install` は不要）

## 1. 取得と初期確認

```bash
git clone https://github.com/Motoki-Tabata/claude-code-canon.git
cd claude-code-canon

npm run build:tables   # docs/ から verify の判定表 gates/conformance_tables/*.json を生成
npm test               # 検査・スクリプト・自己適用のテスト
```

- 判定表は生成物です。手で編集せず、`docs/` を変えたら `npm run build:tables` を再実行してコミットします。CI は判定表が `docs/` と一致していることを検査します。
- `npm test` が緑でないまま run を始めないでください。claude-canon 自身の `.claude/` がスキーマに合っていること、ワーカーがコマンド実行系のツールを持たないこともここで確かめています。

## 2. 標準 Skill を入れる

Phase C は Anthropic の標準 Skill を使います。

| Skill | 使いどころ | 入手 |
|---|---|---|
| `/claude-api prompt-audit` | Phase C で生成物のプロンプトを監査する | プラグイン `example-skills`（Claude Code に同梱されている場合はそれを使う） |
| `skill-creator` | 対象向けの Skill の description を trigger eval で磨きたいとき（任意）。builder 自身は `generation` Skill に置いた執筆指針の要約に従う | プラグイン `example-skills` |
| `mcp-builder` | MCP サーバーの新規実装が要るときに、対象側で使うよう案内する | プラグイン `example-skills` |

プラグインは Claude Code の中で次のように入れます。

```text
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

`claude plugin list` で `example-skills@anthropic-agent-skills` が enabled になっていれば準備完了です。

## 3. run の進め方

### 3.1 Phase A を始める

```bash
cd claude-code-canon
claude --model opus
```

```text
/canon-a /path/to/target-project
```

`/canon-a` は最初に `npm run new-run` を実行し、次のものを作ります。

- `<ts>`（`YYYYMMDD_hhmmss`）
- canon のルートの `work/<ts>/`・`output/<ts>/` と `work/<ts>/handoff.md`

成果物は git で追跡しません（`.gitignore`）。handoff.md の `canon_commit` に、run を始めたときの canon のコミットが記録されます。

工程2（要件ヒアリング）はオーケストレーターとの対話です。P1（要件）と P2（spec）で承認を求められたら、内容を確かめて承認するか、直す点を伝えます。

### 3.2 Phase B〜D

各 Phase は、前の Phase の最後に表示される案内どおり、**canon のルートで新しいセッションを起動**して実行します。

```bash
cd claude-code-canon
claude --model opus      # Phase B
```

```text
/canon-b <ts>
```

| Phase | モデル | コマンド | 人間ゲート |
|---|---|---|---|
| B | `claude --model opus` | `/canon-b <ts>` | P3 design-map |
| C | `claude --model sonnet` | `/canon-c <ts>` | P4 生成物とレビュー |
| D | `claude --model sonnet` | `/canon-d <ts>` | P5 配置 |

各 Phase の開始時に、handoff の `canon_commit` と現在の canon のコミットを比べます。run の途中で canon 本体（`.claude/`・`lib/`・`gates/`・`tools/`・`docs/`・`design/`・`guide/`）を直していれば、差分を示して続けてよいかを尋ねます。run の途中で canon を改修するときは、この警告を目安に、続けるか run を作り直すかを判断してください。

推奨モデルは強制ではありません。判断の精度が要る Phase（ヒアリング・spec・keep と retire の議論）を opus、委譲と機械的な手順が中心の Phase を sonnet にしています。Subagent のモデルは各定義の frontmatter で決まり、セッションのモデルには左右されません。

### 3.3 handoff.md と承認

`work/<ts>/handoff.md` が run の状態を持つ唯一のファイルです。

| 節 | 内容 |
|---|---|
| frontmatter | ts・target・mode（new／refactor）・phase・status・canon_commit |
| 進捗 | 工程のチェックリスト |
| 承認 | ゲート・日時・対象・sha256（先頭12桁）・要旨 |
| 差し戻し | 人間やレビューの指摘の逐語と、直す箇所・直さない箇所 |
| 申し送り | 次の Phase が最初にすること |

承認はオーケストレーターが `npm run approvals -- <ts> record <P1〜P5> "<要旨>"` で記録します。次の Phase の開始時には `npm run approvals -- <ts> check --expect …` で、それまでの承認の対象が変わっていないかを照合します。手で確かめるときも同じコマンドを使えます。

```bash
npm run approvals -- <ts> check --expect P1,P2,P3
npm run approvals -- <ts> hash P4      # 現在の generated/ のハッシュ
```

### 3.4 差し戻しと中断

- ゲートで直してほしい点を伝えると、オーケストレーターは指摘を handoff の「差し戻し」に書き、担当のワーカーを新しく起動して直させてから、承認を取り直します。
- 要件や spec に戻る変更は、Phase A のゲートからやり直します。設計の組み直しは `/canon-b <ts>` からやり直します。
- セッションが途中で切れたら、canon のルートで新しいセッションを起動し、同じ Phase のコマンドを実行し直します。Phase A は `/canon-a <ts>`（対象のパスではなく ts）で再開します。進捗と承認は handoff.md から読み直されます。ヒアリングの途中で切れた場合は、調査サマリの提示からやり直します。

## 4. 配置（Phase D）

`/canon-d <ts>` が配置手順書 `output/<ts>/deploy/RUN.md` と配置前照合 `pre-deploy-report.txt` を作り、P5 で承認を求めます。

- 照合で **uncaptured**（調査が取りこぼした、または調査の後に対象側で増えた管理ファイル）が1件でもあれば配置しません。Phase A の調査か Phase B の設計に戻します。
- 承認したら、RUN.md の「3. 配置」のコマンドを **sandbox の外の通常のシェルで**実行します。オーケストレーターは実行しません（`.claude/settings.json` も `--confirm` を拒否しています）。

  ```bash
  npm run deploy -- <output/<ts> の絶対パス> <対象の絶対パス> --confirm
  ```

  対象の管理パス集合を `.claude-canon.bak.<ts>/` へ退避してから配置し、sha256 で事後確認します。失敗したら退避から戻します。
- 実行したらセッションに戻って報告します。オーケストレーターが `deploy-result.json` を確かめ、RUN.md の配置後の手順を示します。
- 対象リポジトリへのコミットと push は、対象リポジトリで起動した Claude Code のセッションで行ってください。
- ロールバックは、対象側の git で revert するか、`.claude-canon.bak.<ts>/` から手で戻します。

run 中に見つけた claude-canon 本体の問題は、その場で `tasks/lessons.md` に書かれます。Phase D の最後に件数と見出しが報告されます。コミットは自分で判断してください。

## 5. run の片付け

run の成果物と対象側の `.bak` は自動では消えません。不要になったら人間が消します。

```bash
rm -rf work/<ts> output/<ts>
```

成果物は git で追跡していないので、消すと戻せません。残したいときは消さずに置いておきます。対象側の `.claude-canon.bak.<ts>/` は、配置の結果を確かめてから消します。

## 6. npm scripts

| script | 用途 | 使う Phase |
|---|---|---|
| `npm run new-run -- <target> [<ts>]` | ts の採番・骨格・handoff.md の作成 | A |
| `npm run approvals -- <ts> hash\|record\|check …` | 承認行の記録と照合 | A〜D |
| `npm run check -- <ts> requirements\|spec\|design-map` | requirements・spec・design-map の項目ごとの機械点検（OK / NG） | A・B |
| `npm run slice -- <ts>` | design-map をワーカー別のスライスに切り出す | C |
| `npm run copy-keep -- <ts>` | keep の原本を generated/ にバイト単位でコピーする | C |
| `npm run manifest -- <ts>` | MANIFEST・README・配置リストを決定論で生成する | C |
| `npm run verify -- <ts>` | V1〜V9 の検証。`verify-report.md` を書き、違反があれば exit 1 | C |
| `npm run review-bundle -- <ts>` | keep-reviewer の判定入力を作る | C |
| `npm run run-manifest -- <output-dir> <target-dir>` | 配置手順書 RUN.md を書く | D |
| `npm run pre-deploy -- <output-dir> <target-dir>` | 配置前照合。uncaptured があれば exit 1 | D |
| `npm run deploy -- <output-dir> <target-dir> [--confirm]` | 配置。`--confirm` が無ければ予定の表示だけ | D（人間） |
| `npm run build:tables` | `docs/` から判定表を生成する | 保守 |
| `npm run tokens -- <session-id \| jsonl のパス>` | セッションのトークン消費を集計する | 保守 |
| `npm test` | テスト | 保守 |

## 7. 正典 `docs/` の更新

正典を更新する専用のコマンドはありません。保守のセッションで `docs/SOURCES.md` の一次ソース一覧と調査手順に沿って公式ドキュメントと突き合わせ、`docs/` を直したら `npm run build:tables` と `npm test` を通し、PR で main に入れます。規律は `.claude/rules/canon-docs.md` にあります。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Phase の開始時に「承認行が無い」「不一致」で止まる | 前の Phase の承認が記録されていない、または承認の後で対象が変わった | 表示されたゲートの Phase で承認を取り直す。意図した変更でなければ、何が変わったかを確かめる（成果物は git で追跡していない） |
| Phase の開始時に「canon 本体が変わった」と警告される | run を始めた後に canon を改修した（コミット済み、または未コミット） | 表示された差分が run に影響しないなら続ける。影響するなら `/canon-a <対象>` で run を作り直す |
| `npm run verify` が検査対象ゼロで違反になる | generated/・design-map・requirements.md のどれかが無い、または空 | 該当する工程をやり直す。検査対象が無いことを合格にしない設計です |
| `npm run pre-deploy` が exit 1 で uncaptured を出す | uncaptured がある | 一覧のファイルを調査に含めるか、design-map で扱いを決め直す |
| `deploy --confirm` が「移動できないファイル」で拒否する | sandbox の中で実行した（バインドマウントされたファイルは rename できない） | sandbox の外の通常のシェルで実行する。対象は変更されていない |
| 新しいテストが `TS_NAMESPACES に '<name>' が未登録` で赤 | `tests/helpers/ts.js` への登録漏れ | 他と重複しない8桁の日付を `TS_NAMESPACES` に登録する |
| CI が「判定表が docs/ と一致しない」で赤 | `docs/` を変えて `build:tables` を回していない | `npm run build:tables` を実行してコミットする |
