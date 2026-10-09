---
sources:
  - https://code.claude.com/docs/en/features-overview.md
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/agents.md
  - https://code.claude.com/docs/en/workflows.md
  - https://code.claude.com/docs/en/best-practices.md
  - https://code.claude.com/docs/en/permissions.md
---

# 機能の組み合わせ方

機能を組み合わせる型を、委譲・並列・強制・配布の4つに分けて示す。1つの機能の書き方は各機能ファイルに、機能の選び方は `selection.md` にある。

## 1. 組み合わせの基本

機能はそれぞれ別の問題を解く。公式は役割を次のように分けている。[仕様]

> "CLAUDE.md handles always-on context, skills handle on-demand knowledge and workflows, MCP handles external connections, subagents handle isolation, and hooks handle automation."

| 組み合わせ | 働き方 | 例 |
|---|---|---|
| Skill + MCP | MCP が接続を、Skill がその使い方を受け持つ | MCP でデータベースにつなぎ、Skill にスキーマとクエリの型を書く |
| Skill + サブエージェント | Skill が並列の作業のためにサブエージェントを起動する | 監査の Skill が、セキュリティ・性能・スタイルのサブエージェントを起動する |
| CLAUDE.md + Skill | CLAUDE.md に常に効く規則、Skill に必要なときの参照資料を置く | CLAUDE.md は「API の規約に従う」とだけ書き、Skill に規約の全文を置く |
| Hook + MCP | Hook が MCP を通して外部の処理を起こす | 重要なファイルの編集のあとに、Hook がチャットへ通知する |

（公式の "Combine features" の表を要約した。[仕様]）

まず最も単純な構成を選び、要件が求めるときだけ複雑にする。[知見]

> "we recommend finding the simplest solution possible, and only increasing complexity when needed."

## 2. 委譲の型

メインの会話から作業を切り出し、隔離したコンテキストで動かす型である。

- **切り出す理由を確かめる。** 委譲が向くのは、大量の出力を隔離したい作業、ツールや権限を絞りたい作業、自己完結して要約を返せる作業である。頻繁なやり取りが要る作業や、段階をまたいで大きなコンテキストを共有する作業には向かない。[仕様]（`features/subagents.md` §2）
- **委譲のメッセージに4つを入れる。** 目的・出力の形式・使うツールと情報源・作業の境界の4つである。これが曖昧だと、作業者どうしが同じ作業を重ねたり、抜けが出たりする。[知見]
  > "Each subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task boundaries."

  サブエージェントは会話の履歴を見ないので、必要な情報は本文か委譲のメッセージで渡す。[仕様]（`features/subagents.md`）
- **大きな成果物はファイルに書かせ、参照を返させる。** 結果のすべてを調整役のコンテキストに通すと、情報が落ち、トークンも増える。[知見]
  > "Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator."
- **定義と Skill の組み合わせ方を選ぶ。** 次の2つの方向がある。[仕様]（`features/skills.md` §2）
  - サブエージェントの定義に役割を書き、`frontmatter:subagent/skills` で手順の Skill を preload する。
  - 手順の Skill に `frontmatter:skill/context` の `fork` を付けて、指定したエージェントで動かす。
- **組み込みのサブエージェントを先に検討する。** 調べるだけの作業は読み取り専用の Explore、計画のための調査は Plan、探索と変更の両方が要る作業は general-purpose に任せられる。Explore と Plan は CLAUDE.md を読まない。ユーザーかプロジェクトに `Explore` という名前のサブエージェントを定義すると、組み込みの Explore を置き換え、その定義の `model` で動く。[仕様]
- **モデルを役割に合わせる。** 単純で量の多い作業は速く安いモデルへ、判断の重い作業は上位のモデルか `inherit` にする。モデルが決まる順序は `features/subagents.md` §3 にある。[仕様][知見]
- **結果を別の作業者に検証させる。** 作業した本人ではなく、新しいコンテキストの作業者に結果を反証させる。[仕様]
  > "a verification subagent or a dynamic workflow that checks its own findings has a fresh model try to refute the result, so the agent doing the work isn't the one grading it."

## 3. 並列の型

- **互いに独立した作業だけを並べる。** 公式の比較では、作業を分けて同時に動かす型と、同じ作業を複数回動かして結果を比べる型がある。[知見]
  > "Sectioning: Breaking a task into independent subtasks run in parallel."
  > "Voting: Running the same task multiple times to get diverse outputs."
- **分け方が前もって決まらないなら、調整役に分けさせる。** 調整役が作業を分け、作業者に渡し、結果をまとめる型である。コーディングのように、変えるファイルの数が作業によって決まる場面に向く。[知見]
- **規模で実現の手段を選ぶ。** [仕様]
  - 数個までならサブエージェントを並べる。
  - それを超える規模や、結果を相互に検証させたいときは dynamic workflows を使い、計画をスクリプトに持たせる。
  - 同じファイルを触る作業は worktrees で分ける。
  - 選び方の軸は `selection.md` §6.1 にある。
