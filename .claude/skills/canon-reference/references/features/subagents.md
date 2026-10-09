---
feature: subagents
sources:
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/model-config.md
  - https://code.claude.com/docs/en/tools-reference.md
---

# サブエージェント

## 1. 概要

サブエージェントは、特定の種類の作業を受け持つ専用の AI アシスタントで、YAML frontmatter 付きの Markdown ファイル（`agents/*.md`）として定義する。[仕様] frontmatter が設定を、本文がシステムプロンプトを決める。[仕様]

- **コンテキスト**: 各サブエージェントは独立した新しいコンテキストウィンドウで動き、会話の履歴・呼び出し済みの Skill・読んだファイルを見ない。Claude が書く委譲メッセージから作業を始め、最終結果だけを親に返す。親は途中のツール呼び出しや出力を見ない。[仕様]
- **起動時に読み込まれるもの**（fork 以外）: 自身のシステムプロンプトと環境の情報（Claude Code のシステムプロンプトは含まない）、委譲メッセージ、CLAUDE.md の全階層（`omitClaudeMd` で外せる）、git status のスナップショット、`skills` で preload した Skill の全文、名前付きエージェントの一覧（`SendMessage` を持つときだけ）。[仕様]
- **届かないもの**: output style、メインの会話の auto memory、メインの会話のコンテキストウィンドウの大きさ（サブエージェント自身のモデルで決まる）。[仕様]
- **常駐するコスト**: 組み込み以外のサブエージェントの `description` はコンテキストに載る。合計が 15,000 トークンを超えると起動時に警告が出る。システムプロンプト（本文）はそのサブエージェントが動くときだけ読み込まれる。[仕様]

> "Subagents receive only this system prompt plus basic environment details like the working directory, not the Claude Code system prompt."

配置先と優先順位（同名なら上が勝つ）は managed settings → `--agents` CLI フラグ → `.claude/agents/` → `~/.claude/agents/` → plugin の `agents/` の順。[仕様] 配置パスは `paths:files/project:.claude/agents/*.md` と `paths:files/user:~/.claude/agents/*.md` を参照する。

## 2. 使う場面・使わない場面

**使う場面** [仕様]

- 作業が、メインのコンテキストに要らない大量の出力（検索結果・ログ・テスト出力・ファイルの中身）を出す。
- 特定のツール制限や権限を強制したい。
- 作業が自己完結していて、要約を返せる。
- 同じ指示の作業者を繰り返し起動している（定義を再利用できる）。
- 単純な作業を Haiku のような速く安いモデルへ回してコストを抑えたい。

**使わない場面** [仕様]

- やり取りや反復の修正が頻繁にある。
- 計画・実装・テストなど、複数の段階が大きなコンテキストを共有する。
- すぐ終わる小さな変更。
- 待ち時間が重要（fork 以外のサブエージェントは白紙から始まり、コンテキストを集める時間がかかる）。

**近い機能との違い**

- **Skill**: 再利用したいプロンプトや手順を、隔離されたコンテキストではなくメインの会話で動かしたいときは Skill を選ぶ。[仕様] Skill に `context: fork`（`frontmatter:skill/context`）を書くと Skill の内容が指定したエージェントに注入され、サブエージェントの `skills` は逆にサブエージェントが自分のプロンプトで Skill を読み込む。どちらも会話の履歴を持たずに始まる。[仕様]
- **fork**: 会話の全体を引き継ぐサブエージェント。説明し直す背景が多すぎて通常のサブエージェントが役に立たないとき、同じ出発点から複数の案を並列に試したいときに使う。fork はファイルとして定義しない。[仕様]
- **`/btw`**: 会話に既にあることへの質問。全コンテキストを見るがツールを持たず、答えは履歴に残らない。[仕様]
- **別セッション・agent teams・dynamic workflows**: サブエージェントは1つのセッションの中で動く。並列に動かし続ける作業や1つのコンテキストに収まらない作業は別セッションに分ける。[仕様] これらは選定ガイドの選択肢として扱う。
- **多エージェントの向き不向き**: 多エージェントはトークンを大きく消費する（"multi-agent systems use about 15× more tokens than chats"）。並列化しやすい価値の高い作業に向き、エージェント間の依存が多い作業には向かない。コーディングの作業は調査より並列化できる部分が少ない。[知見]

