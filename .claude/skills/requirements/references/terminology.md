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

## 機能の取り違え

- 「Custom Instructions と Instructions files は別物」→ Claude Code ではどちらも claude-md と rules（`canon-reference/references/features/`）。
- 「Prompt Files は別の機能」→ Claude Code では skills。
- 「2層」「3層」「L1〜L5」は旧 claude-canon の整理で、公式の用語でも現在の canon の語でもない。ユーザーが使っていたら、機能名（claude-md・rules・skills・subagents・hooks・mcp・plugins など）に写し、写し方を確かめる。

## 強度の言い方

- 「必ず守らせたい」は2種類ある。Hooks で確実に実行・遮断したい（deterministic）のか、permissions で許可そのものを制限したい（enforced）のか。CLAUDE.md に書くだけの指示は助言（advisory）にとどまる。どれを求めているかをユーザーに確かめる。
