---
feature: output-styles
sources:
  - https://code.claude.com/docs/en/output-styles.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/settings-reference.md
  - https://code.claude.com/docs/en/plugins/components.md
  - https://code.claude.com/docs/en/plugins/manifest-reference.md
---

# 出力スタイル（Output styles）

## 1. 概要

- 出力スタイルは、セッション中のすべての応答について Claude の役割・口調・応答の形式を決める指示の集まりである。[仕様]
  > "An output style is a set of instructions that sets Claude's role, tone, and response format for every response in a session."
- 組み込みのスタイルと、Markdown ファイルで書くカスタムスタイルがある。カスタムスタイルは frontmatter（メタデータ）と、その後の Claude への指示の本文から成る。[仕様]
- 読み込みの時期: スタイルのファイルは起動時に読まれる。ターミナルでは、実行中のセッションでファイルを作成・編集しても、Claude Code を再起動するまで反映されない。セッション中にスタイルを切り替えると、次のメッセージから新しいスタイルが使われる。[仕様]
- コンテキストへの効き方: 有効なスタイルの指示は毎リクエストで送られ、入力トークンを増やす（初回以降はプロンプトキャッシュで軽減される）。[仕様]
- カスタムスタイルは既定で、完全なシステムプロンプトにある Claude Code 組み込みのソフトウェアエンジニアリングの指示の節（変更の範囲の決め方・コメントの書き方・作業の検証など）を外す。`keep-coding-instructions: true` で残せる。短いシステムプロンプトにはこの節が無いので、そこではこのキーは効かない。[仕様]
- 適用範囲はメインの会話と fork（親の会話とシステムプロンプトを丸ごと継ぐ）だけで、それ以外の Subagent は自分のシステムプロンプトで動くため、スタイルの影響を受けない。[仕様]
- スタイルは指示であり、強制はされない。[仕様]
  > "It's an instruction Claude follows, so nothing enforces it."

## 2. 使う場面・使わない場面

- **使う**: すべての応答を特定の声・長さ・形式にしたいとき、または Claude をソフトウェアエンジニア以外の役割（文章の補助・データ分析など）にしたいとき。[仕様]
- **使わない**（公式が別の機能を勧める場面）[仕様]:
  - プロジェクトの規約・コマンド・構成を知らせたい → CLAUDE.md（どのスタイルでも読み込まれ続ける）。
  - 特定の種類の作業の手順（リリースのチェックリスト・レビュー手順など） → Skill（呼ばれたときか作業が合うときだけ読み込まれ、無関係な応答に影響しない）。
  - 例外なく毎回起こるべきこと（編集後の整形・コマンドの阻止） → Hook（Claude が指示に従うかに依存しない）。
  - 独自の指示・モデル・ツールを持つ補助役 → Subagent（別のコンテキストで動き、要約を返す）。
  - 起動時に指示を足すだけ → `--append-system-prompt`（何も外さずに追記する）。
- これらは組み合わせられる。知識は CLAUDE.md、応答の仕方は出力スタイル、保証が要ることは Hook、という分担を公式が例示している。[仕様]
- 組み込みの Proactive スタイルは permission mode を変えない。どのツール呼び出しを確認なしで実行するかは permission mode が決める。[仕様]
- 出力スタイルはふつう個人のものなので、多くは `~/.claude/output-styles/` に置く。チームで共有するスタイル（全員が使うレビューモードなど）があるときだけ、プロジェクトの `.claude/output-styles/` に置く。[仕様]

## 3. 仕様の要約

### 配置

- ファイルは Markdown（`output-styles/*.md`）で、コミット対象である。配置先は `paths:files/user:~/.claude/output-styles/*.md` と `paths:files/project:.claude/output-styles/*.md`。[仕様]
- 置ける階層はユーザー（`~/.claude/output-styles`）・プロジェクト（`.claude/output-styles`）・管理ポリシー（managed settings のディレクトリの中の `.claude/output-styles`）の3つ。[仕様]
- プロジェクトのスタイルは、作業ディレクトリからリポジトリのルートまでの間にあるすべての `.claude/output-styles/` から読み込まれる。同じ名前のスタイルが複数あれば、作業ディレクトリに最も近いものが使われる。[仕様]
- ユーザーのスタイルは全プロジェクトで使え、同じ名前のプロジェクトのスタイルが優先する。[仕様]
- プラグインは `output-styles/<name>.md` に出力スタイルを同梱できる。`/output-style` には `<plugin>:<name>` として現れる。プラグインの manifest の `outputStyles`（`plugin-manifest:fields/outputStyles`）を設定すると、既定の `output-styles/` の走査は行われず、指定したパスに置き換わる。[仕様]

