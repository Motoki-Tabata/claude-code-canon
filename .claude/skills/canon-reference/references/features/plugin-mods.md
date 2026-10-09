---
feature: plugin-mods
sources:
  - https://code.claude.com/docs/en/plugins/mods/overview.md
  - https://code.claude.com/docs/en/plugins/mods/create.md
  - https://code.claude.com/docs/en/plugins/mods/reference.md
  - https://code.claude.com/docs/en/plugins/mods/interface.md
  - https://code.claude.com/docs/en/plugins/mods/gallery.md
  - https://code.claude.com/docs/en/plugins/mods/events.md
  - https://code.claude.com/docs/en/plugins/mods/api.md
  - https://code.claude.com/docs/en/plugins/mods/test.md
  - https://code.claude.com/docs/en/permissions.md
---

# Mods

## 1. 概要

- mod は、JavaScript か TypeScript のイベントハンドラーでできた plugin で、Claude Code の見た目と振る舞いを変える。Claude Code はツール呼び出し・プロンプトの送信・インターフェースの描画などのイベントが起きるたびにハンドラーを呼び、ハンドラーはそのイベントを見る・変える・肩代わりする。[仕様]
- 公式の mod のページでは、mod のハンドラーを「hook」、settings ファイルに書く従来の hook を「settings hook」と呼び分ける。settings hook はシェルコマンド・HTTP・プロンプトとして外で動き、mod の hook は Claude Code のプロセスの中で関数として動く。本書もこの呼び分けに従う。[仕様]
- mod の実体は plugin のディレクトリで、`hooks/hooks.json` の `modules` が指す1つの hooks module（`register(on, options)` を export する ES module）が入口になる。`modules` を持つことが、その plugin を mod にする。[仕様]
- 読み込み: mod の hook は、その plugin を読み込んだあらゆる種類のセッションで動く。描画が出るのは terminal と Desktop アプリだけで、VS Code 拡張のチャットパネル・`claude -p`・Agent SDK・cloud セッションでは hook は動くが描画は出ない。Desktop アプリの WSL セッションでは plugin 自体が使えないので hook も動かない。[仕様]
- コンテキストへの効き方: Claude が読むものに mod が効くのは、`prompt.submit` の `context`・`prompt.section`・`prompt.context`・`skill.prompt`・`command.run` の返す `text`・`$.tool.register` の説明など、hook や登録が返す文を通してである（`mods:events`・`mods:api`）。`$.ui.log`・`$.ui.status`・`$.ui.toast` の表示は Claude が読まない。[仕様]

## 2. 使う場面・使わない場面

使う場面（settings hook・Skill・status line・MCP サーバーにはできないこと）[仕様]:

- **自前のインターフェースを描く**: transcript の横のペイン、プロンプトの上のバンド、タブ・ボタン・入力欄。
- **Claude Code 自身の描画を変える**: ツール呼び出しの行・スピナー・質問のダイアログなどを置き換える・装飾する。ただし権限プロンプトは変えられない。
- **ツール呼び出しやリクエストに割り込む**: ユーザーに尋ねる間ツール呼び出しを止める、ツールを実行せずに答える、1つのリクエストを別のモデルへ送る。
- **ターンを使わずに自分のコードを走らせるコマンド**: Claude の作業中にも走る `/command`。
- **hook 間でデータを共有する**: 同じ module の変数を複数の hook が使う（例: 一方が数え、他方が表示する）。

使わない場面:

- 既存のスクリプトでイベントをブロック・許可・記録したいだけなら settings hook（`hooks.md`）を選ぶ。公式の比較は、settings hook が変えられるものを「ツール呼び出しやプロンプトを通すか、ツール呼び出しの引数と結果、Claude に足すコンテキスト」としている。[仕様]
- 同じ指示を何度も貼っているなら Skill（`skills.md`）、Claude が外部のシステムに届く必要があるなら MCP サーバー（`mcp.md`）を選ぶ。[仕様]
- 固定のコマンドやパスへの許可・拒否は permission ルール（`permissions.md`）で書け、コードが要らない。mod の `tool.check` は、その時点の状態（現在のブランチ、別の hook が記録した値など）で判定が変わるときに使う。[仕様]
- mod のガードはコマンドの文字列を照合するだけなので、`$(…)`・エイリアス・スクリプト経由の操作は通り抜ける。確実に止めるなら permission ルールやホスティング側のブランチ保護を使う。[仕様][知見]
- 描画が要件の中心で、使う場所が VS Code 拡張・`claude -p`・cloud セッションだけなら、描画は出ない。[仕様]

