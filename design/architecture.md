---
title: claude-canon アーキテクチャ（v3）
purpose: claude-canon v3 の全体像と「なぜそうしたか」を人間向けに書く。経路とゲート、run の置き場所（対象の worktree）、中間文書、決定論のスクリプト、Agent と Skill と model・effort、検査、オーケストレーションの原則を扱う。書式と検査の契約は Skill の references とテストに置き、本書には写さない。
audience: [human]
canon_version: 2.1.295
---

# claude-canon アーキテクチャ（v3）

frontmatter の `canon_version` は、本書を書いたときに参照していた正典の版（`.claude/skills/canon-reference/sources.json` の `claude_code_version`）で、`tests/canon_version.test.js` が一致を検査する。

## 1. 位置づけ

claude-canon は、Claude Code のカスタマイズ一式（CLAUDE.md・Rules・Skills・Subagents・settings・Hooks・MCP・Plugin・出力スタイル）を、対象プロジェクトごとに人間の承認を挟みながら作る・直すメタジェネレータである。正しさの基準は正典 `.claude/skills/canon-reference/` だけに置く。

用途は4つ（既存一式の継続的な改修・新規の構築・全面的な作り直し・canon 自身への適用）で、どれも同じ仕組みで扱う。改修はふつう小の経路、新規と作り直しは大の経路に入る（§2）。

### 1.1 v2 から変えた理由

v2 は全量スナップショット方式で、既存の全ファイルを「そのまま残す・直す・統合する・消す」に判定し、一式を `output/` の下に書き直して配置した。2回の run（R1 20261012_030955・R2 20261014_232320）はどちらも小さな改修だったが、総入力は R1 が 53.5M、R2 が 46.3M（配置の段を除くと 40.3M）で、94% が cache_read だった。R2 では79件中55件が「直す」になり、23件は内容を変えないのに全文を書き写した。中間文書は要件 10KB → 仕様 101KB → 設計マップ 81KB と膨らみ、下流の全員がそれを読み直した。手戻りの原因は2回とも、実物や公式で確かめる前に要件を確定したことだった。verify の違反は2回とも0件で、欠陥を見つけたのは、残すファイルのレビュー・prompt-audit・公式照合だった。

v3 は**変更集合方式**にする。対象リポジトリの worktree の上で、変えるファイルだけを編集する。差分は `git diff` で示し、反映は人間がマージする。触らないファイルの判定・書き写し・配置の仕組みが要らなくなる。そのため、互換を取らずに骨格から作り直す。

## 2. 経路とゲート

| 経路 | セッション（推奨の起動） | ゲート |
|---|---|---|
| 小 | `/canon-plan`（Opus・medium）→ `/canon-build`（Sonnet・medium） | G1 計画 → G2 差分 → 人間のマージ |
| 大 | `/canon-plan`（Opus・medium）→ `/canon-design`（Opus・medium）→ `/canon-build`（Sonnet・medium） | G1 要件 → G2 設計 → G3 差分 → 人間のマージ |

- 1つのセッションは1つの Skill を進め、最後のゲートの承認を handoff に記録したら止まる。状態はファイルが持つので、セッションを切ってメインの履歴の読み直しを抑えても、失うものは無い。
- ゲートは1つずつ、ほかの問いと混ぜずに尋ねる。あるゲートの承認が別のゲートを兼ねることはない。
- 小の G1 は requirements.md と change-plan.md を合わせて承認する。大の経路で要件（G1）と設計（G2）を分けるのは、要件が固まらないうちに設計を議論すると、要件に戻って発散するためである。

### 2.1 小に入る条件

`/canon-plan` が要件を固めた時点で、次の3つをすべて満たせば小、1つでも欠ければ大とする。経路は G1 で人間が確かめる。

