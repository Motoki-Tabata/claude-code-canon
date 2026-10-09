---
sources:
  - https://code.claude.com/docs/en/features-overview.md
  - https://code.claude.com/docs/en/claude-directory.md
  - https://code.claude.com/docs/en/env-vars.md
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/hooks-guide.md
  - https://code.claude.com/docs/en/settings.md
---

# 機能横断の品質基準と検証ルール

生成したカスタマイズを検査・レビューするときの、機能をまたぐ基準を置く。機能ごとの基準は各機能ファイルの §6（検証ルール）と §7（品質基準）にあり、本書はそれを写さない。

## 1. 使い方

- **検証ルール（`V-`）** は、機械で真偽が決まる規則である。**品質基準（`Q-`）** は、意味の判断を要するレビュー観点である。
- 生成物の1ファイルに当てる規則は、次の手順で決める。
  1. ファイルの置き場を `paths:files` の要素と照らし、その要素の `feature` を得る。
  2. その機能ファイルの §6・§7 と、本書の §2・§3 を当てる。
  3. settings ファイルのように複数の機能が同居するファイルは、中のキーごとに機能ファイルを選ぶ。たとえば `hooks` は `features/hooks.md`、`permissions` は `features/permissions.md`、`statusLine` は `features/statusline.md` を当てる。
- 機能ファイルの規則と本書の規則が同じ対象を見るときは、機能ファイルの規則を優先する。本書の規則は、機能ファイルが扱わない部分を埋める。
- 規則に付く [仕様] と [知見] の意味は `SKILL.md` に書いてある。「canon の規律」と書いた規則は canon が決めたもので、公式の仕様ではない。

## 2. 検証ルール

- **V-common-01**: 名前を `complete: false` のコレクションと照合する規則（本書と機能ファイルのすべて）で、一致しない名前は違反とせず「未判定」と報告する。未判定の名前は、公式ページか、`claude plugin validate` などの公式のツールで確かめる。根拠は、`complete: false` のコレクションに無いことが、存在しないことを意味しないこと（データの規約で、公式の仕様ではない）。
- **V-common-02**: 生成物のファイルの置き場が、`paths:files` のいずれかの要素の `path` の形に一致する。`<name>`・`<subdir>`・`<project>` は任意の名前、`*` は任意のファイル名として扱う。`paths:files` は `complete: false` なので、一致しないときは V-common-01 に従う。[仕様]
- **V-common-03**: `CLAUDE_CODE_` か `ANTHROPIC_` で始まる環境変数の名前は、`env-vars:vars` のいずれかの `id` と一致する。対象は、生成した settings ファイルの `settings:keys/env` のキーと、Hook のスクリプト・status line のスクリプトが読む変数である。`env-vars:vars` は `complete: false` なので、一致しないときは V-common-01 に従う。[仕様]

## 3. 品質基準

- **Q-common-01**: 例外なく守らせる必要のある制約が、Claude が読む指示だけに頼っていない。指示とは CLAUDE.md・ルール・Skill・出力スタイル・サブエージェントの本文のことで、制約は Hook か permission 規則で強制し、境界が要るときはサンドボックスと組み合わせる。[仕様]
  > "An instruction like "never edit `.env`" in CLAUDE.md or a skill is a request, not a guarantee."

  各機能ファイルの強制に関する基準（Q-claude-md-06・Q-rules-04・Q-skills-05・Q-output-styles-03・Q-plugins-03・Q-hooks-02・Q-permissions-02）は、この観点を機能ごとに具体化したものである。
- **Q-common-02**: 各内容が、その読み込まれ方に合った機能に置かれている。[仕様]
  - 毎セッション要る事実 → CLAUDE.md
  - コードベースの一部だけに効く指示 → `paths` 付きのルール
  - ときどき要る参照資料や手順 → Skill
  - 応答の声・長さ・形式 → 出力スタイル
  - 大量の出力を隔離したい作業 → サブエージェント
  - 外部のシステムへの接続 → MCP
  - 毎回必ず起こす処理 → Hook

  選び方の詳細は `selection.md`。
- **Q-common-03**: 常にコンテキストに載るものの総量が、全セッションで要る内容に見合っている。常に載るのは、CLAUDE.md・`paths` の無いルール・出力スタイル・モデルが呼べる Skill とサブエージェントの `description`・MCP のツール名と instructions・有効なプラグインの中身である。[仕様]
  > "Every feature you add consumes some of Claude's context. Too much can fill up your context window, but it can also add noise that makes Claude less effective"
- **Q-common-04**: 各ファイルのスコープが、効かせたい相手に合っている。チームで共有するものはプロジェクトのコミットされるファイル、個人の好みは `local` か `user` のファイル、組織の強制は managed に置く。個人の好みをプロジェクトに入れてチームに押し付けていない。[仕様]（`paths:files` の `scope`。機能ごとの基準は Q-mcp-01・Q-claude-md-07・Q-output-styles-05・Q-settings-01・Q-permissions-07）
- **Q-common-05**: 層をまたいで同じ振る舞いについて矛盾する指示が無い。層とは CLAUDE.md・ルール・Skill・出力スタイル・Hook が返すコンテキストのことである。CLAUDE.md は全レベルの内容が同時に読み込まれ、食い違うと Claude の判断で調停される。[仕様][知見]
  > "When instructions conflict, Claude uses judgment to reconcile them."
- **Q-common-06**: 権限が役割に要る最小の範囲に絞られている。対象は、サブエージェントの `tools`、Skill の `allowed-tools`、permission の allow 規則、Hook の `matcher`、MCP サーバーの資格情報である。[仕様]（機能ごとの基準は Q-subagents-03・Q-skills-06・Q-permissions-03・Q-hooks-03・Q-mcp-06）
- **Q-common-07**: 秘密の値（API キー・トークン・パスワード）が、コミットされるファイルに平文で書かれていない。環境変数の参照、ヘルパー、プラグインの `sensitive` な `userConfig` で受け取っている。[仕様]（機能ごとの基準は Q-settings-04・Q-mcp-02・Q-plugins-07）
- **Q-common-08**: Claude が選んで呼ぶもの（Skill・サブエージェント・MCP のツール）の `description` が、何をするかといつ使うかを、ほかの候補と区別できる具体性で書いている。曖昧だったり重なったりすると、Claude は誤ったものを読み込むか、役に立つものを見落とす。[仕様][知見]
  > "If descriptions are vague or overlap, Claude may load the wrong skill or miss one that would help."
- **Q-common-09**: 指示が簡潔で、Claude が既に知っていることを説明していない。古いモデル向けの過剰な制約（網羅的な禁止・例の羅列・同じ指示の繰り返し・強い強調）が無く、判断に任せられることは任せている。[知見]
  > "we found that we were overconstraining Claude Code, both through our system prompt and in our CLAUDE.md files and skills."
- **Q-common-10**: 長い資料は段階的に開示している。常に読み込まれるファイルには入口と索引だけを置き、詳細は必要なときに読むファイルに分ける。[仕様][知見]
  > "consider having a tree of files that can be loaded at the right time."
- **Q-common-11**: 時期で変わる情報（日付・「現在の版では」などの注記）が、生成物の指示の本文に無い。用語が生成物の中でそろっている。[知見]
  > "Avoid time-sensitive information"

## 4. 出典

spec:

- https://code.claude.com/docs/en/features-overview.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/en/env-vars.md
- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/hooks-guide.md
- https://code.claude.com/docs/en/settings.md

insight:

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md
- https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
