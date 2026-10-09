---
feature: rules
sources:
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/features-overview.md
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/hooks.md
---

# ルール（`.claude/rules/`）

## 1. 概要

- ルールは、プロジェクトの指示をトピックごとの Markdown ファイルに分けたもの。置き場所はプロジェクトの `.claude/rules/`（`paths:files/project:.claude/rules/*.md`）とユーザーの `~/.claude/rules/`（`paths:files/user:~/.claude/rules/*.md`）。ユーザーのルールは全プロジェクトに効く。[仕様]
- `.claude/rules/` の下の `.md` は再帰的に見つけられるので、`frontend/` などのサブディレクトリに分けてよい。[仕様]
- 読み込みの時点は frontmatter の `paths`（`frontmatter:rule/paths`）の有無で決まる。[仕様]
  - `paths` が無いルール: セッション開始時に、`.claude/CLAUDE.md` と同じ優先度で無条件に読み込まれる。
  - `paths` があるルール: Claude が一致するファイルを `tools:tools/Read`・`tools:tools/Write`・`tools:tools/Edit` で扱ったとき、または読み取りに数える `tools:tools/Bash` のコマンド（1ファイルへの `cat`・`head` など）で見たときに読み込まれる。それまではコンテキストに入らない。
- 作業ディレクトリの下のサブディレクトリにある `.claude/rules/` も、オンデマンドで読み込まれる対象として公式に言及がある。読み込みのきっかけの詳しい条件は、取得したページには書かれていない。[仕様]
- ユーザーのルールはプロジェクトのルールより先に読み込まれる。どちらも他方を上書きしない。[仕様]
  > "if a user rule and a project rule conflict, Claude may follow either one"
- ルールは CLAUDE.md と同じく、Claude が読む指示であって、Claude Code が強制する設定ではない。[仕様]
  > "Like CLAUDE.md, rules are guidance Claude reads, not configuration Claude Code enforces."
- frontmatter は読み込む前に取り除かれ、本文だけがコンテキストに入る。[仕様]
- サブエージェント（フォークを除く）の初期コンテキストには、メインの会話が読み込む CLAUDE.md の階層とともにプロジェクトのルールが入る。組み込みの Explore と Plan はこれを読まず、`frontmatter:subagent/omitClaudeMd` を設定したサブエージェントも読まない。[仕様]
- `/compact` の後、`paths` があるルールは一致するファイルを再び扱うまで読み込まれない（オンデマンドで再読込される）。[仕様]

## 2. 使う場面・使わない場面

公式は CLAUDE.md・ルール・Skill を、読み込み方の違いで使い分けるよう示している。[仕様]

| 置き場 | 読み込み | 向く内容 |
|---|---|---|
| CLAUDE.md | 毎セッション | 全体に効く中心の規約・ビルドコマンド |
| `.claude/rules/` | 毎セッション、または一致するファイルを開いたとき | 言語別・ディレクトリ別の指針 |
| Skill | 呼び出されたとき、または関連すると判断されたとき | 参照資料・繰り返す手順 |

- **使う**: CLAUDE.md を焦点の絞れた状態に保つため、トピックごとに分けたいとき。[仕様]
- **使う**: コードベースの一部だけに効く指示を、そこを扱うときだけ読み込ませたいとき（`paths` を付ける）。[仕様]
- **使う**: CLAUDE.md が 200 行に近づいたとき。公式は、そこでルールへの分割を始めるよう勧めている。[仕様]
  > "When CLAUDE.md approaches 200 lines, start splitting into rules"
- **使わない**: 常に読み込む必要のない、タスク固有の指示や複数手順の作業。Skill にする（`skills` の機能ファイル）。[仕様]
- **使わない**: 必ず守らせたい振る舞い。ルールは強制されないので、hooks か permissions を使う。[仕様]
- **使わない**: CLAUDE.md の `@path` の import で足りる単なる整理。ただし import は起動時に読み込まれるのでコンテキストは減らない。コンテキストを減らすのが目的なら、`paths` を付けたルールにする。[仕様]
- Skill の `paths`（`frontmatter:skill/paths`）とは別物。ルールの `paths` は、ルール本文をコンテキストに読み込む条件を決める。[仕様]

## 3. 仕様の要約