- **費用と見合うかを確かめる。** 多エージェントはトークンを大きく消費する。並列化しやすい価値の高い作業に向き、エージェント間の依存が多い作業には向かない。コーディングの作業は調査より並列化できる部分が少ない。[知見]
  > "multi-agent systems use about 15× more tokens than chats."
- **作業の規模に応じて作業者の数を決める基準を、調整役の指示に書く。** 基準が無いと、単純な作業にも多くの作業者を使いがちになる。[知見]

## 4. 強制の型

例外なく守らせる制約は、Claude が読む指示とは別の層で担保する。層の強さは `selection.md` §4 にある。

- **指示と強制を組にする。** 理由と望ましい振る舞いは CLAUDE.md やルールに書き、守らせる部分は Hook か permission 規則に置く。指示だけでは保証にならない。[仕様]
  > "An instruction like "never edit `.env`" in CLAUDE.md or a skill is a request, not a guarantee."
- **許可と拒否は permission 規則で書く。** 迂回の経路が問題になる制約には、サンドボックスか `hook-events:events/PreToolUse` の Hook を重ねる。Bash の規則はコマンド文字列との照合で、プログラムの周りの境界ではない。[仕様]（`features/permissions.md` §2）
- **完了の条件は Stop の Hook で縛る。** チェックが通るまでターンを終わらせない、決定論のゲートにできる。判断が要る完了条件なら `/goal` を使う。[仕様]
  > "a Stop hook runs your check as a script and blocks the turn from ending until it passes."

  続行させる Hook は、終わらない続行を防ぐ（`features/hooks.md` の Q-hooks-04）。
- **Skill の手順と強制を一緒に配る。** Skill の `frontmatter:skill/hooks` に書いた Hook は、その Skill が呼ばれた時点で登録され、セッションの残りの間ずっと動く。Skill が呼ばれる前は効かない。[仕様]（`features/skills.md` §2）
- **組織の強制は managed settings に置く。** managed settings の permission 規則は、ほかのどのレベルにも上書きされない。[仕様]
- **失敗を成功と取り違えさせない。** Hook が依存するコマンドが無いときや入力を読めないときに、黙って成功と同じに見せない。これは canon の規律で、公式の仕様ではない。[知見]（`features/hooks.md` §4）

## 5. 配布の型

| 配る相手 | 置き場 | 要点 |
|---|---|---|
| 自分だけ（全プロジェクト） | `~/.claude/` の下 | コミットしない。クラウドセッションや routine では個人の Skill は読み込まれない |
| 自分だけ（このプロジェクト） | `CLAUDE.local.md`・`.claude/settings.local.json` など `local` スコープ | git に入れない |
| プロジェクトのチーム | プロジェクトの `.claude/`・`CLAUDE.md`・`.mcp.json` をコミット | 名前に接頭辞が付かない。permission の allow など一部は、ワークスペースを信頼するまで効かない |
| 複数のプロジェクト・外部 | プラグインとマーケットプレイス | 名前に接頭辞が付き、版で配れる。利用者ごとにインストールか有効化が要る |
| 組織の全員に強制 | managed settings・組織の CLAUDE.md | 上書きされない。技術的な強制は managed settings、振る舞いの指示は組織の CLAUDE.md に置く |

[仕様]（`features/claude-md.md` §2・`features/plugins.md` §2・`features/settings.md` の Q-settings-02・`features/skills.md` §2。置き場は `paths:files` で引く）

- **プロジェクトからプラグインを勧める。** プロジェクトの `settings:keys/enabledPlugins` と `settings:keys/extraKnownMarketplaces` で、チームにプラグインとマーケットプレイスを示せる。ただし外部のソースのプラグインは、それだけでは手元に揃わない。[仕様]（`features/plugins.md` の Q-plugins-10）
- **マーケットプレイス無しで、リポジトリの全員にプラグインを読み込ませる。** `.claude/skills/<name>/.claude-plugin/plugin.json` を置く skills ディレクトリのプラグインを使う。[仕様]（`features/plugins.md` §2）
- **配る前に評価する。** プラグインは `claude plugin eval` のテストケースで評価できる。[仕様]（`plugin-evals`）

## 6. 出典

spec:

- https://code.claude.com/docs/en/features-overview.md
- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/agents.md
- https://code.claude.com/docs/en/workflows.md
- https://code.claude.com/docs/en/best-practices.md
- https://code.claude.com/docs/en/permissions.md
- https://code.claude.com/docs/en/plugin-evals.md

insight:

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://claude.dev/blog/building-effective-agent-automations/
