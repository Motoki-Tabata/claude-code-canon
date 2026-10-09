---
feature: skills
sources:
  - https://code.claude.com/docs/en/skills.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/commands.md
  - https://code.claude.com/docs/en/model-config.md
  - https://code.claude.com/docs/en/tools-reference.md
  - https://code.claude.com/docs/en/sub-agents.md
---

# Skills（Skill とコマンドファイル）

## 1. 概要

- **何か**: Skill は、YAML frontmatter と Markdown の指示を持つ `SKILL.md` を中心にしたディレクトリである。ユーザーが `/skill-name` で直接呼ぶか、関連する場面で Claude が自動で読み込む。[仕様]
- **コマンドファイル**: `.claude/commands/*.md` は Skill に統合された古い形式で、同じ `/name` を作り、同じように動く。違いは、補助ファイルを持てないことと、frontmatter に `name`・`paths` を書けないことである。[仕様]
  > "Custom commands have been merged into skills."
- **いつ読み込まれるか**: 通常のセッションでは、Skill の名前と説明の一覧が常にコンテキストに載り、本文は呼ばれたときだけ読み込まれる。サブエージェントに preload した Skill は、起動時に本文がまるごと入る。[仕様]
  > "Unlike CLAUDE.md content, a skill's body loads only when it's used, so long reference material costs almost nothing until you need it."
- **コンテキストへの効き方**:
  - 呼ばれた Skill の本文は1つのメッセージとして会話に入り、以後のターンにも残る。Claude Code は後のターンで Skill のファイルを読み直さない。[仕様]
  - auto-compaction の後は、各 Skill の最後の呼び出しを要約の後ろに付け直す。付け直すのは各 Skill の先頭 5,000 トークンまでで、全 Skill で合わせて 25,000 トークンまでである。最近呼んだ Skill から埋めるので、古い Skill は落ちることがある。[仕様]
  - Skill の一覧は文字数の予算の中に収められる。予算はモデルのコンテキストウィンドウの 1% である。予算を超えると、あまり呼ばれない Skill から順に説明を落とす（名前は常に残る）。各 Skill の `description` と `when_to_use` は、合わせて 1,536 文字で切られる。[仕様]
- **段階的な読み込み**: 1段目がメタデータ（name と description、常に読み込まれる）、2段目が `SKILL.md` の本文（呼ばれたときに読み込まれる）、3段目が補助ファイルとスクリプト（必要になったときに読み込まれる）である。スクリプトは実行され、出力だけがコンテキストに入る。[知見]

## 2. 使う場面・使わない場面

**使う場面**

- 同じ指示・チェックリスト・複数の手順を何度も会話に貼っているとき。CLAUDE.md の一部が、事実ではなく手順になってきたとき。[仕様]
- 長い参照資料・API の仕様・例の集まりを、必要なときだけ読ませたいとき（補助ファイルに置く）。[仕様]
- スクリプトを同梱し、1つのプロンプトではできない処理を Claude に組み合わせて使わせたいとき。[仕様]

**内容の型で選ぶ**

| 型 | 内容 | 向いている呼び出しの制御 |
|---|---|---|
| 参照の内容（reference content） | 規約・パターン・スタイルガイド・領域の知識。会話の中でそのまま使う | 既定のまま。ユーザーが呼ぶ意味が無い背景知識なら `user-invocable: false` |
| タスクの内容（task content） | デプロイ・コミット・コード生成などの手順 | 副作用があるもの・実行の時機を人が決めたいものは `disable-model-invocation: true` |

[仕様]（skills ページ「Types of skill content」「Control who invokes a skill」）

**近い機能との違い**

- **CLAUDE.md**: 毎セッション読み込まれる。Skill の本文は使うときだけ読み込まれる。どの場面でも要る事実は CLAUDE.md に、特定の作業でだけ要る手順は Skill に置く。[仕様]
- **Hook**: 毎回必ず守らせたい規則は Hook に移す。Skill は、Claude が後のターンでそれに従い続けるとは限らない。Hook は、そのイベントが起きるたびに必ず動く。Skill と一緒に持たせたいときは、Skill の `hooks` frontmatter に書く。[仕様]
- **サブエージェント**: 次の2つの方向がある。[仕様]

  | やり方 | システムプロンプト | タスク | ほかに読み込むもの |
  |---|---|---|---|
  | Skill に `context: fork` | エージェントの種類のもの | `SKILL.md` の本文 | CLAUDE.md（エージェントの起動時の内容に従う） |
  | サブエージェントの `skills` フィールド | サブエージェントの本文 | Claude の委譲メッセージ | preload した Skill と CLAUDE.md |

  後者は `frontmatter:subagent/skills` を参照する。