- **frontmatter**: Claude Code がルールから読むキーは `paths` だけで、ほかのキーはエラーにならずに無視される。正は `frontmatter:rule`。[仕様]
- **`paths` の値**: glob パターンの YAML リスト、またはカンマ区切りの文字列。複数のパターンを並べられ、波括弧の展開（例: `src/**/*.{ts,tsx}`）が使える。[仕様]
- **パターンの基準**: 公式の例では、`*.md` が「プロジェクトのルートの Markdown」、`src/**/*` が「`src/` の下のすべて」に一致する。[仕様]
- **波括弧の展開の上限**: ルール1つの `paths` 全体で上限がある。超えたパターンは展開されず、どのファイルにも一致しない。値は `frontmatter:rule/paths` の `brace_expansion_budget`。[仕様]
- **無効なパターン**: `[` は角括弧式の開始として扱われる。角括弧式として読めない `[` を含むパターンは何にも一致しない（他のパターンは有効なまま）。リテラルの `[` は `\[` と書く。[仕様]
- **YAML が解析できないとき**: frontmatter は無視され、`paths` が無いルールとして無条件に読み込まれる。`claude --debug` で解析エラーを確認できる。[仕様]
- **シンボリックリンク**: `.claude/rules/` はシンボリックリンクに対応し、循環は検出される。[仕様]
  - リンク先が作業ディレクトリの外なら、外部の import と同じ扱いになる。プロジェクトごとに1回の承認ダイアログで承認するまで読み込まれず、承認後も `paths` の無いルールだけが読み込まれる。
  - リンク先がネットワークのパス（UNC の `\\server\share`、`/net` や `/Network` の下）なら読み込まれない。`\\wsl$` はネットワークのパスに数えない。
- **読み込みの除外**: `settings:keys/claudeMdExcludes` の glob で、特定のルールファイルを読み込みから外せる。パターンは絶対パスに照合する。シンボリックリンク経由のルールは、`.claude/rules/` の下のパスとリンク先のどちらに一致しても除外される。[仕様]
- **`--setting-sources`**: `project` を除くと、プロジェクトのルールは読み込まれない。[仕様]
- **`--add-dir`**: 追加したディレクトリの `.claude/rules/*.md` は既定では読み込まれない。環境変数 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` を設定すると読み込まれる。[仕様]
- **読み込みの確認**: 起動時に読み込まれたルールは `/context` で確かめられる。読み込みのたびに `hook-events:events/InstructionsLoaded` が発火し、`paths` で読み込まれたときは `load_reason` が `path_glob_match` になる。このフックはブロックできず、観測用に非同期で動く。[仕様]
- **サイズの警告**: 推奨の長さを超えた指示ファイル、または個々は範囲内でも合計が上限を超えたときに、起動時と `/status` で警告が出る。CLAUDE.md・ルールファイル・`@path` の import はそれぞれ別のファイルとして数える。[仕様]

## 4. 設計の指針

- **1ファイル1トピック**: 各ファイルは1つのトピックだけを扱い、`testing.md`・`api-design.md` のように内容が分かるファイル名にする。[仕様]
- **`paths` を付けるかどうかを内容で決める**: [仕様]
  - コードベースの一部（特定の言語・ディレクトリ・ファイル種別）だけに効く指示 → `paths` を付ける。読み込まれるのは該当ファイルを扱うときだけになる。
  - 全ファイルに効き、毎セッション必要な指示 → `paths` を付けない。
  - `/compact` の後も必ず残したい指示 → `paths` を付けない（または project ルートの CLAUDE.md に置く）。`paths` 付きのルールは、一致するファイルを再び扱うまで読み込まれない。
- **読み込みのきっかけを把握する**: `paths` 付きのルールは、一致するファイルを Claude が読む・書く・編集するまで読み込まれない。一致するファイルを扱うより前の段階（計画を立てるときなど）で必要になる指示は `paths` に頼らない。[仕様]（読み込みのきっかけは仕様。そこから「前の段階の指示には向かない」とするのは canon の推論で、公式の記述ではない）
- **CLAUDE.md・ユーザーのルールと矛盾させない**: 矛盾する指示があると、Claude はどちらかを任意に選ぶことがある。ユーザーのルールとプロジェクトのルールも上書きの関係にない。[仕様]
- **強制が要るものはルールにしない**: ルールは指示であって強制ではない。必ず守らせたい制約は hooks（`PreToolUse` など）や permissions に置き、ルールには置かない。[仕様]
- **プロジェクト間の共有**: 共通のルールはシンボリックリンクで複数のプロジェクトに配れる。ただし作業ディレクトリの外へのリンクは承認が要り、承認後も `paths` 付きのルールは読み込まれない。承認なしで全プロジェクトに効かせたいなら `~/.claude/rules/` に置く。[仕様]
- **サブエージェントへの届き方**: プロジェクトのルールは通常のサブエージェントにも読み込まれるが、Explore・Plan と `omitClaudeMd` を設定したサブエージェントには届かない。そこにも必ず届かせたい指示は、委譲のプロンプトに書く。[仕様]

## 5. 生成の規約

- 置き場所は `.claude/rules/<トピック>.md`（プロジェクト）。全プロジェクトに効かせる個人の規約だけを `~/.claude/rules/<トピック>.md`（ユーザー）にする。拡張子は `.md`。[仕様]
- frontmatter に書くキーは `paths` だけにする。ほかのキーは無視されるので書かない。[仕様]
- `paths` の値は YAML のリストで書き、各パターンを引用符で囲む。[仕様]（公式はカンマ区切りの文字列も受け付けるが、公式の例はすべてこの形である。この形に揃えるのは canon の規律で、公式の仕様ではない）
- `paths` を付けないルールには frontmatter 自体を置かない。[仕様]（Claude Code が読むキーは `paths` だけなので、それ以外の frontmatter は効果が無い。frontmatter を置かないと決めるのは canon の規律で、公式の仕様ではない）
- 本文は Markdown の見出しと箇条書きで、検証できるほど具体的な指示を書く。[仕様]（公式はこれを CLAUDE.md の書き方として示し、ルールも CLAUDE.md と同じく指示として読まれると述べている。ルールにも当てはめるのは canon の判断）

`paths` 付きのルールの最小の例:

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API の規約

- すべてのエンドポイントで入力を検証する
- エラーは共通のレスポンス形式で返す
```

