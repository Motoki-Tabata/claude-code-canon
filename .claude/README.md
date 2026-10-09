# claude-canon `.claude/` の使い方

この `.claude/` は claude-canon 本体です。対象プロジェクトの Claude Code カスタマイズ一式を、Phase A〜D の4つのセッションに分けて、調査・要件確定・設計・生成・検証・配置します。構成は Phase Skill 4件・知識 Skill 5件・Subagent 8体・Rule 4件・`settings.json` です。

設計の全体像は [design/architecture.md](../design/architecture.md)、セットアップと運用の手順は [guide/setup.md](../guide/setup.md) を参照してください。

---

## 1. 起動するもの（Phase Skill）

4つとも `/名前` で起動したときだけ動きます（自動では動きません）。1つの Phase を1つのセッションで行い、最後の人間ゲートを承認すると、次の Phase の起動方法を案内して止まります。

| コマンド | 起動する場所 | 推奨モデル | 工程と人間ゲート |
|---|---|---|---|
| `/canon-a <対象プロジェクトのパス>` | canon のルート | opus | run の骨格を作る → 1 調査① → 2 要件ヒアリング → P1 → 3 調査② → 4 spec → P2 |
| `/canon-b <ts>` | canon のルート | opus | 5 機能選定と設計（design-map）→ P3 |
| `/canon-c <ts>` | canon のルート | sonnet | 6 生成 → 7 検証（verify）→ 8 品質検査と修正ループ → P4 |
| `/canon-d <ts>` | canon のルート | sonnet | 9 配置前照合 → P5 → 配置（人間が sandbox の外で実行）→ 配置後の手順 |

- `<ts>` は `/canon-a` が採番する run の識別子（`YYYYMMDD_hhmmss`）です。
- 中断した Phase A は、`/canon-a <ts>` を実行すると再開します。
- 2つ目以降の Phase も、canon のルートで `claude --model <opus|sonnet>` の新しいセッションを起動してから実行します。
- run の状態・承認・差し戻し・申し送りは `work/<ts>/handoff.md` に記録されます。各 Phase の開始時に、前の Phase までの承認が承認後に変わっていないかを `npm run approvals` で照合し、run を始めたときから canon 本体が変わっていないか（`canon_commit`）も確かめます。
- run 中に見つけた canon 本体の問題は、その場で `tasks/lessons.md` に書きます。

## 2. 自動で使われるもの（Subagent）

Phase Skill が工程ごとに起動します。ユーザーが直接起動する手順はありません。いずれもコマンド実行系のツールを持たず、決められたファイルだけを書きます。

| Subagent | 使われる場面 | 書くもの |
|---|---|---|
| `investigator` | Phase A の工程1（existing・profile）と工程3（focused） | `work/<ts>/investigation/<mode>.md` |
| `session-analyst` | Phase A の工程2（過去のセッション履歴の分析を要件の材料にするときだけ）・Phase D の終わりの振り返り | `work/<ts>/session-analysis-<名前>.md`・`work/<ts>/retro/session-analysis-<phase>.md` |
| `spec-writer` | Phase A の工程4 | `output/<ts>/spec.md` |
| `designer` | Phase B の工程5（P3 の差し戻し、Phase C で keep に及ぶ修正をするときも） | `output/<ts>/design-map.md` |
| `builder` | Phase C の工程6（層ごとに並列）と修正ループ | `output/<ts>/generated/` の担当層 |
| `reviewer` | Phase C の工程8（判定の対象20件ごとに1体を並列に） | `output/<ts>/review/review-<k>.md` |
| `keep-reviewer` | Phase C の工程8（既存を改修する run のときだけ） | `output/<ts>/review/keep-review.md` |
| `prompt-auditor` | Phase C の工程8（標準 Skill `/claude-api prompt-audit` を実行し、報告を逐語で保存する） | `output/<ts>/review/prompt-audit.md` |

このほか、調査・要件・設計・生成・レビューの判断基準とテンプレートをまとめた内部参照の知識が5件あり、それぞれの Subagent が起動時に読み込みます。直接呼び出すものではないので、ここには並べません。

## 3. 自動で読み込まれるもの（Rule）

claude-canon 本体を保守するときの規律です。run の生成物には関係しません。

| Rule | 読み込まれるとき | 内容 |
|---|---|---|
| `workflow` | 常に | 日本語で応答する・申し送りを裏取りする・件数を数え直す・承認ゲートを縮めない・削除の前に参照を確かめる・canon への改修要求を `tasks/lessons.md` に起票する |
| `gates-and-tests` | `lib/**`・`.claude/skills/*/scripts/**`・`tools/**`・`tests/**` を扱うとき | 検査対象ゼロを合格にしない・禁止リストを能力で書く・判定ロジックを複製しない、など検査とテストの書き方 |
| `canon-docs` | `docs/**` を扱うとき | 正典を一次ソースで更新する・ページに無いことと存在しないことを区別する |
| `worker-definitions` | `.claude/agents/**`・`.claude/skills/**`・`.claude/settings.json` を扱うとき | 検査の変更をワーカー定義に追従させる・値の書式を実例で示す・応答を逐語で書き出す |

## 4. 前提のセットアップ

- **Node.js 22 以上と git**。依存パッケージはありません（`npm install` は不要）。
- **標準 Skill**: Phase C は `prompt-auditor` が `/claude-api prompt-audit` を実行し、builder は skill-creator の執筆指針の要約に従います。claude-api などはプラグイン `example-skills@anthropic-agent-skills`（marketplace `anthropics/skills`）で入れます。手順は [guide/setup.md](../guide/setup.md) にあります。
- **フック・MCP・実験的機能**: この `.claude/` は使いません。

## 5. 注意と制約

- **`settings.json` の permissions**:
  - canon のスクリプト（`npm run …`）と読み取り専用の git は許可しています。
  - `deploy` の `--confirm` は拒否しています。配置は人間が sandbox の外で実行します。
  - `git push` は毎回確認を求めます。
- **人間ゲートは自動で進みません**。P1〜P5 では、チャットで承認を得るまで止まります。
- **run の成果物（`work/<ts>`・`output/<ts>`）は自動で消しません**。片付けは人間が判断します。
- **配置先に claude-canon 自身は指定できません**。canon 本体の変更は、ブランチで `npm test` を通し、PR で main に入れます。
