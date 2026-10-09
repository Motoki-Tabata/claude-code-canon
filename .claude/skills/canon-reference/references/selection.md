---
sources:
  - https://code.claude.com/docs/en/features-overview.md
  - https://code.claude.com/docs/en/agents.md
  - https://code.claude.com/docs/en/workflows.md
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/sandbox-environments.md
  - https://code.claude.com/docs/en/channels.md
---

# 機能選定ガイド

要件から、使う機能を選ぶためのガイドである。機能ごとの判断材料は各機能ファイルの「2. 使う場面・使わない場面」にあり、本書はそれらを横に並べて選ぶ順序を示す。

## 1. 選ぶ手順

1. **要件を「何を・いつ・どれだけ確実に」に分ける。**
   - 何を: Claude に知らせる事実か、手順か、応答の形か、外部への接続か、自動で起こす処理か。
   - いつ: 毎セッションか、特定のファイルを扱うときか、呼んだときか、イベントのたびか。
   - どれだけ確実に: Claude の判断に任せてよいか、例外なく守らせるか。
2. **§2 の比較表で候補を絞る。** 読み込まれ方とコンテキストの費用が要件に合う機能を選ぶ。[仕様]
3. **確実さが要るものは §4 で制御の層を選ぶ。** Claude が読む指示は強制されない。例外なく守らせる制約は、Hook・permission 規則・サンドボックスで担保する。[仕様]
4. **近い機能と迷ったら、両方の機能ファイルの §2 を読む。** §3 に見分け方の要点を置いた。
5. **配る相手で置き場と包み方を決める。** スコープは §5、プラグインにするかどうかは `features/plugins.md` §2 で決める。
6. **1つのセッションの外に出る要件**（定期実行・並列のセッション・CI・外部からのイベント）は §6 の運用の機能から選ぶ。これらは配置するファイルではなく、運用の選択肢である。

公式は、最初からすべてを設定せず、きっかけが生じたら機能を足していくよう勧めている。[仕様]

> "You don't need to configure everything up front. Each feature has a recognizable trigger"

| きっかけ | 足すもの |
|---|---|
| 同じ規約やコマンドを Claude が2回間違えた | CLAUDE.md（`features/claude-md.md`） |
| 短く・詳しく・同じ形式で、と何度も頼んでいる | 出力スタイル（`features/output-styles.md`） |
| 作業を始めるたびに同じプロンプトを打っている／同じ手順を何度も貼っている | Skill（`features/skills.md`） |
| Claude から見えないシステムのデータを何度も写している | MCP サーバー（`features/mcp.md`） |
| 脇の作業の出力で会話があふれる | サブエージェント（`features/subagents.md`） |
| 頼まなくても毎回起きてほしい | Hook（`features/hooks.md`） |
| 2つ目のリポジトリにも同じ構成が要る | プラグイン（`features/plugins.md`） |

（公式の "Build your setup over time" の表を要約した。[仕様]）

## 2. 機能の比較表

| 機能 | 何をするか | 読み込まれる時機 | コンテキストの費用 | 強制か | 機能ファイル |
|---|---|---|---|---|---|
| CLAUDE.md | 毎セッション読む事実と規約 | セッションの開始時（サブディレクトリのものは必要時） | 毎リクエストに全文 | しない | `features/claude-md.md` |
| ルール（`.claude/rules/`） | トピックやパスごとの指示 | 毎セッション、または `paths` に一致するファイルを扱うとき | `paths` が無ければ毎リクエスト | しない | `features/rules.md` |
| Skill | 参照資料と、呼び出せる手順 | `description` は開始時、本文は使うとき | `description` は毎リクエスト。本文は使ったときだけ | しない | `features/skills.md` |
| 出力スタイル | 応答の役割・口調・形式 | 開始時と、切り替えたとき | 毎リクエスト（Default は無し） | しない | `features/output-styles.md` |
| サブエージェント | 隔離したコンテキストで作業し、要約を返す | 起動したとき | メインからは隔離される（`description` は常駐） | ツールと権限の制限は効く | `features/subagents.md` |
| Hook | ライフサイクルのイベントで処理を走らせる | イベントのたび | 出力を返さなければ0 | する（イベントのたびに必ず動く） | `features/hooks.md` |
| MCP | 外部のサービスとツールにつなぐ | 開始時（ツール名。スキーマは必要時） | ツールを使うまでは小さい | しない | `features/mcp.md` |
| settings | クライアントが強制する設定 | 起動時と、ファイルを変えたとき（一部のキーは起動時だけ） | 載らない | する | `features/settings.md` |
| permissions | ツールの許可・確認・拒否、モード、サンドボックス | ツール呼び出しのたび | 載らない | する | `features/permissions.md` |
| status line | 端末の下の表示 | 表示の更新のたび | 載らない | 表示だけ | `features/statusline.md` |
| プラグイン | 上の機能を束ねて配る | 有効にしたとき | 中身の機能に従う | 中身の機能に従う | `features/plugins.md` |
| Mods | 関数の Hook で、描画やイベントの書き換えをする | プラグインが読み込まれたとき | 返すものに従う | 照合だけのガードは迂回されうる | `features/plugin-mods.md` |

