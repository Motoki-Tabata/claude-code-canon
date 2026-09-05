---
name: requirement-elicitation
description: Provide the canon-aligned interview question set for process step 2. Use when /canon needs to interview the user — covers new/refactor mode confirmation, the feature-selection intake, and a terminology mis-mapping checklist (Copilot terms, L1–L5 confusion). The main Claude conducts the back-and-forth directly, inline.
user-invocable: false
---

# requirement-elicitation（ヒアリング設計）

`/canon` が **inline ロード**し、メイン Claude の会話履歴を保持したままユーザーと往復対話するための質問設計。`context: fork` は付与しない（fork すると会話履歴が非継承となり往復対話が成立しない — `L2_SKILLS.md §2.2`・基本設計書 §4.1）。

## 参照正典
- `BEST_PRACTICES.md §5.1`（Ask codebase questions）・`§5.2`（Let Claude Interview You）
- `00_INDEX.md §4`（機能選択フロー）・`§9`（用語集・誤マッピング検知チェックリスト）
- 詳細設計書 §6.3（requirements.md フォーマット・constraints・strength_needed）

## ヒアリング方針
- 公式「Let Claude Interview You」（`BEST_PRACTICES.md §5.2`）に従い、AskUserQuestion で要点を掘り下げる。自明な質問は避け、ハードな部分（edge case・トレードオフ）に踏み込む。
- 冒頭で工程1（investigator）の調査サマリを提示し、**新規作成 / 既存改修モードをユーザーに明示選択させる**。系統B `project_profile.md` に `learning_history`（対象プロジェクト自身の学習履歴）が見つかっていれば、その要点（既知の落とし穴・過去の申し送り）もサマリに含め、要件が過去に実機で踏んだ問題を繰り返さないようヒアリングで踏まえる。

## 質問カテゴリ
1. **モード確認**: 新規作成か既存改修か（調査サマリの既存カスタマイズ有無を提示した上で）。
2. **対象と目的**: どのプロジェクトに、何を達成するカスタマイズを入れたいか。
3. **必要機能の兆候**: 常時必要な規約（→L1）/ 繰り返す手順（→L2）/ 専門委譲（→L3）/ イベント自動化・外部連携（→L4）/ 配布（→L5）。詳細選定は `feature-selection` に委ねる。
4. **制約（constraints）**: シークレットの扱い・権限制御の強度（advisory/deterministic/enforced）・Experimental 機能の許容可否・hooks/mcp/plugins の可否。これらは機能選択の探索空間を事前に刈り込む入力（§6.3）。
   - **`allowed: false` は「生成物のどこにも存在してはならない（絶対不在）」を意味し、G11（決定論ゲート）がそう機械解釈する**。既存改修モードで「対象が既にその機能を使用中で、維持したいが新規追加は望まない」場合に `allowed: false` と記録すると、既存の keep 対象が該当機能を使っているだけで機械的にブロックされる。**この意図は `allowed: true` ＋ `reason` に「既存維持・新規追加なし」等を明記して表す**（`allowed: false` は使わない）。ユーザーが「新規に追加はしないが既存は維持する」と言ったら、この書き分けを確認すること。
5. **要件ごとの強度（strength_needed）**: deterministic 希望なのに hooks 禁止、のような制約との衝突を検出する材料。
6. **検証基準**: 成功をどう確認するか（`BEST_PRACTICES.md §1.3`）。

## 用語誤マッピング検知チェックリスト（`00_INDEX.md §9` 用語集に基づく）
ユーザー発話に以下が混入していないか確認し、混入時は Claude Code 用語へ正す:
- Copilot 形式: `.agent.md` / `copilot-instructions.md` / `*.instructions.md` / `*.prompt.md` / `.github/` / `.vscode/mcp.json` の `"servers"` キー → それぞれ Claude Code の `.claude/agents/<name>/<name>.md` / `CLAUDE.md` / `.claude/rules/*.md` / `.claude/skills/<name>/SKILL.md` / `.claude/` / `.mcp.json` の `"mcpServers"` キー。
- レイヤー誤マッピング: 「Custom Instructions と Instructions files は別物」→ Claude Code では両方 L1。「Prompt Files は別レイヤー」→ Claude Code では L2 Skills。
- 「2層/3層」「L1〜L5」は本リファレンス独自用語であり公式用語ではない点に注意（`00_INDEX.md §9`）。

収集・合意後、回答一式を `requirements-recorder` Subagent にプロンプト注入で渡し、`work/<ts>/requirements.md` へ機械的に直列化させる。