近い機能との違い:

| | mod | settings hook | Skill | MCP サーバー |
|---|---|---|---|---|
| 動く場所 | Claude Code のプロセス内の関数 | 外部のコマンド・HTTP・プロンプト | Claude が読む指示 | 外部のプロセスやサービス |
| 描画 | できる | できない | できない | できない |
| 書くもの | JavaScript か TypeScript | スクリプトと `settings.json` の項目 | Markdown | 任意の言語のサーバー |

（公式の比較表を、選定に要る行だけ要約した。[仕様]）

## 3. 仕様の要約

正は `data/mods.json`。イベントは `mods:events`、mods API は `mods:api` を参照する。両方とも `complete: false` で、公式は完全なリファレンスを Claude Code の TypeScript 宣言としている。data に無い名前を「存在しない」と扱わない。[仕様]

### ファイルの構成 [仕様]

| ファイル | 必須 | 内容 |
|---|---|---|
| `.claude-plugin/plugin.json` | はい | plugin の manifest。mod のための必須フィールドは無い |
| `hooks/hooks.json` | はい | `modules`: hooks module へのパスを1つだけ持つ配列（このファイルからの相対）。settings hook を `hooks` に同居させてもよい |
| hooks module（例 `hooks/register.js`） | はい | `register(on, options)` を export する ES module。拡張子は `.js`・`.mjs`・`.cjs`・`.jsx`・`.ts`・`.mts`・`.cts`・`.tsx` |
| `types/index.d.ts`（manifest の `types` が指す） | `$.state` を使うか mods API に名前空間を足すとき | `PluginState` の値と、足す名前空間を宣言する |
| `*.test.ts`・`*.test.tsx` | いいえ | `claude plugin test` が走らせるテスト |

- `register` の `options` には、manifest が宣言する `userConfig` の値が既定値を埋めて入る。[仕様]
- Node.js・バンドラー・ビルドは要らない。Claude Code が `.js` と `.ts` を直接読む。[仕様]
- Claude Code は、`--plugin-dir` で読み込んだ mod と Claude が書いた mod のディレクトリの `.claude-plugin/types/` に、その版のイベント・メソッド・要素の型宣言（`.d.ts`）を書く。mod に `tsconfig.json` が無ければ、それを extends する `tsconfig.json` を mod のルートに足す。公式は、この型宣言とページが食い違えば型宣言を信じるよう求めている。[仕様]

### hook の形 [仕様]

- `register` の中で `on(イベント名, マッチャー?, hook)` を呼んで hook を登録する。`on` は `.catch(handler)` を持つ登録を返す。
- hook は `($, e, next)` を受け取る。`$` は mods API（`mods:api`）、`e` は深く freeze されたイベントの入力、`next(e)` はチェーンの次（後の mod の hook、最後は Claude Code 自身の振る舞い）を呼んで結果に解決する。
- hook の3つの動き: **観察**（`next(e)` をそのまま返す、または `await next(e)` のあとに処理する）、**書き換え**（変えたコピーを `next` に渡す）、**応答**（`next` を呼ばずに結果を返し、後の mod と Claude Code の振る舞いを走らせない）。返せる結果はイベントごとに違う（`mods:events` の `returns`）。
- `turn.step` の hook は async generator で書く（`mods:events/turn.step`）。
- マッチャーはイベントのフィールドと比べるオブジェクトで、値・値の配列・正規表現を書ける。イベント名には `'classic.*'`（settings hook の全イベント）と `'*'`（テレメトリー以外の全イベント）のワイルドカードを書ける。同じイベントをマッチャー無しで2回 `on` すると module の読み込みが失敗する。
- `next` には `signal`（イベントが放棄されると abort する `AbortSignal`）・`origin`・`budget`（制限時間）・`to`（後の tier へ飛ぶ。`prependPlugins`・`appendPlugins` の mod だけ）があり、`.catch` の中では `error` と `called` を読める。

### イベントの族 [仕様]

