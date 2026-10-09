---
feature: statusline
sources: [https://code.claude.com/docs/en/statusline.md, https://code.claude.com/docs/en/settings-reference.md]
---

# Status line

## 1. 概要

status line は、Claude Code の画面下部に出る1行（または複数行）のバーで、設定したシェルコマンドを実行してその標準出力を表示する。[仕様]

> "It receives JSON session data on stdin and displays whatever your script prints"

- 設定は settings の `statusLine`（`settings:keys/statusLine`）に書く。user settings（`~/.claude/settings.json`）か project settings に置ける。[仕様]
- コマンドは標準入力でセッションの JSON（`statusline:input-fields`）を受け取り、標準出力に書いたものが表示される。複数行・ANSI の色・OSC 8 のリンクを出せる。[仕様]
- 実行のきっかけはセッション開始（resume を含む）と、その後のイベント（新しい assistant メッセージ、`/compact` の完了、permission mode の変更、vim mode の切り替え、`command` の変更、`refreshInterval` の経過、レート制限の `resets_at`・prompt cache の `expires_at` への到達）。更新は 300ms でデバウンスされ、実行中に次の更新が来ると実行中のスクリプトは取り消される。[仕様]
- コンテキストへの効き方: status line はローカルで動き、API のトークンを消費しない。モデルのコンテキストには入らない。[仕様]

  > "The status line runs locally and does not consume API tokens."

- 関連する設定として `subagentStatusLine`（`settings:keys/subagentStatusLine`）があり、エージェントパネルの subagent の各行を自前のコマンドで書き換える。入力は hooks の共通入力フィールド・`columns`・`tasks` 配列で、出力は行ごとに `{"id": "<task id>", "content": "<row body>"}` の JSON を1行ずつ書く。[仕様]

## 2. 使う場面・使わない場面

使う場面 [仕様]:

- 作業中にコンテキストウィンドウの使用率を常に見たい。
- セッションのコストを追いたい。
- 複数のセッションを並行して使い、見分けたい。
- git のブランチや状態を常に見たい。

使わない場面・近い機能との違い:

- 会話中に出た ID をクリックできるリンクにしたいだけなら、スクリプトを書かずに settings の `footerLinksRegexes`（`settings:keys/footerLinksRegexes`）を使う。status line と footer のバッジは併存し、どちらも他方を置き換えない。[仕様]
- status line はモデルの振る舞いを変えない（表示だけ）。Claude に指示や制約を与える目的には使えない。[仕様]（ローカルで動きトークンを消費しない、という記述による）
- 組織で `allowManagedHooksOnly` を使う場合や、`disableAllHooks` が managed 以外で `true` になっている場合、managed settings 以外の `statusLine` は警告なしに動かない。プロジェクト向けに `statusLine` を配っても、そうした環境では表示されない。[仕様]

## 3. 仕様の要約

### 設定（`settings:keys/statusLine`）[仕様]

- 値はオブジェクトで、`type` は `"command"`、`command` は文字列（スクリプトのパスかインラインのシェルコマンド）。`command` はシェルで実行される。
- 任意のフィールド: `padding`（文字数、既定 `0`。UI 既定の余白への追加で、相対的なインデント）、`refreshInterval`（秒、最小 `1`。イベントに加えて一定間隔で再実行する）、`hideVimModeIndicator`（真偽。スクリプトが `vim.mode` を自分で表示するとき、組み込みの `-- INSERT --` を隠す）。
- 既定は未設定（status line なし）。scope は `Any file`。
- 無効にするには `/statusline` で削除を頼むか、`statusLine` を settings から消す。`/statusline` コマンド（`builtin-commands:commands/statusline`）は自然言語の指示から `~/.claude/` にスクリプトを作り、settings を更新する。

### 入力 [仕様]

- フィールドの正は `statusline:input-fields`。各要素の `may_be_absent` は JSON に現れないことがあるフィールド、`nullable` は null になりうるフィールドを示す。
- 判断に効く点:
  - `cwd` と `workspace.current_dir` は同じ値で、公式は `workspace.current_dir` を推奨する（`statusline:input-fields/workspace.current_dir`）。
  - `context_window.used_percentage` は入力トークンだけから計算し、出力トークンを含まない。セッション初期は null になりうる（`statusline:input-fields/context_window.used_percentage`）。
  - `context_window.current_usage` は最初の API 呼び出しの前と `/compact` の直後に null になる。
  - `rate_limits` は claude.ai の Pro・Max の契約者か、spend limit を設定する Claude apps gateway の配下で、最初の API 応答の後にだけ現れる。各ウィンドウは個別に欠ける。
  - `session_id` はセッションの間は変わらず、セッションごとに異なる。キャッシュファイル名の鍵に向く（`$$` などのプロセス ID は毎回変わる）。
- 端末の幅は `tput cols` などでは取れない（出力が端末に直結しないため）。Claude Code が実行前に設定する環境変数 `COLUMNS`・`LINES` を読む。

### 出力と失敗時の挙動 [仕様]

- 標準出力に書いた内容を表示する。各行が1行ずつ表示される。
- 終了コード 0 で終わったときだけ表示する。0 以外で終わるか、何も出力しないと空になる。遅いスクリプトは終わるまで更新を止める。
- 標準エラーは表示されない。`claude --debug` で毎回の標準エラーと、セッション最初の実行の終了コードがログに出る。
- fullscreen rendering 以外では、通知（MCP サーバーのエラー、自動更新、コンテキスト残量の警告など）が status line と同じ行の右側に出て、狭い端末では status line の出力が切れることがある。

### 動く条件（ゲート）[仕様]

`statusLine`・`subagentStatusLine` は次の順で判定される（`settings-reference` の Status line and file suggestion gates）。

- 完全に無効: managed settings が `disableAllHooks` を設定したとき、またはフォルダーが workspace trust を受けていないとき（hooks と同じ規則）。trust 前は `claude --debug` に `Status line command skipped: workspace trust not accepted` が出る。
- managed settings の値だけに絞られる: `allowManagedHooksOnly`（`settings:keys/allowManagedHooksOnly`）が設定されたとき、`disableAllHooks`（`settings:keys/disableAllHooks`）が settings の優先順位を適用した後に managed 以外で `true` のとき、`--safe-mode` で起動したとき。managed の値が無ければ警告なしに無効になる。
- plugin は自分の `settings.json` で `subagentStatusLine` の既定値を配れるが、hooks と違い、managed settings の `enabledPlugins` で強制有効にしても `allowManagedHooksOnly` の下では plugin の値は動かない。

### Windows [仕様]

- Git Bash があれば Git Bash で、無ければ PowerShell でコマンドを実行する。
- Git Bash は引用されないバックスラッシュをエスケープとして扱うため、`command` のパスはスラッシュで書く。`~` は Windows のホームディレクトリに展開される。
- PowerShell のスクリプトは `powershell -NoProfile -File <path>` で呼ぶと、どちらの経路でも動く。

## 4. 設計の指針

- 表示する項目は、利用者が作業中に判断に使うもの（コンテキスト使用率・コスト・ブランチなど）に絞る。status bar の幅は限られ、長い出力は切れるか折り返す。[仕様]
- 欠けうるフィールド・null になりうるフィールドは、必ずフォールバックを持たせて読む（jq の `// 0`・`// empty`、Python の `.get()`、JavaScript の `?.`）。どれが該当するかは `statusline:input-fields` の `may_be_absent`・`nullable` で判断する。[仕様]
- `git status`・`git diff` のような遅い処理は、`session_id` を鍵にした一時ファイルにキャッシュする。スクリプトは頻繁に実行され、遅いと表示の更新が止まる。[仕様]
- 時刻のような時間で変わる値や、main session が idle のあいだに外部で変わる値（背景の subagent による git の状態など）を出すときだけ `refreshInterval` を設定する。それ以外は未設定にしてイベント駆動に任せる。[仕様]
- 色や OSC 8 のリンクは端末・SSH・tmux によって崩れたり無効になったりする。複数行かつエスケープシーケンスを使う出力は崩れやすい。必須でなければ平文の1行を選ぶ。[仕様]
- 置き場所: 個人の好みの表示は user settings（`~/.claude/settings.json`）に置く。project settings に置けば共有できるが、`command` はシェルで実行されるため、リポジトリにスクリプトを置くなら workspace trust の対象になることを前提にする。[仕様]（scope と trust の記述による。user に置くか project に置くかの選び方自体は canon の規律であり、公式の仕様ではない）

## 5. 生成の規約

- `statusLine` は `type: "command"` と `command` を必ず書き、任意のフィールドは必要なものだけ書く。[仕様]
- スクリプトは標準入力の JSON を一度だけ読み、必要なフィールドを取り出して標準出力に書き、終了コード 0 で終える。[仕様]
- Bash の例は `jq` を前提にする（利用者が入れる必要がある）。依存を増やしたくなければ Python か Node.js の標準の JSON 解析を使う。[仕様]
- スクリプトのファイルを作るときは実行権限を付ける（`chmod +x`）。[仕様]
- 生成したスクリプトは、モックの入力で単体で動かして確かめる。[仕様]

最小の例（`~/.claude/settings.json`）:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}
```

`~/.claude/statusline.sh`:

```bash
#!/bin/bash
input=$(cat)
MODEL=$(echo "$input" | jq -r '.model.display_name')
DIR=$(echo "$input" | jq -r '.workspace.current_dir')
PCT=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
echo "[$MODEL] ${DIR##*/} | ${PCT}% context"
```

確かめ方:

```bash
echo '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"/home/user/project"},"context_window":{"used_percentage":25},"session_id":"test-session-abc"}' | ./statusline.sh
```

## 6. 検証ルール

- **V-statusline-01**: settings の `statusLine`（`settings:keys/statusLine`）の値はオブジェクトで、`type` が `"command"`、`command` が空でない文字列である。[仕様]
- **V-statusline-02**: `statusLine` のキーは `type`・`command`・`padding`・`refreshInterval`・`hideVimModeIndicator` のいずれかである（`settings:keys/statusLine`）。[仕様]
- **V-statusline-03**: `statusLine.padding` があれば数値、`statusLine.refreshInterval` があれば `1` 以上の数値、`statusLine.hideVimModeIndicator` があれば真偽値である（`settings:keys/statusLine`）。[仕様]
- **V-statusline-04**: settings の `subagentStatusLine`（`settings:keys/subagentStatusLine`）の値はオブジェクトで、`type` が `"command"`、`command` が空でない文字列である。[仕様]
- **V-statusline-05**: status line のスクリプトが読む入力のフィールドのパス（例: jq の `.model.display_name`）は、`statusline:input-fields` のいずれかの `id`、またはその上位の部分パスに一致する。[仕様]
- **V-statusline-06**: スクリプトが読むフィールドのうち、`statusline:input-fields` で `may_be_absent` か `nullable` が `true` の要素には、読む箇所にフォールバック（jq の `//`、Python の `.get()` か `or`、JavaScript の `?.` か `||` など）がある。[仕様]

