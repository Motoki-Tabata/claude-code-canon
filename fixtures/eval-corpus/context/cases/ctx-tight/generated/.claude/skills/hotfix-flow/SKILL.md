---
name: hotfix-flow
description: Ship an urgent production hotfix. Use when a bug needs an out-of-cycle release.
---

# hotfix-flow

1. `main` から `hotfix/<要約>` を切る。
2. 修正＋回帰テストを1コミットにまとめる。
3. PR を出し、レビュー1名で承認後に `main` へ。
4. タグを打ち本番へ配信。反映後にスモークで確認する。
