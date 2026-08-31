# L1: コンテキスト管理（常時ロード・静的指示）

> 親INDEX: [00_INDEX.md](./00_INDEX.md)
> 関連: [L2_SKILLS.md](./L2_SKILLS.md)（動的ロードの対比） / [BEST_PRACTICES.md](./BEST_PRACTICES.md)（横断原則）

## メタ情報
| 項目 | 値 |
|---|---|
| 確認したClaude Codeバージョン | v2.1.251 |
| 一次ソース（英語） | https://code.claude.com/docs/en/memory |
| 一次ソース | https://code.claude.com/docs/en/best-practices |
| 調査日 | 2026-08-29 |

---

## 1. 概要レイヤー（What & When）

### 1.1 機能の目的
L1は **セッション開始時に Claude のコンテキストへ常時ロードされる静的指示・知識** を扱うレイヤーです。プロジェクト固有のルール、コード規約、過去のやり取りで得た学習を、毎回再説明することなく Claude に持たせます。動的に呼び出されるL2スキルとは異なり、L1の内容は「呼び出し不要・常に有効」が原則です。

### 1.2 含まれる機能一覧

| 機能名 | 一言説明 | 主な用途 |
|---|---|---|
| **CLAUDE.md** | あなたが書く永続コンテキスト | プロジェクト固有のコード規約、ワークフロー指示、環境特有の癖 |
| **Rules**（`.claude/rules/`） | パス別スコープで条件付きロードされる Markdown ルール群 | 大規模プロジェクトでのモジュール化・ファイル種別ごとの指示 |
| **Auto Memory**（`MEMORY.md` + topic files） | Claude が自身の判断で書き込む動的学習メモ | 修正履歴・デバッグ知見・ユーザー嗜好の永続化 |

### 1.3 いつ使うか（採用判断基準）

#### 採用すべき状況（DO）
- そのプロジェクトに来た **全てのセッション**で必ず参照させたい知識・ルールがある
- Claude が自力で（コード読解で）把握できない **暗黙の前提**（環境変数、独自ビルド手順、組織固有の語彙）がある
- 何度も同じ指示を口頭で繰り返している → CLAUDE.md へ
- 「特定パスのファイル」を編集するときだけ適用したい指示がある → Rules へ
- セッション間で Claude 自身の学習を引き継がせたい → Auto Memory へ

#### 採用すべきでない状況（DON'T）
- **コードを読めばわかること**を書く（API docs の写し、ファイル一覧、自明な規約）→ トークンの無駄
- 多段階の **手順** を CLAUDE.md に書く → L2 Skill（[L2_SKILLS.md](./L2_SKILLS.md)）が適切
- **強制的に**実行させたいルール（exit code で拒否したい）→ L4 Hooks（[L4_AUTOMATION.md](./L4_AUTOMATION.md)）が適切（CLAUDE.md は advisory に過ぎない）
- **変更頻度が高い**情報（リリース日程、進行中バグの状態）→ Auto Memory または都度プロンプトで渡す

#### 他レイヤーとの使い分け

| 比較対象 | L1 を選ぶ基準 | 他レイヤーを選ぶ基準 |
|---|---|---|
| **L1 vs L2 Skills** | 常時必要な前提知識 | 特定タスク発動時のみ必要なワークフロー |
| **L1 CLAUDE.md vs L4 Hooks** | 助言的に守らせたい（advisory） | 必ず実行/遮断したい（deterministic） |
| **L1 vs L5 Plugins** | このプロジェクト/ユーザー固有 | 複数プロジェクト・他者へ配布したい |

