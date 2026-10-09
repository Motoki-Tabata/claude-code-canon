---
feature: hooks
sources:
  - https://code.claude.com/docs/en/hooks.md
  - https://code.claude.com/docs/en/hooks-guide.md
  - https://code.claude.com/docs/en/tools-reference.md
---

# Hooks

## 1. 概要

- Hook は、Claude Code のライフサイクルの決まった時点で自動的に動く、利用者が定義したハンドラーである。ハンドラーはシェルコマンド・HTTP エンドポイント・MCP ツール・LLM へのプロンプト・サブエージェントのどれかにできる（`hook-events:handler-types`）。[仕様]
- 狙いは決定的な制御である。[仕様]
  > "which gives you deterministic control: certain actions always happen rather than relying on the LLM to choose to run them."
- 設定は3段の入れ子になる。イベント（`hook-events:events`）→ matcher group（いつ発火するかの絞り込み）→ ハンドラー（`hooks` 配列の要素）。[仕様]
- 置き場所は settings の `hooks`（`settings:keys/hooks`。`paths:files/user:~/.claude/settings.json`・`paths:files/project:.claude/settings.json`・`paths:files/local:.claude/settings.local.json`・managed policy settings）、プラグインの `hooks/hooks.json`、skill の frontmatter（`frontmatter:skill/hooks`）、subagent の frontmatter（`frontmatter:subagent/hooks`）である。settings ファイルを直接編集すると、通常はファイル監視が自動で拾う。[仕様]
- コンテキストへの効き方: Hook の出力のうち Claude のコンテキストに入るのは、`additionalContext`（system reminder として、Hook が発火した位置に差し込まれる）と、`UserPromptSubmit`・`UserPromptExpansion`・`SessionStart`・`PostModelSwitch` で exit 0 のときの平文の stdout だけである。そのほかのイベントでは、stdout は debug log に書かれるだけでトランスクリプトに出ない。`additionalContext`・`systemMessage`・`initialUserMessage`・平文の stdout は、それぞれ 10,000 文字が上限である。超えた分はファイルに保存され、Claude にはパスと先頭 2,000 文字までのプレビューが渡る。[仕様]

## 2. 使う場面・使わない場面

使う場面:

- LLM の判断に任せず、必ず起こしたい処理（編集後の整形、保護したファイルの編集のブロック、入力待ちの通知、コンパクション後のコンテキストの再注入、設定変更の監査、ディレクトリ移動時の環境の読み直し、特定の許可プロンプトの自動承認）。[仕様]
- 判断が要る条件には、`prompt` ハンドラー（入力だけで判断できるとき）または `agent` ハンドラー（コードベースの実際の状態を確かめる必要があるとき）を使う。[仕様]
- permission mode に関係なく効くポリシー。`PreToolUse` は permission mode の判定より前に、すべての mode（`dontAsk` を含む）で発火する。Hook が `permissionDecision: "deny"` を返すと、`bypassPermissions` mode や `--dangerously-skip-permissions` のときでもツールはブロックされる。[仕様]

使わない場面と、近い機能との違い:

- 変わらない指示や静的なプロジェクトの規約は、Hook ではなく CLAUDE.md に書く（claude-md の機能ファイル）。[仕様]
  > "For instructions that never change, prefer CLAUDE.md. It loads without running a script and is the standard place for static project conventions."
- 許可と拒否を確実に強制するには、permission rules を使う（permissions の機能ファイル）。`if` の絞り込みはベストエフォートである。また Hook の `"allow"` は settings の deny rules を越えられない。Hook は制限を強めることはできても、permission rules が許す範囲より緩めることはできない。[仕様]
  > "Because the `if` filter is best-effort, use the permission system rather than a hook to enforce a hard allow or deny."