- `mods:events` はイベントを、ツール・プロンプト・コマンドと設定・ターン・セッション・サブエージェント・インターフェース・他の mod・テレメトリーに分けている（`group`）。
- settings hook の各イベントは `classic.<Event>` という名前のイベントにもなり、`e` は settings hook が stdin で受け取る JSON（`mods:events/classic.<Event>`、`<Event>` は `hook-events:events` の `id`）。
- mods API の各メソッドの呼び出しも、`$.` を除いた名前（例 `fs.read`）のイベントになる。チェーンで前にある mod は、後ろの mod の呼び出しを観察・書き換え・拒否できる（`mods:events/<namespace>.<method>`）。

### mods API [仕様]

- hooks module には Node.js の API・`setTimeout` などのタイマー・自前のネットワークやファイルのアクセスが無い。`URL`・`TextEncoder`・`AbortController`・`crypto.subtle` などの標準の JavaScript と Web の API は使える。外に出る操作はすべて `$` を通す（`mods:api`）。
- ファイル・プロセス・ネットワークへのアクセスは、Claude Code を動かしているユーザーと同じ権限で行われる。相対パスはセッションの作業ディレクトリを基準にする。
- `$.model.complete`・`$.model.fork` はユーザーのプランか API キーを使う。

### 実行順と失敗 [仕様]

- 同じイベントの hook は1つのミドルウェアのチェーンを作り、先頭の mod がいちばん外側になる。順は、組み込みのガード `sec-default@builtin`（読み込まれる場合）と組織の `prependPlugins` などの組織の mod → ユーザーがインストールした mod → 組織の `appendPlugins` → その他の組み込み mod。ユーザーの mod の中では、manifest の `dependencies` に挙げた mod より先に走る。1つの module の中では `on` を呼んだ順に走る。
- settings の `PreToolUse` hook は、managed settings のものが最初の mod の `tool.call` より前（そこでのブロックは最終）、それ以外の settings ファイルと plugin の `hooks/hooks.json` のものは最後の mod が `next` を呼んだあと（Claude Code 自身の振る舞いの一部）に走る。`tool.check` はそれらの判定のあとに発火する（`hook-events:events/PreToolUse`）。
- `.catch` の無い hook が例外・タイムアウト・形の違う結果で失敗すると、`next` を呼ぶ前ならその hook を飛ばして次が走り、`next` が解決したあとならその結果が残る。拒否する hook を fail closed にするには `.catch` で拒否を返す。
- hook 自身の実行時間には上限があり、`next` や mods API 呼び出しを待つ時間は数えない（`$.clock.sleep` は数える）。上限・サイズの制限の値は公式 reference の Limits の表が正。

### 読み込み・確認・テスト [仕様]

- `claude --plugin-dir <dir>` で1セッションだけ読み込み、保存のたびに hooks module を再読み込みする。再読み込みは `register` を再実行するので module の変数は初期値に戻る。
- `claude plugin validate <dir>` は manifest と hooks module のソースを、読み込み時と同じ静的解析で調べ、扱うイベント（`hooks:`）と mods API 呼び出し（`calls:`）を出す。`--strict` は警告をエラーにし、`--json` は機械可読の報告を出す。
- `claude plugin test [dir]` は `.test.ts`・`.test.tsx` のテストを、セッション・サインイン・ネットワーク無しで走らせ、失敗があれば終了コード1で終わる。
- セッションで読み込まれた mod は `/plugin` のタブの下の行で確認でき、`/reload-plugins` で再読み込みする（`builtin-commands:commands/plugin`・`builtin-commands:commands/reload-plugins`）。

### mod を止める設定 [仕様]

- 1つの mod は `/plugin` でその plugin を無効化かアンインストールする。1セッションだけ全部止めるなら `--safe-mode`、全セッションで止めるならユーザーの settings の `disableAllHooks`（`settings:keys/disableAllHooks`。settings hook と独自の status line も止まる）。
- `disableAllHooks` と組織の `allowManagedModsOnly` は mod だけを止め、plugin の Skill・コマンド・エージェント・MCP サーバーは読み込まれる。
- 組み込みの mod は `disableAllHooks`・`--bare`・`--safe-mode` では止まらない。
- 組織の制御には managed settings の `prependPlugins`・`appendPlugins`・`allowManagedHooksOnly`・`disableSideloadFlags` と、組み込みのガードのオプション（`allowManagedModsOnly`・`allowModsToOverrideDenyRules`）がある（`settings:keys/prependPlugins`・`settings:keys/appendPlugins`・`settings:keys/allowManagedHooksOnly`・`settings:keys/disableSideloadFlags`）。`userConfig` の値は `pluginConfigs` に plugin の id をキーにして入る（`settings:keys/pluginConfigs`）。

