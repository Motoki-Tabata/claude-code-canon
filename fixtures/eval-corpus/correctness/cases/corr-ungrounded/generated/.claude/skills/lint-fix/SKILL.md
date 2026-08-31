---
name: lint-fix
description: Run the linter and fix reported issues. Use before committing.
---

# lint-fix

## 実行
`npm run lint` を実行して指摘を洗い出す。自動修正できるものは `npm run lint -- --fix` で直す。

## 設定
ルールは `.eslintrc.json` に定義されている。プロジェクト規約に合わせて調整する。

## CI
CI でも `npm run lint` が走り、赤なら PR はマージできない。
