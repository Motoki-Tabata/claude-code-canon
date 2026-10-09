---
feature: permissions
sources:
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/permission-modes.md
  - https://code.claude.com/docs/en/sandboxing.md
  - https://code.claude.com/docs/en/tools-reference.md
  - https://code.claude.com/docs/en/settings-reference.md
---

# Permissions

## 1. 概要

permissions は、Claude Code がどのツールを・どの対象に・確認なしで使えるかを決める仕組みで、次の3つから成る。

- **permission 規則** [仕様]: settings の `permissions.allow`・`permissions.ask`・`permissions.deny` に `Tool` または `Tool(specifier)` の形で書く。書式は `permissions:rule-syntax`、ツール名は `tools:tools` を参照する。
- **permission モード** [仕様]: セッションの基準線（何を確認なしで実行するか）を決める。`permissions.defaultMode` か `--permission-mode` で選ぶ。値は `permissions:modes` を参照する。
- **サンドボックス** [仕様]: Bash・PowerShell・Monitor のコマンドとその子プロセスに対し、OS がファイルシステムとネットワークの境界を強制する。設定キーは `permissions:sandbox-keys` を参照する。

規則は Claude Code が強制し、モデルの判断に依存しない [仕様]。

> "Permission rules are enforced by Claude Code, not by the model. Instructions in your prompt or `CLAUDE.md` shape what Claude tries to do, but they don't change what Claude Code allows."

コンテキストへの効き方 [仕様]: ツール名だけの deny 規則（例: `Bash`・`Bash(*)`、ツール名のグロブ）はそのツールを Claude のコンテキストから取り除き、Claude はそのツールを見なくなる。specifier 付きの deny 規則（例: `Bash(rm *)`）はツールを残し、一致した呼び出しだけを止める。例外は `tools:tools/EndConversation` で、ほかに使えるツールが残る限り deny・ask 規則の対象にならない。

## 2. 使う場面・使わない場面

| 目的 | 使うもの | 根拠 |
|---|---|---|
| 特定のツール・コマンド・パス・ドメインを確認なしで許す、必ず確認させる、禁じる | permission 規則 | [仕様] |
| セッション全体の確認の度合いを決める（CI で事前承認だけに絞る、計画だけさせる等） | permission モード | [仕様] |
| コマンドの書き方に依存せず、シェルコマンドの読み書き先と通信先を OS レベルで制限する | サンドボックス | [仕様] |
| コマンド全文を独自のロジックで検査して許可・拒否する | `hook-events:events/PreToolUse` の Hook | [仕様] |
| Claude に望ましい振る舞いを伝える（強制はしない） | `CLAUDE.md` | [仕様] |

近い機能との違い:

- **規則とサンドボックス** [仕様]: 規則はツールの実行前にコマンド文字列で判定し、全ツールに効く。サンドボックスは実行中のプロセスに OS が強制し、シェルコマンドだけに効く。Bash の規則は Claude が書いたコマンド文字列に一致するだけなので、`/usr/bin/curl` や `sh -c 'curl …'` には一致しない。

  > "a deny or ask rule covers the invocation Claude usually produces and isn't a security boundary around the program."

  境界として守らせたいときは、規則とサンドボックスを併用する。
- **サンドボックスの外で動くもの** [仕様]: Read・Edit・Write・WebFetch・WebSearch などの組み込みツールは規則に従い、サンドボックスの設定（`denyRead`・`allowedDomains`）は効かない。command Hook・ローカルの MCP サーバー・LSP サーバー・status line のコマンドなどはユーザーの全権限で動く。
- **規則と Hook** [仕様]: PreToolUse Hook は許可プロンプトの前に動き、拒否・プロンプトの強制・プロンプトの省略ができる。ただし Hook が `"allow"` を返しても、一致する deny 規則は止め、一致する ask 規則はプロンプトを出す。exit code 2 で止める Hook は allow 規則より先に効く。
- **サンドボックスの auto-allow と auto モード** [仕様]: auto-allow はサンドボックスの境界がコマンドを閉じ込めるので Bash を承認し、auto モードは分類器が各操作を審査する。別物で、組み合わせられる。
- **運用の選択肢** [仕様]: Claude Code のプロセス全体を隔離する（コンテナ・VM・sandbox runtime）のは選定ガイドの選択肢として扱い、この機能ファイルの範囲外とする。

