# design-map.md のテンプレート

`output/<ts>/design-map.md` に書く。**見出しは機械が読む**（スライスの切り出し・宣言の抽出・検査）ので、次の見出し名と形を守る。

## 見出しの契約

- 機能ごとの節の見出しは `## <機能>` で**始める**。`<機能>` は `canon-reference/references/features/*.md` のファイル名の12通り（claude-md・rules・skills・subagents・hooks・mcp・settings・permissions・statusline・plugins・plugin-mods・output-styles）。括弧書きの補足は可: `## skills（手順）`。`## スキル群` のような別の語にすると、宣言が0件になって検査が止まる。
- 使わない機能の節は置かなくてよい（`## Used Features` で N/A と書く）。
- 機能の節の下には、生成物を1件ずつ ``### `パス` `` の見出しで宣言する（skills・subagents は名前だけでもよい: ``### `test-gen` ``）。新規も改修も維持も、生成されるものは全部ここに並べる。廃止するものは見出しの注記に `retire` か `廃止` と書く（宣言から外れる）。
- 既存の判定は `## 既存判定` の見出しの下の YAML ブロックに書く。
- `## Used Features` は必須（無いとスライスの切り出しが失敗する）。`## Write Scopes` は見出しの文字列が完全一致。
- 共通の節: `## メタ`・`## Used Features`・`## 構成と責務`・`## Model Assignments`・`## Interface Contracts`・`## 生成上の制約`・`## 要件→生成物の対応`・`## 参照元からのコピー`（任意）・`## 管理パス外の変更`・`## Experimental Dependencies`・`## 依存フラグ`。
- `## 参照元からのコピー`（任意）は、requirements.md の `## 参照元` から**ほぼ逐語で移すファイル**の一覧。1行1件で ``- <参照元の絶対パス> → <生成先の相対パス>`` と書く。コピー元は `## 参照元` の `path` の配下、生成先は管理パス集合の中でなければならず、外れると copy-keep が止まる。生成先は機能の節にも ``### `パス` `` で宣言する（V8 は宣言の無い生成物を止める）。大きなスクリプトやテストなど、builder に打ち直させると時間と文脈を使うものだけを挙げる。builder は、コピー済みのファイルを読んで、参照元との差分（対象に合わせる箇所）だけを Edit する。参照元のパスは生成物に書かない。
- `## 管理パス外の変更` の各項目は ``### <ID> `<対象パス>` <要約>`` の見出しと、`要件`・`変更内容`・`根拠`・`確認`・`撤回条件`・`撤回したら直す生成物` の6つの欄を持つ。欄が欠けている、対象パスが管理パス集合の中にある、`根拠` が「試行待ち」のまま残っている、のどれかがあると emit-manifest が止まる。
- `根拠` に「現状どこも〜していない」のような不在だけを書かない。対象の振る舞いを変える変更の成否は、実際に試すまで分からない（あなたはコマンドを実行できないので「試行待ち」と書き、試すのはオーケストレーター）。

## テンプレート

````markdown
# design-map.md

## メタ
spec_ref: output/<ts>/spec.md
patterns: <委譲|並列|強制|配布 を組み合わせて並べる。単純な構成は なし（単体）>
rationale: <型の選択理由を1〜2文>

## Used Features
<12機能のうち使うものを挙げ、使わないものは N/A と書く。次の1行を必ず書く: `builder を起動する機能: rules・skills`（機能名を「・」で並べる）。ここで builder を起動する担当が決まる>

## 構成と責務
<機能・カスタマイズごとの1文責任。例: rules: … / skills: … / subagents: …>

## Write Scopes
<役割ごとの常設の書込範囲と、共有する構成ファイルの扱い。役割分担が無い設計は「N/A（役割分担なし）」>

## 既存判定
```yaml
existing_disposition:
  - path: .claude/agents/reviewer/reviewer.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "<判断の根拠を1〜2文>"
  - path: .claude/skills/lint/SKILL.md
    disposition: modify
    interface_change: none
    rationale: "本文に節を足すだけ。frontmatter の name は変えない"
  - path: .claude/skills/old-test-gen/SKILL.md
    disposition: retire
    reason_code: superseded_by_new
    superseded_by: .claude/skills/test-gen/SKILL.md
    manifest_note: "old-test-gen は廃止し、test-gen へ移行"
```

## claude-md
### `CLAUDE.md`（modify）
<builder への指示: 何をどう書くか。対象の非管理ファイルは節見出しで参照する>

## skills
### `.claude/skills/test-gen/SKILL.md`（新規）
<指示>

## subagents
### `.claude/agents/reviewer/reviewer.md`（keep）

## Model Assignments
<各実行単位の model と effort、その根拠を1行ずつ>

## Interface Contracts
<カスタマイズ間の呼び出しの向き・入出力・依存>

## 生成上の制約
<builder への指示。対象プロジェクトの非管理ファイルへの参照は、行番号でなく節見出しで書かせる（V6）>

## 要件→生成物の対応
| 要件 | 主な生成物 | 受入基準 |
|---|---|---|
| R1 | `.claude/rules/x.md` | A1-1・A4-1 |

## 配置時の追加手順
<配置の前後に人間が行う手作業（ファイルを変えないもの）。無ければ「なし」>

## 参照元からのコピー
<requirements.md に `## 参照元` があり、ほぼ逐語で移すファイルがあるときだけ。無ければ節ごと書かない>
- /abs/ref/skills/x/run.mjs → .claude/skills/x/scripts/run.mjs

## 管理パス外の変更
<要件の実現に要る、管理パス集合の外のファイルの変更。無ければ「なし」。1件ずつ次の形で書く>
### 2-1 `frontend/vitest.config.ts` に setupFiles を足す
- 要件: R18
- 変更内容: <何をどう変えるか。差分が再現できる粒度で>
- 根拠: <対象のテスト・ビルド・CI の振る舞いを変える変更は「試行待ち」と書く（Phase B でオーケストレーターが対象の一時 worktree で試し、結果に書き換える）。変えない変更は、変えないと言える理由>
- 確認: <適用後に実行するコマンドと、通ったとみなす結果>
- 撤回条件: <確認が通らないときに戻す範囲と手順>
- 撤回したら直す生成物: <この変更の成果物を前提に書く生成物のパスと節（機能の節で、その成果物に触れるよう指示した生成物を全部）。無ければ「なし」>

## Experimental Dependencies
<constraints が許すときだけ。無ければ「なし」>

## 依存フラグ
<ネストの段数・isolation: worktree の要否>
````

## 書き方の要点

- **keep_conditions は5つを並べる**。1つでも false なら keep にできない構造にして、判定を裁量から規則の適用に近づける。
- **retire と merge のレコードには `manifest_note` を必ず書く**。
- spec §8 で `[mandatory]` を付けた受入基準は取捨の対象外。すべて `## 要件→生成物の対応` に ID を載せる（範囲表記 `A1-1〜A1-4` も可）。
- 読み手（builder）は、自分の担当の機能の節と共通の節だけを読む。節の下に「他の機能の情報」を混ぜない。
- `## 配置時の追加手順` は、emit-manifest が MANIFEST に写し、配置手順書がそのまま転記する。対象側の台帳の照合など、ファイルを変えない run 固有の手作業があるときだけ書く。
- 管理パス集合の外のファイル（テスト設定・CI・スクリプト・非管理の文書）を変えるときは、`## 配置時の追加手順` の散文に混ぜず `## 管理パス外の変更` に1件ずつ書く。generated/ には入れない。emit-manifest が MANIFEST に写し、配置手順書が「3a」として転記し、Phase D で1件ずつ適用と確認を記録する。