- **`context: fork` と会話の fork**: `context: fork` のサブエージェントは会話の履歴を見ない。会話の履歴が要る作業では、`context: fork` ではなく会話の fork を使う。[仕様]
- **コマンドファイル**: 新しく作るなら Skill を選ぶ。Skill は補助ファイルを持てる。[仕様]
  > "Prefer a skill for new work, since skills also support supporting files."

**使わない場面**

- 具体的なタスクを持たないガイドラインだけの Skill に、`context: fork` を付けない。サブエージェントは指示を受け取っても実行できるタスクが無く、意味のある出力を返さない。[仕様]
- 個人の Skill（`~/.claude/skills/`）は、Cowork・クラウドセッション・routine では読み込まれない。そこで使う Skill は、リポジトリの `.claude/skills/` にコミットするか、claude.ai のアカウントで有効にする。[仕様]

## 3. 仕様の要約

### 3.1 置き場所と読み込まれる範囲

- 置き場所は、enterprise（managed settings のディレクトリの `.claude/skills/`）・personal（`~/.claude/skills/<skill-name>/SKILL.md`）・project（`.claude/skills/<skill-name>/SKILL.md`）・nested（`<subdir>/.claude/skills/…`）・追加ディレクトリ（`--add-dir`）・Plugin（`<plugin>/skills/<skill-name>/SKILL.md`）・claude.ai のアカウントである。[仕様]
- 配置パスの正は `paths:files/project:.claude/skills/<name>/SKILL.md`・`paths:files/user:~/.claude/skills/<name>/SKILL.md`・`paths:files/project:.claude/commands/*.md`・`paths:files/user:~/.claude/commands/*.md` とする。どれもコミットの対象である（claude-directory の File reference 表）。[仕様]
- project の Skill は、起動したディレクトリから repo のルートまでの各階層の `.claude/skills/` から読み込まれる。起動した位置より下の `.claude/skills/` は、Claude がそのサブディレクトリのファイルを読むか編集したときに初めて読み込まれる。[仕様]
- 同じ名前の Skill が複数あるとき:
  - enterprise・personal・project の間では、enterprise が personal より、personal が project より優先される。
  - Skill と `.claude/commands/` のファイルでは、Skill が優先される。
  - repo のルートと nested では両方が読み込まれる。
  - Plugin の Skill は `/plugin-name:skill-name` の名前空間に入るので、他と衝突しない。

  [仕様]
- Skill のフォルダ名に `synced` は使えない（大文字小文字を問わない）。Plugin の外では、名前が `anthropic-skills` か `anthropic-skills:` で始まるフォルダ・コマンドファイル・frontmatter の `name` は読み込まれない。[仕様]

### 3.2 コマンド名の決まり方

| 置き場所 | コマンド名 |
|---|---|
| `~/.claude/skills/`・`.claude/skills/` のディレクトリ | frontmatter の `name`、無ければディレクトリ名。ディレクトリ名でも呼べる |
| `.claude/commands/<file>.md` | 拡張子を除いたファイル名 |
| `.claude/commands/<sub>/<file>.md` | `/` を `:` に替えたサブディレクトリのパスとファイル名（例: `/frontend:component`） |
| Plugin の `skills/<dir>/SKILL.md` | `/<plugin>:<name かディレクトリ名>` |
| nested で名前が衝突したとき | 作業ディレクトリからの相対パスとディレクトリ名（例: `/apps/web:deploy`） |

[仕様]

### 3.3 frontmatter

- フィールドの正は `frontmatter:skill`（`SKILL.md`）と `frontmatter:command`（コマンドファイル。`name` と `paths` を除く）である。[仕様]
- フィールドはすべて任意で、推奨は `description` だけである。フィールド名は表と完全に一致しなければならない（ハイフンも含む。例外は `when_to_use`）。知らないフィールドは、エラーを出さずに無視される。[仕様]
  > "Claude Code ignores a field it doesn't recognize without reporting an error."