### frontmatter

- 正は `frontmatter:output-style`。すべてのキーが任意で、キー名は小文字のハイフン区切り。[仕様]
- 綴りを誤ったキーはエラーなしで無視される。YAML が解析できないときも、スタイルはファイル名の名前でフィールドなしとして読み込まれる（解析エラーは `claude --debug` で見る）。どちらも黙って意図と違う動きになる。[仕様]
- スタイル名は `frontmatter:output-style/name` があればその値、無ければファイル名になる。[仕様]
- `frontmatter:output-style/force-for-plugin` はプラグインのスタイル専用で、ユーザーの `outputStyle` 設定を上書きする。[仕様]

### 選び方

- 選ぶ手段は `/output-style <style>` コマンド・`/config` のメニュー・VS Code 拡張のメニュー・settings の `outputStyle`（`settings:keys/outputStyle`）。コマンドとメニューは選択を `.claude/settings.local.json` に保存する。[仕様]
- `outputStyle` の値は大文字小文字を区別する。スタイル名と完全に一致しない値（例: `explanatory`）は Default スタイルになる。`/output-style` コマンドは大文字小文字を無視する。[仕様]
- 組み込みの名前は `Proactive`・`Concise`・`Explanatory`・`Learning` と書く。スタイルを選ばない状態が Default で、`/output-style` の一覧には `default` として出る。[仕様]
- 全プロジェクトの既定にするには `~/.claude/settings.json` に `outputStyle` を置く。プロジェクトの settings はそれより優先する。[仕様]

### トークン

- スタイルの指示は入力トークンを足す。Explanatory と Learning は設計上 Default より長く応答し、出力トークンを増やす。Concise は短く応答させる。カスタムスタイルの出力トークンは、指示が何を出させるかで決まる。[仕様]

## 4. 設計の指針

- 応答の仕方（役割・口調・形式）だけを出力スタイルに書き、プロジェクトの知識・作業の手順・保証の要る振る舞いはそれぞれ CLAUDE.md・Skill・Hook に分ける。スタイルはセッションの全応答にかかり、しかも強制されないため。[仕様]
- `keep-coding-instructions` は、スタイルを入れても Claude にソフトウェアエンジニアリングをさせるかで決める。伝え方だけを変えて同じようにコードを書かせたいなら `true`、Claude がソフトウェアエンジニアリングをしないなら省く。[仕様]
- このキーに頼る構成では、短いシステムプロンプトだと効かない点に注意する。公式は、確実に効かせるには環境変数 `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`（`env-vars:vars/CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`）を `0` にして完全なプロンプトを選ぶよう案内している。[仕様]
- 配置のスコープ: 個人の好みのスタイルはユーザーに、チームで共有するスタイルだけをプロジェクトに置く。[仕様]
- Subagent の応答の形式を変えたいときは、出力スタイルではなく Subagent 側の定義で指示する。出力スタイルは fork 以外の Subagent には効かないため。[仕様]
- `force-for-plugin` はユーザーの選択を上書きし、複数のプラグインが設定すれば最初に読み込まれたものが勝つ。[仕様] そのため canon では、利用者に選ばせる余地を残すべきでない理由が要件にあるときだけ使う（これは canon の規律で、公式の仕様ではない）。

## 5. 生成の規約

- ファイルは `.claude/output-styles/<name>.md`（プロジェクト）または `~/.claude/output-styles/<name>.md`（ユーザー）、プラグインでは `output-styles/<name>.md` に書く。[仕様]
- frontmatter には `frontmatter:output-style` のキーだけを書き、YAML として解析できる形にする。[仕様]
- 本文は Claude への指示として書く。[仕様]
- スタイルを有効にする設定を生成するときは、`outputStyle` に `name`（無ければファイル名）を大文字小文字まで一致させて書く。[仕様] チームで共有するなら `.claude/settings.json`、個人なら `~/.claude/settings.json` か `.claude/settings.local.json` に置く（スコープの対応付けは canon の判断で、公式はそれぞれのファイルに置けることを示している）。

