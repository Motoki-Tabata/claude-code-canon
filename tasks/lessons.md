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

## 2026-10-02 R18 の追加手順 2-2（setup.ts の enableAutoUnmount）が実際には 175 件のテストを壊した（run 20261001_184754・Phase B→D）
- 種別: 規律昇華
- 何が起きたか: design-map の 2-2 は「現状どの spec も enableAutoUnmount を呼んでいない」ことだけを根拠に、`setupFiles` で `enableAutoUnmount(afterEach)` を足す設計だった。配置後に適用して `pnpm test:unit` を実行すると、Dialog 系 spec が `document.body.innerHTML = ''` の後に自動 unmount して `Cannot read properties of null (reading 'nextSibling')` で 175 件失敗した（setupFiles を外すと元に戻る）。2-2 の確認欄に書いてあった撤回手順どおり、setup.ts と setupFiles を外し、規約の明示だけで運用することにした。
- 提案: R18 の追加手順のうち、対象のテスト・ビルドの振る舞いを変えるもの（テスト設定・CI・スクリプト）は、design の段階で対象のブランチ上で試して結果を根拠にする（investigator の focused か、設計後の検証工程）。「現状どの spec も呼んでいない」のような不在の根拠だけで設計しない。

## 2026-10-02 生成した rule が、配置されない（撤回した）追加手順の成果物を前提に書かれていた（run 20261001_184754・Phase D）
- 種別: 規律昇華
- 何が起きたか: 追加手順 2-2 の setup.ts を撤回したのに、生成物の `.claude/rules/frontend-pnpm.md`「モーダル／ダイアログ系 spec の後始末」は「`frontend/src/test/setup.ts` のグローバルな enableAutoUnmount」の存在を前提に書かれていた。管理パスの外の成果物を前提にする生成物は、その手順を撤回すると宙に浮く。対象側で rule を直接直した。
- 提案: design-map で、生成物の本文が R18 の追加手順の成果物を参照するときは、その参照を追加手順の確認欄の撤回条件にも書く（撤回したら直す生成物を明示する）。