## 3. 仕様の要約

### 3.1 規則の評価

- 評価順は deny → ask → allow で、最初に一致したものが結果を決める。具体性は順序を変えない [仕様]。広い deny（`Bash(aws *)`）は、狭い allow（`Bash(aws s3 ls)`）にも一致する呼び出しを止め、allow で deny に例外を作ることはできない [仕様]。
- どのスコープの deny も、ほかのスコープの allow より優先する。managed 設定の規則は、コマンドライン引数を含むほかのどの層からも覆せない [仕様]。
- プロジェクトの `.claude/settings.json` の `permissions.allow` と `permissions.additionalDirectories` は、そのフォルダーのワークスペース信頼を受け入れてから効く。deny・ask は制限するだけなので信頼に左右されない [仕様]。`claude -p` と SDK では信頼のダイアログが出ないので、プロジェクトの allow 規則は使われない [仕様]。
- 「Yes, and don't ask again」で保存される規則は、git リポジトリのルートの `.claude/settings.local.json` に書かれる。ファイル編集の承認はセッションの終わりまでで、ファイルには保存されない [仕様]。

### 3.2 書式の要点

書式の一覧は `permissions:rule-syntax` を正とする。判断に要る要点だけを挙げる。

- Bash の `*` は空白を含む任意の文字列に一致し、`*` より前の語がそのまま照合される。`Bash(git *)` は git の全サブコマンドを許すので、`*` はサブコマンドの後ろに置く [仕様]。
- 複合コマンドは部分コマンドに分けて照合し、allow は全部分コマンドに一致する必要がある [仕様]。`timeout` などの決まったラッパーは照合前に取り除くが、`npx`・`docker exec`・`devbox run` などの実行環境ランナーは取り除かないので、`Bash(devbox run *)` は後ろに続く任意のコマンドを許してしまう [仕様]。
- ファイルの規則は `Read(path)` と `Edit(path)` だけが参照される。`Write(path)`・`NotebookEdit(path)`・`Glob(path)` は受け付けられても参照されない [仕様]。`Read` の deny は同じパスの Edit・Write も止める [仕様]。
- パスのアンカー: `//path` が絶対パス、`~/path` がホーム、`/path` は設定ファイルの出どころからの相対（project 設定では主作業ディレクトリ、user 設定では `~/.claude`）、`path`・`./path` は現在のディレクトリからの相対 [仕様]。

  > "A pattern like `/Users/alice/file` isn't an absolute path. The single leading slash anchors at the settings source, not the filesystem root."
- Read・Edit の deny は組み込みのファイルツール、Claude Code が認識する Bash のファイルコマンド（`cat`・`sed` など）、リダイレクト先に効くが、ファイル名を書かずに読むコマンドや任意のサブプロセスには効かない [仕様]。
- パラメーター照合 `Tool(param:value)` は deny・ask でだけ使え、`command`・`file_path` などの主要な内容フィールドには使えない [仕様]。
- 設定ファイルに書いた括弧付きの `mcp__` 規則は読み飛ばされる [仕様]。
- 規則と Hook の matcher は表示ラベルではなく正規のツール名に一致する（例: 表示 `Stop Task` → 正規名 `TaskStop`）[仕様]。正規名は `tools:tools` を参照する。

### 3.3 モード

モードの一覧と各モードの性質は `permissions:modes` を正とする。