[仕様]（`features-overview` の "Match features to your goal" と "Context cost by feature"、各機能ファイルの §1・§2 による）

## 3. 近い機能の見分け方

- **CLAUDE.md と Skill**: CLAUDE.md は毎セッション、Skill は必要なときに読み込まれる。いつも知っているべきことは CLAUDE.md、ときどき要る資料や `/<name>` で呼ぶ手順は Skill に置く。[仕様]
- **CLAUDE.md とルール**: ルールは CLAUDE.md を焦点の絞れた状態に保つための分割先である。`paths` を付けると、一致するファイルを扱うときだけ読み込まれる。[仕様]（`features/rules.md` §2）
- **CLAUDE.md と出力スタイル**: CLAUDE.md は Claude が知るべきこと、出力スタイルは応答の仕方を持つ。どちらも指示で、強制されない。[仕様]
- **Skill とサブエージェント**: Skill はどのコンテキストにも読み込める再利用の内容で、サブエージェントは別のコンテキストで動く作業者である。組み合わせられ、サブエージェントは `skills` で Skill を preload でき、Skill は `context: fork` で隔離して動かせる。[仕様]（`features/skills.md` §2・`features/subagents.md` §2）
- **Skill と Hook**: Hook はイベントのたびに必ず動き、Skill は Claude が解釈して従う。同じ手順を毎回同じに起こしたいなら Hook、判断が要るなら Skill を選ぶ。[仕様]
  > "If a rule must hold every time, make it a hook rather than a prompt instruction."
- **MCP と Skill**: MCP はツールとデータへのアクセスを足し、Skill はその使い方の知識と手順を足す。組み合わせて使える。[仕様]
- **Hook と permission 規則**: 許可・拒否を確実に強制するなら permission 規則を使う。Hook の `"allow"` は deny 規則を越えられない。[仕様]（`features/hooks.md` §2・`features/permissions.md` §2）
- **settings hook と Mods**: 通す・止める・記録するだけなら settings hook を使う。描画、Claude Code 内部のイベントの書き換え、ターンを使わないコマンドが要るときだけ Mods を使う。[仕様]（`features/plugin-mods.md` §2）
- **単体の `.claude/` とプラグイン**: 1つのプロジェクトか自分だけで使うなら単体の構成にする。チームに配る、複数のプロジェクトに入れる、版付きで公開するときにプラグインにする。[仕様]（`features/plugins.md` §2）

## 4. 制御の強さ

弱い順に4つの層がある。下の層ほど確実で、適用できる範囲は狭い。

| 層 | 何で効くか | 確実さ | 主な機能ファイル |
|---|---|---|---|
| 指示 | Claude が読んで従う（CLAUDE.md・ルール・Skill・出力スタイル・サブエージェントの本文） | 強制されない。依頼であって保証ではない | `features/claude-md.md` ほか |
| Hook | Claude Code がイベントのたびにスクリプトなどを走らせ、ブロックや文脈の追加をする | イベントが起きれば必ず動く。ただし `if` の絞り込みはベストエフォート | `features/hooks.md` |
| permission 規則とモード | Claude Code がツール呼び出しの前に、規則でツールと引数を判定する | deny はどのレベルの allow にも越えられない。ただし Bash の規則はコマンド文字列との照合で、プログラムの周りの境界ではない | `features/permissions.md` |
| サンドボックス | OS がシェルコマンドとその子プロセスの読み書き先・通信先を制限する | コマンドの書き方に依存しない。ただし組み込みのファイルツール・MCP サーバー・Hook はその外で動く | `features/permissions.md` |

- 指示は強制の層ではない。[仕様]
  > "CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer."
- Hook は permission 規則を緩められない。一致する deny 規則は、Hook が `"allow"` を返しても呼び出しを止める。[仕様]
- 境界として守らせたいときは、permission 規則とサンドボックスを併用する。[仕様]（`features/permissions.md` §2）
- 組織として強制するときは managed settings に置く。managed settings はほかのどのレベルにも上書きされない。[仕様]
- Claude Code のプロセス全体を隔離したい（ファイルツール・MCP サーバー・Hook も境界の内側に入れたい）ときは、sandbox runtime・コンテナ・VM・クラウドセッションから選ぶ。比較は `sandbox-environments` にある。[仕様]

## 5. スコープと、複数のレベルの重なり方

- 置き場のスコープ（managed・user・project・local・plugin）は `paths:files` の `scope` で引く。チームで共有するものはプロジェクトのコミットされるファイル、個人のものは `local` か `user` に置く。[仕様]
- 同じ機能が複数のレベルにあるときの重なり方は、機能によって違う。[仕様]
  - CLAUDE.md: 全レベルの内容が同時に読み込まれる。
  - Skill とサブエージェント: 同じ名前なら優先順位で1つが勝つ。
  - MCP サーバー: 同じ名前なら local > project > user の順に勝つ。
  - Hook: すべてのレベルのものが発火する。