公式引用（[best-practices](https://code.claude.com/docs/en/best-practices) "Set up hooks" 節）:
> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic and guarantee the action happens."

---

## 2. 詳細レイヤー（How）

### 2.1 CLAUDE.md

#### 仕組み
- セッション開始時にコンテキストへ**完全ロード**される（プロジェクトルート直下のもの）
- サブディレクトリの CLAUDE.md は **遅延ロード**（Claude が該当ディレクトリのファイルを読むときに展開される）
- スコープごとに4階層存在し、すべて加算的にロードされる

#### 配置場所と優先順位（4階層）

ロード順序（後にロードされたものが優先・上書き）:

| 階層 | 配置場所 | スコープ | 共有方法 |
|---|---|---|---|
| **Managed Policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br>Linux/WSL: `/etc/claude-code/CLAUDE.md`<br>Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | 組織全体 | IT/DevOps が配布、ユーザーは override 不可 |
| **User Instructions** | `~/.claude/CLAUDE.md` | ユーザー全体 | 個人設定（バージョン管理外） |
| **Project Instructions** | `./CLAUDE.md` または `./.claude/CLAUDE.md` | プロジェクト・チーム | git 管理（チーム共有） |
| **Local Instructions** | `./CLAUDE.local.md` | 個人・このリポジトリだけ | `.gitignore` 推奨 |

**サブディレクトリ走査**: `foo/CLAUDE.md` → `foo/bar/CLAUDE.md` の順で、ディレクトリを下降するたびに該当階層を遅延ロード。同一ディレクトリ内では `CLAUDE.md` → `CLAUDE.local.md` の順。

#### 設定方法・サイズ制限

| ファイル | 初回サイズ制限 | 推奨上限 | 超過時動作 |
|---|---|---|---|
| CLAUDE.md | **4 MiB まで全文ロード。4 MiB 超はスキップ** | **200行/ファイル** | 4 MiB 以内なら全てロードされるが、行数が増えるとトークン消費が増え、Claudeの遵守率が低下する |
| MEMORY.md | **200行 or 25KB（先着順）** | 同じ | 超過するとロードは成功するが**エラーが返る**。**YAML frontmatter・ブロックレベルHTMLコメントは計測から除外**される（ロード対象になる本文のみで判定される） |
| Rules ファイル | 明示記述なし [要確認: 公式ドキュメント参照] | 1機能1ファイル | - |

公式引用（[memory](https://code.claude.com/docs/en/memory)）:
> "CLAUDE.md files are loaded into the context window at the start of every session, consuming tokens alongside your conversation."
> "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence."
> "The first 200 lines of MEMORY.md, or the first 25KB, whichever comes first, are loaded at the start of every conversation."
> "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file."

#### インポート構文（`@path`）

CLAUDE.md内の任意箇所で `@path/to/file` 形式により他ファイルを取り込める。

**仕様**:
- **相対パス**: インポート元ファイル基準（ワーキングディレクトリ基準ではない）
- **絶対パス**: `/path/to/file` 対応
- **ホームディレクトリ**: `@~/.claude/my-project-instructions.md` 対応
- **再帰**: 最大 **4 hops**
- **タイミング**: セッション開始時に展開（遅延ロードではない）
- **コードスパン／コードフェンス内は展開されない**: import のパースは Markdown の code span（バッククォート）と fenced code block を**スキップ**する。`@path` を文字どおり書きたい場合はバッククォートで囲めばよい
- **project レベルの外部インポートは初回に承認ダイアログ**: project スコープの CLAUDE.md がプロジェクト外のファイルを import すると、初回に承認を求められる。**拒否するとそのインポートは以後無効**になり、ダイアログは再表示されない
- **Cowork セッションの制限**: Cowork セッションでは、user スコープのファイルからのプロジェクト外パス・symlink 経由の import は**スキップ**される

実装例:
```markdown
# プロジェクト概要
See @README.md for project overview and @package.json for npm commands.

# 詳細指示
- Gitワークフローについては @docs/git-instructions.md を参照すること
- 環境変数の一覧は @docs/env-vars.md にまとめている
- 個人用補助指示: @~/.claude/personal-overrides.md
```

#### frontmatter サポート
- CLAUDE.md: **サポートなし**
- Rules: **YAML frontmatter で `paths` 指定可**（後述）
- MEMORY.md: **サポートなし**

#### HTMLコメント
`<!-- comment -->` は context ロード時に削除される（ユーザー注釈用に使用可）。

#### `/init` コマンド
- CLAUDE.md が存在しない場合: コードベースを分析して **自動生成**
- CLAUDE.md が存在する場合: **改善提案のみ**（既存ファイルを上書きしない）
- インタラクティブモード: `CLAUDE_CODE_NEW_INIT=1` でマルチフェーズ対話形式
- `/init` が読む他エージェントの設定: 既定で **Cursor rules・Copilot rules**。`CLAUDE_CODE_NEW_INIT=1` ではさらに **`AGENTS.md`・`.devin/rules/`・`.windsurf/rules/`・`.clinerules`** も読む

#### AGENTS.md の扱い

公式は「**Claude Code が読むのは `CLAUDE.md` であって `AGENTS.md` ではない**」と明言している。取り込むには次の2手段がある:

| 手段 | 書き方 | 注意 |
|---|---|---|
| **インポート（推奨）** | `CLAUDE.md` に `@AGENTS.md` を書く | Windows でも追加権限が不要。**Windows では公式もこちらを推奨** |
| **symlink** | `CLAUDE.md` を `AGENTS.md` への symlink にする | Windows では Administrator 権限または Developer Mode が要る |

#### 公式が推奨する記述構造

**Include（書くべきこと）**:
- Bash コマンドのうち Claude が推測できないもの
- 言語デフォルトと異なるコードスタイル規則
- テストの実行方法・推奨テストランナー
- リポジトリ作法（ブランチ命名、PR 規約）
- このプロジェクト固有の設計判断
- 開発環境の癖（必要な環境変数）
- よくある罠・非自明な振る舞い

**Exclude（書くべきでないこと）**:
- コードを読めば Claude にわかること
- 言語の標準的慣習（Claude が既知）
- API ドキュメントの詳細（リンクで誘導するべき）
- 頻繁に変わる情報
- 長文の説明・チュートリアル
- ファイルごとの逐次的説明
- "clean code を書け" など自明な原則

**公式推奨例（[best-practices](https://code.claude.com/docs/en/best-practices)）**:
```markdown
# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you're done making a series of code changes
- Prefer running single tests, and not the whole test suite, for performance
```

#### 公式が明示するアンチパターン
1. **200行超過**: 重要ルールが埋没し、無視されやすくなる
2. **矛盾する複数指示**: Claude がどれかを任意に選択する
3. **コードから自明な情報の重複**: トークンの無駄
4. **API ドキュメントの詳細記載**: 公式 docs へのリンクで代替
5. **多段階手順を直書き**: L2 Skill（`.claude/skills/<name>/SKILL.md`）に切り出すべき

**`/doctor` の CLAUDE.md トリム提案**: checked-in CLAUDE.md に対し `/doctor` がトリム候補を提案する。コードベースから導出可能な内容を削る一方、pitfall・rationale・ツール既定と異なる規約は保持対象として残す。

#### Managed Policy（組織レベル）
- 配置: 上記4階層の最上位（OSごとに固定パス）
- 特性:
  - 組織全体・全ユーザー・全プロジェクトで自動ロード
  - ユーザーは除外・override **不可**
  - 代替として `managed-settings.json` の `claudeMd` キーで内容指定も可
- 用途: コンプライアンス指示、セキュリティ規約、組織共通の禁止事項

---

### 2.2 Rules（`.claude/rules/`）

#### 仕組み
`.claude/rules/` 配下の Markdown ファイル群を、**ファイルパス条件付き**で遅延ロードする仕組み。CLAUDE.md は全ファイルに常時適用される一方、Rules は「特定パスのファイルを Claude が触るときだけ」コンテキストへ追加される。

#### ディレクトリ構造
```
.claude/
├── CLAUDE.md
└── rules/
    ├── code-style.md
    ├── testing.md
    ├── security.md
    ├── frontend/
    │   └── react.md
    └── backend/
        └── api.md
```

- ファイル形式: Markdown（`*.md`）
- 命名: 説明的トピック名推奨（`testing.md`, `api-design.md`）
- 自動発見: 配下の `.md` ファイルを再帰的に検出
- Project-level: `.claude/rules/`
- User-level: `~/.claude/rules/`（全プロジェクト共通）

#### Path-Specific Rules（YAML frontmatter）

YAML frontmatter の `paths` フィールドで Glob パターンを指定すると、該当するファイルを Claude が読むときだけそのルールが context に追加される。

**サポートする Glob 構文**:
- `**/*.ts` — 全ディレクトリの TypeScript ファイル
- `src/**/*` — `src/` 以下すべて
- `*.md` — プロジェクトルートの Markdown のみ
- `src/components/*.tsx` — 特定ディレクトリのみ
- `src/**/*.{ts,tsx}` — ブレース展開対応

**実装例**（`.claude/rules/frontend.md`）:
```markdown
---
paths:
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
---

# Frontend ルール

- React コンポーネントは関数コンポーネントで書く
- ステート管理は Zustand を使用（Redux は使わない）
- スタイルは Tailwind を使い、CSS Modules は新規追加しない
```

**ロード条件**:
- frontmatter なし → 無条件ロード（CLAUDE.md と同等）。**ロード順は `.claude/CLAUDE.md` と同順位**で、セッション起動時に読まれる
- `paths` あり → 該当ファイル読取時のみロード

**`paths` の展開予算**:

| 項目 | 仕様 |
|---|---|
| ブレース展開の上限 | **1ルールの `paths` 全体で、展開後 1,000 パターン・4 MiB** |
| 超過時の挙動 | 超過したパターンは**未展開のまま使われる**（リテラルの `{}` を含む文字列として扱われ、結果として**何にもマッチしない**） |
| `[` の扱い | glob のブラケット式として解釈される。リテラルの `[` を書くにはエスケープが必要 |
| symlink 経由のパス | **symlink 経由のパスでもマッチする** |

> **`--setting-sources` との関係**: `--setting-sources` から `project` を外すと **project の Rules はスキップされる**。

> **`/cd` によるセッション移動**: `/cd` でセッションを移動すると、**移動先の project settings・hooks・`.mcp.json` サーバー（通常の承認プロンプト経由）・skills・agents が `--resume` を待たずに即時有効になる**（§3.3 も参照）。

#### Symlink サポート
- `.claude/rules/` 内で symlink 可
- 循環参照は自動検出される
- **`claudeMdExcludes` の symlink 除外**: symlink された `.claude/rules` のファイル／ディレクトリも `claudeMdExcludes` で除外できる（§3.3 参照）

#### CLAUDE.md との優先順位（ロード順）
```
Managed Policy
  ↓
User CLAUDE.md / User rules
  ↓
Project CLAUDE.md / Project rules
  ↓
Local CLAUDE.local.md
```
後にロードされたものが優先（上書き）。

#### CLAUDE.md vs Rules の使い分け

| 条件 | 推奨 |
|---|---|
| 全ファイル共通の常時ルール | CLAUDE.md |
| ファイル種別ごとに異なるルール | Rules（`paths` で限定） |
| 大規模プロジェクト・モノレポ | Rules でモジュール化 |
| 200行を超えそうな CLAUDE.md | Rules へ分割 |

公式引用（[memory](https://code.claude.com/docs/en/memory)）:
> "For larger projects, use .claude/rules/ to keep instructions modular. Rules can be scoped to specific file paths, so they only load into context when Claude works with matching files, reducing noise and saving context space."

---

### 2.3 Auto Memory（`MEMORY.md` + topic files）

#### 仕組み
Claude が **自身の判断で書き込む** 永続的メモリ機構。修正履歴・デバッグ知見・ユーザーの嗜好などを保存し、セッション間で引き継ぐ。

#### 保存場所
```
~/.claude/projects/<project>/memory/
├── MEMORY.md              # インデックス・初回ロード対象
├── debugging.md           # topic file・遅延ロード
├── api-conventions.md     # topic file・遅延ロード
└── ...
```

**プロジェクト識別**:
- gitリポジトリ: 全 worktree・サブディレクトリが同一 memory を共有
- git 外: プロジェクトルートで識別
- マシンローカル保存（クラウドストレージ非対応）

**`modified` frontmatter フィールド**: Claude が YAML frontmatter を持つメモリファイルへ書き込むと、書き込み時刻を ISO 8601 タイムスタンプとして `modified` フィールドに記録する。既存 frontmatter を持つファイルのみ次回書き込み時に付与され（古いバージョンで作成されたファイルも含む）、frontmatter を持たないファイルに新規追加されることはない。

**カスタム保存先**（`~/.claude/settings.json`）:
```json
{
  "autoMemoryDirectory": "~/my-custom-memory-dir"
}
```

- `autoMemoryDirectory` の値は **絶対パスか `~/` 始まり**でなければならない（相対パスは不可）
- `autoMemoryDirectory` を **project 設定に置いた場合**は、hooks と同じ **workspace trust の規則**に従う（未 trust のワークスペースでは適用されない）
- **`CLAUDE_CODE_PROJECT_DIR_NAME` との併用**: `CLAUDE_CONFIG_DIR` と併せて指定すると、複数のチェックアウトが `<config dir>/projects/<name>/` を**共有**する（同じプロジェクトの worktree／クローンで memory を1つにまとめたいときに使う）
- **⚠ 設定場所の制約**: **プロジェクトレベル `.claude/settings.json` の `env` からは `CLAUDE_CONFIG_DIR` を設定できない**（`CLAUDE_CODE_TMPDIR` / `TMPDIR` / `TMP` / `TEMP` も同様）。**shell・user・managed settings で設定すること**。上記の `CLAUDE_CODE_PROJECT_DIR_NAME` × `CLAUDE_CONFIG_DIR` の併用も、この制約の下で行う（[L4_AUTOMATION.md §2.1 スコープ階層](./L4_AUTOMATION.md) にも収録）

**保持・スコープに関する注意**:
- メモリディレクトリは **`cleanupPeriodDays` の retention sweep の対象外**（古くなっても自動削除されない）
- main conversation の auto memory は **subagent にロードされない**（**fork のみ例外**——fork は親会話をまるごと継承するため）
- **`desktopSessionCleanupPeriodDays` 設定**: Claude Desktop / Cowork が書いたセッションは、**アプリ内にある間は保持され、この設定が免除期間の上限を定める**（上記「`cleanupPeriodDays` の対象外」と隣接する retention 系の設定）

#### 記憶タイプ（4種）

公式 `memory` ページが明記する4分類。**種別はメモリファイルの YAML frontmatter の `type` フィールドに記録される**（"Claude records the kind as a `type` field in the memory file's frontmatter"）:

| タイプ | 意味 | 書き込みタイミング |
|---|---|---|
| **user** | ユーザーの役割・好み・知識・責任範囲 | ユーザーの自己紹介・背景発言から |
| **feedback** | 「こうしないで」「こうして」の指示、成功確認 | 修正された / 褒められた直後 |
| **project** | 進行中の作業・締切・関係者・意思決定の背景 | プロジェクト固有事情を聞いた時 |
| **reference** | 外部システムへのポインタ（Linear、Grafana等） | 「ここを見て」と言われた時 |

公式引用（[memory](https://code.claude.com/docs/en/memory)）:
> "Claude saves notes for itself as it works: build commands, debugging insights, architecture notes, code style preferences, and workflow habits."
> "Claude records the kind as a `type` field in the memory file's frontmatter."

#### 初回ロード制限（厳格）
- **MEMORY.md**: 200行 OR 25KB（先着順、超過部分は非ロード）
- **Topic files**: 初回ロード対象外、必要時に Claude が明示的に Read

→ MEMORY.md は **索引** として運用し、本文を topic files に分離する設計が前提。

#### 有効化・無効化
- デフォルト: ON
- UI トグル: `/memory`
- 設定:
  ```json
  { "autoMemoryEnabled": false }
  ```
- 環境変数: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`

#### 関連コマンド

| コマンド | 動作 |
|---|---|
| `/memory` | メモリ・rules・CLAUDE.md を一覧表示・編集。GUI エディタを閉じるのを待たずに操作を継続できる |
| `/remember` | Auto memory へユーザーが明示的に追加 |
| ~~`/forget`~~ | **非実在**（§4 参照）。公式 `commands` ページに一度も現れない |
| `/import` | 他コーディングエージェントの設定を取り込む（`AGENTS.md` 等の内容を該当 CLAUDE.md へ追記し、MCP サーバー・commands・subagents・skills も移送する） |
| `/init` | CLAUDE.md 自動生成または改善提案 |
| `/compact` | コンテキスト圧縮（圧縮後も L1 は再ロードされる） |
| `/clear` | セッションを全クリア |

#### 上書き・削除のルール
- Claude は基本的に **追記**（自動削除はしない）
- ユーザーは plain Markdown として自由編集可
- `/memory` UI から削除可
- 書き込み判定:
> "Claude doesn't save something every session. It decides what's worth remembering based on whether the information would be useful in a future conversation."

---

## 3. L1 固有のベストプラクティス

> 横断的な設計原則（"Explore first, then plan, then code" 等）は [BEST_PRACTICES.md](./BEST_PRACTICES.md) を参照。本セクションは L1 特有のものに限定。

### 3.1 推奨される使い方（Do）
- **CLAUDE.md は200行以下を厳守**: 超過しそうなら Rules に分割する
- **`@import` で構造化**: 巨大ファイルを避け、`@docs/git.md` のような分割を活用
- **Path-scoped Rules で context 節約**: フロントエンド/バックエンドで切り分ける
- **Auto Memory の MEMORY.md は索引**: 本文は topic files に分離（200行/25KB制限のため）
- **チーム共有は `./CLAUDE.md`、個人補助は `./CLAUDE.local.md`**: `.gitignore` 設計を明確に
- **`/init` で初回生成**: 既存コードベースに対しては `/init` で基礎を作ってから手動編集

### 3.2 避けるべき使い方（Don't）
- CLAUDE.md に多段階手順を書く → L2 Skill 化する
- CLAUDE.md で **強制したいルール** を書く → L4 Hooks（決定的）または `settings.json permissions`（強制）を使う
- 矛盾する複数指示を同居させる（Claude が任意に選ぶ）
- コードを読めばわかる事項を重複記述する
- 頻繁に変わる情報（進行中バグ・リリース日程）を CLAUDE.md に書く → 都度プロンプトまたは Auto Memory へ
- Auto Memory に依存しきって CLAUDE.md を空にする（Auto Memory は補助、明示指示の代替ではない）
- Path-scoped Rules を細分化しすぎる（10ファイル超になったら統合を検討）

### 3.3 パフォーマンス・安定性の考慮点
- CLAUDE.md と全 Rules の合計が **2000行を超える**と context window 圧迫が顕在化する目安（[要確認: 公式の明示数値ではない、経験則]）
- `@import` は最大 4 hops → 循環参照は自動検出されるが、深いネストは可読性のため避ける
- Managed Policy はユーザーが override 不可なので、**禁止事項のみ**書き、推奨事項は User/Project 階層で書く
- Monorepo では `claudeMdExcludes`（glob、絶対パスベース）で不要なサブディレクトリ CLAUDE.md を除外できる（公式確認済み: settings.json の `claudeMdExcludes` キーが正式名称）。**symlink された `.claude/rules` のファイル／ディレクトリも除外できる**
- **`--add-dir` 側の CLAUDE.md / rules もロードしたい場合**は `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` を設定する（既定では追加ディレクトリの L1 はロードされない）
- **`permissions.additionalDirectories`（settings.json）と `--add-dir` / `/add-dir` の差**: 前者は**ファイルアクセス許可のみ**で何もロードしない。後者（`--add-dir` / `/add-dir` / SDK の `additionalDirectories`・`add_dirs`）は **`.claude/skills/` と `.claude/commands/` もロードする**（TS オプションと同名だが挙動が違う）。CLAUDE.md については上記の `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` が引き続き必要（出典: `skills`。[L2_SKILLS.md §2.1](./L2_SKILLS.md) に詳細）
- Worktree で作業する場合、`CLAUDE.local.md` は worktree ごとに別ファイル扱いになる → 共有したい設定は `~/.claude/CLAUDE.md` または `@~/.claude/...` インポートで吸収

---

## 4. このファイルの `[要確認]` 項目

| 項目 | セクション | 状態 |
|---|---|---|
| Rules のサイズ制限の有無 | 2.1 サイズ制限表 | **ファイルサイズ上限の明示は依然なし**。ただし `paths` については**1ルールあたり展開後1,000パターン・4 MiB の予算**が公式に明記された（§2.2 参照）。ファイル本体のサイズ上限は引き続き要確認 |
| 2000行という context 圧迫閾値 | 3.3 | 公式に数値記載なし。経験則のまま |

---

## 5. 公式ドキュメント参照

| 項目 | URL |
|---|---|
| Memory and instructions（L1全体） | https://code.claude.com/docs/en/memory |
| Best practices（CLAUDE.md書き方） | https://code.claude.com/docs/en/best-practices |
| Settings リファレンス [要確認] | https://code.claude.com/docs/en/settings |
| 日本語版 | https://code.claude.com/docs/ja/memory |
