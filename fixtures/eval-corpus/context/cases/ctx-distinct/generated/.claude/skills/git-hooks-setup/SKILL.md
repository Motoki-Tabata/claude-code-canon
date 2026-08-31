---
name: git-hooks-setup
description: Install this repo's local git hooks. Use when setting up your clone.
---

# git-hooks-setup

`npm run hooks:install` を実行して pre-commit / pre-push を導入する。
導入後は commit 時に lint とテストの一部が走る。無効化は `HOOKS=0 git commit`。