## 7. 品質基準

- **Q-statusline-01**: 表示する項目が利用者の要件に結びついていて、端末の幅に収まる長さか。幅に応じて変えるなら `COLUMNS` を使っているか。[仕様]
- **Q-statusline-02**: 遅い処理（git のコマンド・ネットワーク）を毎回実行していないか。キャッシュするなら鍵に `session_id` を使い、プロセス ID を使っていないか。[仕様]
- **Q-statusline-03**: `refreshInterval` を設定するのは、時間で変わる値や idle 中に外部で変わる値を出すときに限られているか。[仕様]
- **Q-statusline-04**: 失敗時に空になる挙動（0 以外の終了・無出力）を踏まえ、依存コマンド（`jq` など）が無い・git リポジトリの外といった状況でも終了コード 0 で何かを出すか。[仕様]
- **Q-statusline-05**: Windows で使う想定なら、`command` のパスをスラッシュで書き、PowerShell のスクリプトは `powershell -NoProfile -File` で呼んでいるか。[仕様]
- **Q-statusline-06**: 対象の環境が `allowManagedHooksOnly` や `disableAllHooks` を使っていて、managed 以外の `statusLine` が動かない可能性を、配置の判断で考慮しているか。[仕様]
- **Q-statusline-07**: 色・OSC 8・複数行を使う場合、それが要件に必要で、崩れたときに平文へ戻せるか。[仕様]

## 8. 出典

spec:

- https://code.claude.com/docs/en/statusline.md
- https://code.claude.com/docs/en/settings-reference.md

insight:

- （なし）