1. 対象に既存のカスタマイズがある（`inventory` が1件以上を数える）。
2. 新しい機能種別を足さない。機能種別は正典の12機能のことで、「新しい」とは、`inventory` でその機能のファイルが0件なのに、change-plan がその機能のファイルを足すことを指す。
3. 構成を変えない。Skill・Subagent・Plugin の新設・廃止・統合と、責務の付け替えをしない。既存のファイルの中を直すこと（行の追加・削除・参照の付け替え・設定の値の変更）は構成の変更に含めない。

変えるファイルの件数は条件にしない。R1 と R2 は、変えたファイルがそれぞれ31件・32件で、新規は0件、新しい機能種別も構成の変更も無かった。件数で切ると、両方とも大に入ってしまう。件数が示すのは作業量で、設計判断の有無ではない。

## 3. run の置き場所

| もの | 置き場所 |
|---|---|
| run の状態と中間文書 | canon のルートの `work/<ts>/`（gitignore） |
| 生成物 | 対象リポジトリの worktree `~/.claude-canon/wt/<対象名>-<ts>/`（ブランチ `canon/<ts>`） |

- 対象は git で管理されていることを前提にする。git でなければ `worktree` は exit 1 で止まる。
- `output/` は無くなる。生成物は対象のブランチのコミットとして渡す。
- 対象のブランチに入らないファイル（未追跡や gitignore の、`.claude/settings.local.json` など）は worktree に現れない。`inventory` は対象の作業ツリーにあるそうしたカスタマイズを警告として挙げる。そのファイルを変える要件は扱わない。
- canon 自身が対象のときも同じ扱いになる。worktree は canon のルートの外にあるので、run 中のセッションが読む `.claude/` と、編集される `.claude/` が混ざらない。v2 で必要だった、canon 自身を対象に指定することの拒否は要らなくなる。

### 3.1 canon のルートの外に置く理由（2026-10-17 の実験）

使い捨てのリポジトリ（canon 役のルートと、CLAUDE.md・Skill に目印を入れた対象）を作り、`claude -p`（v2.1.300・haiku）で確かめた。判定は、transcript の jsonl に目印が入ったかどうかで行った。

| 置き方 | 対象の CLAUDE.md | 対象の Skill | 編集の権限 |
|---|---|---|---|
| ルートの下 `work/<ts>/wt`（gitignore 下） | Read・Edit のたびに読み込まれた | 読み込まれなかった | 作業ディレクトリ内なので要らない |
| ルートの外・権限なし | — | — | Read の段階で拒否された |
| ルートの外・`--add-dir` | 読み込まれなかった | **読み込まれた** | 通った |
| ルートの外・allow 規則 `Edit(//<worktree>/**)` だけ | 読み込まれなかった | 読み込まれなかった | 通った |

- ルートの下に置くと、対象の指示が canon のセッションに混ざる（v2 が生成物を置いていた canon のルートの下のフォルダも同じ）。gitignore されていないサブディレクトリの Skill は、対照の実験で読み込まれた。gitignore 下で読み込まれないのはこの実験で見た挙動で、正典には書かれていない。
- `--add-dir` は対象の Skill を読み込むので使わない。`permissions.additionalDirectories` も、正典 `skills.md` §3.1 が追加ディレクトリを Skill の置き場所に挙げているので使わない（こちらは実験していない）。
- そこで、置き場所をホームの下の固定のパスにし、canon の `.claude/settings.json` に `Read(~/.claude-canon/wt/**)`・`Edit(~/.claude-canon/wt/**)` を置く。`~/` の起点で書けるので、利用者ごとの絶対パスが要らない。allow 規則は、canon のルートのワークスペース信頼を受け入れてから効く（正典 `permissions.md`）。
- 段階2で確かめたこと（`claude -p`・v2.1.300・haiku、`worktree` で作った `~/.claude-canon/wt/` の worktree）: Subagent（builder）は、この allow 規則で worktree を Edit できた。規則に当たらないパスへの Edit は、同じ手順で拒否された。
- まだ確かめていないこと: 対話のセッションで `~/` の起点の規則が効くか（`-p` は非対話なので、対話の許可の画面は通っていない）。
- 片付けは、人間のマージの後に `worktree cleanup` で行う。worktree のフォルダと、空になった `~/.claude-canon/` だけを消す。ブランチ `canon/<ts>` は成果物なので、`--delete-branch`（マージ済みのときだけ）か `--discard`（未コミットの変更ごと捨てる）を指定したときだけ消す。差分のゲートで差し戻されると同じ worktree で直すので、`/canon-build` の終わりでは消さない。

