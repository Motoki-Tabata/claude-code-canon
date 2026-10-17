# rules: `.claude/rules/*.md`

正典: `canon-reference/references/features/rules.md` の §5「生成の規約」（`paths:` の書き方、ファイルの粒度）。書く前に読む。

## canon の契約

- ファイル名は内容を表すトピック名にする。1ファイル1機能。
- 適用範囲が限られる規律には `paths:` を付けて、常時の文脈を太らせない。`paths:` が無い rule は CLAUDE.md と同じく無条件に読み込まれる。
- `paths:` は rule の対外インタフェースの署名である。`instruct` が指示しない限り変えない（ほかのファイルがこの rule の適用範囲を当てにしている。影響は change-plan の `## 参照元の扱い` で答えてある）。