- 開きの `---` がファイルの1行目のときだけ、frontmatter として読まれる。YAML がパースできないときは、フィールドが何も設定されないまま Skill が読み込まれる（`/name` では動くが、`description` との照合ができない）。[仕様]
- `model` には `/model` と同じ値（`models:aliases` のエイリアスか完全なモデル名）か `inherit` を書く。効くのは現在のターンの残りだけである。組織の `availableModels` が除外する値は無視され、セッションのモデルのまま動く。`effort` は、セッションの effort level を上書きするが、環境変数 `CLAUDE_CODE_EFFORT_LEVEL` は上書きしない。[仕様]
- claude.ai へのアップロード・Skills API・`package_skill.py` で使えるのは、Agent Skills の仕様の6フィールドだけである（`frontmatter:skill` の各要素の `agent_skills_spec` が `true` のもの）。それ以外のフィールドがあると、アップロードはエラーで失敗する。[仕様]

### 3.4 呼び出しの制御

| frontmatter | ユーザーが呼べる | Claude が呼べる | コンテキストへの読み込み |
|---|---|---|---|
| （既定） | はい | はい | 説明は常に載る。本文は呼ばれたときに載る |
| `disable-model-invocation: true` | はい | 自分の判断では呼べない | 説明は載らない。本文は呼ばれたときに載る |
| `user-invocable: false` | いいえ | はい | 説明は常に載る。本文は呼ばれたときに載る |

[仕様]

- `user-invocable: false` は、Claude が Skill ツールで呼ぶのを止めない。止めるには `disable-model-invocation: true` を使う。[仕様]
- Claude は Skill を `tools:tools/Skill` で実行する。許可ルールは `Skill(name)`（完全一致）か `Skill(name *)`（前方一致）と書く（`permissions:rule-syntax/Skill`）。[仕様]
- frontmatter を編集せずに、settings の `settings:keys/skillOverrides` で見え方を切り替えられる。値は `on`・`name-only`・`user-invocable-only`・`off` のどれかである。Plugin の Skill には効かない。[仕様]
- メッセージの先頭に `/name` を書くと、Skill を直接実行する。文の途中に書くと、そのメッセージに限って Claude がその Skill を実行してよいという許可になる。[仕様]

### 3.5 引数と文字列の置換

- 置換される変数は `builtins:skill-substitutions` を見る。`scope: plugin` の変数は Plugin の Skill でだけ置換される。どの置換先にも引数が入らないときは、本文の末尾に `ARGUMENTS: <value>` が足される。[仕様]
- `${CLAUDE_SKILL_DIR}` と `${CLAUDE_PROJECT_DIR}`（Plugin の Skill では `${CLAUDE_PLUGIN_ROOT}` と `${CLAUDE_PLUGIN_DATA}` も）は、本文と `allowed-tools` の Bash ルールの両方で置換される。[仕様]

### 3.6 動的なコンテキストの注入

