# 機能選定

要件ごとに、`canon-reference/references/selection.md` §1 の選ぶ手順を当てて、使う機能を決める。requirements.md の `constraints`（hooks／mcp／plugins／experimental の可否）で、分岐を**先に**刈り込む。禁止された機能は、選ぶ前に候補から外す。

## 12機能

選ぶ単位は `canon-reference/references/features/*.md` の 12 機能: claude-md・rules・skills・subagents・hooks・mcp・settings・permissions・statusline・plugins・plugin-mods・output-styles。近い機能の見分け方は `selection.md` §3、運用の機能（並列・定期実行・CI）は §6。Auto Memory・Worktree などは、該当する機能の節（claude-md・subagents など）の中で扱い、独立した節を増やさない。

builder は機能ごとでなく担当（unit）で起動する。機能と担当の対応は `lib/features.js` の `UNITS`（claude-md／rules／skills／subagents／settings＝settings・hooks・permissions・statusline／mcp／plugins＝plugins・plugin-mods／output-styles）。design-map の節は担当でなく**機能ごと**に分け、同じ担当に属する機能は同じ builder が書く。

## 制御の強度

要件が「守らせたい」を含むとき、`selection.md` §4 の強度から選ぶ。requirements.md で禁止された強度は選べない（hooks 禁止なら deterministic は使えない）。その場合は、要件を満たせる範囲まで advisory に下げるか、断念するかを design-map に明記する（requirements.md の `conflicts` と整合させる）。

## Experimental 依存の明示

選定結果が実験機能（Agent Teams・Monitors・Channels・Themes・`context: fork`・プレビュー段階の組込み Skill など。何が実験かは各機能ファイルの記述に従う）に依存するなら、依存する箇所を design-map の `## Experimental Dependencies` に書く。`constraints.experimental` が `allowed: false` なら、その依存を持つ機能自体を選ばない（V9 が生成物を止める）。dynamic workflows は自動生成の対象外（手動対応）なので、依存するなら手動対応の項目として明記する。

## この段階で決めないこと

責務と書込スコープは次の段階（[structure.md](structure.md)）、組み合わせの型はその次（[orchestration-patterns.md](orchestration-patterns.md)）で決める。
