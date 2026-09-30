# 連携パターン

層数が決まったら、採用する連携パターンと、カスタマイズ間の呼び出しの向き・データの渡し方を決め、`## Interface Contracts` に書く。

| パターン | 構成 | 使いどころ |
|---|---|---|
| A | メイン＋L2 Skill（inline） | 短時間・対話的。メインの文脈を引き継ぐ |
| B | メイン＋L2 Skill（`context: fork`） | 長い探索。`agent:` の指定と、具体的なタスクが必須 |
| C | メイン＋L3 Subagent（委譲） | 専門の役割を継続して使う。委譲の的中率は description の精度で決まる |
| D | Subagent＋preload した Skill | 1つの Subagent の中の多段処理。preload できるのは `disable-model-invocation: true` でない Skill だけ |
| E | Subagent＋MCP ツール | 外部サービス連携。`tools:` に MCP ツールを許可する |
| F | Subagent＋Hook による監視 | SubagentStart/Stop・PreToolUse で監査・遮断する |
| 多層 | Subagent nesting／Agent Teams／`/batch` | 純粋な多階層は既定3階層まで。それを超える・独立プロセス・相互通信が要るなら Agent Teams（実験機能。nested team 不可）か `/batch` |
| Dynamic Workflows | `/workflows` | 数十〜数百の Subagent の制御。自動生成の対象外なので、採用するなら手動対応の項目として明記する |

## 避けること

- 既定の深度上限（3階層）を超える nesting。
- fork から別の fork を spawn すること。
- 指針だけの Skill に `context: fork` を付けること。
- 「ブロックしたい」を CLAUDE.md に書くこと（advisory でしかない。確実に止めたいなら Hooks）。
- `disable-model-invocation: true` の Skill を preload すること（エラーになる）。

## Interface Contracts への書き方

採用したパターンと、カスタマイズ間の「誰が誰を呼ぶか」「何を渡し、何を返すか（ファイルか応答か）」「依存の向き」を書く。工程間のやりとりは、応答本文でなくファイルで受け渡す形にする（本文を会話に通すと、呼び出し元の文脈が膨らむ）。
