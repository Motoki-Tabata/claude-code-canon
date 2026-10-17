# claude-canon `.claude/` の使い方

この `.claude/` は claude-canon 本体です。対象プロジェクトの Claude Code カスタマイズ一式を、対象の worktree の上で、計画・設計・構築の段に分けて作る・直します。構成は段の Skill 3件・知識 Skill 5件・正典リファレンス `canon-reference`・その更新 Skill `canon-update`（Skill は計10件）・Subagent 6体・Rule 4件・`settings.json` です。

設計の全体像は [design/architecture.md](../design/architecture.md)、セットアップと運用の手順は [guide/setup.md](../guide/setup.md) を参照してください。

---

## 1. 起動するもの（段の Skill）

3つとも `/名前` で起動したときだけ動きます（自動では動きません）。1つの段を1つのセッションで行い、最後のゲートを承認すると、次の段の起動方法を案内して止まります。

| コマンド | 起動する場所 | 推奨モデル・effort | 内容と人間のゲート |
|---|---|---|---|
| `/canon-plan <対象プロジェクトのパス>` | canon のルート | opus・medium | run と worktree の作成 → 棚卸し → 要件ヒアリングと根拠の確認 → G1。小の経路は change-plan.md も書き、G1 を両文書で取る |
| `/canon-design <ts>` | canon のルート | opus・medium | 大の経路だけ。機能選定・構成と責務・モデル割当と change-plan.md → G2 |
| `/canon-build <ts>` | canon のルート | sonnet・medium | 編集（builder）→ 対象のテストと verify → レビュー → 差分のゲート（小は G2・大は G3）→ 振り返り |

- 正典 `canon-reference` の更新は run の外の保守作業で、`/canon-update` で起動します（段の Skill ではありません）。
- `<ts>` は `/canon-plan` が採番する run の識別子（`YYYYMMDD_hhmmss`）です。中断した段は、`/canon-plan <ts>` のように ts を渡すと再開します。
- 2つ目以降の段も、canon のルートで `claude --model <opus|sonnet> --effort medium` の新しいセッションを起動してから実行します。
- run の状態・承認・差し戻し・申し送りは `work/<ts>/handoff.md` に記録されます。各段の開始時に `npm run preflight` が、承認が承認後に変わっていないか、run を始めたときから canon 本体が変わっていないか（`canon_commit`）、worktree が正しいかを確かめます。
- run 中に見つけた canon 本体の問題は、その場で `tasks/lessons.md` に書きます。

## 2. 自動で使われるもの（Subagent）

段の Skill が起動します。ユーザーが直接起動する手順はありません。いずれもコマンド実行系のツールを持ちません。

| Subagent | 使われる場面 | 書くもの |
|---|---|---|
| `investigator` | `/canon-plan`。要件の主張を対象の実物で確かめる | `work/<ts>/investigation/findings.md` |
| `profiler` | `/canon-plan`。既存が無い対象や、未知の領域に触れる要件のとき | `work/<ts>/investigation/profile.md` |
| `builder` | `/canon-build`。担当（unit）ごとに並列 | worktree の担当のファイル |
| `reviewer` | `/canon-build`。変えたファイルと `impact` の参照元を判定する | `work/<ts>/review/review-<k>.md` |
| `prompt-auditor` | `/canon-build`。標準 Skill `/claude-api prompt-audit` を実行し、報告を逐語で保存する | `work/<ts>/review/prompt-audit.md` |
| `session-analyst` | `/canon-plan`（過去のセッション履歴を要件の材料にするとき）・`/canon-build` の振り返り | `work/<ts>/session-analysis-<名前>.md`・`work/<ts>/retro/session-analysis-<段>-<id>.md` |

このほか、要件・調査・設計・生成・レビューの判断基準とテンプレートをまとめた内部参照の知識が5件あり、それぞれの Subagent が起動時に読み込みます。直接呼び出すものではないので、ここには並べません。

## 3. 自動で読み込まれるもの（Rule）

claude-canon 本体を保守するときの規律です。run の生成物には関係しません。

| Rule | 読み込まれるとき | 内容 |
|---|---|---|
| `workflow` | 常に | 日本語で応答する・申し送りを裏取りする・件数を数え直す・承認ゲートを縮めない・削除の前に参照を確かめる・canon への改修要求を `tasks/lessons.md` に起票する |
| `checks-and-tests` | `lib/**`・`.claude/skills/*/scripts/**`・`tools/**`・`tests/**` を扱うとき | 検査対象ゼロを合格にしない・禁止リストを能力で書く・判定ロジックを複製しない、など検査とテストの書き方 |
| `canon-reference` | `.claude/skills/canon-reference/**` を扱うとき | 正典を一次ソースで更新する・ページに無いことと存在しないことを区別する |
| `worker-definitions` | `.claude/agents/**`・`.claude/skills/**`・`.claude/settings.json` を扱うとき | 検査の変更をワーカー定義に追従させる・値の書式を実例で示す・応答を逐語で書き出す |

## 4. 前提のセットアップ

- **Node.js 22 以上と git**。依存パッケージはありません（`npm install` は不要）。
- **標準 Skill**: `/canon-build` では `prompt-auditor` が `/claude-api prompt-audit` を実行し、builder は Skill の執筆指針として `canon-reference` の skills §4（generation Skill から参照）に従います。claude-api などはプラグイン `example-skills@anthropic-agent-skills`（marketplace `anthropics/skills`）で入れます。手順は [guide/setup.md](../guide/setup.md) にあります。
- **フック・MCP・実験的機能**: この `.claude/` は使いません。

## 5. 注意と制約

- **`settings.json` の permissions**:
  - canon のスクリプト（`npm run …`）と読み取り専用の git は許可しています。
  - 対象の worktree（`~/.claude-canon/wt/`）の Read・Edit を許可しています。
  - `git push` と、`worktree cleanup` の `--discard` は毎回確認を求めます。
- **人間のゲートは自動で進みません**。G1〜G3 では、チャットで承認を得るまで止まります。
- **反映は人間のマージです**。この仕組みは対象のブランチをマージも push もしません。worktree は、マージの後に `npm run worktree -- cleanup` で片付けます。
- **run の中間物（`work/<ts>`）は自動で消しません**。片付けは人間が判断します。
- canon 自身を対象にしても、worktree が canon のルートの外にあるので、run 中に読む `.claude/` と編集される `.claude/` は混ざりません。
