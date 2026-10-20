# claude-canon セットアップと運用の手順

claude-canon は、Claude Code のカスタマイズ一式を、対象の worktree の上で半自律に作る・直すメタジェネレータです。
本書はセットアップ、run の進め方、マージと片付けの手順を示します。設計の全体像は
[../design/architecture.md](../design/architecture.md) にあります。

## 前提

- Node.js 22 以上（22・24 で検証済み。`npm test` が `node --test` にグロブ文字列を渡すため、20 系では動きません）
- git
- Claude Code
- 依存パッケージはありません（`npm install` は不要）

## 1. 取得と初期確認

```bash
git clone https://github.com/Motoki-Tabata/claude-code-canon.git
cd claude-code-canon

npm test               # 検査・スクリプト・自己適用のテスト
```

- `npm test` が緑でないまま run を始めないでください。claude-canon 自身の `.claude/` がスキーマに合っていること、ワーカーがコマンド実行系のツールを持たないこともここで確かめています。

## 2. 標準 Skill を入れる

`/canon-build` は Anthropic の標準 Skill を使います。

| Skill | 使いどころ | 入手 |
|---|---|---|
| `/claude-api prompt-audit` | `/canon-build` で変えたファイルのプロンプトを監査する | プラグイン `example-skills`（Claude Code に同梱されている場合はそれを使う） |
| `skill-creator` | 対象向けの Skill の description を trigger eval で磨きたいとき（任意）。builder 自身は `canon-reference` の skills §4（`generation` Skill から参照）に従う | プラグイン `example-skills` |
| `mcp-builder` | MCP サーバーの新規実装が要るときに、対象側で使うよう案内する | プラグイン `example-skills` |

プラグインは Claude Code の中で次のように入れます。

```text
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills
```

`claude plugin list` で `example-skills@anthropic-agent-skills` が enabled になっていれば準備完了です。

## 3. run の進め方

### 3.1 計画の段を始める

```bash
cd claude-code-canon
claude --model opus --effort medium
```

```text
/canon-plan /path/to/target-project
```

対象は git で管理されているリポジトリです（git でなければ止まります）。`/canon-plan` は最初に `npm run new-run` を実行し、次のものを作ります。

- `<ts>`（`YYYYMMDD_hhmmss`）
- canon のルートの `work/<ts>/` と `work/<ts>/handoff.md`（git では追跡しません）
- 対象の worktree `~/.claude-canon/wt/<対象名>-<ts>/` とブランチ `canon/<ts>`（canon のルートの外に置くので、対象の `CLAUDE.md` や Skill が canon のセッションに混ざりません）

handoff.md の `canon_commit` に、run を始めたときの canon のコミットが記録されます。

続けて棚卸し（`inventory`）、要件のヒアリング、根拠の確認を行います。ヒアリングはオーケストレーターとの対話です。「文言のみ」の根拠しかない要件は、実物か公式で確かめるまで G1 で確定しません。G1 で承認を求められたら、内容を確かめて承認するか、直す点を伝えます。

### 3.2 設計の段と構築の段

各段は、前の段の最後に表示される案内どおり、**canon のルートで新しいセッションを起動**して実行します。

| 経路 | 次の段 | モデル | コマンド | 人間のゲート |
|---|---|---|---|---|
| 小 | 構築 | `claude --model sonnet --effort medium` | `/canon-build <ts>` | G2 差分 |
| 大 | 設計 | `claude --model opus --effort medium` | `/canon-design <ts>` | G2 設計 |
| 大 | 構築 | `claude --model sonnet --effort medium` | `/canon-build <ts>` | G3 差分 |

経路（小か大か）は `/canon-plan` が要件を固めたときに決め、G1 で人間が確かめます。小は、対象に既存のカスタマイズがあり、新しい機能種別を足さず、Skill・Subagent・Plugin の新設・廃止・統合をしない改修です。変えるファイルの件数は条件にしません。

