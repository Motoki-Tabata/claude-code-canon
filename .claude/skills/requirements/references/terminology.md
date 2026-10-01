# 用語の誤マッピング

ユーザーの発話に他ツール（主に GitHub Copilot）の用語や、claude-canon 独自の用語が混じることがある。混じっていたら Claude Code の用語に正してから要件に書く。取り違えたまま要件にすると、存在しないファイル形式を生成物に書くことになる。

## Copilot 形式 → Claude Code

| Copilot の言い方 | Claude Code での対応 |
|---|---|
| `.agent.md` | `.claude/agents/<name>/<name>.md`（Subagent） |
| `copilot-instructions.md` | `CLAUDE.md` |
| `*.instructions.md` | `.claude/rules/*.md`（`paths:` で適用範囲を絞れる） |
| `*.prompt.md` | `.claude/skills/<name>/SKILL.md`（Skill） |
| `.github/` 配下の設定 | `.claude/` |
| `.vscode/mcp.json` の `"servers"` キー | `.mcp.json` の `"mcpServers"` キー |

## レイヤーの取り違え

- 「Custom Instructions と Instructions files は別物」→ Claude Code ではどちらも L1（CLAUDE.md と Rules）。
- 「Prompt Files は別のレイヤー」→ Claude Code では L2（Skills）。
- 「2層」「3層」「L1〜L5」は claude-canon 独自の整理で、公式の用語ではない。ユーザーが公式用語として使っていたら、独自の整理であることを伝える。
  - L1＝CLAUDE.md・Rules／L2＝Skills／L3＝Subagents／L4＝Hooks・MCP／L5＝Plugins。

## 強度の言い方

- 「必ず守らせたい」は2種類ある。Hooks で確実に実行・遮断したい（deterministic）のか、permissions で許可そのものを制限したい（enforced）のか。CLAUDE.md に書くだけの指示は助言（advisory）にとどまる。どれを求めているかをユーザーに確かめる。
