---
feature: claude-md
sources:
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/plugins/components.md
  - https://code.claude.com/docs/en/settings-reference.md
---

# CLAUDE.md（指示ファイル・AGENTS.md・auto memory）

## 1. 概要

- CLAUDE.md は、プロジェクト・個人・組織の指示を平文の Markdown で書き、セッションをまたいで Claude に渡すファイルである。人が書く。[仕様]
- 置き場所はスコープごとに分かれる。正は `paths:files` の `feature: claude-md` の要素。[仕様]
  - 組織: `paths:files/managed:CLAUDE.md`（OS ごとの固定パス）
  - 個人（全プロジェクト）: `paths:files/user:~/.claude/CLAUDE.md`
  - プロジェクト（チームで共有）: `paths:files/project:CLAUDE.md` または `paths:files/project:.claude/CLAUDE.md`
  - 個人（このプロジェクトだけ）: `paths:files/local:CLAUDE.local.md`
- **読み込みの時点**: 作業ディレクトリとその上位の各ディレクトリにある `CLAUDE.md`・`CLAUDE.local.md` は起動時に読み込まれる。作業ディレクトリより下のサブディレクトリにあるもの（`paths:files/project:<subdir>/CLAUDE.md`）は、Claude がそのサブディレクトリのファイルを読む・書く・編集したときに読み込まれる。[仕様]
- **連結の順序**: 見つかったファイルは上書きし合わず、すべて連結されてコンテキストに入る。順序は 組織 → 個人 → プロジェクト で、ディレクトリはファイルシステムのルートから作業ディレクトリへ向かう。同じディレクトリでは `CLAUDE.local.md` が `CLAUDE.md` の後に付く。作業ディレクトリに近い指示ほど後に読まれる。[仕様]
- **コンテキストへの効き方**: CLAUDE.md の内容はシステムプロンプトの一部ではなく、システムプロンプトの後のユーザーメッセージとして渡される。Claude は従おうとするが、厳密に従う保証は無い。[仕様]
  > "Claude treats them as context, not enforced configuration."
- **auto memory** は、Claude が自分で書くメモで、CLAUDE.md と対になる仕組みである。プロジェクト（git リポジトリ）ごとに `paths:files/user:~/.claude/projects/<project>/memory/` に置かれ、worktree とサブディレクトリで共有され、マシンの外には共有されない。索引の `paths:files/user:~/.claude/projects/<project>/memory/MEMORY.md` は先頭の一部だけがセッション開始時に読み込まれ（上限はその要素の `startup_load_limit`）、トピックファイルは必要なときに読まれる。[仕様]
- **AGENTS.md**: 他のコーディングエージェント向けの `paths:files/project:AGENTS.md` を、Claude Code はプロジェクトの指示として読める。既定では、作業ディレクトリとその上位に `CLAUDE.md`・`.claude/CLAUDE.md`・`CLAUDE.local.md` のどれも無いときだけ、CLAUDE.md の代わりに読む。`~/.claude/CLAUDE.md`・組織の CLAUDE.md・`.claude/rules/` はこの判定に数えず、AGENTS.md と並んで読み込まれる。[仕様]
- **subagent への届き方**: fork 以外の subagent の初期コンテキストには、メインの会話が読み込む CLAUDE.md の階層（AGENTS.md を含む）が入る。組み込みの Explore と Plan はこれを読まない。`frontmatter:subagent/omitClaudeMd` を設定した subagent は組織の CLAUDE.md だけを読む。メインの会話の auto memory は subagent に入らない（fork を除く）。[仕様]
- **compaction の後**: プロジェクトのルートの CLAUDE.md は `/compact` の後にディスクから読み直されて再び入る。サブディレクトリの CLAUDE.md は必要になったときに読み直される。会話の中だけで伝えた指示は残らない。[仕様]

## 2. 使う場面・使わない場面

公式は CLAUDE.md を「毎回説明し直していることを書き留める場所」と位置づけ、毎セッション必要な事実だけを置くよう示している。[仕様]