## 3. 仕様の要約

正は `frontmatter:subagent`。ここでは判断に要る範囲だけを書く。

### ファイルと識別

- 必須のキーは `name` と `description` だけ（`frontmatter:subagent/name`・`frontmatter:subagent/description`）。識別は `name` だけで決まり、ファイル名やサブフォルダーは識別に関係しない。[仕様]
- キー名は camelCase（`maxTurns`・`disallowedTools` など）で表と完全に一致させる。認識できないキーはエラーなしで無視される。[仕様]
- `.claude/agents/` と `~/.claude/agents/` は再帰的に走査される。同じディレクトリの木で同名のファイルが2つあると、どちらが読まれるかは定まらない。入れ子の project ディレクトリでは作業ディレクトリに近い定義が勝つ。[仕様]
- 次のファイルは報告なしで読み飛ばされる: `name` が無い、開始の `---` が1行目に無い、`name` が `-` で始まる・`:` を含む・256文字を超える、`description` が無い、YAML がパースできない。[仕様]
- ファイルの変更は数秒で検知される。ただし、セッション開始時に無かった `agents` ディレクトリに最初のファイルを作ったときは再起動が要る。[仕様]

### ツール

- `tools`（`frontmatter:subagent/tools`）は許可リスト、`disallowedTools`（`frontmatter:subagent/disallowedTools`）は拒否リスト。両方あるときは `disallowedTools` を先に適用し、両方にあるツールは外れる。どちらも省略するとサブエージェントが使えるツールをすべて継承する。[仕様]
- サブエージェントには常に外されるツールがある（深さの上限での `Agent`、`AskUserQuestion`、`EnterPlanMode`、`permissionMode: plan` 以外での `ExitPlanMode` など）。background で動くサブエージェントは組み込みツールがさらに絞られるので、同じ定義でも foreground と background で使えるツールが変わる。[仕様]
- `tools` のどの要素もツールに解決できないと、通常は起動を拒否してエラーになる。[仕様]
- `disallowedTools` に `Bash(git push *)` のような指定子を書いても Bash 全体が外れる。特定のコマンドだけを止めたいときは `settings:keys/permissions.deny` に Bash の deny ルールを書く。[仕様]
- サブエージェントの定義で `tools` に `Agent` を入れると、深さの上限までサブエージェントを起動できる。`Agent(worker, researcher)` の型の制限は `claude --agent` でメインスレッドとして動くときだけ効き、サブエージェントの定義では括弧の中は無視される。旧名の `Task(...)` は別名として今も効くが、生成では `Agent` と書く（別名は `tools:tools/Agent` の `aliases`。`Agent` と書くのは canon の規律）。[仕様]（`tools:tools/Agent`）
- macOS・Linux・WSL では、`tools` に `Glob` か `Grep` を入れて `Bash` を外すと、そのサブエージェントに限り Glob・Grep が戻る。[仕様]

### モデルと effort

- `model`（`frontmatter:subagent/model`）はエイリアス（`models:aliases/sonnet`・`models:aliases/opus`・`models:aliases/haiku`・`models:aliases/fable`）、完全なモデル ID、`inherit` を取る。[仕様]
- 解決の順序は、呼び出しごとの `model` 引数 → frontmatter の `model` → 環境変数 `CLAUDE_CODE_SUBAGENT_MODEL` → メインの会話のモデル。[仕様] `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` を `1` にすると frontmatter の `model` は無視される。[仕様]
- メインの会話のモデルと同じ系列のエイリアスを指定すると、メインの会話と同じモデル（`[1m]` を含む）で動く。[仕様]
- `/model` でモデルを切り替えると、メインのモデルを継承するサブエージェントにも及ぶ。小さいモデルに固定したいときは定義に `model` を書く。[仕様]
- `effort`（`frontmatter:subagent/effort`）はセッションの effort を上書きするが、`CLAUDE_CODE_EFFORT_LEVEL` は上書きしない。モデルが対応しない値は、対応する一番高い値に下がる。[仕様]
- extended thinking はメインの会話の設定を継承し、サブエージェントごとの設定は無い。[仕様]