各段の開始時に、`npm run preflight` が handoff の `canon_commit` と現在の canon のコミットを比べます。run の途中で canon 本体を直していれば、差分を示して続けてよいかを尋ねます。続けるか run を作り直すかは、この警告を目安に判断してください。

推奨モデルは強制ではありません。判断の精度が要る段（ヒアリング・設計）を opus、編集と検査の手順が中心の段を sonnet にしています。Subagent のモデルは各定義の frontmatter で決まり、セッションのモデルには左右されません。

### 3.3 handoff.md と承認

`work/<ts>/handoff.md` が run の状態を持つ唯一のファイルです。

| 節 | 内容 |
|---|---|
| frontmatter | ts・target・route・worktree・branch・base・canon_commit・stage・status |
| 進捗 | 段ごとのチェックリスト（`計画1〜3`・`設計1`・`構築1〜5`） |
| 承認 | ゲート・日時・対象・sha・要旨 |
| 差し戻し | 人間やレビューの指摘の逐語と、直す箇所・直さない箇所 |
| 申し送り | 次の段が最初にすること |
| セッション | 段ごとの session-id（振り返りの集計に使う） |

承認はオーケストレーターが `npm run approvals -- <ts> record <G1〜G3> "<要旨>"` で記録します。文書のゲートは文書の sha256 に、差分のゲートは worktree のコミットの sha に束縛されます。次の段の開始時には `npm run approvals -- <ts> check --expect …` で、それまでの承認の対象が変わっていないかを照合します。手で確かめるときも同じコマンドを使えます。

```bash
npm run approvals -- <ts> check --expect G1
npm run approvals -- <ts> hash G1      # 現在の承認対象のハッシュ
```

差分のゲートを承認した後でブランチに新しいコミットを積むと、その承認は無効になります。

### 3.4 差し戻しと中断

- ゲートで直してほしい点を伝えると、オーケストレーターは指摘を handoff の「差し戻し」に書き、担当のワーカーを新しく起動して直させてから、承認を取り直します。
- 要件に戻る変更は、G1 からやり直します。設計の組み直しは `/canon-design <ts>` からやり直します。
- セッションが途中で切れたら、canon のルートで新しいセッションを起動し、同じ段のコマンドを実行し直します。計画の段は `/canon-plan <ts>`（対象のパスではなく ts）で再開します。進捗と承認は handoff.md から読み直されます。ヒアリングの途中で切れた場合は、調査サマリの提示からやり直します。

## 4. マージと片付け

差分のゲートを承認すると、`/canon-build` は止まります。オーケストレーターはマージも push もしません。

1. 対象のリポジトリで、ブランチ `canon/<ts>` を人間がレビューしてマージします。PR にするときは push も人間が行います。
2. hooks か `permissions` を含む差分は、対象のリポジトリでワークスペースの trust を承認しないと効きません（差分のゲートの提示に警告として載ります）。配置後の手作業（実行権限・環境変数）も、提示の内容に従います。
3. マージしたら、canon のルートで worktree とブランチを片付けます。

```bash
npm run worktree -- cleanup --worktree <worktree> --delete-branch
```

`--delete-branch` はマージ済みのときだけブランチも消します。マージしないで捨てるなら `--discard` です（未コミットの変更ごと消えるので、実行前に確認を求められます）。`--delete-branch` も `--discard` も付けなければ、worktree と空の置き場所だけを消し、ブランチは残します。

run 中に見つけた claude-canon 本体の問題は、その場で `tasks/lessons.md` に書かれます。`/canon-build` の最後に、振り返りの結果が報告されます。コミットは自分で判断してください。

## 5. run の中間物の片付け

`work/<ts>` は自動では消えません。不要になったら人間が消します。

```bash
rm -rf work/<ts>
```

`work/<ts>` は git で追跡していないので、消すと戻せません。残したいときは消さずに置いておきます。

## 6. npm scripts

