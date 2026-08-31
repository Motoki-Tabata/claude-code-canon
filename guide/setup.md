# claude-canon セットアップと初回実行手順

claude-canon は Claude Code のカスタマイズ一式を10工程で半自律構築するメタジェネレータです。
本書は初回セットアップと `/canon` の実行手順を示します。設計の全体像は
`../design/basic-design.md`、実装契約の詳細は `../design/detailed-design.md`、
ブートストラップ順序は詳細設計書 §13.3 を参照。

## 前提

- Node.js v22 以上（v22・v24 で検証済み。`npm test` が `node --test` へグロブ文字列を直接渡す形式のため
  v20 系では動作しない）
- git（`docs/`・`.claude/`・`gates/` は git 管理。`output/`・`work/` は clone 時点で空ディレクトリとして
  存在し、中身のみ gitignore。`generations/` は初回不在で実行時に作成される）
- **依存ゼロ**: `npm install` は不要（外部 npm パッケージを使わない設計）

## 0. リポジトリを取得する

```bash
git clone https://github.com/Motoki-Tabata/claude-code-canon.git
cd claude-code-canon
```

## 1. 照合表を生成する

決定論ゲートは正典 `docs/` から生成した照合表を出典にします。まず生成してください。

```
npm run build:tables
```

`gates/conformance_tables/*.json` が生成されます。**正典 `docs/` を変更したら必ず再実行**
してください（照合表は生成物であり、手動編集しない）。

## 2. テストが緑であることを確認する

```
npm test
```

`npm test` は**必須の帯域外検証**です（詳細設計書 §11.5）。ゲートのロジックと `.claude/settings.json`
の配線構造を検査します。これが緑でないまま `/canon` を実行してはいけません。

## 3. ⚠ 最重要: hooks が現に発火することを確認する

**決定論ゲートは `.claude/settings.json` の hooks 配線で発火します。配線が死んでいると、
ゲートが沈黙したまま全工程が「違反ゼロ」で通る vacuous pass が起こります。** しかも
`settings.json` の自己検証は原理的に不可能です（壊れていても `npm test` は緑になる）。
配線が死ぬ原因は主に2つあり、対処が異なります:

- **(a) 書式ミス（再起動では直らない）**: command handler に `"args": []` を付けると
  「引数なし」ではなく **exec form**（`command` を単一の実行ファイル名として直接起動）に
  切り替わり、`"command": "node \"${CLAUDE_PROJECT_DIR}/gates/x.js\""` のようなシェル用
  コマンド行を書いていると spawn に失敗して hook が黙って落ちる。node スクリプトは
  shell form（`args` を書かない）か exec form（`"command":"node","args":["…x.js"]`）の
  どちらかに統一する（詳細は `docs/L4_AUTOMATION.md` の command handler 規則）。
- **(b) ロード未反映（再起動で直る）**: Claude Code は hooks をセッション開始時に読み込む。
  `settings.json` を作成・変更した直後の同一セッションでは、file watcher が拾わない環境だと
  発火しないことがある。その場合は Claude Code を一度終了して再起動する。

これらは静かな罠です。`settings.json` を書いた直後は `npm test` が緑（ロジックと構造は正しい）
でも hooks が発火しないことがあり、run 内でしか検出できません。そのため多段で守ります:

1. **配線テスト（`npm test`・run 外）**: 配線の構造が妥当かを検査する（書式ミスの一部も捕捉）。
2. **スモークテスト（`npm run smoke:*`・任意・推奨）**: `/canon` を起動せず配線の実発火だけを
   最小コストで確認する。**`/canon` の前に必ず一度回すこと**（手順は下記）。
3. **ランタイム・カナリア（`/canon` 内・run 開始時）**: 配線が現に発火するかを run 開始時に検査する。

**スモークテスト手順（`/canon` の前に実施）**:

```
npm run smoke:arm      # <ts> を採番し、カナリアの的パスを表示（run in-flight 化）
```