### 権限モード

- `permissionMode`（`frontmatter:subagent/permissionMode`）を省略するとメインの会話のモードを継承する。メインが `bypassPermissions`・`acceptEdits`・auto mode のときは指定が無視される。メインが `default`・`dontAsk`・`plan` のときは指定が効くが、`bypassPermissions` を指定してもメインのモードのままになる。[仕様]
- サブエージェントの起動自体は権限を求めない。各ツール呼び出しが権限ルールで判定される。[仕様]

### 機能の拡張

- `skills`（`frontmatter:subagent/skills`）は Skill の全文を起動時に注入する。アクセスできる Skill を制限するものではない。`disable-model-invocation: true`（`frontmatter:skill/disable-model-invocation`）の Skill は preload できない。Skill を一切使わせないときは `tools` から `Skill` を外すか `disallowedTools` に入れる。[仕様]（`tools:tools/Skill`）
- `mcpServers`（`frontmatter:subagent/mcpServers`）のインライン定義はサブエージェントの起動時に接続し、終了時に切る。メインの会話にツールの説明を載せずに済む。project の `.claude/agents/` のインライン定義は、そのフォルダーを trust するまで読み込まれない。[仕様]
- `hooks`（`frontmatter:subagent/hooks`）はそのサブエージェントが動いている間だけ有効。`Stop` は実行時に `SubagentStop` に変わる。project のサブエージェントの Hook は、定義ファイルのフォルダーを trust するまで動かない。settings の Hook（`hook-events:events/PreToolUse` など）はサブエージェントの中でも発火し、`hook-events:events/SubagentStart`・`hook-events:events/SubagentStop` の matcher にはサブエージェントの `name` を書く。[仕様]
- `memory`（`frontmatter:subagent/memory`）は会話をまたいで残るディレクトリを与える。起動時に `MEMORY.md` の先頭200行か25KB（先に達した方）がシステムプロンプトに入り、Read・Write・Edit が自動で有効になる。auto memory を切ると効かない。[仕様] 配置パスは `paths:files/project:.claude/agent-memory/<name>/`・`paths:files/user:~/.claude/agent-memory/<name>/` を参照する。
- plugin のサブエージェントでは `hooks`・`mcpServers`・`permissionMode`（表では `initialPrompt` も）が無視される。[仕様] plugin の扱いは plugins の機能ファイルに任せる。

### 実行の形