- `` !`<command>` `` と、` ```! ` で始まるコードブロックは、Skill の本文を Claude に渡す前に実行される。コマンドの出力が、その場所を置き換える。インラインの形は、`!` が行頭か空白の直後にあるときだけ認識される。[仕様]
- コマンドが失敗すると、Skill の呼び出し全体が中止され、Claude は本文を受け取らない。既定の `bash` では、0以外の終了コードはすべて失敗になる。ただし、検索・比較のコマンドが返す終了コード1は例外である。[仕様]
- 注入するコマンドは、Skill を組み立てる間に許可の確認を出さない。auto mode 以外では、許可ルールの判定が allow でなければ呼び出しが中止される。`allowed-tools` で事前に許可しておけば中止されない。[仕様]
- settings の `settings:keys/disableSkillShellExecution` を `true` にすると、user・project・Plugin・追加ディレクトリの Skill のコマンドは実行されず、`[shell command execution disabled by policy]` に置き換わる。[仕様]

### 3.7 `allowed-tools` と `disallowed-tools`

- `allowed-tools` が許可するのは、Skill を呼んだターンの間だけである。次のメッセージを送ると許可は消える。Skill の本文は会話に残るが、許可は残らない。使えるツールを制限するものではない。[仕様]
- workspace trust は `allowed-tools` を止めない。信頼していないフォルダの `-p` 実行でも、project の Skill の `allowed-tools` が効く。managed settings で `allowManagedPermissionRulesOnly` を設定すると、project と personal の Skill の `allowed-tools` は無視される。[仕様]
- `disallowed-tools` は、Skill が有効な間、そのツールを使えるツールから外す。[仕様]

### 3.8 `context: fork`

- `agent` で指定した種類の新しいサブエージェントを起動し、Skill の本文をそのプロンプトにする。`agent` を省略すると `general-purpose` になる。[仕様]
- 既定ではバックグラウンドで動く。`background: false` にすると、呼んだターンの中で結果を待つ。バックグラウンドの fork は、バックグラウンドのサブエージェント向けの狭いツールの組で動く。また、セッションの checkpoint の外で編集するので、`/rewind` では戻らない。[仕様]
- 組み込みのサブエージェントは `builtins:subagents` を見る。`skips_claude_md` が `true` のもの（`Explore` と `Plan`）は CLAUDE.md と git status を読み込まない。[仕様]

### 3.9 セッション中の変更と組み込みコマンド

- `~/.claude/skills/`・project の `.claude/skills/`・`--add-dir` の `.claude/skills/` は監視されている。`SKILL.md` を追加・編集・削除すると、再起動なしで反映される。セッションの開始時に無かったトップレベルの skills ディレクトリを作ったときは、`builtin-commands:commands/reload-skills` を実行する。[仕様]
- 組み込みコマンドと bundled skill の一覧は `builtin-commands:commands` を参照する（`marked_as` が `Skill` の要素が bundled skill である）。[仕様]
- 自分の Skill の名前が bundled skill や組み込みコマンドと同じだと、自分の Skill がそれを置き換える。別名は置き換えない（例: project の `code-review` Skill を作っても、別名の `/review` は bundled の方を実行する）。組み込みコマンドを置き換えるのは、ローカルの端末のセッションだけである。[仕様]
- `verify` か `simplify` という名前の Skill がセッションの開始時にあると、Claude はコミットの直前にそれを実行するよう指示される。対象は enterprise・personal・project・追加ディレクトリの Skill と `.claude/commands/` で、Claude が呼べる Skill に限る。docs と tests の変更は除く。[仕様]

## 4. 設計の指針

- **description**:
  - 何をするかと、いつ使うかの両方を書き、主な用途を先頭に置く。一覧では 1,536 文字で切られ、予算を超えると説明そのものが落ちる。[仕様]
  - 利用者が自然に使う語を入れる。[仕様]
  - 三人称で、具体的な語ときっかけを書く。「Helps with documents」のような曖昧な説明は避ける。[知見]
  - Claude は Skill を使い足りない傾向があるので、使うべき場面をやや積極的に書く。[知見]
- **本文**:
  - 簡潔に書く。読み込まれた本文はターンをまたいで残るので、1行1行が繰り返しかかるトークンのコストになる。どうするかを書き、経緯や理由の語りは入れない。[仕様]
  - Claude が既に知っていることは書かない。[知見]
  - 一度きりの手順ではなく、作業の間ずっと効く指示として書く（例: 「テストを実行する」ではなく「編集のたびにテストを実行する」）。最も重要な指示は先頭に置く。compaction の後は、先頭しか残らないことがある。[仕様]
  - 選択肢を並べすぎず、既定のやり方を1つ示し、例外のときの代わりを添える。用語は Skill の中で1つに揃える。時期で変わる情報を書かない。[知見]
- **段階的な開示**:
  - `SKILL.md` は 500 行より短くし、詳しい参照資料は別のファイルに移す。`SKILL.md` からは、各ファイルに何があり、いつ読むかを書いてリンクする。[仕様]
  - 参照は `SKILL.md` から1段までにする。長い参照ファイルには、先頭に目次を付ける。[知見]
  - 領域や変種ごとに参照ファイルを分けると、Claude は関係するファイルだけを読む。[知見]
- **呼び出しの制御**:
  - 副作用がある workflow（デプロイ・コミット・外部への送信）は、`disable-model-invocation: true` にする。Claude が自分の判断で実行しないようにするためである。[仕様]
  - 背景知識は `user-invocable: false` にする。[仕様]
- **権限**:
  - `allowed-tools` には、Skill の手順が実際に使うコマンドだけを書く。[仕様]
  - 同梱のスクリプトは、本文と `allowed-tools` の両方で `${CLAUDE_SKILL_DIR}` を使って書く。そうすると、ルールが実行するコマンドと一致し、確認なしで動く。[仕様]
  - repo の Skill は自分自身に広い権限を与えられるので、コミットされた Skill の `allowed-tools` はレビューする。[仕様]
  - Skill は、自分で作ったものか信頼できる出所のものだけを使う。[知見]
- **注入するコマンド**:
  - 0以外で終わることが分かっているコマンドには `|| true` を付ける。[仕様]
  - 毎回同じ場所を指すべきパスは、`${CLAUDE_SKILL_DIR}` か `${CLAUDE_PROJECT_DIR}` で書く。注入するコマンドの作業ディレクトリは、Claude の `cd` で動くためである。[仕様]
- **スクリプト**:
  - スクリプトの中で問題を解き、Claude に判断を丸投げしない。エラーの扱いを明示する。パスはスラッシュで書く。[知見]
- **持ち運び**:
  - claude.ai や Skills API にも配る Skill は、Agent Skills の仕様の6フィールドに限る。[仕様]
  - その場合、`name` は 64 文字以内で、小文字・数字・ハイフンだけにし、`anthropic`・`claude` を含めない。`description` は空でなく、1,024 文字以内にする。[知見]
- **評価**:
  - Skill が呼ばれることと、意図した結果になることは、別々に確かめる。現実的なプロンプトを集め、新しいセッションで Skill の有る場合と無い場合を比べる。[仕様]
  - 書き込む前に、Skill が無い状態での失敗を確かめ、評価を作る。[知見]

## 5. 生成の規約

- **形**:
  - 新しく作るものは `.claude/skills/<name>/SKILL.md` にする。コマンドファイルは、既存のものを保つときだけ使う。[仕様]
  - frontmatter は、ファイルの1行目の `---` から書く。
  - フィールド名は `frontmatter:skill` の `id` と完全に一致させる。
- **最小の例（参照の内容）**:

  ```markdown
  ---
  name: api-conventions
  description: API design patterns for this codebase. Use when writing or reviewing API endpoints.
  user-invocable: false
  ---

  When writing API endpoints:
  - Use RESTful naming conventions
  - Return consistent error formats
  - Include request validation
  ```

- **最小の例（タスクの内容・副作用あり）**:

  ```markdown
  ---
  name: deploy
  description: Deploy the application to production
  disable-model-invocation: true
  allowed-tools: Bash(npm test *) Bash(npm run build *)
  ---

  Deploy $ARGUMENTS to production:

  1. Run the test suite
  2. Build the application
  3. Push to the deployment target
  4. Verify the deployment succeeded
  ```

- **補助ファイル**: 補助ファイルは Skill のディレクトリに置き、`SKILL.md` からリンクする。[仕様]

  ```text
  my-skill/
  ├── SKILL.md        概要と案内（必須）
  ├── reference.md    詳しい資料（必要なときに読む）
  └── scripts/
      └── helper.py   実行するスクリプト（読み込まない）
  ```

- **同梱スクリプトを確認なしで実行する型**: [仕様]

  ```markdown
  ---
  name: render-chart
  description: Render a chart from a CSV file
  allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)
  ---

  Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>` to render the chart.
  ```

