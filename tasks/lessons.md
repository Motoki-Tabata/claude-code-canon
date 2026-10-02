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


## 2026-10-01 reviewer 用の review-bundle が未実装で、reviewer が入力を自分で集めている（保守作業）
- 種別: 欠陥修正
- 何が起きたか: artifacts.md §9.1 は reviewer 用のバンドル（生成物の実体と接地材料・design-map の rationale を除く）を定めるが、`.claude/skills/canon-c/scripts/review-bundle.js` は keep-reviewer 用しか作らない。reviewer は generated/・spec・slices・investigation を直接読んでおり、入力を探し損ねて「問題なし」と答える経路と、slices 経由で designer の rationale を読む経路が残っている。
- 提案: review-bundle.js に reviewer 用の出力（`work/<ts>/review-bundle/reviewer/`）を足し、rationale を除くことをテストで固定する。reviewer 定義の「入力」と canon-c の工程8 をバンドルの読みに切り替える。


## 2026-10-01 セッション分析の「逐語保存」がメインの出力トークンを大量に使う（run 20261001_184754・Phase A）
- 種別: 効率化
- 何が起きたか: interview.md は、分析を Explore（読み取り専用）に任せ、その応答本文をメインが逐語で `work/<ts>/session-analysis-<名前>.md` に保存するよう定めている。2件で約3万字あり、メインがこれを Write で書き直すことになった。opus の出力トークンを、転記のためだけに使っている。
- 提案: `.claude/skills/requirements/references/interview.md` の分析手順を変える。書込先を `work/<ts>/session-analysis-*.md` の1ファイルに限る分析専用の Subagent 定義（tools: Read, Grep, Glob, Bash（読み取り）, Write）を用意し、その Subagent が自分で保存する。メインは実在と要旨だけを確かめる。

## 2026-10-01 investigator（focused）が公式ドキュメントを読めず、Claude Code の仕様に関わる要件を裏取りできない（run 20261001_184754・Phase A）
- 種別: 欠陥修正
- 何が起きたか: R3（組込み Skill をモデルから起動できるか）・R15（allow と分類器の関係）・R6（待ちの手段）について、investigator は「確かめられなかった」と返した。investigator の tools は Read・Grep・Glob・Write だけで、WebFetch を持たないためである。オーケストレーターが claude-code-guide に確かめさせ、その結果を `investigation/official-check.md` に手で残した。手順の外の工程になっている。
- 提案: canon-a の工程3に「要件が Claude Code の仕様に依存するときは、claude-code-guide で公式の仕様を確かめ、`investigation/official-check.md` に残す」を足し、spec-writer の入力に加える。または investigator（focused）に WebFetch を足す。

## 2026-10-01 管理パスの外の改修を要件にしたとき、それを運ぶ正規の経路が無い（run 20261001_184754・Phase A）
- 種別: 欠陥修正
- 何が起きたか: ユーザーが「スコープ外（vitest.config.ts・ci.yml・scripts/）でも、要件の実現に要るなら今回は改修してよい」と指示した（R18）。しかし generated/ は管理パス集合の中に限られ（spec A4-1）、管理パスの外の変更は「配置時の追加手順（散文）」に書くしかない。差分の実体・検証・適用の記録が、どこにも機械的に残らない。
- 提案: design-map と RUN.md に「管理パス外の変更」の節（対象のパス・変更内容・適用後の確かめ方）を設け、canon-d の配置の後で、適用と確認をチェックリストとして扱う。requirements-template.md にも、管理パスの外を改修対象にするときの書き方を足す。

## 2026-10-02 R18 の追加手順 2-2（setup.ts の enableAutoUnmount）が実際には 175 件のテストを壊した（run 20261001_184754・Phase B→D）
- 種別: 規律昇華
- 何が起きたか: design-map の 2-2 は「現状どの spec も enableAutoUnmount を呼んでいない」ことだけを根拠に、`setupFiles` で `enableAutoUnmount(afterEach)` を足す設計だった。配置後に適用して `pnpm test:unit` を実行すると、Dialog 系 spec が `document.body.innerHTML = ''` の後に自動 unmount して `Cannot read properties of null (reading 'nextSibling')` で 175 件失敗した（setupFiles を外すと元に戻る）。2-2 の確認欄に書いてあった撤回手順どおり、setup.ts と setupFiles を外し、規約の明示だけで運用することにした。
- 提案: R18 の追加手順のうち、対象のテスト・ビルドの振る舞いを変えるもの（テスト設定・CI・スクリプト）は、design の段階で対象のブランチ上で試して結果を根拠にする（investigator の focused か、設計後の検証工程）。「現状どの spec も呼んでいない」のような不在の根拠だけで設計しない。

## 2026-10-02 生成した rule が、配置されない（撤回した）追加手順の成果物を前提に書かれていた（run 20261001_184754・Phase D）
- 種別: 規律昇華
- 何が起きたか: 追加手順 2-2 の setup.ts を撤回したのに、生成物の `.claude/rules/frontend-pnpm.md`「モーダル／ダイアログ系 spec の後始末」は「`frontend/src/test/setup.ts` のグローバルな enableAutoUnmount」の存在を前提に書かれていた。管理パスの外の成果物を前提にする生成物は、その手順を撤回すると宙に浮く。対象側で rule を直接直した。
- 提案: design-map で、生成物の本文が R18 の追加手順の成果物を参照するときは、その参照を追加手順の確認欄の撤回条件にも書く（撤回したら直す生成物を明示する）。
