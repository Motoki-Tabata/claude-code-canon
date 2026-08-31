---
name: style-guide
description: このリポジトリのコーディング規約を参照する。命名・エラー処理・ESM の書き分けで迷ったときに使う。
---

# style-guide

- ESM のみ。CommonJS を新規に足さない。
- エラーは例外で伝え、戻り値の null で表現しない。
- 公開関数には JSDoc の1行説明を付ける。

この Skill は canon 導入後も keep 判定される（制約に触れず、新要件とも重複しない）。