v2 は canon の run ごとの worktree を、`cd` と絶対パスの使い分け・コミットの権限確認・3つ目のフォルダの管理が負担だとしてやめた。v3 の worktree は対象の側にあり、作成・コミット・片付けは `worktree` スクリプトが行い、置き場所は1か所に固定する。ツールには絶対パスを渡すので `cd` も要らない。

## 4. 中間文書

中間文書は2つだけにする。前の段を再掲せず、要件の ID（R1…）とパスで参照する。書式の契約（テンプレート）は requirements Skill の references に置き、`npm run check` が検査する。

| 文書 | 書く人 | 中身 |
|---|---|---|
| `work/<ts>/requirements.md` | `/canon-plan` のメイン | 要件ごとの want・根拠の確度・根拠の所在・触る見込みのファイル・受入基準。constraints（hooks・mcp・plugins・experimental・組織の方針）、範囲外、未決 |
| `work/<ts>/change-plan.md` | 小はメイン（`/canon-plan`）、大は `/canon-design` のメイン | ファイルごとの変更指示（modify・new・delete と、要件 ID ごとの指示）、影響を受ける参照元の扱い（`impact` の該当ごとに「変える」か「変えない（理由）」か）、worktree で実行する対象の検証コマンド。大の経路では、機能選定・構成と責務・モデル割当も持つ |

- 仕様の文書は廃止して requirements.md に統合する。要件を「確かめた事実」と「受入基準」の形で書けば、方向づけの文書を別に挟む必要が無い。
- **根拠の確度**は「実物で確認」「公式で確認」「文言のみ」の3つにする。「文言のみ」の要件は G1 で確定させない（`check` が NG にする）。2回の run の手戻りは、どちらもここが原因だった。
- `impact` の該当には、change-plan の参照元の扱いで漏れなく答える（`check` が照合する）。R2 のレビューが見つけた、触らないファイルが変えた語を参照していた食い違いを、計画の段階で表に出すためである。
- handoff.md は run の状態だけを持ち、要件と計画の本文を写さない。frontmatter（`ts`・`target`・`route`・`worktree`・`branch`・`base`〔分岐元の sha〕・`canon_commit`・`stage`・`status`）と、進捗・承認・差し戻し・申し送り・セッションの5節にする。

### 4.1 サイズの上限

`check` は節ごとの UTF-8 バイト数を数え、上限を超えたら NG にする。値は R2 の実測（要件1件は 357〜1190 バイト、v2 の設計マップの変更指示はファイル1件で最大約 2.1KB）に余裕を持たせて決めた。段階6の実測で見直す。

| 文書・節 | 上限 |
|---|---|
| requirements の要件1件 | 1.5KB |
| requirements の constraints | 2KB |
| requirements 全体 | 20KB |
| change-plan のファイル1件の変更指示 | 2.5KB |
| change-plan の参照元の扱いの1件 | 1行（300バイト） |
| change-plan の機能と責務（大のみ） | 8KB |
| change-plan のモデル割当（大のみ） | 3KB |
| change-plan 全体 | 小 48KB・大 64KB |

上限を超えるのは、たいてい前の段の再掲か、変更指示に新しい本文を丸ごと書いたときである。新しい本文は builder が書くもので、計画には「何を・なぜ」だけを書く。

## 5. 決定論のスクリプト

機械的に答えが決まることは、すべてスクリプトにする。スクリプトは要約だけを標準出力に返し、詳細はファイルに書く。メインの文脈に一覧の全文を流さないためである。入口は `tools/` に置き、`package.json` の scripts から呼ぶ。共有のパーサは `lib/` に置く。