- **サブエージェントで実行する型**: タスクを明示した本文にだけ使う。[仕様]

  ```markdown
  ---
  name: deep-research
  description: Research a topic thoroughly
  context: fork
  agent: Explore
  ---

  Research $ARGUMENTS thoroughly:
  1. Find relevant files using Glob and Grep
  2. Read and analyze the code
  3. Summarize findings with specific file references
  ```

## 6. 検証ルール

- **V-skills-01**: Skill の定義ファイルは、`SKILL.md` という名前で、`skills/<name>/` の直下にある（`paths:files/project:.claude/skills/<name>/SKILL.md`・`paths:files/user:~/.claude/skills/<name>/SKILL.md`）。[仕様]
- **V-skills-02**: frontmatter を持つ `SKILL.md` とコマンドファイルは、1行目が `---` である。[仕様]
- **V-skills-03**: frontmatter の YAML がパースできる。[仕様]
- **V-skills-04**: `SKILL.md` の frontmatter のキーは、すべて `frontmatter:skill` のいずれかの `id` と完全に一致する。[仕様]
- **V-skills-05**: コマンドファイル（`paths:files/project:.claude/commands/*.md`・`paths:files/user:~/.claude/commands/*.md`）の frontmatter のキーは、すべて `frontmatter:command` のいずれかの `id` と一致する（`name`・`paths` を含まない）。[仕様]
- **V-skills-06**: `allowed_values` を持つフィールド（`frontmatter:skill/effort`・`frontmatter:skill/context`・`frontmatter:skill/shell`）の値は、その `allowed_values` のいずれかである。[仕様]
- **V-skills-07**: `type` が `boolean` のフィールド（`frontmatter:skill/disable-model-invocation`・`frontmatter:skill/user-invocable`・`frontmatter:skill/background`）の値は、`true`・`false`・`yes`・`no`・`on`・`off`・`1`・`0` のいずれかである（大文字小文字を問わない）。[仕様]
- **V-skills-08**: `frontmatter:skill/agent` と `frontmatter:skill/background` は、`context: fork` と一緒にだけ書かれている。[仕様]
- **V-skills-09**: `frontmatter:skill/agent` の値は、`builtins:subagents` のいずれかの `id`、または対象のプロジェクトに定義されたサブエージェントの名前のいずれかである。[仕様]
- **V-skills-10**: `description` と `when_to_use` の文字数の合計が 1,536 以下である。[仕様]
- **V-skills-11**: `frontmatter:skill/compatibility` は 500 文字以下である。[仕様]
- **V-skills-12**: Skill のフォルダ名は、大文字小文字を問わず `synced` ではない。Plugin の外の Skill のフォルダ名・コマンドファイル名・`name` は、`anthropic-skills` でなく、`anthropic-skills:` で始まらない。[仕様]
- **V-skills-13**: `disable-model-invocation: true` と `user-invocable: false` を同じ Skill に指定していない（指定すると、ユーザーも Claude も自分では呼べなくなる）。[仕様]
- **V-skills-14**: `allowed-tools`・`disallowed-tools` の各要素は `ToolName` か `ToolName(specifier)` の形で、`ToolName` は `tools:tools` のいずれかの `id` か `mcp__` で始まる名前である。[仕様]
- **V-skills-15**: `${CLAUDE_PLUGIN_ROOT}`・`${CLAUDE_PLUGIN_DATA}` は、Plugin の Skill にだけ現れる。[仕様]
- **V-skills-16**: 本文のインラインの `` !` `` は、行頭か空白の直後にある（それ以外の位置では実行されず、文字のまま残る）。[仕様]
- **V-skills-17**: `SKILL.md` は 500 行より短い。[仕様]
- **V-skills-18**: `SKILL.md` から相対パスでリンクした補助ファイルが、Skill のディレクトリの中に存在する。[仕様]

## 7. 品質基準

- **Q-skills-01**: `description` が、何をするかといつ使うかの両方を書き、主な用途と利用者が使う語を先頭近くに置いている。曖昧な説明や一人称・二人称の説明ではない。[仕様][知見]
- **Q-skills-02**: 呼び出しの制御が内容に合っている。副作用のある手順は `disable-model-invocation: true`、ユーザーが呼ぶ意味の無い背景知識は `user-invocable: false` にしている。[仕様]
- **Q-skills-03**: `context: fork` は、それだけで完結する明示のタスクを持つ Skill にだけ付けている。会話の履歴を前提にしていない。[仕様]
- **Q-skills-04**: 本文が簡潔で、作業の間ずっと効く指示として書かれ、最も重要な指示が先頭にある。Claude が既に知っている説明を含まない。[仕様][知見]
- **Q-skills-05**: 毎回必ず守らせたい規則を Skill の指示だけに頼らず、Hook（設定か Skill の `hooks`）で強制している。[仕様]
- **Q-skills-06**: `allowed-tools` が、手順が実際に使うコマンドに絞られている。同梱スクリプトの許可は `${CLAUDE_SKILL_DIR}` を使い、本文と一致している。[仕様]
- **Q-skills-07**: 長い資料は補助ファイルに分けられ、`SKILL.md` から何をいつ読むかが示されている。参照は1段までで、長い参照ファイルには目次がある。[仕様][知見]
- **Q-skills-08**: `builtin-commands:commands` の名前と重なる Skill は、その組み込みコマンドや bundled skill を置き換えることを意図している。[仕様]
- **Q-skills-09**: 注入するコマンドが、想定内の0以外の終了や許可ルールで、呼び出し全体を止めない作りになっている。[仕様]
- **Q-skills-10**: 時期で変わる情報が無く、用語が Skill の中で揃っている。[知見]
- **Q-skills-11**: claude.ai や Skills API にも配る Skill は、Agent Skills の仕様のフィールドと `name`・`description` の制約に収まっている。[仕様][知見]
- **Q-skills-12**: Skill の中身が、説明された意図と食い違う動作（意図しない外部送信や権限の取得など）を含まない。[知見]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/skills.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/commands.md
- https://code.claude.com/docs/en/model-config.md
- https://code.claude.com/docs/en/tools-reference.md
- https://code.claude.com/docs/en/sub-agents.md

**insight**

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.md
- https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md