- settings のスコープと優先順位の詳細は `features/settings.md`。

## 6. 運用の機能の選択肢

配置するファイルを持たないか、セッションの外で動く機能である。canon は、これらの機能を生成の対象にしない（canon の規律で、公式の仕様ではない）。要件がこれらを必要とするなら、選択肢として利用者に示す。

### 6.1 並列に動かす

| 選択肢 | 使う場面 | ページ |
|---|---|---|
| サブエージェント | 1つのセッションの中で、脇の作業を隔離して要約を受け取る | `sub-agents`（`features/subagents.md`） |
| Agent view | 独立した複数の作業を background のセッションに渡し、まとめて見る | `agent-view` |
| Agent teams | リーダーが作業を分けて割り当て、作業者どうしが連絡を取り合う。実験的な機能で、既定では無効 | `agent-teams` |
| Dynamic workflows | 数個のサブエージェントでは足りない規模の作業や、結果を相互に検証させたい作業。計画をスクリプトに持たせる（`workflows/*.js`） | `workflows` |
| Worktrees | 並列のセッションやサブエージェントに、別々の git checkout を持たせる。gitignore されたファイルを写すときは `.worktreeinclude` を使う | `worktrees` |
| Cross-session messaging | 自分で動かしている複数のセッションの間で、結果や状態を伝え合う | `cross-session-messaging` |

並列の方式の選び方の軸は、公式によれば3つである。誰が作業を調整するか、作業者どうしが連絡するか、同じファイルを触るか。[仕様]（`agents` の "Choose an approach"）並列化はトークンの消費を何倍にもする。[仕様]

### 6.2 自動で・定期的に動かす

| 選択肢 | 使う場面 | ページ |
|---|---|---|
| Scheduled tasks（`/loop` など） | セッションの中でプロンプトを一定の間隔で繰り返す（デプロイの監視・PR の見張り） | `scheduled-tasks` |
| Desktop scheduled tasks | デスクトップアプリから、手元のマシンで定期的に新しいセッションを起動する | `desktop-scheduled-tasks` |
| Routines | クラウドで、スケジュール・API・GitHub のイベントを契機にセッションを動かす。手元のマシンが止まっていても動く | `routines` |
| `/goal` | 検証できる完了条件に達するまで、ターンを重ねて作業を続けさせる | `goal` |
| Channels | 外部のイベント（CI・チャット・Webhook）を、開いているセッションに送り込む | `channels`・`channels-reference` |
| Headless（`claude -p`） | スクリプトや CI から非対話で動かす | `headless` |
| GitHub Actions・GitLab CI/CD | リポジトリのワークフローから Claude Code を動かす | `github-actions`・`gitlab-ci-cd` |

### 6.3 レビューと安全

| 選択肢 | 使う場面 | ページ |
|---|---|---|
| Code Review | GitHub の PR を自動でレビューし、行にコメントする | `code-review` |
| Ultrareview | クラウドで、ブランチや PR を深くレビューする | `ultrareview` |
| Security guidance プラグイン | Claude が書いたコードを、書いている間に脆弱性の観点で見直させる | `security-guidance` |
| Claude Security プラグイン | コードベースや差分の脆弱性を、複数のエージェントで走査する | `claude-security` |
| Checkpointing | Claude の編集を巻き戻す | `checkpointing` |
| Advisor | 判断の難しい場面で、別の強いモデルに相談させる | `advisor` |
| Sandbox environments | Claude Code のプロセス全体の隔離方式を選ぶ | `sandbox-environments` |
| Plugin evals | プラグインをテストケースで評価する | `plugin-evals` |

### 6.4 前提の知識

選定の前提になる概念のページである。機能の選択肢ではない。

- エージェントのループと組み込みのツール: `how-claude-code-works`
- コンテキストウィンドウに何が載るか: `context-window`
- プロンプトキャッシュの効き方: `prompt-caching`
- 使い方の勧め: `best-practices`
- 大きなコードベースやモノレポでの絞り込み: `large-codebases`
- 機能が使える環境: `feature-availability`・`platforms`
- MCP の導入: `mcp-quickstart`
- プラグインの信頼と、Anthropic のマーケットプレイス: `plugins/security`・`plugins/anthropic-marketplaces`
- セキュリティの全体像: `security`
- 用語: `glossary`

ページは `https://code.claude.com/docs/en/<ページ>.md` で読める。

## 7. 出典

spec:

- https://code.claude.com/docs/en/features-overview.md
- https://code.claude.com/docs/en/agents.md
- https://code.claude.com/docs/en/workflows.md
- https://code.claude.com/docs/en/permissions.md
- https://code.claude.com/docs/en/sandbox-environments.md
- https://code.claude.com/docs/en/channels.md
- https://code.claude.com/docs/en/memory.md
- `sources.json` の `pages` のうち `treatment: selection-only` のページ（§6 に挙げたもの）