| コマンド | 役割 |
|---|---|
| `new-run` | `<ts>` を採番し、`work/<ts>/` と handoff の雛形を作り、`worktree` を作る |
| `preflight` | 開始時の照合を1回で行う（canon の HEAD と `canon_commit` の差分、`--expect` に挙げたゲートの承認、入力の実在、worktree のブランチと記録した sha） |
| `inventory` | worktree のカスタマイズ（`canon-reference/data/paths.json` の配置パス）の一覧・frontmatter・参照のグラフを JSON と要約に書く。プレースホルダ（`<...>`・`NNN`）は、実在の参照と区別する |
| `impact` | 変えるファイルと語・コマンドの一覧を受け取り、触らないファイルのうち、それらに触れているものを行番号付きで挙げる |
| `worktree` | 作成・削除（`rm`。change-plan の `op: delete`）・コミット・片付け。差分のゲートは、ここで作ったコミットの sha に束縛する |
| `verify` | 変えたファイルの検査（§7） |
| `check` | requirements.md と change-plan.md の検査（§4） |
| `approvals`・`handoff`・`tokens`・`reference-check` | 承認の記録と照合、handoff の更新、トークンの集計、正典の検査 |

`inventory` は v2 の existing 調査（R2 で 85KB）を置き換える。v2 の existing 調査は、ファイルの一覧・frontmatter・参照という機械で取れる事実を、ワーカーが読んで書き写していた。

## 6. Agent と Skill

### 6.1 Agent（6体）

ワーカーはコマンド実行系のツールを持たない。スクリプトの実行とコミットはメインが行う。model と effort は frontmatter の1か所で決め、起動時に上書きしない。

| Agent | 1文の責任 | model・effort | 使う段 |
|---|---|---|---|
| `investigator` | 要件に関係する箇所を、対象と公式・正典の実物で確かめ、確度付きの事実を書く | sonnet・medium | plan |
| `profiler` | 対象の言語・テスト・CI・規約を読み、事実だけを書く（`inventory` で数えられない部分） | haiku・high | plan（大の経路と、要件が未知の領域に触れるとき） |
| `builder` | change-plan の担当のファイルを、指示どおりに worktree で編集する | sonnet・medium | build |
| `reviewer` | 変えたファイルと `impact` の参照元を、correctness・security・正典の意図・context の4観点で判定する | sonnet・high | build |
| `prompt-auditor` | 変えたファイルに `/claude-api prompt-audit` を実行し、報告を逐語で書く | sonnet・medium | build |
| `session-analyst` | run の各セッションの transcript を分析し、行の参照付きで事実を書く | haiku・high | build の最後（振り返り） |

- **仕様を書く Agent と、残すファイルを見る Agent は作らない**。仕様の文書は廃止し、残すかどうかの判定ももう無い。後者が見ていた触らないファイルとの食い違いは、`impact` の該当を reviewer が見ることで引き継ぐ。
- **designer は作らない**。`/canon-design` の設計はメインが inline で行う。R1 の designer は総入力 9.5M（cache_read 8.9M）で、文脈は約12k から約313k まで増えた。そのうえ設計の段のメインも 1.7M を使い、R2 では生成の段で designer をもう1回起動した。設計の段のメインは設計以外のことをしないので、ワーカーに分けても文脈は節約できない。inline なら入力を読むのは1回で済み、差し戻しも同じ文脈で直せる。
- 小の経路の change-plan はメインが書く。要件の事実確認をした文脈がメインにあるからである。
- `profiler` と `session-analyst` を haiku・high にしたのは、`.claude/skills/design/references/model-selection.md` の3条件（事実の抽出に徹する・正典を参照した判断を要さない・出力が後段で検証される）を満たすからである。profile については `work/20261014_232320/eval/haiku/profile.md` で、haiku の出力が本番とほぼ同じ質だった（版の情報は多く、数えられなかった repo_scale は `inventory` が数える）。haiku に分ける基準は「3条件を満たし、本番の出力と同じ事実の項目が揃うこと」とする。session-analyst の分析を台帳に起票するかは、メインが確度を確かめて決める。

