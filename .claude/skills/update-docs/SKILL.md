---
name: update-docs
description: Maintenance Slash Command that refreshes the canon under docs/ (機能X・正典更新). Reads docs/SOURCES.md, launches canon-updater to investigate official documentation and draft a diff proposal, stops for the human update-gate approval, then applies the approved diff to the 9 canon files. Use only when the user invokes /update-docs. Never invoked by /canon.
disable-model-invocation: true
user-invocable: true
---

# update-docs（正典更新・機能X・本体フロー非連動）

メイン Claude が **inline 実行**する Slash Command。詳細設計書 §13.1。**`/canon` の委譲チェーンには絶対に乗らない**——`/canon` からもこの Skill からも互いを起動しない。

## 参照正典
- `docs/SOURCES.md`（一次ソース URL 一覧・調査手順）
- 詳細設計書 §13.1（機能X 実装契約）・§11.2「G14/G15/G16 実装契約」・§11.3「ガードの2系統」

## この Skill が前提とする契約（実装済み・変更禁止）

1. **G13（preflight）は本 Skill の展開時にも自動発火する**（`.claude/settings.json` の `UserPromptExpansion` matcher は `canon|update-docs|self-optimize` の3コマンド共有）。`canon-updater` を含む claude-canon 自身のワーカー定義に `Bash`/`PowerShell`/`Monitor` があれば run 開始自体がブロックされる。
2. **`canon-update-scope-guard` は `work/.canon-update-ts` が in-flight のときのみ有効**（`/canon` 用の `write-scope-guard` とは判定材料・保護対象の極性が逆・§11.3）。`docs/` への書込は更新ゲート承認まで機械的に deny される。`.claude/`・`gates/`・`tests/`・`design/`（設計書2冊）は常時 deny。
3. **相互排他**: `/canon` の run（`work/.session-ts`）が in-flight のとき、`npm run canon:ts` は異常終了する。先に `/canon` run を完了させること。
4. **承認は CLI が唯一の鋳造経路**（§4.4 と同じ規律）。更新ゲート通過は `npm run approve -- <ts> canon-update` を **Bash で実行**して表す。`canon-updater` はコマンド実行系ツールを持たないので承認を捏造できない。

## 実行手順

### preflight

1. **G13**: 本 Skill 展開時に自動発火済み（上記契約1）。
2. **相互排他確認**: `/canon` の run が in-flight でないことを確認する（`work/.session-ts` を見る。終端マーカー未鋳造の run があれば中断しユーザーへ報告する）。
3. **`<ts>` 採番**: `npm run canon:ts` を Bash で実行し `<ts>` を得る。これが `work/.canon-update-ts` を書き、`output/<ts>/`・`work/<ts>/` の骨格を作る。**この瞬間から機能X run が in-flight**。

### フェーズ1: 調査・差分提案

1. `canon-updater`（`general-purpose`・opus・定義注入。「フェーズ1（調査・差分提案）を実行せよ」と明示する）を起動する。`docs/SOURCES.md` の一次ソースを調査し、`work/<ts>/canon-diff-proposal.md` を書かせる（**`docs/` へはまだ書かせない**——書こうとしても `canon-update-scope-guard` が deny する）。
2. canon-updater が `work/<ts>/.requests/canon-update-proposal` を書いて完了。このリクエストは G14〜G16 の対象外（`canon-guard.js` は `canon-update` リクエストのみを消費する）ため、ここでは決定論ゲートは発火しない——**次の人間ゲートが唯一の関門**。
3. **更新ゲート（人間承認・唯一の関門・§13.1）**: `canon-diff-proposal.md` の絶対パスと差分候補の要約をユーザーに提示し、**採否と breaking 判定を確定してもらう**。一次ソース間の矛盾があれば併せて提示する。承認後 `npm run approve -- <ts> canon-update` を実行する（これが無いと `docs/` への書込は次フェーズでも deny され続ける）。

### フェーズ2: 承認差分の反映

1. `canon-updater` を再度起動する（同一定義・「フェーズ2（承認差分の反映）を実行せよ」と明示し、承認済みの差分候補・ユーザーが確認した採否を注入する）。承認された差分のみを `docs/` 9ファイルへ反映させ、`docs/SOURCES.md` の更新履歴に investigated_at の行を追記させる。
2. `npm run build:tables` を Bash で実行し、`gates/conformance_tables/*.json` を再生成する（`ExtractionError` が出たら正典の書式崩れ。ここで止めてユーザーへ報告する）。
3. canon-updater が `work/<ts>/.requests/canon-update` を書いて完了。`SubagentStop` で `canon-guard` が発火し、**G14（正典整合）・G15（波及 stale 検出・非ブロッキング）・G16（`[要確認]` 台帳整合）**を検査する。通過で `output/<ts>/.gate/markers/canon-update.done` が鋳造され、機能X run が終了する（以降 `canon-update-scope-guard` は素通りに戻る）。
4. G14/G16 が違反を検出した場合（正典バージョン不一致・台帳の形式崩れ等）は `.gate/blocks/canon-update.blocked` が立つ。原因を提示し、`docs/` を再修正して再度完了リクエストを書かせる（`npm run unblock` は最終手段）。

### 完了報告

1. `work/<ts>/impact-report.md`（G15 が生成）をユーザーに提示する。**波及 stale の検出は判定ではない**——`.claude/**`・`gates/**`・`tests/**`・`design/**`（設計書2冊）に旧表現が残っていないかの一覧に過ぎず、修正するかどうかは人間が判断する。修正が必要なら、この Skill の外（通常の実装作業・run 外）で行う。
2. 影響のある過去 `output/*/` があれば併せて提示する。**自動再生成はしない**——要否はユーザーが判断し、必要なら通常の `/canon` を新規実行する。
3. `npm run smoke:check`（配線の生存確認。`docs/` の変更が `gates/` の照合表以外に波及していないか）を推奨する。

## 制約

- **`docs/` 配下と `work/<ts>/canon-diff-proposal.md` 以外は canon-updater に書かせない**（機械強制は `canon-update-scope-guard` が担う）。
- 各人間ゲート（更新ゲート）で**必ずチャット上でユーザー確認を取り停止する**。承認は口頭でなく `npm run approve` の実行で表す（§4.4 と同じ規律）。
- `context: fork` は付与しない（`canon-updater` Subagent を起動するため。`.claude/skills/canon/SKILL.md` と同じ理由）。
- 起動主体: 本システムの現行実装では Subagent 起動はメイン Claude（本 Skill）が行う。`canon-updater` は他 Subagent を spawn しない（多段委譲は不要）。
- **`subagent_type` マッピング規則**: 本システムの運用環境（SDK/harness）では canon agent が未登録のため、**`subagent_type: general-purpose`**（`canon-updater` 定義は `model: opus` のため **`model: opus`** で起動）を指定し、プロンプトに「`.claude/agents/canon-updater/canon-updater.md` を Read して定義に従うこと」を注入する（`ORCHESTRATION.md §2.3` 参照）。
