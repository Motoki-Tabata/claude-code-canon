---
name: output-path-resolver
description: Resolve and manage the timestamped output directory for a claude-canon run. Use when the orchestrator or a builder needs the canonical output/<ts>/ paths. The actual minting is done by tools/new-ts.js (npm run ts); this skill documents the path contract so workers resolve the same <ts> and absolute paths.
user-invocable: false
---

# output-path-resolver（出力先パスの一元解決）

出力先パスを一元解決し、タイムスタンプディレクトリの規約を示す共通知識。`context: fork` は付与しない（全 Subagent/オーケストレータが参照する軽量共有のため）。

## 参照正典・設計書
- 基本設計書 §14（ディレクトリ構成）・§4.5（`.requests/` 消費規約）・詳細設計書 §11.3（`.gate/` の deny-all）

## タイムスタンプ規約
- `<ts>` は `YYYYMMDD_hhmmss` 形式。
- **採番は `tools/new-ts.js`（`npm run ts`）のみが行う**（§11.3 注・ガードの有効条件）。`SessionStart` は採番しない。採番の契機は「セッションの開始」でなく「run の開始」。
- `npm run ts` は `work/.session-ts` に `<ts>` を書き、この瞬間から run in-flight になる（ガードが有効化する）。

## パス対応表（`<ts>` 確定後）
| 用途 | パス |
|---|---|
| 成果物ステージング | `output/<ts>/generated/`（CLAUDE.md / .claude/{rules,skills,agents} / .mcp.json / plugin） |
| 生成物 README | `output/<ts>/generated/.claude/README.md` |
| spec | `output/<ts>/spec.md` |
| design-map | `output/<ts>/design-map.md` |
| MANIFEST | `output/<ts>/MANIFEST.md` |
| 配置スクリプトの真実源 | `output/<ts>/.deploy/{managed-paths.list,retired.list}` |
| 権威マーカー・承認・ブロック（**Hook 専有・エージェント書込 deny-all**） | `output/<ts>/.gate/{markers,approvals,blocks}/` |
| 調査中間成果物 | `work/<ts>/{target.txt,existing_customizations.md,project_profile.md,requirements.md}` |
| 工程9 判定入力バンドル（`eval/bundle.js` が生成） | `work/<ts>/eval-bundle/<axis>/<case>.md` |
| 工程9 各軸 judge の verdict | `output/<ts>/eval/<axis>.md` |
| 工程9 集約レポート（`eval-reviewer` が書く。マーカーは鋳造しない） | `output/<ts>/eval-report.md` |
| 完了リクエスト（エージェントが書く・Hook が消費削除） | `work/<ts>/.requests/<stage>` |

## 重要な制約
- **`output/<ts>/.gate/**` にエージェントが書いてはならない**（deny-all・§11.3）。承認は `npm run approve -- <ts> <kind>` のみが鋳造する（§4.4）。
- ワーカーは自分の成果物（`generated/`・`spec.md` 等）と完了リクエスト（`work/<ts>/.requests/<stage>`）のみを書く。
- 既存 `<ts>` の解決は `work/.session-ts` を読む（`$ARGUMENTS` で明示されればそれを優先）。