### 6.2 model と effort の根拠（概算）

単価（`claude-api` Skill の価格表、2026-10-06 時点のキャッシュ）は、Opus 5.5 が入力 $4・出力 $20・cache read $0.20、Sonnet 5.5 が $2・$10・$0.20、Haiku 5.5 が $0.10・$0.50 である。cache write は入力の1.25倍とした。Haiku の cache read は表に無いので、入力の0.1倍と仮定した。R1・R2 の transcript を `npm run tokens -- <session-id> --json` で集計し直し、この単価を掛けた。費用の全体は、R1 が約 $29.0、R2 が約 $26.3 である。

| 役（R2 の実績） | 実績 | 案 | 同じトークン量での概算 |
|---|---|---|---|
| designer＋設計の段のメイン | opus $5.74（生成の段の designer の再起動を含む） | 設計をメインの inline で行う | designer 1体分（約 $4.0）以下。メインが入力を読み直す分と、再起動の分が無くなる |
| reviewer | sonnet $2.53 | sonnet・high（opus・high は段階6で比べる） | opus なら $4.40 |
| session-analyst | sonnet $2.08 | haiku・high | $0.10（100K トークンを超えるプロンプトは単価が5倍になるので、最大で約 $0.5） |
| investigator | sonnet $2.39 | sonnet・medium（profile の部分は profiler の haiku に移す） | haiku なら $0.12 |
| builder・prompt-auditor | sonnet $2.30・$1.33 | sonnet・medium | 変えない |

- Opus と Sonnet の差は、cache read の単価が同じなので、cache の多い役では約1.4〜1.7倍にとどまる。費用を決めるのは、モデルの格よりトークンの量である。そこで v3 は、モデルを下げるより、読む量と書き写す量を減らすほうを優先した。
- 段階6の受け入れ条件（総入力が R2 の全段の 46.3M の40%、約18.5M 以下）に余裕を持って収める配分の目安（推測、計16M）は、plan のメイン 4.5M・investigator 1.5M・build のメイン 3M・builder 2M・reviewer 2.5M・prompt-auditor 1M・振り返り 1.5M である。段階6で `npm run tokens` の実測と比べる。
- `/canon-build` の advisor は、同じエラーが2回出たときと、差分のゲートの前だけに呼ぶ。

### 6.3 Skill

- 段階のオーケストレーター `canon-plan`・`canon-design`・`canon-build` は `disable-model-invocation: true` にする。最初に `preflight` を実行し、終わりに次のセッションの `--model`・`--effort` を案内する。`context: fork` は付けない（ヒアリングが成り立たなくなる）。
- 知識 Skill は5件にする。`requirements`（ヒアリングの質問・用語の誤マッピング・requirements.md と change-plan.md のテンプレート）、`investigation`（確度付きの事実と profile の書式）、`design`（機能選定・構成と責務・パターン・モデル割当）、`generation`（builder の生成規約）、`review`（4観点・`impact` の参照元の見方・verify との境界）である。
- 正典 `canon-reference` の中身は変えない。知識 Skill は本文を写さず、該当の節をパスで指し、ワーカーには節単位で読ませる。`canon-update`（正典の作り直し）は v3 の対象外である。

## 7. 検査

| 検査 | 入力 | 内容 |
|---|---|---|
| `check` | requirements.md・change-plan.md | 確度、確定要件に「文言のみ」が無いこと、受入基準、サイズの上限、要件と計画の対応、`impact` の該当への回答 |
| `verify` | worktree の `git diff --name-only <base>..HEAD` | 1 配置パス・2 frontmatter・3 ツール名・4 secret・5 書式片・6 参照整合（変えたファイルからの参照と、削除したファイルを指す、触らないファイルの参照）・7 計画との一致（差分のファイル集合が change-plan のファイル集合と同じ）・8 constraints・9 trust の前提（警告） |
| 対象のテスト | worktree | change-plan の検証コマンドを、メインが worktree で実行する |
| `approvals` | ゲートの対象 | G1・G2（大は G3 まで）。文書のゲートは sha256 に、差分のゲートはコミットの sha に束縛する |