- 起動の仕方は、自動委譲（`description` で判断）、自然言語での指名、@-mention（必ずそのサブエージェントが動く）、`--agent` フラグか `settings:keys/agent` によるセッション全体の置き換え。[仕様] `--agent` のときはサブエージェントのシステムプロンプトが既定のシステムプロンプトを置き換える。[仕様]
- 対話セッションでは fork mode が既定で有効で、Claude が起動するサブエージェントは background で動く。`background: true` は foreground を求められても background に保つ。[仕様]
- サブエージェントは既定で、自分のサブエージェントを起動でき、入れ子の深さはメインの会話から数えて3段までになる（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` で変えられる）。同時に動く数の既定の上限は20。[仕様]
- 完了したサブエージェントは `SendMessage`（`tools:tools/SendMessage`）で会話の履歴を保ったまま再開できる。Explore と Plan は再開できない。[仕様]
- 最終報告は Claude が読む前に走査され、指示の形をした文字列に印が付く。これは到達範囲の制限の代わりにはならない。[仕様]
- auto mode では、Agent ツールがローカルで動かす fork 以外のサブエージェントに `SubagentHandback`（`tools:tools/SubagentHandback`）が与えられ、最終報告はそれで渡る。[仕様]

## 4. 設計の指針

- **1つのサブエージェントに1つの役割**を持たせる。[仕様] 公式の best practices は "Design focused subagents: each subagent should excel at one specific task" とする。
- **description は振り分けのために書く**。Claude は description で委譲先を決めるので、1つのサブエージェントに絞り込める具体性にし、全体を 15,000 トークンの予算に収める。詳細は本文に移す。積極的に委譲させたいときは "use proactively" のような句を入れる。[仕様]
- **ツールは必要な分だけ与える**。読むだけの役割（レビュー・調査）は `Read, Grep, Glob` などに絞り、Edit・Write を外す。[仕様] tools の許可リストでは足りない粒度の制御（例: 読み取り専用の SQL だけを許す）は `PreToolUse` の Hook で行う。[仕様]
- **本文だけで作業できるようにする**。サブエージェントは会話の履歴を見ない。必ず守らせたい規則は委譲のプロンプトで言い直すか、`skills` で preload する。CLAUDE.md の規則の多くは、結果を読むメインの会話が持っているので届ける必要はない。`omitClaudeMd: true` にするのは、委譲のプロンプトから必要なものをすべて受け取るサブエージェントだけにする。[仕様]
- **委譲のプロンプトに作業の範囲を書く**。各サブエージェントには、目的・出力の形式・使うツールと情報源の指針・作業の境界を渡す。これが無いと作業の重複・抜け・情報の見落としが起きる。[知見] 作業の量を問いの複雑さに合わせる規則をプロンプトに入れる。[知見]
- **返す量を抑える**。多くのサブエージェントが詳しい結果を返すとメインのコンテキストを大きく消費する。[仕様] 大きな成果物はファイルに書き、親には軽い参照を返す形にすると、伝言による劣化を避けられる。[知見]
- **並列化は独立した作業にだけ使う**。並列調査は調査の経路が互いに依存しないときに最もよく働く。依存のある多段の作業はサブエージェントを順に連ね、Claude が次へ必要なコンテキストを渡す。[仕様]
- **モデルは役割で選ぶ**。単純で量の多い作業は低コストのモデルへ、判断の重い作業は `inherit` か上位のモデルにする。[仕様]
- **再利用と共有**: プロジェクト固有のサブエージェントは `.claude/agents/` に置いてバージョン管理に入れる。[仕様] メモリのスコープは `project` が推奨の既定。[仕様]

## 5. 生成の規約

型:

```markdown
---
name: <kebab-case の一意な名前>
description: <いつ委譲するか。1つのサブエージェントに絞り込める具体性で>
tools: <必要なツールだけ>
model: <エイリアス・完全なモデル ID・inherit>
---

<役割の宣言>

<呼ばれたときの手順>

