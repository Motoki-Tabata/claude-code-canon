# profile.md（プロジェクトの実態・浅く広く）

要件を聞く前に書く。言語・ビルド・テスト・CI・規約の**骨格**だけを調べ、ヒアリングで「この対象はこういう現場だ」と示せる材料にする。深掘りは要件が決まったあとの focused で行うので、ここで掘りすぎない。

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
repo_scale: <ファイル数・規模の目安>
existing_docs: [<README・docs など>]
learning_history: <対象プロジェクト自身の学習履歴ファイルの有無と所在>
```

## 書き方

- 実在を確かめたものだけを書く。README に書いてあるコマンドを鵜呑みにしない（README が古いと、実在しない手順が後段の生成物に入り込む）。テストの実行コマンドは package.json・Makefile・CI 設定など、実際に動く側から取る。
- `learning_history` は、対象が過去に踏んだ落とし穴（依存の罠・CI の既知の失敗など）の記録。ヒアリングで同じ問題を繰り返さないために要る。ファイル名はプロジェクトごとに違う（`tasks/lessons.md`・`docs/lessons.md` など）ので、固定パスで探さず、README や CLAUDE.md の言及を手がかりに探す。見つかれば有無と所在のパスを書く。無ければ空欄でよい。
- 根拠のパスを示せない項目は書かない（推測で埋めない）。

## 値の語彙

`evidence_paths` などのパス列は、focused.md の語彙（[focused.md](focused.md) の「値の語彙」）と同じ規則で書く。