- verify は変えたファイルだけを見る。触らないファイルは base のまま変わらず、それへの影響は 6 の参照整合と `impact` が受け持つ。v2 の、残すファイルの非回帰とスナップショットの完全性の検査は、全量スナップショット方式のためのものなので廃止する。
- 判定のコードは `lib/verify/` の1系統にまとめた。`canon-update` の検査（正典の検査）は触らない。重なるのはコードフェンスの判定と走査だけだった。
- 差分に hooks（settings・frontmatter のどちらでも）か `permissions` が含まれるときは、verify の 9 が「対象のワークスペースの trust を承認しないと効かない」という警告を出し、差分のゲートの提示に載せる。v2 は README の生成でこれを伝えようとしたが、項目が漏れていた。
- 空振りを合格にしない。検査の対象が0件のとき（差分が空・計画が空）は、違反として扱う。
- 差分のゲートを承認した後に、ブランチに新しいコミットが積まれたら、承認は無効になる（`approvals check` が sha の不一致を出す）。

## 8. オーケストレーションの原則

- **メインが直接 spawn する**。ワーカーはすべてメインが起動し、深さは2にとどめる。ワーカーを束ねる中継役は置かない。独立したワーカーは同じ turn で並列に起動する。
- **ファイル駆動**。工程の間の状態は、メインの文脈ではなく `work/<ts>/` のファイルと worktree のコミットが持つ。ワーカーは成果物を自分で書き、応答では書いたことだけを短く返す。
- **差し戻しは新しく spawn する**。`SendMessage` で再開すると、キャッシュが切れた状態で、溜まった文脈を読み直すことになる。直す指示は handoff の差し戻しに逐語で書き、そのパスを渡す。
- **ワーカーはシェルを持たない**。書込先は定義と tools で縛るが、シェルを持てばその外にも書ける。自己適用テストが `.claude/agents/**` の `tools:` を検査する。対象向けの生成物の Subagent は、この対象外である。
- **フックを使わない**。かつて完了マーカーと書込ガードをフックで回した方式は、Stop の再ブロックの連打・誤検知・承認状態の分散・同期漏れを生み、欠陥を見つけたのは成果物の中身を見る検査だった。順序と承認は対話と handoff が持ち、承認後の改変は sha の照合で検出する。
- **canon の課題はその場で `tasks/lessons.md` に起票する**。`/canon-build` の最後に session-analyst が振り返りの材料を出し、メインが確度を確かめて起票を補う。

## 9. リポジトリ構成

`.claude/` に段階の Skill・知識 Skill・正典（§6.3）、Agent 6体（§6.1）、rules（canon 自身の開発規律）、`settings.json`（permissions だけ。worktree への Read・Edit を含み、hooks は置かない）を置く。そのほか、`lib/`（共有のパーサと判定）、`tools/`（§5 のスクリプト）、`tests/`、`design/architecture.md`（本書）、`guide/`、`tasks/lessons.md`（canon 本体への改修要求の台帳）、`work/`（run の状態・gitignore）を置く。

## 10. 廃止したもの

全量スナップショット方式と、それを支えた仕組みを廃止する。具体的には、ファイルごとの処遇の判定とその条件、成果物の一覧と使い方の説明の決定論の生成、管理パス集合、成果物のコピー・一覧の生成・レビュー入力の作成・配置前の照合・配置・自己指定の拒否のスクリプト、verify の旧 V7・V8、仕様の文書とそれを書く Agent、残すファイルを見る Agent、designer、`output/`、Phase 分けと人間ゲート P 系である。v2 の書式と検査の詳細（旧 `design/artifacts.md`）は git の履歴に残る。