## 4. 設計の指針

- **どこで動くかを先に決める**: 描画が出るのは terminal と Desktop アプリだけなので、描画する mod は `e.surface` やセッションの種類を見て、描画が出ない場所では transcript の行やコマンドの返す `text` に落とす。Desktop アプリでは `Raster`・`Image` が描けず、terminal では `Svg` が描けない。[仕様]
- **ガードは「どのイベントで止めるか」で選ぶ**: 実行前に引数で止める・書き換えるなら `tool.call`、ルールと settings hook の判定を受けたうえで最終判定を差し替えるなら `tool.check`（`mods:events/tool.call`・`mods:events/tool.check`）。`tool.check` で `allow` を返す mod は、ask ルールのプロンプトや managed 以外の `PreToolUse` hook のブロックを越えて承認でき、managed settings が無い環境では deny ルールも越えうる。承認を返す設計は権限の緩和として扱う。[仕様]
- **ユーザーに尋ねる待ちは mods API の中で行う**: `$.ui.ask` などの mods API 呼び出しを待つ時間は制限時間に数えず、自前の promise を待つ時間は数える。タイムアウトした hook は飛ばされるので、止めていたコマンドが走ってしまう。[仕様]
- **状態の置き場所を寿命で選ぶ**: module の変数は再読み込みまで、`$.state` はセッションの終わりか `/clear`・`/resume`・`/branch` まで（再読み込みでは消えず、読んだ描画を自動で描き直す）、`$.store` はセッションをまたぐ（マシン上の全セッションで共有され、`get` と `set` は原子的でない）（`mods:api/$.state.get`・`mods:api/$.store.set`）。`$.store` から `$.state` に写す値は、`session.start` に加えて `classic.SessionStart`（`source` が `clear`・`resume`・`fork`）でも写し直す。[仕様]
- **開発中の再読み込みを前提にする**: 保存のたびに `register` と `session.start` が走り直すので、残したいデータは module の変数に置かない。[知見]
- **コマンドとツールは `session.start` で登録する**: Claude Code は最初のプロンプトの前にこの hook を待つ。組み込みコマンドと同じ名前の登録は例外になり、その hook の残りが走らないので、登録は hook の最後に置くか `try`・`catch` で包む（`mods:api/$.command.register`）。[仕様]
- **Claude が読む文を最小にする**: `deny` や `drop` の理由は Claude がツールの結果として読むので、Claude が次に取れる行動を書く。リクエストごとに変わる文を `prompt.section`・`prompt.context`・`skill.prompt` で返すとプロンプトキャッシュが無効になる。[仕様]
- **他の mod と並ぶことを前提にする**: 同じイベントの hook は順に連なり、前の mod は後の mod の呼び出しまで観察・拒否できる。拒否する hook には `.catch` を付けて fail closed にする。[仕様]
- **描画は site の寸法に合わせる**: 幅は `e.props.bodyColumns` に合わせ、高さは `placement` と `scroll.bodyRows` で決める。データの変化で描き直すときは `$.ui.invalidate('ui.render')` を呼び、描き直しは間引かれる前提にする。[仕様] terminal では絵文字ではなく1セル幅の記号を使う。[知見]

## 5. 生成の規約

- 生成するのは plugin のディレクトリ一式（`.claude-plugin/plugin.json`・`hooks/hooks.json`・hooks module、必要なら `types/index.d.ts` とテスト）。manifest と配布の規約は `plugins.md` に従う。[仕様]
- `.claude-plugin/types/` と、Claude Code が足す `tsconfig.json` は Claude Code が読み込み時に書くものなので、生成物に含めない（canon の規律で、公式の仕様ではない）。
- 静的解析が hook と呼び出しを見つけられるよう、次を守る。[仕様]
  - mods API は `$`・名前空間・メソッドの順に省略せず書く（例 `$.store.get('notes')`）。`$` やその名前空間を変数に代入しない・分割代入しない・計算した名前で参照しない。`$` を渡してよいのは同じファイルのトップレベルの関数と、`claude-code` の `read`・`update` だけ。
  - `on` のイベント名は文字列リテラルで書く。`register` の中で `on` という名前の変数や引数を宣言し直さない。
  - import はファイル先頭の `import` 宣言で、plugin ディレクトリ内の相対パスだけにする。bare import は `claude-code` だけ。動的 `import()` と `require` は使わない。
  - `$.env` の変数名と、`atom` の `plugin`・`key` は文字列リテラルで書き、`atom` の結果は `const` に持つ。
