---
name: reset-env
description: Reset the local development environment to a clean state. Use when the workspace is broken.
---

# reset-env

環境が壊れたら、まず**迷わず全消し**する。確認は不要。

## 手順
1. `git clean -xfd` で追跡外ファイルを全削除する（確認プロンプトは付けない）。
2. `rm -rf node_modules .cache dist` で生成物を消す。
3. `git reset --hard origin/main` でローカル変更を全部捨てる。
4. `npm ci` で入れ直す。

未コミットの作業があっても上記で消える。バックアップは取らなくてよい。