`paths` の無いルールの最小の例（セッション開始時に読み込まれる）:

```markdown
# コミットの規約

- コミットメッセージは Conventional Commits の形式で書く
```

## 6. 検証ルール

- **V-rules-01**: ルールファイルのパスは `paths:files/project:.claude/rules/*.md` か `paths:files/user:~/.claude/rules/*.md` の形に一致し、拡張子が `.md` である（サブディレクトリは可）。[仕様]
- **V-rules-02**: ルールファイルに frontmatter があるとき、`---` の間が YAML として解析できる。[仕様]
- **V-rules-03**: frontmatter のキーはすべて `frontmatter:rule` のいずれかの `id` と一致する。[仕様]
- **V-rules-04**: `paths` の値は、文字列のリストか、文字列である（`frontmatter:rule/paths` の `accepted_forms`）。[仕様]
- **V-rules-05**: `paths` の各パターンに、角括弧式として閉じていない `[` を含まない（リテラルは `\[`）。（`frontmatter:rule/paths` の `invalid_pattern`）[仕様]
- **V-rules-06**: ルール1つの `paths` を波括弧で展開したパターンの総数と総バイト数が、`frontmatter:rule/paths` の `brace_expansion_budget` を超えない。[仕様]
- **V-rules-07**: `.claude/rules/` の下のシンボリックリンクのリンク先が、ネットワークのパス（`\\` で始まる UNC（`\\wsl$` を除く）、`/net/`・`/Network/` の下）でない。[仕様]
- **V-rules-08**: `.claude/rules/` の下で、作業ディレクトリの外を指すシンボリックリンクから読み込まれるルールファイルは、frontmatter に `paths` を持たない。[仕様]

## 7. 品質基準

- **Q-rules-01**: 各ファイルが1つのトピックだけを扱い、ファイル名から内容が分かる。[仕様]
- **Q-rules-02**: `paths` の有無が内容に合っている。コードベースの一部だけに効く指示は `paths` で絞られ、全体に効く指示や `/compact` の後も残したい指示は `paths` を持たない。[仕様]
- **Q-rules-03**: `paths` のパターンが、意図したファイルに一致し、意図しないファイルに一致しない。[仕様]（公式の例では `*.md` がプロジェクトのルートの Markdown に一致する）
- **Q-rules-04**: 必ず守らせる必要のある制約をルールだけに頼っていない。そうした制約は hooks か permissions でも担保されている。[仕様]
- **Q-rules-05**: ルール同士、ルールと CLAUDE.md、ユーザーのルールとプロジェクトのルールの間で、同じ振る舞いについて矛盾する指示が無い。[仕様]
- **Q-rules-06**: 常に読み込む必要のない、タスク固有の手順や参照資料をルールに置いていない（Skill に置くべき内容）。[仕様]
- **Q-rules-07**: 指示が検証できるほど具体的で、見出しと箇条書きで整理されている。[仕様]（CLAUDE.md の書き方の公式の指針を、ルールにも当てはめた canon の基準）
- **Q-rules-08**: `paths` の無いルールは毎セッションのコンテキストを使うので、その分量が全セッションで必要な内容に見合っている。[仕様]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/features-overview.md
- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/hooks.md

**insight**

- （なし）