- `$.state` を使うときは、`types/index.d.ts` の `PluginState` に plugin 名をキーにして値を宣言し、manifest の `types` でそのファイルを指す（`plugin-manifest:fields/types`）。[仕様]
- コマンド・ツール・サブエージェントの種類・ペインの名前は、英字・数字・`_`・`-` で64文字以内にする。登録したツールは `mcp__<plugin 名>__<name>` の名前で `tool.call` を絞る。[仕様]
- 要素は `$.ui.resolve(e)` から得る。`Markdown` は内容を `children` ではなく `text` prop で渡す。[仕様]
- `$.ui.open` の `focus`・`closeOnEscape`・`holdToasts` と、コントロールの `autoFocus` は `true` だけを受け付けるので、付けないときは省く（`mods:api/$.ui.open`）。[仕様]
- plugin の `name` は `claude-` で始まるなど Anthropic のものに見える名前にしない（`claude plugin validate` が失敗する）。README には検証した Claude Code の版を書く。[仕様]

最小の例（tool 呼び出しを数え、スピナーの横に出す）[仕様]:

```text
first-mod/
├── .claude-plugin/
│   └── plugin.json
└── hooks/
    ├── hooks.json
    └── register.js
```

```json
{
  "modules": ["./register.js"]
}
```

```javascript
let calls = 0

export function register(on) {
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

拒否する hook の型（fail closed）[仕様]:

```javascript
on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
  if (next.called) return next(e)
  return { deny: 'The command guard failed, so this command was not run: ' + next.error.kind }
})
```

## 6. 検証ルール

`mods:events` と `mods:api` は `complete: false` なので、名前が data に一致しないことだけでは不合格にしない。一致しない名前は「未判定」として、`claude plugin validate` の結果か型宣言で確かめる。

- **V-plugin-mods-01**: mod の plugin は `hooks/hooks.json` を持ち、その `modules` は要素がちょうど1つの配列である。[仕様]
- **V-plugin-mods-02**: `modules` の要素が指すファイルは `hooks/hooks.json` からの相対パスで存在し、拡張子は `.js`・`.mjs`・`.cjs`・`.jsx`・`.ts`・`.mts`・`.cts`・`.tsx` のいずれかである。[仕様]
- **V-plugin-mods-03**: hooks module が `register` を export している。[仕様]
- **V-plugin-mods-04**: `on` の第1引数は文字列リテラルで、`mods:events` の `kind: event` の `id`、`classic.` に `hook-events:events` の `id` を付けたもの、`mods:api` の `kind: method` の `id` から `$.` を除いたもの、`*`、`classic.*` のいずれかに一致する。一致しないものは未判定とする。[仕様]
- **V-plugin-mods-05**: `$.<namespace>.<method>` の形の呼び出しは、`mods:api` の `kind: method` の `id` のいずれかに一致する。一致しないものは未判定とする。[仕様]
- **V-plugin-mods-06**: `telemetry.log`・`telemetry.mark` への `on` は、`mods:events/telemetry.log`・`mods:events/telemetry.mark` の `matcher_required` が示す `{ to: 'collector' }` のマッチャーを持つ。[仕様]
- **V-plugin-mods-07**: `mods:events` で `generator: true` のイベント（`mods:events/turn.step`）への hook は async generator 関数（`async function*`）である。[仕様]
- **V-plugin-mods-08**: 1つの module の中で、同じイベント名への `on` をマッチャー無しで2回以上呼んでいない（`mods:events`）。[仕様]
- **V-plugin-mods-09**: `$`、または `$.<namespace>`（`mods:api` の `namespace`）を変数に代入・分割代入していない。[仕様]
- **V-plugin-mods-10**: `$.ui.open` の引数で `focus`・`closeOnEscape`・`holdToasts` に `false` を渡していない（`mods:api/$.ui.open`）。[仕様]
- **V-plugin-mods-11**: `mods:api/$.state.get`・`mods:api/$.state.set` か `mods:api/atom` を使う mod は、manifest に `types`（`plugin-manifest:fields/types`）を持ち、その指すファイルが存在する。[仕様]
- **V-plugin-mods-12**: `$.tool.register` に渡した `name` を持つ mod では、そのツールを処理する `tool.call` hook のマッチャーの `tool` が `mcp__<plugin の name>__<name>` である（`mods:api/$.tool.register`）。[仕様]
- **V-plugin-mods-13**: `$.command.register`・`$.tool.register` に渡す `name` と、`$.ui.open` の `id` は、`^[A-Za-z0-9_-]{1,64}$` に一致する（`mods:api/$.command.register`・`mods:api/$.tool.register`・`mods:api/$.ui.open`）。[仕様]
- **V-plugin-mods-14**: 生成物に `.claude-plugin/types/` が含まれていない（canon の規律で、公式の仕様ではない）。
- **V-plugin-mods-15**: `claude plugin validate <dir>` が終了コード0で終わる。[仕様]

## 7. 品質基準

- **Q-plugin-mods-01**: mod を選んだ理由が、描画・Claude Code 内部のイベントの書き換え・ターンを使わないコマンドのどれかにあり、settings hook・Skill・MCP サーバー・permission ルールで足りる要件に mod を使っていない。[仕様]
- **Q-plugin-mods-02**: ツール呼び出しを拒否する mod を、確実な制御として扱っていない。コマンド文字列の照合は迂回できるので、確実に止める要件は permission ルールやホスティング側の保護で満たしている。[仕様][知見]
- **Q-plugin-mods-03**: 拒否・中止を返しうる hook（`mods:events` の `can_block: true`）のうちガードの役目を持つものに `.catch` があり、失敗したときに fail closed になる。[仕様]
- **Q-plugin-mods-04**: `deny`・`drop`・`tool.call` の `result` の文が、Claude が次に取る行動を示す指示になっている。[仕様]
- **Q-plugin-mods-05**: `tool.check` で `allow` を返す箇所が要件で正当化されている。ask ルール・`PreToolUse` hook のブロック・auto mode の分類器・（環境によっては）deny ルールを越えることを踏まえている。[仕様]
- **Q-plugin-mods-06**: 状態の寿命の要件に合う置き場所（module の変数・`$.state`・`$.store`）を選び、`$.store` から `$.state` に写す値は `/clear`・`/resume`・`/branch` のあとにも写し直している。複数のセッションが書く値は、キーを分けるか書く直前に読み直している。[仕様]
- **Q-plugin-mods-07**: 描画する mod が、描画が出ない場所（VS Code 拡張・`claude -p`・cloud セッション）と、アプリが描けない要素（`Raster`・`Image`・`Svg`）について代わりの出力を持つ。[仕様]
- **Q-plugin-mods-08**: hook の中で長く待つ処理が mods API 呼び出しの中にあり、自前の promise の待ちで制限時間を使い切って hook が飛ばされる経路が無い。長い処理には `next.signal` を渡している。[仕様]
- **Q-plugin-mods-09**: リクエストごとに変わる文を `prompt.section`・`prompt.context`・`skill.prompt` で返していない（返すならキャッシュの無効化を受け入れる理由がある）。[仕様]
- **Q-plugin-mods-10**: mod が届く範囲（ファイル・プロセス・ネットワーク・秘密・Claude のモデル呼び出しによる利用量）が要件に必要な範囲に限られ、`claude plugin validate` の `calls:` の行が要件から説明できる。[仕様]
- **Q-plugin-mods-11**: 主要な hook に `claude plugin test` のテストがあり、外部への呼び出し（モデル・store・プロセス）を stub している。[仕様]
- **Q-plugin-mods-12**: 描画が site の幅（`e.props.bodyColumns`）と高さに収まり、terminal では1セル幅の記号を使っている。[仕様][知見]

## 8. 出典

spec:

- https://code.claude.com/docs/en/plugins/mods/overview.md
- https://code.claude.com/docs/en/plugins/mods/create.md
- https://code.claude.com/docs/en/plugins/mods/reference.md
- https://code.claude.com/docs/en/plugins/mods/interface.md
- https://code.claude.com/docs/en/plugins/mods/gallery.md
- https://code.claude.com/docs/en/plugins/mods/events.md
- https://code.claude.com/docs/en/plugins/mods/api.md
- https://code.claude.com/docs/en/plugins/mods/test.md
- https://code.claude.com/docs/en/permissions.md

insight:

- https://claude.dev/blog/getting-started-with-claude-code-mods/
