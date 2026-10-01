# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`gates/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中（run ブランチの worktree）で見つけたら `work/<ts>/handoff.md` の「canon 課題候補」に同じ書式で書き、
  Phase D の最後に本台帳へ転記する（`design/architecture.md` §6.4）。
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


## 2026-09-30 `npm run tokens -- <session-id>` が対象プロジェクトの transcript を解決できない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: ヒアリングの手順どおり対象プロジェクトの session-id を渡すと「transcript が無い: ~/.claude/projects/-home-motoki-tabata-work-claude-code-canon/<id>.jsonl」で失敗した。解決先が canon 自身のプロジェクトディレクトリに固定されている（tools/token-usage.js）。jsonl の絶対パスを渡せば動く。
- 提案: tools/token-usage.js で session-id を対象側プロジェクトディレクトリ（v2 では handoff.md の `target` から導く）でも探す（または ~/.claude/projects/* を横断して一意に解決する）。requirements Skill の `references/interview.md` には「対象の transcript は jsonl の絶対パスで渡す」を併記済み（ツール側の修正が済んだら、その併記を外す）。

## 2026-10-01 reviewer 用の review-bundle が未実装で、reviewer が入力を自分で集めている（保守作業）
- 種別: 欠陥修正
- 何が起きたか: artifacts.md §9.1 は reviewer 用のバンドル（生成物の実体と接地材料・design-map の rationale を除く）を定めるが、`.claude/skills/canon-c/scripts/review-bundle.js` は keep-reviewer 用しか作らない。reviewer は generated/・spec・slices・investigation を直接読んでおり、入力を探し損ねて「問題なし」と答える経路と、slices 経由で designer の rationale を読む経路が残っている。
- 提案: review-bundle.js に reviewer 用の出力（`work/<ts>/review-bundle/reviewer/`）を足し、rationale を除くことをテストで固定する。reviewer 定義の「入力」と canon-c の工程8 をバンドルの読みに切り替える。

## 2026-10-01 exit code の規約が canon のスクリプト間でばらばら（保守作業）
- 種別: 欠陥修正
- 何が起きたか: verify・new-run・approvals は 0=合格/1=違反/2=引数不正だが、deploy は引数不正が 1・拒否と巻き戻しが 2、pre-deploy-check は引数不正が 1・uncaptured が 2、slice・copy-keep・emit-run-manifest・token-usage は引数不正が 1、review-bundle は ts を検証せず実行時エラーも 2（各 scripts の usage 処理）。deploy の 2 は RUN.md・canon-d・テストが前提にしている契約。
- 提案: 規約を決めて揃える。deploy の契約を変えるなら RUN.md・canon-d/SKILL.md・artifacts.md §10・テストを同時に直す。

## 2026-10-01 不正な JSON（null）で V4・V6 が例外終了し report が書かれない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: `.mcp.json` が `null` だと v4-security.js:107 が TypeError、plugin.json が `null` だと v6-ref-integrity.js:278-284 も同型。例外終了で verify-report.md が書かれず、exit 1 が「違反」と区別できない。
- 提案: JSON のトップレベルが object でない場合を違反として report に載せる。

## 2026-10-01 review-bundle の caseId が衝突しうる（保守作業）
- 種別: 欠陥修正
- 何が起きたか: review-bundle.js の caseIdFor は非英数字を `_` に潰すため、`foo-bar.md` と `foo_bar.md` が同じ出力名になり後者が前者を上書きする。
- 提案: 衝突時は連番かハッシュ接尾辞を付ける。

## 2026-10-01 存在しない ts で verify が output/<ts>/ を作る・slice.js に main ガードが無い（保守作業）
- 種別: 欠陥修正
- 何が起きたか: 存在しない ts を渡した verify.js が output/<ts>/ を作って「不合格」を報告する（本来は引数エラー）。slice.js は import しただけで実行される。
- 提案: ts の実在を検証して exit 2 にする。slice.js に main ガードを足す。

## 2026-10-01 lib/ の死んだ export が8件ある（保守作業）
- 種別: 効率化
- 何が起きたか: CANON_CONFORMANCE_KEYS（investigation.js）・mentionsBareIdentifier・parseListLike・sourced・stripLineSuffix・stripTrailingAnnotation（markdown.js）・designDocRegExp（canon.js）・ensureDir（run.js）は定義以外の参照が0件（grep で確認）。
- 提案: 削除する（テストが参照していれば、そのテストごと整理）。

## 2026-10-01 V9 の conflicts が「ブロック無し」と「空」を区別しない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: v9-constraints.js の `doc.conflicts ?? []` は、requirements-template の「ブロック自体が無いのと空とは区別される」と一致しない。
- 提案: ブロックが無い場合は違反にするか、テンプレート側の記述を直す。

## 2026-10-01 findHeading が部分一致で別の見出しに当たりうる（保守作業）
- 種別: 欠陥修正
- 何が起きたか: lib/markdown.js:62 の `m[2].includes(text)` は、`確定要件` や `Experimental Dependencies` を含む別の見出しに先に一致しうる。
- 提案: 完全一致か、見出しの先頭一致にする。

## 2026-10-01 対象プロジェクト自前の plugin/ を管理対象とみなす（保守作業）
- 種別: 規律昇華
- 何が起きたか: L5_PLUGIN_PATTERN（`^plugin/.+`）により new-run.js の mode 判定が refactor になり、deploy の退避対象が plugin/** 全体になって node_modules まで走査する。uncaptured が配置を止めるので事故にはならないが、設計上の注意点。
- 提案: plugin の管理範囲を design-map で宣言したものに限るか、走査から node_modules を除く。

## 2026-10-01 token-usage の slug が Windows で合わない（保守作業）
- 種別: 欠陥修正
- 何が起きたか: tools/token-usage.js:151 は `[\\/]` だけを `-` に置換する。ドライブ文字の `:` や `.`・`_` の置換が足りず、canon 側のプロジェクトディレクトリ解決も Windows で外れる（対象側 transcript の件とは別）。
- 提案: Claude Code の slug 規則に合わせて置換する。上の tokens の項目と一緒に直す。

## 2026-10-01 V9 の hooks 検出が skill の supporting dir の hooks/ を誤検出しうる（保守作業）
- 種別: 欠陥修正
- 何が起きたか: v9-constraints.js の `(^|\/)hooks\/` は、skill の supporting dir にある `hooks/*.md` も hook の実体とみなす。
- 提案: `.claude/hooks/**`・`plugin/hooks/**` に限る。

## 2026-10-01 settings.json の deny パターンが RUN.md の deploy 書式を拾わない可能性（保守作業）
- 種別: 規律昇華
- 何が起きたか: deny `Bash(node *deploy.js * --confirm*)` は deploy.js の直後が空白であることを要求するが、RUN.md のコマンドは `node "<canon>/…/deploy.js" …`（直後が引用符）。glob の解釈は実機未確認。`npm run deploy … --confirm` の形は一致する。
- 提案: 実機で deny が効くかを確かめ、効かなければパターンを直す。

## 2026-10-01 Phase 終わりの git add -f・git commit が allow に無く毎回確認が出る（保守作業）
- 種別: 効率化
- 何が起きたか: canon-a〜d の各 Phase 終わりに `git add -f work/<ts> output/<ts>`・`git commit` を使うが、allow は読み取りの git だけ。
- 提案: 意図した確認なら .claude/README.md か settings.json の $comment に一言書く。不要なら allow に足す。

## 2026-10-01 docs/00_INDEX.md の「後続Phase」が canon の Phase A〜D と紛らわしい（保守作業）
- 種別: 規律昇華
- 何が起きたか: docs/00_INDEX.md:381 の「後続Phaseまたは利用時に追加検証が必要」。docs/ は正典なので、直すときは build:tables と npm test を通す。
- 提案: 「後の調査または利用時に」へ言い換える。