- プロンプトで `@` 参照したファイルはツール呼び出しを経ずに読み込まれるので、`PreToolUse` は発火しない。このパスを止めるには `Read` の deny rule を使う。[仕様]
- 特定のファイルの変更を、何が書いたかによらず捉えたいときは、`Edit|Write` に matcher を付けた `PostToolUse` ではなく `FileChanged` を使う。Bash や外部のプロセスによる書き換えでは `PostToolUse` は動かない。[仕様]
- skills は Claude に追加の指示と実行できるコマンドを与え、subagents は分離したコンテキストでタスクを動かし、plugins は拡張をまとめて配る。[仕様]
- プラグインが JavaScript の関数として登録するフック（画面に描画もできる）は mod であり、plugin-mods の機能ファイルで扱う。本ファイルの Hook は mod と並んで動き続ける。[仕様]

## 3. 仕様の要約

イベントと matcher:

- イベントごとの発火の時点、matcher の対象、ブロックできるか、イベント固有の入力と出力、使えるハンドラーの種別は `hook-events:events` を見る。ブロックできるかは `can_block` で、exit 2 の効果は `exit2_effect_ja` で引く。[仕様]
- matcher の評価規則は次のとおりである。[仕様]
  - `"*"`・`""`・省略は、すべてに一致する。
  - 英数字・`_`・`-`・空白・`,`・`|` だけの値は、完全一致（`|` か `,` で区切った一覧）として扱う。
  - それ以外の文字を含む値は、アンカー無しの JavaScript の正規表現として扱う。`Edit.*` は `NotebookEdit` にも一致する。
  - 大文字と小文字を区別する。
  - `FileChanged` と `StopFailure` では、完全一致として扱う文字が英数字・`_`・`|` だけに狭まる。
- matcher に対応しないイベント（`matcher_target` が `null`）に `matcher` を書くと、黙って無視される。[仕様]
- MCP のツールは `mcp__<server>__<tool>` という名前になる。サーバーのツールを全部対象にするには `mcp__memory__.*` のように `.*` が要る。`mcp__memory` は完全一致として扱われ、どのツールにも一致しない。プラグインに同梱されたサーバーのツールは `mcp__plugin_<plugin-name>_<server-name>__<tool>` になる。[仕様]
- matcher には括弧の付いたルールの書式ではなく、括弧の無いツール名（`tools:tools` の `id`）を書く。[仕様]
- ハンドラーの `if` は permission rule の構文（`Bash(git *)`・`Edit(*.ts)`）でツール名と引数を絞る。規則は1つしか書けない。`if` が効くのは `if_supported` が `true` のツールのイベントだけで、ほかのイベントで書くとそのハンドラーは動かない。[仕様]

ハンドラー:

- 種別ごとのフィールドと既定のタイムアウトは `hook-events:handler-types` を見る。どの種別を使えるかはイベントごとに違う（`hook-events:events` の `handler_types`）。`agent` は experimental である。[仕様]
- 一致したハンドラーはすべて並列に動く。同じハンドラーを複数の settings ファイルに書いても1回しか動かない。設定のレベルをまたいで、Hook の定義は置き換わらずにマージされる。[仕様]
- `command` ハンドラーは、`args` があれば exec form（シェルを通さず直接起動する）で、無ければ shell form（macOS と Linux では `sh -c`）で動く。パスのプレースホルダー `${CLAUDE_PROJECT_DIR}`・`${CLAUDE_PLUGIN_ROOT}`・`${CLAUDE_PLUGIN_DATA}` はどちらの形でも使え、環境変数としても渡る。[仕様]
- `async: true` の command ハンドラーはバックグラウンドで動く。決定のフィールドは効かず、結果は次のターンで届く。[仕様]

入力と出力:

- 入力は、`hook-events:common-input` に、イベント固有の `input_fields` を足したものである。command には stdin で、http には POST の本文で渡る。[仕様]
- exit code の意味は `hook-events:exit-codes` を見る。要点を挙げる。[仕様]
  - それだけでブロックできる exit code は 2 だけで、exit 1 は非ブロックのエラーとして処理が進む。
  - exit 2 のブロックは JSON で覆せない。
  - exit 0 以外でも、スキーマに合う JSON があれば JSON で決まる。