最小の例（公式の例から見出し以降を省いたもの。伝え方を変えつつコーディングの振る舞いは残す）[仕様]:

```markdown
---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---

When explaining code, architecture, or data flow, start with a Mermaid diagram showing the structure, then explain in prose.
```

```json
{
  "outputStyle": "Diagrams first"
}
```

## 6. 検証ルール

- **V-output-styles-01**: `output-styles/*.md` の frontmatter の各キーは `frontmatter:output-style` のいずれかの `id` と一致する。[仕様]
- **V-output-styles-02**: `output-styles/*.md` の frontmatter は YAML として解析できる。[仕様]
- **V-output-styles-03**: `frontmatter:output-style/keep-coding-instructions` と `frontmatter:output-style/force-for-plugin` の値は、それぞれの `allowed_values`（真偽値）のいずれかである。[仕様]
- **V-output-styles-04**: `frontmatter:output-style/force-for-plugin` は、`applies_to` に含まれるスコープ（プラグイン）のスタイルファイルにだけ現れる。[仕様]
- **V-output-styles-05**: プロジェクト・ユーザーの出力スタイルのファイルは `paths:files/project:.claude/output-styles/*.md` か `paths:files/user:~/.claude/output-styles/*.md` の `path` に一致する場所にあり、拡張子が `.md` である。[仕様]
- **V-output-styles-06**: プラグインの出力スタイルは、プラグインのルートの `output-styles/` にあるか、manifest の `plugin-manifest:fields/outputStyles` に列挙したパスにある。`outputStyles` を設定したときは既定の `output-styles/` は走査されないので、`output-styles/` だけに置いたファイルは読まれない。[仕様]
- **V-output-styles-07**: 生成した settings の `settings:keys/outputStyle` の値は、組み込みのスタイル名（`Proactive`・`Concise`・`Explanatory`・`Learning`）か、同じ生成物にあるカスタムスタイルの名前（`frontmatter:output-style/name` の値、無ければ拡張子を除いたファイル名）のいずれかと、大文字小文字まで完全に一致する。[仕様]

## 7. 品質基準

- **Q-output-styles-01**: スタイルの本文が、全応答に効く役割・口調・形式の指示に限られている。プロジェクトの知識（→ CLAUDE.md）、特定の作業の手順（→ Skill）、例外なく起こるべき振る舞い（→ Hook）が混ざっていない。[仕様]
- **Q-output-styles-02**: `keep-coding-instructions` の有無が、そのスタイルで Claude にソフトウェアエンジニアリングをさせるかと一致している。コードを書かせる用途なのに省いて、変更の範囲や検証についての組み込みの指示を落としていない。[仕様]
- **Q-output-styles-03**: 安全や必須の手順をスタイルの指示だけに頼っていない。スタイルは強制されないため、保証が要ることは Hook や permissions で担保している。[仕様]
- **Q-output-styles-04**: Subagent（fork を除く）の応答をスタイルで変えられる前提で設計していない。[仕様]
- **Q-output-styles-05**: 配置のスコープが用途に合っている。個人の好みのスタイルをプロジェクトに置いてチームに押し付けていない。[仕様]
- **Q-output-styles-06**: `force-for-plugin: true` を使うとき、ユーザーの `outputStyle` を上書きしてよい理由が要件にある。[仕様]（上書きの事実は仕様。理由を求めるのは canon の規律）
- **Q-output-styles-07**: スタイルの指示が出させる応答の長さが用途に見合っている。長い応答を常に求めるスタイルは出力トークンを増やす。[仕様]

## 8. 出典

- spec
  - https://code.claude.com/docs/en/output-styles.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/settings-reference.md
  - https://code.claude.com/docs/en/plugins/components.md
  - https://code.claude.com/docs/en/plugins/manifest-reference.md
- insight
  - （なし）
