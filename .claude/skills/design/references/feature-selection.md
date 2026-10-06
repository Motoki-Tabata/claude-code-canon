# 機能選定

要件ごとに、正典 `docs/00_INDEX.md` §4 の機能選択フローチャートを当てて、使う機能を決める。requirements.md の `constraints`（hooks／mcp／plugins／experimental の可否）で、分岐を**先に**刈り込む。禁止された機能は、選ぶ前に候補から外す。

## 8つの候補機能

CLAUDE.md（L1）／Rules（L1）／Skills（L2）／Subagents（L3）／Hooks（L4）／MCP（L4）／Plugins（L5）／モデル選定（横断）。Auto Memory・Worktree・LSP・Status Lines・Output Styles などは、対応する層の builder が同じ担当の中で扱う（独立した builder を増やさない）。

## 入口の分岐（要件1件ずつに当てる）

- **毎セッション必ず要るか？** はい → 固定の指示や規約は CLAUDE.md、パス別のルールは Rules、Claude 自身の学習は Auto Memory（L1）。
- **特定のタスクのときだけ呼べばよいか？** はい → Claude が自動で選ぶなら Skills、ユーザーが `/名前` で呼ぶなら Skills（`disable-model-invocation: true`）、メインの文脈を汚したくないなら `context: fork`（L2）。
- **実装作業を伴うか？** はい → 逐次の専門作業は Subagents（L3）。並列性・隔離が要るなら、編集の衝突回避は Worktree、同じパターンの大量変換（5〜30件）は `/batch`、多段の専門サブタスクは Subagent nesting（既定3階層・可変）、複数の Claude Code の協調は Agent Teams（実験機能）。
- **実装を伴わない自動化・外部連携か？** イベントで自動実行したいなら Hooks、外部サービスと直接つなぐなら MCP（同じデータをチャットにコピペしているなら採用する）、他のプロジェクトでも再利用したいなら Plugins（L5）。

## 制御の強度

要件が「守らせたい」を含むとき、強度を選ぶ。

| 強度 | 機能 | 使いどころ |
|---|---|---|
| advisory | CLAUDE.md | 判断を信頼して方向づける |
| deterministic | Hooks（exit 2 でブロック） | イベントで確実に発火させる |
| enforced | settings.json の permissions | ツールの許可・禁止をクライアントが強制する |
| OS-level | Sandbox・Worktree | 物理的に隔離する |

requirements.md で禁止された強度は選べない（hooks 禁止なら deterministic は使えない）。その場合は、要件を満たせる範囲まで advisory に下げるか、断念するかを design-map に明記する（requirements.md の `conflicts` と整合させる）。

## Experimental 依存の明示

選定結果が Agent Teams・Monitors・Channels・Themes・`context: fork`・プレビュー段階の組込み Skill（`/design` など）に依存するなら、依存する箇所を design-map の `## Experimental Dependencies` に書く。`constraints.experimental` が `allowed: false` なら、その依存を持つ機能自体を選ばない（V9 が生成物を止める）。Dynamic Workflows は実験機能ではないが、自動生成の対象外（手動対応）なので、依存するなら手動対応の項目として明記する。

## この段階で決めないこと

層数（2層・3層）は次の段階（[layer-design.md](layer-design.md)）で決める。