- 起動時のモードは `--permission-mode`（または `--dangerously-skip-permissions`）→ 設定ファイルの `permissions.defaultMode` → 組み込みの既定、の順に決まる [仕様]。
- プロジェクトの `.claude/settings.json`・`.claude/settings.local.json` に書いた `auto` と `bypassPermissions` は効かない（`permissions:modes` の `honored_from_project_settings`）[仕様]。
- deny 規則は `bypassPermissions` を含む全モードで止める。allow 規則は `bypassPermissions` では意味を持たない [仕様]。
- どのモードでも自動承認しないもの [仕様]: 明示の ask 規則に一致するツール、`AskUserQuestion` などユーザーの操作が要るツール、critical path（ルート・ホーム・作業ディレクトリなど）を対象にする `rm`・`rmdir` など。critical path の削除は allow 規則でも PreToolUse Hook の `"allow"` でも承認されない。
- 保護パス（`.git`・`.claude`・`.vscode`・シェルの起動ファイル・`.mcp.json` など）への書き込みは、`permissions.allow` では事前承認できない [仕様]。モードごとの扱いは `permissions:modes` の `protected_path_writes`。
- `dontAsk` は、プロンプトが出るはずの呼び出しを拒否し、事前承認したものだけを動かす。CI やスクリプト向け [仕様]。
- auto モードに入ると、任意コード実行を許す広い allow 規則（`Bash(*)`・`Bash(python*)` のようなインタープリターのワイルドカード、パッケージマネージャーの run、`Agent` の allow、`Monitor` の allow）は外され、`Bash(npm test)` のような狭い規則は残る [仕様]。auto モードでは、サブエージェントの frontmatter の `permissionMode`（`frontmatter:subagent/permissionMode`）は無視される [仕様]。

### 3.4 サンドボックス

設定キーの一覧・既定値・置けるスコープは `permissions:sandbox-keys` を正とする。

- 既定では無効で、`sandbox.enabled` を `true` にするか `/sandbox` で有効にする。macOS・Linux・WSL2 で動き、ネイティブの Windows では動かない [仕様]。
- 既定の境界 [仕様]: 書き込みは作業ディレクトリ・ユーザーごとの一時ディレクトリ・追加ディレクトリ。読み取りは `~/.ssh` などの認証情報ファイルを含むほぼ全体。ネットワークはプロキシ経由で、許可ドメインは初期値が空。
- `sandbox.autoAllowBashIfSandboxed`（既定 `true`）のとき、サンドボックス内で動くコマンドはプロンプトなしで実行される。deny 規則と、内容を指定した ask 規則（`Bash(git push *)`）は引き続き効く [仕様]。
- サンドボックスの外で動かす経路は `sandbox.excludedCommands` と、失敗後の `dangerouslyDisableSandbox` による再試行。`sandbox.allowUnsandboxedCommands: false` で再試行を止める [仕様]。
- `Edit` の allow 規則・`Read`/`Edit` の deny 規則・`WebFetch(domain:...)` の規則は、サンドボックスの設定と統合されて最終的な境界になる [仕様]。
- キーによって置けるスコープが違う。`permissions:sandbox-keys` の `scope` が `user-or-managed`・`managed` のキー（例: `sandbox.filesystem.disabled`・`sandbox.network.strictAllowlist`）は、リポジトリの設定ファイルに書いても効かない [仕様]。
- サンドボックスがプラットフォームや依存の都合で起動できないとき、既定ではサンドボックスなしで実行する。起動を止めるには `sandbox.failIfUnavailable` を使う [仕様]。

### 3.5 ツール

- ツール名は permission 規則・サブエージェントの tools・Hook の matcher に書く正確な文字列で、一覧は `tools:tools` を正とする [仕様]。
- 同じ規則の書式は `--allowedTools`・`--disallowedTools`、skill の `frontmatter:skill/allowed-tools`、Hook の `if` 条件でも使われる [仕様]。Hook の `matcher` は括弧付きの書式ではなく素のツール名を使う [仕様]。
- macOS・Linux・WSL では `Glob` と `Grep` は既定のツールセットに含まれず、検索は Bash の `find`・`grep` として行われ、Hook と規則には `Bash` の呼び出しとして届く [仕様]。

## 4. 設計の指針