<返す出力の形式>
```

最小の例（読み取り専用のレビュー役。公式の例に基づく）[仕様]:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use proactively after writing or modifying code.
tools: Read, Grep, Glob
model: sonnet
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

- frontmatter のキーは `frontmatter:subagent` の `id` と大文字小文字まで一致させる。[仕様]
- `name` に `:` を入れない。`-` で始めない。[仕様]
- 開始の `---` をファイルの1行目に置く。[仕様]
- プロンプトキャッシュの寿命は最上位ではなく `experimental` の中に `cacheTtl` として書く。[仕様]
- 権限モードは設定値で書く（Manual mode は `default`）。[仕様]
- 本文は、サブエージェントが受け取るシステムプロンプトそのものとして書く。[仕様]

## 6. 検証ルール

- **V-subagents-01**: `agents/*.md` は1行目が `---` で始まり、frontmatter が YAML としてパースできる。[仕様]
- **V-subagents-02**: frontmatter に、`frontmatter:subagent` で `required: true` のキー（`frontmatter:subagent/name`・`frontmatter:subagent/description`）がすべてある。[仕様]
- **V-subagents-03**: `name` の値は256文字以内で、`:` を含まず、`-` で始まらない（`frontmatter:subagent/name` の `constraints_ja`）。[仕様]
- **V-subagents-04**: frontmatter の最上位のキーは、すべて `frontmatter:subagent` のいずれかの `id` と大文字小文字まで一致する。[仕様]
- **V-subagents-05**: `allowed_values` を持つキー（`frontmatter:subagent/permissionMode`・`frontmatter:subagent/memory`・`frontmatter:subagent/effort`・`frontmatter:subagent/isolation`・`frontmatter:subagent/color`）の値は、その `allowed_values` のいずれかである。[仕様]
- **V-subagents-06**: `experimental` の中のキーは `cacheTtl` だけで、値は `5m` か `1h` である（`frontmatter:subagent/experimental` の `nested_keys`）。[仕様]
- **V-subagents-07**: 同じスコープの `agents` ディレクトリの木（サブフォルダーを含む）の中で、`name` の値が重複しない。[仕様]
- **V-subagents-08**: `tools`・`disallowedTools` の各要素は、`tools:tools` のいずれかの `id`（`Agent(...)` のように括弧付きなら括弧の前）か、`mcp__` で始まる MCP のパターンである。[仕様]
- **V-subagents-09**: `tools` を書いた場合、少なくとも1つの要素が V-subagents-08 を満たす。[仕様]
- **V-subagents-10**: `hooks` の最上位のキーは、すべて `hook-events:events` のいずれかの `id` と一致する。[仕様]
- **V-subagents-11**: `skills` に挙げた各 Skill は、同じ生成物の中にあるなら、その frontmatter に `frontmatter:skill/disable-model-invocation` が `true` で書かれていない。[仕様]

## 7. 品質基準

- **Q-subagents-01**: description が、どの依頼のときにこのサブエージェントへ委譲すべきかを、他のサブエージェントと区別できる具体性で書いている。詳細な手順は description ではなく本文にある。[仕様]
- **Q-subagents-02**: 1つのサブエージェントが1つの役割に絞られている。[仕様]
- **Q-subagents-03**: ツールが役割に必要な最小限になっている（例: 変更しない役割に Edit・Write が無い）。[仕様]
- **Q-subagents-04**: 本文が、会話の履歴を見ないことを前提に、作業に必要な情報と手順を自分で持っている。必ず守らせたい規則は本文か preload する Skill に入っている。[仕様]
- **Q-subagents-05**: 本文または委譲の手順が、目的・出力の形式・使うツールと情報源・作業の境界を示している。[知見]
- **Q-subagents-06**: サブエージェントを使う理由が「大量の出力の隔離」「ツールや権限の制限」「自己完結した作業」のどれかに当たり、頻繁なやり取りや大きなコンテキストの共有が要る作業を切り出していない。並列化する場合は作業が互いに独立している。[仕様][知見]
- **Q-subagents-07**: 返す出力が要約で、メインのコンテキストを圧迫しない量に抑えられている。大きな成果物はファイルに書いて参照を返す。[仕様][知見]
- **Q-subagents-08**: モデルの選択が役割に合っている（単純で量の多い作業に低コストのモデル、判断の重い作業に `inherit` か上位のモデル）。[仕様]
- **Q-subagents-09**: ツールの一部の操作だけを止めたい要件に、`disallowedTools` の指定子（ツール全体が外れる）ではなく `settings:keys/permissions.deny` か `PreToolUse` の Hook を使っている。[仕様]
- **Q-subagents-10**: `Agent(<型>)` による起動先の制限を、`--agent` でメインスレッドとして動かす定義にだけ使っている（サブエージェントとしては括弧の中が無視される）。[仕様]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/model-config.md
- https://code.claude.com/docs/en/tools-reference.md

**insight**

- https://www.anthropic.com/engineering/multi-agent-research-system
