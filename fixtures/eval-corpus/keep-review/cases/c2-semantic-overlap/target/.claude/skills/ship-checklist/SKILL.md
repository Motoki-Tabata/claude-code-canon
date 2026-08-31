---
name: ship-checklist
description: Final checks before sending a build out the door. Use before shipping a build.
---

# ship-checklist

出荷前に踏む確認手順。

## 版番号を上げる
`package.json` の版を上げる。パッチ／マイナー／メジャーの別は破壊的変更の有無で決める。
版番号を上げ忘れたまま送り出すと、受け手が古い版と区別できない。

## 送り出す
`npm publish` でレジストリへ送り出す。dry-run で中身を確認してから本番へ。

## 周知する
送り出したら GitHub Releases に要点を書いて周知する。破壊的変更は移行手順も添える。
