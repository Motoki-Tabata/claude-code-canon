# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`gates/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §6.4）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には設計書2冊（architecture.md・artifacts.md）だけを置く。未対応の backlog は本台帳だけに置く。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・Phase <A〜D> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 提案: <行き先（ファイルと節）と直し方を1〜3行>
```

---

## 2026-10-09 正典リファレンスの data に、件数を持つ一覧の置き場が足りない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: 手順3の執筆で、§4.2 に置き場の無い一覧を担い手が本文に写すか、要素の独自フィールドに押し込んだ。組み込みの出力スタイル・`subagentStatusLine` の Task fields・Skill の置換変数・組み込みのサブエージェントの種類・hook の matcher の評価規則とハンドラーの共通フィールド（今は `handler-types` の `fields` に `common: true`）・Mods の render site と要素と上限とファイル構成・Global config のキー。
- 提案: `design/canon-reference-build.md` §4.2 で、それぞれをどのファイルのどのコレクションに置くか（置かないか）を決め、表に足す。

## 2026-10-09 正典リファレンスの data の規約に、解釈の割れる箇所がある（保守作業）
- 種別: 欠陥修正
- 何が起きたか: 手順3で担い手ごとに解釈が分かれた。`complete: true` のときの `complete_basis`、数字を使わない件数の表現（"the only field"）を `stated_total` にするか、同じページの別 anchor の値をオブジェクトにするか、公式の "Recommended" の表し方（今は `recommended: true`）、`marketplace:source-types` の `required` の意味、`paths:files` の `commit` の意味。
- 提案: `design/canon-reference-build.md` §4.1・§4.2 にそれぞれの決まりを1行ずつ足す。

## 2026-10-09 正典リファレンスの検査9の grep が普通の語に当たる（保守作業）
- 種別: 欠陥修正
- 何が起きたか: §8 の検査9の禁止語のうち `3層` は「3層下まで」のような日本語に、`L1`〜`L5` は語の境界を付けないと `WSL2` に当たる。subagents の担い手は言い換えで避けた。
- 提案: `design/canon-reference-build.md` §8 の検査9を、語の境界付きの `L[1-5]` と「N層構成」のような独自の用語の形に絞る。

## 2026-10-09 placeable_files にプラグインにしか無いファイルの行が無い（保守作業）
- 種別: 欠陥修正
- 何が起きたか: `paths:files` を書いた担い手が、`.claude-plugin/plugin.json`・`hooks/hooks.json`・`.lsp.json`・`monitors/monitors.json`・`bin/` の割り当てを決められず、すべて `feature: plugins` にした（`hooks/hooks.json` を hooks にするかは未決）。
- 提案: `design/canon-reference-build.md` §1.1・§3.4 で、`placeable_files` の範囲をプラグインのファイルに広げるか、`paths:files` の `feature` の決め方を書く。

## 2026-10-09 insight に .md 版が無いときの取得手順が無い（保守作業）
- 種別: 効率化
- 何が起きたか: anthropic.com/engineering の記事は `.md` 版が無く、`curl` では HTML が返る。WebFetch は要約なので原文の引用が正確とは限らない。担い手ごとに HTML を取ってタグを除くか、WebFetch に頼るかが分かれた。
- 提案: `design/canon-reference-build.md` §3.1 に、HTML を `curl` で取ってテキストにし、引用を grep で原文と照合する手順を足す。

## 2026-10-09 委譲先がファイルを書くときにヒアドキュメントの展開でコマンドを実行した（保守作業）
- 種別: 規律昇華
- 何が起きたか: 件数の独立取得の担い手が、引用符の無いヒアドキュメントで JSON を書き、本文のバッククォートが展開されて `claude --permission-mode manual` が起動した（入力が無くエラーで終わった）。
- 提案: `design/canon-reference-build.md` §7 の委譲プロンプトの必須事項に「ファイルは Write で書く。シェルで書くならヒアドキュメントの区切りを引用符で囲む」を足す。