- JSON 出力のトップレベルのフィールドは `hook-events:common-output` を、イベント固有のフィールドとその置き場所（`location`）は `hook-events:events` の `decision_fields` を見る。[仕様]
  - stdout は、`{` で始まり `}` で終わるときだけ JSON として解釈される。
  - フィールドを誤った階層に置くと（例: `permissionDecision` を `hookSpecificOutput` の外に置く）、エラー無しで無視される。
- 複数の `PreToolUse` が違う決定を返したときは、`deny` > `defer` > `ask` > `allow` の順で強い方が勝つ。`additionalContext` は全フックの分が Claude に渡る。[仕様]

有効化と信頼:

- `disableAllHooks`（`settings:keys/disableAllHooks`）ですべての Hook を止められる。ただし managed settings の Hook を止められるのは、managed settings に書いた `disableAllHooks` だけである。個々の Hook だけを無効にする方法は無い。[仕様]
- `allowManagedHooksOnly`（`settings:keys/allowManagedHooksOnly`）があると、user・project・local・プラグインの Hook はブロックされる。HTTP の Hook は `allowedHttpHookUrls`（`settings:keys/allowedHttpHookUrls`）と `httpHookAllowedEnvVars`（`settings:keys/httpHookAllowedEnvVars`）で制限される。[仕様]
- 対話セッションでは、workspace trust のダイアログを受け入れるまで、settings ファイルの Hook は動かない。`-p` と SDK のセッションではダイアログが出ず、フォルダーは信頼済みとして扱われる。このため、リポジトリにコミットされた `.claude/settings.json` の Hook がそのまま動く。[仕様]
- subagent の frontmatter に書いた Hook は、そのサブエージェントが動いている間だけ有効である（`Stop` は `SubagentStop` に変換される）。skill の frontmatter に書いた Hook は、skill を呼んだ後、セッションの終わりまで有効である。[仕様]

## 4. 設計の指針

- 強制を目的とする Hook は、exit 2 か JSON の決定（`PreToolUse` なら `permissionDecision: "deny"`）でブロックする。exit 1 では止まらない。[仕様]
  > "If your hook is meant to enforce a policy, use `exit 2`."
- ポリシーの Hook は、最初の実行で `<hook name> hook error` の通知が出ないことを確かめる。スクリプトのパスを打ち間違えると、ゲートが黙って無効になる。[仕様]
  > "a mistyped path in `settings.json` leaves the gate silently disabled."
- タイムアウトした `command`・`http`・`mcp_tool` は `PreToolUse` のツール呼び出しをブロックしない。止まった Hook をゲートとして当てにしない。[仕様]
- 止められない操作は、Hook と permissions を組み合わせて守る。Hook は制限を強める方向に使い、確実な allow と deny は permission rules に置く。[仕様]
- 毎回走るイベントの Hook は速くする。`SessionStart` は毎セッション走る。`UserPromptSubmit` はプロンプトごとにモデルの処理を待たせ、既定のタイムアウトは 30 秒である。[仕様]
- `Stop`・`SubagentStop` で続行させる Hook は、入力の `stop_hook_active` を見て、決して満たされない条件でブロックし続けないようにする。連続して8回続行させると、Claude Code が9回目のブロックを無視してターンを終える。[仕様]
- ツールの入力を `updatedInput` で書き換える Hook は、1つのツールに1つだけにする。複数あると並列で動き、最後に終わったものが勝つので、結果が決まらない。[仕様]
- `additionalContext` には命令ではなく事実を書く。帯域外のシステム命令のような文は Claude の prompt injection への防御を起こし、コンテキストとして扱われない。[仕様]
- resume では、セッション途中のイベントで注入した文脈は Hook を再実行せずに再生されるので、時刻やコミットの SHA が古くなる。最新にしたい値は、resume でも再実行される `SessionStart` で注入する。[仕様]
- シェルコマンドを調べる Hook は `Bash|PowerShell` に一致させる。Windows で Git Bash が無い環境では、Bash ツール自体が登録されない。[仕様]
- 失敗を「何も起きなかった」と取り違えない。[知見] の記事は、定期実行の自動化について、読み取りに失敗した情報源を「新着なし」と区別して報告するよう述べている（"Report a failed read as unreadable, never as a quiet day."）。canon はこれを Hook にも当てはめる。ただしこれは canon の規律であり、公式の仕様ではない。具体的には、Hook が依存する外部コマンド（`jq` など）が無いときや、入力を読めないときに、黙って exit 0 で抜けて「異常なし」と同じに見せない。

