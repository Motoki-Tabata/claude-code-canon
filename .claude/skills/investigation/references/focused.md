# focused.md（要件に関係する箇所の深掘り）

要件が確定したあとにだけ書く。確定要件に**関係する箇所だけ**を深く読み、あわせて existing.md の `project_refs` を実際のリポジトリに照合する。要件に無関係な事項を書き足さない（調査が広がると spec が際限なく大きくなる）。

入力として、確定した `requirements.md` と、existing.md の `project_refs` の一覧が渡される。

## テンプレート

```markdown
## focused
requirement_ref: <対象にする要件の id>
scope: <深掘りした範囲>
findings:
  - topic: <論点>
    evidence_paths: [src/a.ts:12-40, src/b.ts]
    summary: <要約>
extractable_templates:
  - source: <抜き出せる素材のパス>
    as: <Skill の supporting file などとしてどう使えるか>
    note: <補足>
ref_resolution:
  - ref: "src/**/*.ts"  kind: paths_glob  resolved: true  match_count: 42  sample: "src/app.ts"
  - ref: "./scripts/x.sh"  kind: supporting_file  resolved: false  reason: "not found"
```

## 調べ方

- 語がどこにどれだけあるかは、Grep の `output_mode` を `count` か `files_with_matches` にして取る。該当行の抜き出し（`content`）は、分布を見て対象のファイルを絞ってから行う。ディレクトリ全体を `content` で引くと出力が大きくなり、会話に入らずにファイルへ退避される。
- 多数の語を `|` で並べた検索は、語ごとの分布を見てから必要な語に絞る。

## 書き方

- `evidence_paths` は必須。根拠のパスを示せない findings は書かない（幻覚の防止）。`extractable_templates` は、生成物をこのプロジェクトに接地させる素材になる。
- `ref_resolution` は「実在するか」の真偽だけを返す。陳腐化しているという評価はしない（それは designer の仕事）。existing.md が渡した `project_refs` を、**そのままの文字列・そのままの粒度**で `ref` に転記する。独自に正規化・要約・結合しない。
- `resolved` は `true` か `false` だけ。「たぶん」「要確認」は書かない。解決できなければ `resolved: false` と `reason` に理由を書く。
- `<ts>` を含まない固定名の動的生成パス（run の実行中にだけ作られるファイル名など）も、`project_refs` に挙がっていれば省略せずエントリを書く。省略すると、K5 がエントリ欠落として同じく止まる（実在しなければ `resolved: false` が正しい）。

## 値の語彙

1. `evidence_paths` は対象ルート相対のパスを裸で書く。バッククォートで囲まない（パーサはダブルクォートは外すがバッククォートは外さないので、囲むと実在確認に失敗する）。絶対パスも書かない（対象リポジトリの外を検査してしまう）。
2. 複数のパスは `[a, b, c]` の角括弧が必須。角括弧が無いと、カンマ区切りに見えても行全体が1つのパスとして扱われ、実在しないパスとして違反になる。
3. 末尾に行番号 `:N` や行範囲 `:N-M` を付けてよい。1項目の中にカンマ区切りの複数行番号（`path:12,40`）は書かない（角括弧の内側ではカンマが項目の区切りになり、`40` が単独の存在しないパスになる）。複数行を示すなら行範囲にするか、findings を分ける。
4. `evidence_paths` は同じ行に書く。次行以降に箇条書きで並べると、読まれずに検査から漏れる。
5. `ref_resolution` の各エントリは `- ref: <値>  kind: <語>  resolved: <true|false>` をこの順で**1行**に書く（`match_count`・`sample`・`reason` は同じ行の後ろでよい）。キーを複数行に分けたり順序を入れ替えると、そのエントリは存在しなかったことになり、K5 が「未解決」として止まる。
6. `ref` は existing.md の `project_refs[].value` と文字列で完全一致させる。1参照につき1エントリ。

## 書いたあとの確認

自分の出力を Read し直し、existing.md の `project_refs` の全件が `ref_resolution` にあること、各エントリが1行形式であることを確かめる。