| 置き場 | 書き手 | 読み込み | 向く内容 |
|---|---|---|---|
| CLAUDE.md | 人 | 毎セッション（サブディレクトリのものは必要時） | ビルド・テストのコマンド、規約、プロジェクトの構成、「常に X する」 |
| auto memory | Claude | 毎セッション（索引の先頭のみ） | 個人の好み、受けた訂正、コードから導けないプロジェクトの文脈 |
| `.claude/rules/` | 人 | 毎セッション、または一致するファイルを扱ったとき | コードベースの一部だけに効く指示（`rules` の機能ファイル） |
| Skill | 人 | 呼び出されたとき・関連すると判断されたとき | 複数手順の作業、ときどき要る領域知識（`skills` の機能ファイル） |
| hooks・permissions | 人 | 決まったイベント・ツール呼び出しごと | 例外なく守らせる制約（`hooks`・`permissions` の機能ファイル） |

- **使う**: Claude が同じ誤りを2回した、コードレビューでこのコードベースについて Claude が知っているべきことが見つかった、前のセッションと同じ訂正を打った、新しいメンバーにも同じ文脈が要る——こうしたときに CLAUDE.md に足す。[仕様]
- **使う**: チームで共有する指示はプロジェクトの CLAUDE.md、自分だけの指示は `CLAUDE.local.md`（このプロジェクト）か `~/.claude/CLAUDE.md`（全プロジェクト）に分ける。[仕様]
- **使わない**: 複数手順の手順書や、コードベースの一部でしか要らない指示。Skill か `paths` 付きのルールにする。[仕様]
- **使わない**: 必ず守らせる必要のある振る舞い（毎コミット前・毎編集後に必ず走らせるもの、特定の操作の禁止）。CLAUDE.md は強制の層ではないので hooks か permissions を使う。[仕様]
  > "CLAUDE.md instructions shape Claude's behavior but are not a hard enforcement layer."
- **使わない**: Claude に覚えさせたいだけの個別の事実。「覚えて」と頼めば auto memory に保存される。[仕様] かつて CLAUDE.md をメモの置き場にしていた使い方は、auto memory に置き換わったとされている。[知見]
- **使わない**: システムプロンプトの水準で効かせたい指示。起動時の `--append-system-prompt` が向き、対話より script・自動化に向く。[仕様]
- **組織の CLAUDE.md と managed settings の分担**: ツール・コマンド・パスの禁止、sandbox の強制、環境変数、ログイン方法の制限は managed settings、コードスタイル・データの扱いの注意・振る舞いの指示は組織の CLAUDE.md に置く。組織の CLAUDE.md は、ファイルの代わりに managed settings の `settings:keys/claudeMd` に本文を書いても配れる。[仕様]
- **AGENTS.md を既に持つリポジトリ**: CLAUDE.md を足さなくても AGENTS.md が読まれる。CLAUDE.md を足すと既定では AGENTS.md が読まれなくなるので、両方を使うなら CLAUDE.md から `@AGENTS.md` を import する（§5）。[仕様]

## 3. 仕様の要約

