# profile.md（プロジェクトの実態・浅く広く）

要件を聞く前に、profiler が書く。言語・ビルド・テスト・CI・規約の**骨格**だけを調べ、ヒアリングで「この対象はこういう現場だ」と示せる材料にする。深掘りは要件が決まったあとの investigator（findings）で行うので、ここで掘りすぎない。カスタマイズの一覧と件数は `npm run inventory` が数えるので、ここでは書かない。

## テンプレート

```markdown
## profile
languages: [<言語>]
frameworks: [<フレームワーク>]
build: <ビルド手段>
package_manager: <パッケージマネージャ>
test:
  frameworks: [<テストフレームワーク>]
  test_dirs: [<テストの置き場>]
  runner_cmd: <テストの実行コマンド>
ci: <CI の有無と種類>
conventions: <命名・lint・format の規約>
existing_docs: [<README・docs など>]
learning_history: <対象プロジェクト自身の学習履歴ファイルの有無と所在>
```

## 書き方

- 実在を確かめたものだけを書く。README に書いてあるコマンドを鵜呑みにしない（README が古いと、実在しない手順が後段の差分に入り込む）。テストの実行コマンドは package.json・Makefile・CI 設定など、実際に動く側から取る。
- `learning_history` は、対象が過去に踏んだ落とし穴（依存の罠・CI の既知の失敗など）の記録。ヒアリングで同じ問題を繰り返さないために要る。ファイル名はプロジェクトごとに違う（`tasks/lessons.md`・`docs/lessons.md` など）ので、固定パスで探さず、README や CLAUDE.md の言及を手がかりに探す。見つかれば有無と所在のパスを書く。無ければ空欄でよい。その中身は「文言のみ」の根拠であり、要件にする前に実物で確かめる。
- 数えられなかったもの（ファイル数など）は、推測で埋めず「数えられなかった」と書く。
- 根拠のパスを示せない項目は書かない。

## 値の語彙

パス列は、[findings.md](findings.md) の「値の語彙」と同じ規則で書く。