## 5. 生成の規約

- プロジェクトで共有する Hook は `.claude/settings.json` の `hooks` に書き、スクリプトは `.claude/hooks/` に置く。公式の例はこの配置を使う。[仕様]
- スクリプトをパスのプレースホルダーで参照するときは exec form（`"args": []` を付ける）にする。shell form で書くときは、プレースホルダーを二重引用符で囲む。[仕様]
  > "Prefer exec form for any hook that references a path placeholder. In shell form, wrap each placeholder in double quotes."
- スクリプトは、stdin の JSON を読み、判定し、次のどちらかで返す。2つを混ぜない（公式は1つの Hook でどちらか一方を選ぶよう求めている）。[仕様]
  - exit 2 と、stderr に書いた理由。
  - exit 0 と、stdout に出した JSON。
- JSON は `jq -n` などのエンコーダーで組み立て、文字列の連結で作らない。[仕様]
- stdout には JSON 以外を書かない。シェルの起動時に何かを出力するプロファイルは、JSON の解釈を壊す。[仕様]
- macOS と Linux では、スクリプトに実行権限を付ける（`chmod +x`）。[仕様]
- `once` は skill の frontmatter でだけ、`async`・`asyncRewake`・`args`・`shell` は `command` でだけ書く（`hook-events:handler-types` の `fields`）。[仕様]

最小の例（`.claude/settings.json`）。`Bash` の `rm` を含むコマンドの前にだけ、スクリプトを動かす。[仕様]

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/block-rm.sh`。[仕様]

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive command blocked by hook"
    }
  }'
else
  exit 0  # no decision; normal permission flow applies
fi
```

## 6. 検証ルール