- **秘密情報は deny 規則とサンドボックスの両方で守る** [仕様]。`Read(./.env)`・`Read(./secrets/**)` の deny は組み込みツールを止めるが任意のサブプロセスは止めないので、OS レベルで止める必要があれば `sandbox.filesystem.denyRead` か `sandbox.credentials.files` を併用する。
- **ネットワーク制限を Bash の規則だけに頼らない** [仕様]。公式は `curl`・`wget` を deny し、許すドメインは `WebFetch(domain:...)` で与え、境界として守らせるならサンドボックスの許可ドメインと組み合わせることを勧めている。WebFetch の規則だけでは Bash からの通信は止まらない。
- **allow は狭く書く** [仕様]。`*` はサブコマンドの後ろに置き、実行環境ランナー（`npx`・`docker exec` など）には内側のコマンドまで含めた規則を1つずつ書く。
- **確認を挟みたい不可逆な操作は ask にする** [仕様]。ask 規則は auto モードでもプロンプトを出し、`dontAsk` では拒否になる。会話で伝えた境界は規則として保存されず、コンパクションで失われることがあるので、確実に止めたいものは deny 規則にする。
- **サンドボックスで足りない書き込み先・通信先は、除外ではなく許可リストで足す** [仕様]。公式は `excludedCommands` で丸ごと外すより `allowWrite`・`allowedDomains` で必要な場所だけ開けることを勧めている。`excludedCommands` に `docker *` のような広いパターンやインタープリターを入れると、Claude が書いたファイルをサンドボックス外で実行できてしまう。
- **`bypassPermissions` は隔離環境だけで使う** [仕様]。プロンプトインジェクションへの防御が無く、公式はコンテナ・VM でだけの使用を求めている。確認を減らしたいときの代替は auto モードかサンドボックスの auto-allow。
- **組織のポリシーは managed 設定に置く** [仕様]。`permissions.disableBypassPermissionsMode`・`disableAutoMode`・`allowManagedPermissionRulesOnly`・`sandbox.network.allowManagedDomainsOnly` などのロックは managed 設定で覆せなくなる。プロジェクトに配置するカスタマイズでは扱わない。

## 5. 生成の規約

書き方の型（プロジェクトの `.claude/settings.json`）[仕様]:

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "ask": ["Bash(git push *)"],
    "deny": ["Read(./.env)", "Read(./secrets/**)", "Bash(curl *)"]
  },
  "sandbox": {
    "enabled": true,
    "network": { "allowedDomains": ["registry.npmjs.org"] }
  }
}
```

規約:

- ツール名は `tools:tools` の正規名で書く。specifier の書式は `tools:tools` の `rule_format` が指す `permissions:rule-syntax` の要素に従う [仕様]。
- パスの規則は `Read(...)` か `Edit(...)` で書き、`Write(...)`・`NotebookEdit(...)`・`Glob(...)` にパスを書かない [仕様]。絶対パスは `//` で始める [仕様]。
- MCP ツールの規則は括弧を付けずに `mcp__<server>` か `mcp__<server>__<tool>` で書く。allow でグロブを使うときは `mcp__<server>__` の後ろにだけ置く [仕様]。
- プロジェクトの設定ファイル（`paths:files/project:.claude/settings.json`・`paths:files/local:.claude/settings.local.json`）の `permissions.defaultMode` には、`permissions:modes` の `honored_from_project_settings` が `true` の値だけを書く [仕様]。
- プロジェクトの設定ファイルに、`permissions:sandbox-keys` の `scope` が `any-file` でないキーを書かない [仕様]。
- 生成物で `permissions.defaultMode` に `bypassPermissions` を書かない。これは canon が決めた規律で、公式の仕様ではない（公式はプロジェクト設定の `bypassPermissions` が効かないと定めている）。

## 6. 検証ルール