- **import**: CLAUDE.md の中の `@path/to/import` は、そのファイルを展開して起動時に一緒に読み込む。[仕様]
  - 相対パスは import を書いたファイルの位置から解決する。絶対パスも使える。
  - import は再帰でき、深さの上限は `paths:files/project:CLAUDE.md` の `import_max_depth`。
  - パスに空白があるときは各空白の前に `\` を置く。引用符で囲んだパスは import されない。
  - Markdown のコードスパンとフェンスのコードブロックの中は import として解釈されない。パスを import せずに書くにはバッククォートで囲む。
  - プロジェクトの指示ファイルから作業ディレクトリの外を指す import は「外部の import」で、プロジェクトで初めて出会ったときに承認ダイアログが出る。断ると無効のままで、ダイアログは再び出ない。ユーザースコープのファイル（`~/.claude/CLAUDE.md`・`~/.claude/rules/`）の import にはダイアログが出ない（Cowork のセッションを除く）。
  - import は整理には役立つが、import したファイルも起動時に読み込まれるのでコンテキストは減らない。
- **サイズ**: 推奨は1ファイル `recommended_max_lines` 行未満（`paths:files/project:CLAUDE.md` の要素）。`max_load_size` を超えるファイルは読み込まれない。推奨の長さを超えたファイルがあるとき、または個々は範囲内でも合計が上限を超えたときに、起動時と `/status` で警告が出る（CLAUDE.md・ルールファイル・import はそれぞれ別のファイルとして数える）。[仕様]
- **HTML コメント**: ブロック単位の HTML コメント（`<!-- … -->`）はコンテキストに入れる前に取り除かれる。コードブロックの中のコメントは残る。Read ツールで直接開くとコメントも見える。[仕様]
- **読み込みの除外**: `settings:keys/claudeMdExcludes` の glob（絶対パスに照合）で、上位ディレクトリの CLAUDE.md やルールを読み込みから外せる。どの設定スコープにも書け、配列はスコープをまたいで連結される。組織の CLAUDE.md は除外できない。[仕様]
- **追加ディレクトリ**: `--add-dir` で足したディレクトリの CLAUDE.md は既定では読み込まれない。環境変数 `env-vars:vars/CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` を設定すると、そのディレクトリの `CLAUDE.md`・`.claude/CLAUDE.md`・`.claude/rules/*.md`・`CLAUDE.local.md` が読み込まれる。[仕様]
- **シンボリックリンク**: CLAUDE.md のシンボリックリンクの先がネットワークのパス（UNC の `\\server\share`、`/net`・`/Network` の下。`\\wsl$` は含まない）なら読み込まれない。[仕様]
- **AGENTS.md の読み方の切り替え**: `/config` の **Project instructions**、または設定の `settings:keys/pluginConfigs` の `cc-plugin-agents-md@builtin` の `options.instructionFiles` で選ぶ。値は `claude-md-or-agents-md`（既定）・`claude-md-and-agents-md`・`claude-md`・`managed-only`。この設定は `~/.claude/settings.json`・`--settings` のファイル・managed settings からだけ読まれ、project・local の設定ファイルでは無視される。[仕様]
- **AGENTS.md の読み込みの範囲**: 起動時は作業ディレクトリとその上位の `AGENTS.md`・`.claude/AGENTS.md`。サブディレクトリの `AGENTS.md` は、Claude がそこにあるファイルを Read で開き、そのサブディレクトリに CLAUDE.md 類が無いときに読む。`AGENTS.local.md`・`AGENTS.override.md`・`.agents/` の下は読まない。[仕様]
- **AGENTS.md と CLAUDE.md の違い**: 設定を通して直接読まれた AGENTS.md では `hook-events:events/InstructionsLoaded` が発火しない。`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` を設定しても追加ディレクトリの AGENTS.md は読まれない。作業ディレクトリの外への import は、承認済みのときだけ読まれ承認の確認は出ない。CLAUDE.md から import した（またはシンボリックリンクで指した）AGENTS.md では `InstructionsLoaded` が通常どおり発火する。[仕様]
- **プラグイン**: プラグインのルートの `CLAUDE.md` は読み込まれない（`paths:files` の plugin スコープに CLAUDE.md の要素は無い）。プラグインで指示を配るときは skill にする。[仕様]
- **auto memory**: [仕様]
  - 既定で有効。`settings:keys/autoMemoryEnabled`（`/memory` の切り替えは `~/.claude/settings.json` に保存する）か環境変数 `env-vars:vars/CLAUDE_CODE_DISABLE_AUTO_MEMORY` で無効にできる。
  - 置き場所は `settings:keys/autoMemoryDirectory` で変えられ、値は絶対パスか `~/` 始まりでなければならない。
  - Claude は記録の種類を各メモリファイルの frontmatter の `type`（`user`・`feedback`・`project`・`reference`）に書く。コードベースから導けること、CLAUDE.md に既に書いてあることは保存しない。
  - メモリファイルは保存期間の自動削除の対象外で、本人か Claude が編集・削除するまで残る。
- **確認の手段**: 起動時に読み込まれた CLAUDE.md・`CLAUDE.local.md` は `builtin-commands:commands/context` の **Memory files** で確かめる。`builtin-commands:commands/memory` は各スコープの指示ファイルと auto memory を一覧し開ける。読み込みのたびに `hook-events:events/InstructionsLoaded` が発火する。`/doctor prompt-audit`（`builtin-commands:commands/doctor`）は古いモデル向けの指示・存在しないファイルやコマンドへの参照・ファイル間の矛盾を報告し、`/doctor` はコミットされた CLAUDE.md からコードベースで導ける内容を削る案を出す。[仕様]
- **生成の補助**: `builtin-commands:commands/init` はコードベースを解析して CLAUDE.md の初稿を作り、既にあれば改善案を出す。他のツールの指示ファイル（`.cursor/rules/`・`.cursorrules`・`.github/copilot-instructions.md` など）も取り込む。[仕様]

## 4. 設計の指針

- **毎セッション必要な事実だけを置く**: ビルドコマンド・規約・プロジェクトの構成・「常に X する」規則に絞る。複数手順の手順書や一部でしか要らない指示は Skill か `paths` 付きのルールへ出す。[仕様]
- **コードから導けることを書かない**: ディレクトリ構成・依存の一覧・アーキテクチャの概要のようにコードベースを見れば分かることは削り、落とし穴・判断の理由・ツールの既定と違う規約を残す。[仕様]（`/doctor` の削減の基準）リポジトリの目的を短く述べ、トークンの大半を落とし穴に使うのがよいとされる。[知見]
- **1行ずつ要否を問う**: 「この行を消すと Claude は誤るか」を問い、誤らないなら消す。長すぎる CLAUDE.md では大事な規則が埋もれて無視される。[知見]
- **強制が要るものは CLAUDE.md に頼らない**: 例外なく守らせる制約は hooks か permissions に置く。CLAUDE.md の指示が無くても Claude が正しくできているなら、消すか hook に置き換える。[仕様]・[知見]
- **スコープで置き場を分ける**: チームの標準はプロジェクトの CLAUDE.md、個人の好みは `CLAUDE.local.md` か `~/.claude/CLAUDE.md`、組織の方針は組織の CLAUDE.md。プロジェクトの CLAUDE.md はバージョン管理で共有されるので、個人の好みを置かない。[仕様]
- **矛盾させない**: 矛盾する2つの指示があると Claude はどちらかを任意に選ぶ。CLAUDE.md・サブディレクトリの CLAUDE.md・`.claude/rules/`・個人の CLAUDE.md の間で揃える。Claude Code が自分で足す指示（コミットや PR の作法）と競合するなら、`settings:keys/includeGitInstructions` で組み込みの指示を切り、`settings:keys/attribution` で帰属の文言を決める。[仕様]
- **段階的な開示**: CLAUDE.md を、起こりうるすべての作法の置き場にしない。検証の手順のような固有の指示は Skill にし、CLAUDE.md からはそれを参照する。[知見]
- **規則より判断を委ねる**: 新しい世代のモデルでは、強い禁止や網羅的な規則は過剰な制約になりやすく、周囲の文脈と判断に任せられるとされる。古いモデル向けの過剰な制約は見直す。[知見] `/doctor prompt-audit` も「古いモデル向けに書かれた指示」を問題として挙げる。[仕様]
- **強調は絞る**: 1つの指示だけが守られないなら、その行にだけ「IMPORTANT」などの強調を付ける。多くの行を強調すると、どれも目立たなくなる。[知見]
- **大きなリポジトリ**: CLAUDE.md が長くなったら、一部にだけ効く指示を `paths` 付きのルールやサブディレクトリの CLAUDE.md に移す。import での分割は整理にはなるがコンテキストは減らない。[仕様]
- **subagent に必ず届かせたい規則**: Explore・Plan・`omitClaudeMd` の subagent には CLAUDE.md が届かない。メインの会話は CLAUDE.md を持ったまま結果を読むので多くの規則は subagent に届かなくてよいが、届かせる必要があるものは委譲のプロンプトに書き直す。[仕様]

## 5. 生成の規約

- 置き場所は `paths:files` の `feature: claude-md` の要素から選ぶ。チームで共有するプロジェクトの指示は `CLAUDE.md`（プロジェクトのルート）に置く。[仕様]（`.claude/CLAUDE.md` も同じ扱いだが、どちらか一方にそろえるのは canon の規律で、公式の仕様ではない）
- `CLAUDE.local.md` を生成するときは、`.gitignore` に `CLAUDE.local.md` を足す。[仕様]
- 本文は Markdown の見出しと箇条書きで整理し、検証できるほど具体的に書く（「コードを整形する」ではなく「インデントは2スペース」、「変更をテストする」ではなく「コミット前に `npm test` を実行する」）。[仕様]
- 1ファイルを `recommended_max_lines` 行未満に収める。[仕様]
- import は `@path` で書き、パスを import せずに書くときはバッククォートで囲む。空白を含むパスは `\ ` でエスケープし、引用符で囲まない。[仕様]
- 人のメンテナー向けの注記は、ブロック単位の HTML コメントにする（コンテキストに入らない）。[仕様]
- 組織の CLAUDE.md を本文で配るときは、managed settings の `settings:keys/claudeMd` にだけ書く（user・project・local の設定では効かない）。[仕様]
- AGENTS.md を共有の正にするリポジトリで Claude 固有の指示も要るときは、隣の CLAUDE.md の先頭で `@AGENTS.md` を import し、その下に Claude 固有の指示を書く。[仕様] シンボリックリンク（`ln -s AGENTS.md CLAUDE.md`）は Windows の利用者がいると壊れうるので使わない。[仕様]（Windows での制約は仕様。import に統一するのは canon の規律）
- auto memory のファイル（`paths:files/user:~/.claude/projects/<project>/memory/`）は Claude が書くもので、生成の対象にしない。[仕様]（auto memory は Claude が書くという仕様から、canon が決めた規律）
- compaction の後も残したい要点がある場合は、「compact するときは変更したファイルの一覧とテストのコマンドを残す」のような指示を CLAUDE.md に書ける。[知見]

最小の例（プロジェクトの `CLAUDE.md`）:

```markdown
# コマンド

- ビルド: `npm run build`
- テスト: `npm test`（1ファイルだけなら `npm test -- <path>`）

# 規約

- ES modules（import/export）で書き、CommonJS（require）は使わない
- API のハンドラーは `src/api/handlers/` に置く

# 落とし穴

- 型定義は `src/types.ts` だけに置き、他のファイルで再定義しない

<!-- メンテナー向け: 検証の手順は .claude/skills/verify/ にある -->
```

AGENTS.md を import する例:

```markdown
@AGENTS.md

## Claude Code

- `src/billing/` の変更では plan mode を使う
```

## 6. 検証ルール

- **V-claude-md-01**: 生成する指示ファイルのパスは、`paths:files` の `feature: claude-md` かつ `kind: file` の要素の `path` の形に一致する（`<subdir>`・`<project>` は置き換える）。[仕様]
- **V-claude-md-02**: プラグインの中に指示を置くとき、プラグインのルートに `CLAUDE.md` を置かない（`paths:files` の plugin スコープに該当の要素が無い）。[仕様]
- **V-claude-md-03**: CLAUDE.md・`CLAUDE.local.md` の各ファイルの大きさが、`paths:files/project:CLAUDE.md` の `max_load_size` 以下である。[仕様]
- **V-claude-md-04**: CLAUDE.md・`CLAUDE.local.md` の各ファイルの行数が、`paths:files/project:CLAUDE.md` の `recommended_max_lines` 未満である（推奨値）。[仕様]
- **V-claude-md-05**: コードスパンとフェンスのコードブロックの外にある `@path` の import がすべて、import を書いたファイルの位置から解決して実在するファイルを指す。[仕様]
- **V-claude-md-06**: import の連鎖の深さが `paths:files/project:CLAUDE.md` の `import_max_depth` 以下である。[仕様]
- **V-claude-md-07**: import のパスを引用符で囲んでいない。[仕様]
- **V-claude-md-08**: `paths:files/local:CLAUDE.local.md`（`commit: false`）にあたるファイルが git に追跡されておらず、`.gitignore` で無視されている（`git check-ignore` が一致する）。[仕様]
- **V-claude-md-09**: `settings:keys/claudeMd` が user・project・local の設定ファイル（`paths:files/user:~/.claude/settings.json`・`paths:files/project:.claude/settings.json`・`paths:files/local:.claude/settings.local.json`）に無い。[仕様]
- **V-claude-md-10**: `settings:keys/pluginConfigs` の `cc-plugin-agents-md@builtin` の項目が、project・local の設定ファイル（`paths:files/project:.claude/settings.json`・`paths:files/local:.claude/settings.local.json`）に無い。[仕様]
- **V-claude-md-11**: `settings:keys/pluginConfigs` の `cc-plugin-agents-md@builtin` の `options.instructionFiles` の値は、`claude-md-or-agents-md`・`claude-md-and-agents-md`・`claude-md`・`managed-only` のどれかである。[仕様]
- **V-claude-md-12**: `settings:keys/autoMemoryDirectory` の値は、絶対パスか `~/` で始まる。[仕様]
- **V-claude-md-13**: 生成物に `paths:files/user:~/.claude/projects/<project>/memory/` の下のファイルを含まない。[仕様]（canon の規律。§5）

## 7. 品質基準

- **Q-claude-md-01**: 毎セッション必要な事実（ビルドコマンド・規約・構成・「常に X する」）だけを置き、複数手順の手順書や一部でしか要らない指示は Skill か `paths` 付きのルールに出している。[仕様]
- **Q-claude-md-02**: 各指示が検証できるほど具体的で、見出しと箇条書きで整理されている。[仕様]
- **Q-claude-md-03**: コードベースを読めば分かること（ディレクトリ構成・依存の一覧・アーキテクチャの概要・標準の言語規約）を書かず、落とし穴・判断の理由・既定と違う規約を書いている。[仕様]・[知見]
- **Q-claude-md-04**: どの行も「消すと Claude が誤る」と言える。自明な実践（「きれいなコードを書く」）や頻繁に変わる情報、長い解説を含まない。[知見]
- **Q-claude-md-05**: CLAUDE.md 同士・サブディレクトリの CLAUDE.md・`.claude/rules/`・個人の CLAUDE.md の間で、同じ振る舞いについて矛盾する指示が無い。Claude Code の組み込みの指示（コミット・PR の作法）とも競合していない。[仕様]
- **Q-claude-md-06**: 例外なく守らせる必要のある制約を CLAUDE.md だけに頼らず、hooks か permissions で担保している。[仕様]
- **Q-claude-md-07**: 個人の好みがプロジェクトの CLAUDE.md に入っておらず、`CLAUDE.local.md` か `~/.claude/CLAUDE.md` に分かれている。組織の方針は組織の CLAUDE.md、技術的な強制は managed settings に分かれている。[仕様]
- **Q-claude-md-08**: import をコンテキストの節約の手段として使っていない（import したファイルも起動時に読み込まれる）。読み込む総量が全セッションで必要な内容に見合っている。[仕様]
- **Q-claude-md-09**: 古いモデル向けの過剰な制約（網羅的な禁止・例の羅列・同じ指示の繰り返し）が無く、判断に任せられることは任せている。[知見]・[仕様]（`/doctor prompt-audit` の観点）
- **Q-claude-md-10**: 強調（「IMPORTANT」など）が、守られにくい少数の行に限られている。[知見]
- **Q-claude-md-11**: subagent に必ず届かせる必要のある規則を CLAUDE.md だけに置いていない（Explore・Plan・`omitClaudeMd` の subagent には届かない）。[仕様]
- **Q-claude-md-12**: AGENTS.md を持つリポジトリで、CLAUDE.md を足したことで AGENTS.md が読まれなくなる事態を、`@AGENTS.md` の import などで避けている。[仕様]

## 8. 出典

**spec**

- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/plugins/components.md
- https://code.claude.com/docs/en/settings-reference.md

**insight**

- https://www.anthropic.com/engineering/claude-code-best-practices
- https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/
