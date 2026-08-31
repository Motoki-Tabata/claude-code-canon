---
name: schema-guard
description: Block edits to the generated GraphQL schema file. Use when the user edits schema.generated.graphql.
---

# schema-guard

`schema.generated.graphql` は生成物であり手編集を禁じる。本 Skill は
`.claude/settings.json` の PreToolUse Hook（`ops/hooks/deny-schema-edit.js`）と対で使い、
Hook が編集を deny したときに、正しい生成手順（`npm run codegen`）へ誘導する。