- **V-permissions-01**: `permissions.allow`・`permissions.ask`・`permissions.deny` の各規則のツール名部分（最初の `(` より前）は、`tools:tools` のいずれかの `id`、`mcp__` で始まる名前、`Cd`、または（ask・deny に限り）グロブのいずれかである。[仕様]
- **V-permissions-02**: `permissions.allow` の規則のツール名部分にグロブ（`*`）を含むなら、そのツール名は `mcp__<server>__` で始まり、`<server>` にグロブを含まない（`permissions:rule-syntax/*`・`permissions:rule-syntax/mcp__<server>__<tool>`）。[仕様]
- **V-permissions-03**: 規則のツール名部分が `Write`・`NotebookEdit`・`Glob`・`MultiEdit` のとき、括弧付きのパス指定を持たない（パスの規則は `permissions:rule-syntax/Read`・`permissions:rule-syntax/Edit` で書く）。[仕様]
- **V-permissions-04**: 設定ファイルの規則で、ツール名が `mcp__` で始まるものは括弧を持たない。[仕様]
- **V-permissions-05**: どの規則も、主要な内容フィールドへのパラメーター照合（`Bash(command:`・`PowerShell(command:`・`Read(file_path:`・`Edit(file_path:`・`Write(file_path:`・`Grep(path:`・`Glob(path:`・`NotebookEdit(notebook_path:`・`WebFetch(url:`）を持たない。[仕様]
- **V-permissions-06**: `Bash(...)`・`PowerShell(...)` の規則の中身で、`:*` は末尾にだけ現れる。[仕様]
- **V-permissions-07**: どの設定ファイルでも、`permissions.defaultMode` の値は `permissions:modes` のいずれかの `id` か `aliases` の要素である。[仕様]
- **V-permissions-08**: プロジェクトの `.claude/settings.json` と `.claude/settings.local.json` では、`permissions.defaultMode` の値（別名は解決した値）が `permissions:modes` の `honored_from_project_settings.value` が `true` の要素である。[仕様]
- **V-permissions-09**: 設定ファイルの `sandbox` 以下のキーは、`permissions:sandbox-keys` のいずれかの `id` と一致する（credentials の各項目のフィールドと `tlsTerminate` の中身を除く）。[仕様]
- **V-permissions-10**: プロジェクトの `.claude/settings.json` と `.claude/settings.local.json` には、`permissions:sandbox-keys` の `scope` が `user-or-managed` または `managed` のキーを書かない。[仕様]

## 7. 品質基準

- **Q-permissions-01**: 守るべき秘密（`.env`・認証情報・鍵）があるプロジェクトで、Read の deny 規則があり、サブプロセスからも守る必要があるならサンドボックスの `denyRead` か `credentials` で補っているか。[仕様]
- **Q-permissions-02**: 安全のための Bash の deny・ask 規則を、境界として当てにしていないか。迂回できる書き方（絶対パス・`sh -c`・オプションの前置き）があることを踏まえ、必要ならサンドボックスか PreToolUse Hook と組み合わせているか。[仕様]
- **Q-permissions-03**: allow 規則が最小か。`Bash(git *)` のような広い規則、`*` がサブコマンドより前にある規則、実行環境ランナーやインタープリターを丸ごと許す規則が無いか。[仕様]
- **Q-permissions-04**: push・デプロイ・削除など不可逆な操作に、確認を挟みたい要件があるなら ask 規則で表しているか（会話での指示や `CLAUDE.md` の記述だけに頼っていないか）。[仕様]
- **Q-permissions-05**: サンドボックスを使うとき、`excludedCommands` や広い `allowedDomains`・`allowWrite` が、もう一方の層（ファイルシステムとネットワーク）の制限を崩していないか。[仕様]
- **Q-permissions-06**: 選んだモードが用途に合っているか（CI では `dontAsk` と事前承認の allow、探索だけなら `plan`、`bypassPermissions` は隔離環境だけ）。[仕様]
- **Q-permissions-07**: チームで共有する規則と個人の規則が、共有する設定ファイルと個人の設定ファイルに正しく分かれているか。プロジェクトの allow 規則はワークスペース信頼を受け入れるまで効かないことを、運用の前提として踏まえているか。[仕様]

## 8. 出典

- spec
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/permission-modes.md
  - https://code.claude.com/docs/en/sandboxing.md
  - https://code.claude.com/docs/en/tools-reference.md
  - https://code.claude.com/docs/en/settings-reference.md
- insight
  - なし
