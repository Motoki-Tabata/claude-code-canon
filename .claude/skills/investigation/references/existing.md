# existing.md（既存カスタマイズの棚卸し）

対象の `CLAUDE.md`・`.claude/rules/`・`.claude/skills/`・`.claude/agents/`・`.claude/hooks/`・`.claude/settings.json`・`.mcp.json`・`plugin/` を、正典リファレンス（`canon-reference/data/paths.json` の `feature`）の分類軸で1ファイル1レコードに分解する。skill ディレクトリの `scripts/`・テンプレートなどの supporting files も、Glob で列挙して1件ずつ記録する（SKILL.md だけで済ませない。記録から漏れた実在ファイルは、配置時に黙って消える）。

## テンプレート

```markdown
## サマリ
総数 <n>（<機能> <n> / <機能> <n> …。件数のある機能だけ）／正典から外れている疑い（事実のみ）

## レコード（1ファイル1件）
- path: <対象ルート相対のパス>
  feature: claude-md|rules|skills|subagents|hooks|mcp|settings|permissions|statusline|plugins|plugin-mods|output-styles
  kind: <claude-md|rule|skill|agent|hook|settings|mcp|plugin|…>
  strength: advisory|deterministic|enforced
  purpose_verbatim: "<frontmatter description の転記>"
  frontmatter_keys: [<キー>]
  declared_tools: [<ツール>]
  declared_model: <値>
  declared_skills: [<名前>]
  depends_on:
    customization_refs: [<他のカスタマイズ・設定への参照>]
    project_refs:
      - kind: paths_glob  value: "src/**/*.ts"
      - kind: supporting_file  value: "./scripts/x.sh"
  referenced_by: [<逆参照>]
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
```

## 書き方

- `feature` はパスで決める。まず `canon-reference/data/paths.json` の `feature` を引く（`CLAUDE.md` は claude-md、rules の `.md` は rules、`skills/<名前>/SKILL.md` は skills、agents の `.md` は subagents、`.mcp.json` は mcp、`plugin/**` は plugins、settings.json は settings）。data に無い `.claude/hooks/**` は hooks。scripts・README など分類に裁量があるものは、役割で決めて理由を1行添える。
- `depends_on` は2つに分ける。`customization_refs` は他のカスタマイズ・設定への依存（keep の K3 が見る）、`project_refs` はプロジェクトの実体への参照（K5 が見る）。**実在するかどうかはここでは確かめない**（focused の仕事）。
- `canon_conformance` は正典との差の**事実**だけを書く。意味的な良し悪しは評価しない（K1 が見る）。
- 各レコードに `canon_conformance`（4キー）と `depends_on`（両方）を必ず含める。この2つが keep 判定の唯一の材料で、欠けると keep は全件 modify に倒れ、keep の非回帰の検査が1件も走らなくなる。

## 値の語彙（機械が文字列で照合する）

1. レコード見出しは `- path: <パス>` の1行にパスだけを書く。`layer`・`kind`・`strength` は字下げした別行に書く（1行にまとめない）。
2. `project_refs[].value` は裸パスで書く。バッククォートで囲まない（focused の `ref_resolution[].ref` と文字列で完全一致させるため、囲むと一致せず「未解決」の誤判定になる）。`project_refs` は `- kind: <語>  value: <値>` の1行形式の箇条書きだけが有効。インライン角括弧 `project_refs: [...]` にまとめたり、`kind` と `value` を別行に分けると、その参照は読み飛ばされて K5 の照合から静かに消える。無ければ `project_refs: []`。
3. `deprecated_notation` が「無し」のときは `[]` だけで表す。「なし」などの自然文は clean と見なされない。`tool_names_valid` は `tools:` を宣言しないレコードでも `true` と書く（検査対象が無いので適合）。`n/a` や省略はしない。
4. `project_refs` は1参照につき1エントリ。節番号のまとめ書き（`"design.md §8, §8.1"`）や複数パスの圧縮（`"a.js, b.js"`）はしない。focused の `ref_resolution` と完全一致で結合されるので、粒度がずれると解決できる参照まで「未解決」になる。
5. `customization_refs` は、インライン角括弧 `[a, b]` か次行以降の `- a` 箇条書きだけが有効。角括弧の無いカンマ列は空リストとして読まれ、依存関係が何も検査されない。無ければ `[]`。
6. `kind: settings`（frontmatter を持たない JSON）のレコードは `unknown_frontmatter_keys: []` に固定する。JSON のトップレベルキーは「未知の frontmatter キー」ではない。
7. `canon_conformance` の4キーは1キー1行の `key: value` で書く（1行に詰め込むと残りのキーが欠落する）。
8. サマリの総数と機能ごとの内訳は、レコードの `- path:` 行の数と一致させる。

## 書いたあとの確認

自分の出力を Read し直し、`- path:` 行の数がサマリの総数と一致すること、全レコードに `canon_conformance` と `depends_on` があることを確かめる。
