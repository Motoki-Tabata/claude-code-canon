# 既存カスタマイズの処遇

refactor モード（既存のカスタマイズがある）でだけ使う。existing.md の各レコードに、次の判定を1つずつ割り当てる。new モードでは使わない。

## なぜ全量を引き直すのか

配置は、管理パス集合（`CLAUDE.md`・`.claude/rules/**`・`.claude/skills/**`・`.claude/agents/**`・`.claude/settings.json`・`.claude/hooks/**`・`.claude/README.md`・`.mcp.json`・`plugin/**`）を**全置換**する。output に無いファイルは対象から消える。だから output には、配置後の全量を置く。差分パッチにはしない。

## 判定

| 判定 | output での扱い | 書くもの |
|---|---|---|
| `keep` | 既存の実体を**そのままコピー**する。再生成しない。Phase C の冒頭でオーケストレーターが `copy-keep` でバイト単位にコピーする（LLM が読んで書き写すと写し違いが起きる） | `keep_conditions`（K1〜K5）・`rationale` |
| `modify` | 新しい内容で生成する | `interface_change`・`rationale` |
| `merge` | 他と統合する。統合される側は output に置かない | `reason_code`・`superseded_by`（統合先）・`manifest_note` |
| `retire` | output に置かない。MANIFEST と `retired.list` に明示される | `reason_code`・`superseded_by`（あれば）・`manifest_note` |
| `out_of_scope` | 管理パス集合の外にある既存の実体（例: `tasks/` 配下）。設計の判断としては言及したいが、上の4つのどれでもないとき | `manifest_note`（なぜ管理対象外か） |

- 「keep＝再生成しない」を「output に置かない」と読まない。keep は output にコピーされて初めて、配置後も残る。
- `retire` は最も慎重に扱う。機能そのものが要らない、または統合後の全体像に居場所が無い、ときだけ。MANIFEST への明示と、人間の確認が要る。
- `retire` にすると配置時に削除される。管理パス集合の外の、まだ使われている実体を `retire` にしてはならない（`out_of_scope` にする）。逆に、管理パス集合の中のパスに `out_of_scope` を付けてはならない。
- `modify` は、機能は要り、単体で成立し、正典からの逸脱や新要件との差を直せば使えるもの。`merge` は、複数の既存が同じ目的で重複している、または新規のものがその役割を包含するもの。

## keep は「積極的な維持」——5つの条件がすべて要る

`modify`・`merge`・`retire` は「変える」判断なので差分に出て、人間がゲートで気づける。`keep` は「変えない」判断で、差分に出ない。誤った現状維持は誰にも気づかれずに通る。特に全量スナップショットでは、陳腐化した keep が最も見つけにくい。だから keep にだけ厳しい条件を課す。次のすべてを満たすときだけ keep にできる。1つでも欠ければ、modify・merge・retire のどれかにする。

| 条件 | 内容 | 誰が判定するか |
|---|---|---|
| K1 正典適合 | existing.md の `canon_conformance` が clean（`frontmatter_keys_valid`・`tool_names_valid` が `true`、`unknown_frontmatter_keys`・`deprecated_notation` が空） | verify V7（事実照合） |
| K2 要件非抵触 | spec の新要件・統合方針と競合も重複もせず、requirements.md の `conflicts` に現れない | keep-reviewer（意味判断） |
| K3 依存健全 | existing.md の `customization_refs` の参照先が、今回の design-map で `retire`・`merge` にならない。`modify` になるなら、そのレコードが `interface_change: none` を宣言している | verify V7（事実照合） |
| K4 強度整合 | 既存が担う強度が、requirements.md の `strength_needed` と constraints に矛盾しない | keep-reviewer（意味判断） |
| K5 実態整合 | existing.md の `project_refs` がすべて、focused.md の `ref_resolution` で `resolved: true` | verify V7（事実照合） |

- K1・K3・K5 は事実と照らして機械が確かめる。K2・K4 は意味の判断を要するので、あなた（designer）は「要件と衝突しないと判断した」という宣言（boolean）を立てるだけで、意味としての正しさは keep-reviewer が、designer の主張を見ずに独立して判定する。**迷うときは true にせず、modify か merge に回すか、rationale に迷いを書く**（疑いのある keep は P3・P4 で人間に示される）。
- K3 の `interface_change: none` は、設計の時点では確かめようがない（生成物がまだ無い）。あなたが `none` を宣言するのは「対外のインタフェースを変えないと約束する」ことで、生成後に verify V7 が原本と output の署名を照合する。正直に宣言する。
- K3 の照合は参照の向き（`customization_refs`）しか見ない。keep にするテストやスクリプトが、同じ run で `modify` する同梱データ（`reflection.json` のような件数の決まった一覧・スナップショット・fixture）の**件数や内容を固定していないか**は、あなたが原本を読んで確かめる。固定していれば、そのデータの変更で keep のテストが落ちるので、K3 を true にせず `modify` にする（verify は件数の固定を見ない）。

## interface_change

`modify` のレコードでだけ意味を持つ。`none`（対外インタフェースを変えない）か `breaking`（変える、または分からない）。**書かなければ `breaking` とみなされる**。`retire`・`merge` のレコードに書かない。

`none` と宣言できるのは、対外インタフェースの署名が変わらない改修だけ。署名は種別ごとに決まっている。

| 種別 | 署名 |
|---|---|
| SKILL.md・Subagent の定義 | frontmatter の `name` |
| rule | `paths:` の値（並べ替えた一覧）。`paths:` が無い rule は「無条件に読み込まれること」。本文に節を足すだけなら署名は変わらない |
| `CLAUDE.md`・`.claude/README.md` | 見出しの構造 |
| JSON（settings.json・.mcp.json など） | トップレベルのキーの集合 |
| 付随スクリプト（`.js`・`.mjs`） | export する識別子の集合 |
| 上記以外 | 検査できないので、`none` の宣言は違反になる |

## 判定のレコード

書式は [design-map-template.md](design-map-template.md) の `## 既存判定` にある。retire と merge のレコードには `manifest_note` を必ず書く（何を、なぜ廃止し、どこへ移行するか）。

## P3 で人間に示される範囲

注意を要するものに絞って示される: retire の全件／merge の統合先／K2・K4 に疑いのある keep。5条件を明らかに満たす keep（新要件と無関係なもの）は要約だけになる。だから、あなたが迷った keep は、迷ったと分かるように rationale に書く。