次に**メイン Claude が Write ツールで**表示された的パス（`output/<ts>/.gate/.canary`）へ
書き込みを試みる。配線が生きていれば `.gate/** は deny-all` で **deny** される。最後に:

```
npm run smoke:check    # 的にファイルが在れば「配線が死んでいる」exit 2、無ければ exit 0
```

`smoke:check` が「配線が生きている」を返せば `/canon` を実行してよい。死んでいる場合は
上記 (a)（書式）→ (b)（再起動）の順に原因を切り分ける。

## 4. `/canon` を実行する

```
/canon <対象プロジェクトの絶対パス>
```

例: `/canon C:/path/to/my-project`

`/canon` は10工程を駆動し、各人間ゲート P1〜P8 でチャット上に確認を求めて停止します。

### 実行の流れ（preflight ＋ 10工程）

1. **preflight（工程1の前・順序厳守）**:
   - **G13**（`/canon` 展開時に自動発火）: claude-canon 自身のワーカー定義にコマンド実行系
     ツール（Bash/PowerShell/Monitor）が混入していれば run 開始をブロック。
   - **`<ts>` 採番**（`npm run ts` 相当）: この瞬間から run in-flight。
   - **ランタイム・カナリア**: `.gate/.canary` への意図的な書込を試み、**deny されなければ
     「配線が死んでいる」と判断して run を中断**する。ここで中断したら手順3（配線の実発火確認・
     書式ミス→再起動の順に切り分け）に戻る。
2. **工程1〜7**（P1〜P6）: 調査 → ヒアリング → 深掘り → spec → 選定+設計 → 生成。
   各工程の承認は `npm run approve -- <ts> <kind>` で鋳造されます（`.gate/**` への直接書込は
   deny-all のため、承認 CLI が唯一の経路）。
3. **工程8**（検証）: 決定論ゲートが真偽で確定。
4. **工程9**（品質検査＝eval）: judge が5軸で意味判断し `eval-report.md` を提示（P7）。
   決定論ゲートの代替ではありません（eval が clean でもラッチが立てば前進しません）。
5. **工程10**（デプロイ）: 照合付き手動配置（下記「6. デプロイ」）。

## 6. デプロイ（工程10・output バンドルを対象へ配置する）

配置は claude-canon の**外**（対象リポジトリ側）で人間が実行します（Hook が発火しない領域のため、
決定論ゲートではなくスタンドアロン CLI と人間ゲート P8 で守ります）。`/canon` の工程10 が
`output/<ts>/.deploy/RUN.md` に**その run 専用の手順書**を出力するので、基本はそれに従えば済みます。
手順書は canon リポジトリと対象リポジトリの両方にアクセスできる環境で実行してください。

```bash
# 1. 配置前照合（消える予定を retired/uncaptured に区分。uncaptured があれば exit 2 で中断）
node deploy/pre-deploy-check.js <output/ts の絶対パス> <対象リポジトリのルート>

# 2. P8: pre-deploy-report の retired 一覧が「意図した廃止」と一致することを確認

# 3-a. 配置予定だけ確認（--confirm 無し・対象は変更されない）
node deploy/deploy.js <output/ts> <対象>

# 3-b. 実配置（退避スワップ。.claude-canon.bak.<ts>/ へ退避してから配置し post-check）
node deploy/deploy.js <output/ts> <対象> --confirm
```

- **uncaptured**（調査取りこぼし）が1件でも出たら配置を止め、調査 or design-map へ差し戻します。
- ロールバックは対象の git revert ＋ `.claude-canon.bak.<ts>/` からの手動 restore。`.bak` の掃除は
  配置が正しいと確認できてから人間が行います（自動削除しません）。

## 7. ブロックされた場合

決定論ゲートが違反を検出すると、`output/<ts>/.gate/blocks/<stage>.blocked` にラッチが立ち、
以降の前進書込が deny されます。**ラッチはゲート再通過でも自動解除されません**。