- **V-hooks-01**: settings の `hooks`（`settings:keys/hooks`）、プラグインの `hooks/hooks.json` の `hooks`、frontmatter の `hooks` のキーは、`hook-events:events` のいずれかの `id` と一致する。[仕様]
- **V-hooks-02**: 各イベントの値は matcher group の配列で、各 matcher group は配列の `hooks` を持つ。[仕様]
- **V-hooks-03**: ハンドラーの `type` は、`hook-events:handler-types` のいずれかの `id` と一致する。[仕様]
- **V-hooks-04**: ハンドラーの `type` は、そのハンドラーを置いたイベントの `hook-events:events` の `handler_types` に含まれる。[仕様]
- **V-hooks-05**: ハンドラーは、その `type` の `hook-events:handler-types` の `fields` で `required: true` のフィールドをすべて持つ。[仕様]
- **V-hooks-06**: ハンドラーのキーは、その `type` の `hook-events:handler-types` の `fields` の `id` のどれかである。[仕様]
- **V-hooks-07**: `matcher` を持つ matcher group は、`matcher_target` が `null` でないイベント（`hook-events:events`）の下にだけある。[仕様]
- **V-hooks-08**: `if` を持つハンドラーは、`if_supported` が `true` のイベント（`hook-events:events`）の下にだけある。[仕様]
- **V-hooks-09**: `once`（`hook-events:handler-types/command` などの `fields`）を持つハンドラーは、skill の frontmatter（`frontmatter:skill/hooks`）にだけある。[仕様]
- **V-hooks-10**: `shell` の値は `"bash"` か `"powershell"` である（`hook-events:handler-types/command`）。[仕様]
- **V-hooks-11**: ツールのイベント（`hook-events:events` で `if_supported` が `true`）の `matcher` が `mcp__` で始まり、英数字・`_`・`-`・空白・`,`・`|` だけから成るなら、`mcp__` の後に `__` を含む（ツール名まで書いた完全一致になっている）。[仕様]
- **V-hooks-12**: `args` を持たない `command` ハンドラー（`hook-events:handler-types/command`）の `command` に `${CLAUDE_PROJECT_DIR}`・`${CLAUDE_PLUGIN_ROOT}`・`${CLAUDE_PLUGIN_DATA}` があれば、二重引用符の中にある。[仕様]
- **V-hooks-13**: プラグインの `command` ハンドラーで `command` に `${user_config.` を含むものは、`args` を持つ。[仕様]
- **V-hooks-14**: `command` ハンドラー（`hook-events:handler-types/command`）が `${CLAUDE_PROJECT_DIR}/` で始まるパスで参照するスクリプトは、生成物の中でそのパス（プロジェクトのルートからの相対）に存在する。[仕様]

## 7. 品質基準

- **Q-hooks-01**: ポリシーを強制する Hook が、exit 2 か JSON の決定でブロックし、exit 1 や Hook のタイムアウトに頼っていない。[仕様]
- **Q-hooks-02**: 確実に守るべき allow と deny が、Hook だけでなく permission rules にも置かれている。Hook の `if` の絞り込みを、境界として当てにしていない。[仕様]
- **Q-hooks-03**: `matcher` と `if` が目的に要る最小の範囲に絞られている。とくに `PermissionRequest` で自動承認する Hook は、`.*` や空の matcher を使っていない。[仕様]
- **Q-hooks-04**: `Stop`・`SubagentStop` で続行させる Hook が、`stop_hook_active` を見るなどして、終わらない続行を防いでいる。[仕様]
- **Q-hooks-05**: `SessionStart`・`UserPromptSubmit`・`MessageDisplay` など、毎回またはユーザーの操作のたびに待たされるイベントの Hook が、速く終わるか、`timeout` を意図して設定している。[仕様]
- **Q-hooks-06**: `additionalContext` や Claude に渡る stdout が、事実を述べる文で書かれ、10,000 文字に収まっている。変わらない内容は CLAUDE.md に置かれている。[仕様]
- **Q-hooks-07**: スクリプトが入力を検証し、シェル変数を引用し、パスの `..` を弾き、機密のファイル（`.env`・`.git/`・鍵）を避けている。[仕様]
- **Q-hooks-08**: シェルコマンドやファイルの変更を調べる Hook が、`Bash|PowerShell` に一致させるか、`FileChanged` や `Stop` での走査を使い、取りこぼす経路を残していない。[仕様]
- **Q-hooks-09**: 1つのツールについて `updatedInput` を返す Hook が1つだけである。[仕様]
- **Q-hooks-10**: Hook が依存するコマンドの欠如や入力を読めない状態を、黙って成功と同じに扱っていない。これは canon の規律であり、公式の仕様ではない。[知見]
- **Q-hooks-11**: 本番の用途で `agent` ハンドラーを使っていない（experimental）。使う場合はその理由がある。[仕様]
- **Q-hooks-12**: `PostToolUse` の `classifierContext` に、信頼できないツールの出力や第三者の文章を写していない。[仕様]

## 8. 出典

spec:

- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/hooks-guide.md
- https://code.claude.com/docs/en/tools-reference.md

insight:

- https://claude.dev/blog/building-effective-agent-automations/
