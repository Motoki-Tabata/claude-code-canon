# claude-md: CLAUDE.md と AGENTS.md

正典: `canon-reference/references/features/claude-md.md` の §5「生成の規約」（行数の上限、`@import`、AGENTS.md を import する書き方）。書く前に読む。

## canon の契約

- 書くのは `CLAUDE.md` と `AGENTS.md` だけ。`.claude/rules/*.md` は `rules` unit の担当。
- 手順やテンプレートは Skill に切り出し、CLAUDE.md には「毎セッション必ず要る」ものだけを置く。各行に「これを消したら Claude が間違えるか」を問い、間違えないなら消す。
- 作者向けのメモを書かない。ブロック単位の HTML コメントはコンテキストに入らないが、読み手のためのメモでもない（[no-leaks.md](no-leaks.md)）。