- 原因を修正して成果物を再生成するのが基本です。
- やむを得ず解除するときのみ、人間の判断で `npm run unblock -- <ts>` を実行します。

## 8. npm scripts 一覧

`package.json` の全16スクリプト。上記1〜6で個別に触れなかったものを含め、用途と実行タイミング別に整理します。

**日常（`/canon` run の前後・随時）**

| script | 用途 |
|---|---|
| `npm run build:tables` | `docs/` から `gates/conformance_tables/*.json` を再生成（手順1） |
| `npm test` | 配線テスト・必須の帯域外検証（手順2） |
| `npm run smoke:arm` / `smoke:check` | hooks の実発火確認（手順3） |
| `npm run unblock -- <ts>` | ブロックラッチの人間による解除（§7） |

**`/canon` run 中（内部から呼ばれる・通常は手動実行しない）**

| script | 用途 |
|---|---|
| `npm run ts` | `<ts>` の採番（`tools/new-ts.js`）。run 開始で自動発行 |
| `npm run approve -- <ts> <kind>` | 承認鋳造の唯一の経路（§4.4）。人間ゲート通過後にオーケストレータが実行 |

**機能X（正典更新・`/update-docs`）**

| script | 用途 |
|---|---|
| `npm run canon:ts` | 機能X 専用 `<ts>` の採番（`tools/new-canon-ts.js`）。`/canon` run の `.session-ts` とは別名前空間 |

**機能Y（自己最適化・`/self-optimize` と実昇格）**

| script | 用途 |
|---|---|
| `npm run selfopt:begin -- <label>` | 自己再生成 run の開始（sentinel `work/.self-optim` を書く） |
| `npm run selfopt:end` | 自己再生成 run の終了（sentinel を消す） |
| `npm run selfopt:status` | 自己再生成 run の in-flight 状態を表示（終了忘れの確認用） |
| `npm run stage -- <output-dir> <label>` | 検証済み `generated/.claude/` を `generations/candidate-<label>/` へ取り込む |
| `npm run promote -- <candidate>` | 候補世代を現行 `.claude/` へ実昇格（G3〜G6＋G13 全通過が条件・失敗時は自動ロールバック） |
| `npm run rollback [-- <ts>]` | `generations/archive/` から直近（または指定 `<ts>`）の世代へ復元 |

**品質検査（工程9・eval）**

| script | 用途 |
|---|---|
| `npm run eval:bundle` | judge への判定入力バンドルを生成（`eval/bundle.js`・§16.3） |
| `npm run eval:meta` | judge の較正（ラベル付きコーパスの precision/recall 実測・§16.6） |

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| カナリアが「配線が死んでいる」と中断 | (a) hook の `command` に `args:[]` を付けて exec form 化し spawn 失敗／(b) `settings.json` 変更後に未ロード | (a) `args` を外す等 command handler 規則に合わせる→(b) Claude Code を再起動。`npm run smoke:*` で切り分け（手順3） |
| 保守作業で `docs/`・`.claude/` に書けない | run in-flight（`work/.session-ts` が残存） | run を完了するか `work/.session-ts` を削除（ガードは run 外では素通り） |
| `npm test` が「宣言の腐り」で赤 | ゲートを実装したのに `gates/gate-manifest.js` の宣言を消し忘れ | 該当エントリを削除（実装済みゲートは宣言に残さない） |
| 次の `/canon` が G13 で全ブロック | claude-canon 自身のワーカーに Bash/PowerShell/Monitor が混入 | 該当ワーカーの `tools:` からコマンド実行系を除去 |
| 新規テストファイル追加後、`npm test` が `TS_NAMESPACES に '<name>' が未登録` で赤 | `tests/helpers/ts.js` の `tsFor`/`tsSeq` を使ったが登録漏れ | `TS_NAMESPACES` へ他と重複しない8桁日付プレフィックスを追加登録（`tests/ts_namespace.test.js` が重複を検査） |
