# handoff: canon-lessons

## 現在地
段階2 完了（2026-10-21）
plan.md を書いた。段階1（壁打ち）は、計画と同じセッションで行った。A・B の実装、C の大の経路の実 run、その後の後始末が残っている。

## 次のセッション
- 推奨モデル: Sonnet（effort medium）
- 最初に打つコマンド: `/flow-build tasks/20261021-canon-lessons`
- 長い作業なら: `/goal Skill flow-build で tasks/20261021-canon-lessons を実装する。完了条件: plan.md の T1〜T15 がすべて [x]、npm test が exit 0、npm run reference-check が exit 0、plan.md の「範囲外」を変えていない、handoff.md の現在地が「段階3 途中（C 待ち）」。または 60 ターンで停止`

## 判断ログ
- 2026-10-21 段階2: 正典 canon-reference を最初に引く役は investigator にする。claude-code-guide は正典で確かめられない論点だけに使う（理由: 過去2回の run の公式確認の3論点が正典に書いてあり、メインの文脈を増やさずに済む）。
- 2026-10-21 段階2: 観測でしか片付かない項目は、skillweave-mhwilds のカスタマイズ一式のリファクタリングを大の経路で通して片付ける（理由: ユーザーの指定。大の経路・依存の導入・対話の許可画面を1回で通せる）。
- 2026-10-21 段階2: `git -C` は allow 規則を足さず、`npm run worktree` のサブコマンドに寄せる（理由: `Bash(npm run *)` に当たる。`*` をサブコマンドの前に置く allow は、公式が警告の対象にしている）。
- 2026-10-21 段階2: change-plan の `## 参照元の扱い` は別ファイルに分けず、読み手を Grep に変える（理由: `check`・`approvals`・V6 の読む位置を変えずに済む）。

## メモ
- 一括の Explore での整合性の洗い出しは、コンテキストがあふれて止まった。T1 は必ず4範囲に分ける。
- `tasks/lessons.md` の15件の対応表は、plan.md の各タスクの末尾にある。
- このフォルダは `.gitignore` の `!/tasks/20261021-canon-lessons/` で追跡している。卒業させて消すときは、その行（と直前のコメント）も消す。
- ブランチは `chore/canon-lessons`（main 5b8cb45 から切った）。