| script | 用途 | 使う段 |
|---|---|---|
| `npm run new-run -- <target> [<ts>]` | ts の採番・`work/<ts>/` と handoff.md の作成・worktree の作成 | 計画 |
| `npm run preflight -- <ts> --stage <plan\|design\|build>` | 段の開始時の照合（canon の版・承認・入力の実在・worktree） | 全段 |
| `npm run inventory -- --root <worktree> --out <dir>` | 対象のカスタマイズの一覧・frontmatter・参照のグラフ | 計画 |
| `npm run impact -- --root <worktree> --out <dir> --files <…> [--terms <…>]` | 変えるファイルと語に触れている、触らないファイルの列挙 | 計画・設計 |
| `npm run check -- <ts> requirements\|change-plan` | requirements・change-plan の機械点検（OK / NG） | 計画・設計 |
| `npm run approvals -- <ts> hash\|record\|check …` | 承認行の記録と照合 | 全段 |
| `npm run handoff -- <ts> mark\|set\|note\|session …` | handoff.md の進捗の印（`mark <名前> --off` で外す）・frontmatter・節への追記・セッションの記録 | 全段 |
| `npm run worktree -- create\|rm\|commit\|cleanup …` | worktree の作成・ファイルの削除・コミット・片付け | 構築・マージ後 |
| `npm run verify -- <ts>` | V1〜V9 の検証（変えたファイルだけ）。`work/<ts>/verify-report.md` を書き、違反があれば exit 1 | 構築 |
| `npm run reference-check [-- --online] [--root <dir>]` | 正典リファレンスの検査（build.md §8 の 1〜9・11。`--online` で 2・4・5 も。`--root` で検査するディレクトリを替える）。違反があれば exit 1 | 保守 |
| `npm run tokens -- <session-id \| jsonl のパス> [--json]` | セッションのトークン消費を集計する（`/canon-build` の振り返りでも使う。`--json` で JSON を出す） | 構築・保守 |
| `npm test` | テスト | 保守 |

## 7. 正典 `canon-reference` の更新

canon のルートで `/canon-update` を実行します。公式ドキュメントから `.claude/skills/canon-reference/`（`references/`・`data/`・`sources.json`）を**全ファイル作り直す**保守用の Skill で、run の外で使います。手順は `.claude/skills/canon-update/references/build.md` にあり、途中で人に見せる関門が2つあります（ページの分類、検査の結果）。

検査だけを実行するには次のコマンドを使います。`--online` を付けると、公式サイトへ取得する検査（anchor の実在、ページ一覧、配置できるファイルの表）も実行します。付けないとき、それらは「未実行」と表示され、合格には数えません。

```bash
npm run reference-check -- --online
```

作り直したら `npm test` を通し、PR で main に入れます。規律は `.claude/rules/canon-reference.md` にあります。

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 段の開始時に「承認行が無い」「不一致」で止まる | 前の段の承認が記録されていない、または承認の後で対象が変わった（差分のゲートは、承認の後にブランチへコミットが積まれた） | 表示されたゲートの段で承認を取り直す。意図した変更でなければ、何が変わったかを確かめる |
| 段の開始時に「canon 本体が変わった」と警告される | run を始めた後に canon を改修した（コミット済み、または未コミット） | 表示された差分が run に影響しないなら続ける。影響するなら `/canon-plan <対象>` で run を作り直す |
| `npm run verify` が違反になる（差分が空・change-plan が無い・worktree に未コミットの変更がある） | 検査の対象が無い、または worktree が clean でない | 編集とコミットを済ませる。検査対象が無いことを合格にしない設計です |
| `npm run worktree -- create` が exit 1 で止まる | 対象が git で管理されていない | 対象を git のリポジトリにしてから `/canon-plan` をやり直す |
| 新しいテストが `TS_NAMESPACES に '<name>' が未登録` で赤 | `tests/helpers/ts.js` への登録漏れ | 他と重複しない8桁の日付を `TS_NAMESPACES` に登録する |
