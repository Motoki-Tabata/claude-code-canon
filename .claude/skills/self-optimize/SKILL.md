---
name: self-optimize
description: Run claude-canon's 10-stage pipeline against claude-canon's own .claude/ (not an external target project) to generate a next-generation candidate under generations/candidate-<label>/. Use only when the user invokes /self-optimize <label>. Stops after staging the candidate — never promotes it. Promotion (npm run promote) is a separate, explicit, human-initiated action.
disable-model-invocation: true
user-invocable: true
argument-hint: "<label>"
---

# self-optimize（機能Y 自己再生成・§13.2.1）

メイン Claude が **inline 実行**する Slash Command。`/canon`（`.claude/skills/canon/`）と同じ理由（工程2ヒアリングの inline 会話履歴継承が要る・§4.1）で `context: fork` は付与しない。

> **稼働中の `.claude/` はこの手順のどこでも書き換わらない。** 生成物は `output/<ts>/generated/.claude/` に書かれ、`npm run stage` で `generations/candidate-<label>/.claude/` へ取り込まれるだけである。**実昇格（`npm run promote` の本実行・現行 `.claude/` のスワップ）は本 Skill のスコープ外**——別の明示的な行為として人間が判断する。

## この Skill が `/canon` と違う点（要点のみ）

`/canon` との共通部分（工程1〜9・各段の判断内容）は `.claude/skills/canon/SKILL.md` と `.claude/skills/requirement-elicitation/`・`.claude/skills/feature-selection/` 等の既存 Skill にすべて委ねる。本ファイルは差分だけを書く。

1. **調査対象が claude-canon 自身**（`§5.1` の唯一の例外・本 Skill 専用に解除済み）。`$ARGUMENTS` は `<target_project_path>` ではなく `<label>`（候補世代のラベル・英数字と `-`/`_` のみ）である。
2. **preflight の名前空間が異なる**（`work/.self-optim`・§13.2.1）。`npm run ts` の代わりに `npm run selfopt:begin` を使う。
3. **工程10 が無い**。デプロイ（対象への退避スワップ）の代わりに**世代ステージング**（`npm run stage`）で終わる。
4. **第3の極性ガード**（`gates/self-optimize-scope-guard.js`）が有効になる。`write-scope-guard` と異なり、**工程7完了（`generation.done`）後も `.self-optim` sentinel が在る限り `.claude/`・`docs/`・`gates/`・`tests/`・`generations/` への書込を deny し続ける**。工程7通過直後こそ「直接 `.claude/` を直したくなる」局面（3リスク(1) 自己コード改変）であり、そこで保護を解いてはならない。

## 実行手順

### preflight（工程1の前・順序厳守）

順序は **G13 →（`<ts>` 採番＋sentinel）→ カナリア → 工程1**。

1. **G13**: 本 Skill 展開時に自動発火済み（`UserPromptExpansion` の matcher に `self-optimize` を含む・§13.2.1）。
2. **`<ts>` 採番＋sentinel**: `npm run selfopt:begin -- <label>` を Bash で実行する。`/canon` run・機能X run のいずれかが in-flight なら異常終了する（3方向相互排他）。成功すると `<ts>`（`YYYYMMDD_hhmmss`）が標準出力に出る。これが `work/.session-ts`（`/canon` と同一の工程1〜9 パイプラインを使うため）と `work/.self-optim`（label+ts・self-optimize-scope-guard の判定材料）を同時に書く。**この瞬間から run in-flight かつ自己再生成 run 中**。以降の各工程が読み書きするパスの一覧・規約は `output-path-resolver` を参照（`/canon` と共通）。
3. **ランタイム・カナリア**（§11.5・`/canon` と同一手順）: `node gates/canary.js target <ts>` で的パスを得て Write ツールで実書込を試み、`.gate/**` の deny-all で deny されることを確認する。allowed だった場合は配線が死んでいるので run を即座に中断する。
4. **対象の確定**: `work/<ts>/target.txt` に **claude-canon 自身のルート（`CANON_ROOT`）** を記録する。系統A/B はこれ以降 claude-canon 自身の `.claude/agents/**`・`.claude/skills/**`・`.claude/settings.json` を調査対象にする（`/canon` の「自身を棚卸ししない」原則の唯一の例外・§5.1）。

### 工程1: プロジェクト調査1（浅く広く・2系統）→ P1

`/canon` と同一（`investigator` → 系統A・系統B 並列 spawn）。ただし対象が claude-canon 自身なので、系統Aは現行の `.claude/agents/**`（19体）・`.claude/skills/**`（14件）・`.claude/settings.json` を、系統Bは `gates/`・`tools/`・`tests/`・`docs/` を含むプロジェクト全体の構造を調べる。

### C1/C5 事前確認（工程1直後・試し打ち）

工程6（設計・G2 keep 判定）を待たず、`gates/lib/investigation.js` の `parseSystemA`/`isCanonClean`/`parseSystemB` を試し打ちし、既存カスタマイズの keep 条件 C1（正典適合）・C5（プロジェクト実態整合）を先取りで確認する。呼出し方向はメイン Claude（本 Skill の inline 実行）→ Bash → `node` → `gates/lib/investigation.js` のエクスポート関数であり、Subagent は介さない。入力は `work/<ts>/existing_customizations.md`（工程1完了時点で既に実在）、出力は標準出力への観測結果のみで、`.claude/`・`docs/`・`gates/` への書込みは発生させない。

**C1 と C5 の扱いを区別すること**: 工程1直後に実データで試せるのは **C1 側（`parseSystemA` + `isCanonClean`）のみ**である。**C5（`parseSystemB`）が要る `## focused` の `ref_resolution` は `requirements.md` 確定後（工程3）にしか書かれない**（`gates/g1_stage_order.js:80-85`）。したがって工程1直後の C5 確認は、fixture（`fixtures/sample-repos/existing/expected-work/project_profile.md:15-16`）または `parseSystemB` の書式契約（`ref: <ref>  kind: <kind>  resolved: true|false` の1行パターン）を読むだけの確認にとどめる。**実データでの C5 検証（`resolved` の真偽が実際にどう出るか）は工程3（focused）以降に行われる**——本手順のC5確認は書式契約の確認までであり、それ以上は求めない。

1. **対象を得る**: `work/<ts>/existing_customizations.md`（系統Aの成果物・工程1完了時点で既に実在）のパスを確認する。C5 用には上記 fixture（`project_profile.md` の `## focused` セクション）を参照する。
2. **実行して観測する**: `Write` ツールで検証スクリプトを **`work/<ts>/` 配下**（sanctioned ツリー）に置く（例: `work/<ts>/probe-c1.mjs`）。`gates/lib/investigation.js` から `parseSystemA`・`isCanonClean`（C1用）・`parseSystemB`（C5の書式契約確認用）を import し、呼び出し結果を `console.log` するだけのコードを書く。書き終えたら `node work/<ts>/probe-c1.mjs` として実行する。**`node -e "…"` 形式は使用不可**——`gates/lib/shell-write.js` の `WRITE_OP_RE` が `\bnode\s+-e\b` を書込操作として分類し、`gates/self-optimize-scope-guard.js`・`gates/write-scope-guard.js` の `PROTECTED_TOKEN_RE` がコマンド文字列中の `gates/` を保護パストークンとして検出するため、`gates/lib/investigation.js` に言及する `node -e` コマンドは両ガードにより deny される（無害な `console.log` のみの `node -e` でも deny された・実測）。`work/<ts>/` 配下のスクリプトファイルを `node` で実行する形態はどちらの検出パターンにも該当せず通過する。
3. **結果を報告する**: `isCanonClean` が返した C1 の真偽と根拠キー（`unknown_frontmatter_keys` 等）、および C5 側の書式契約または fixture での確認結果をチャット上で簡潔に報告する。ここで見つかった不整合は工程6の G2 判定を待たず先取りで人間へ共有してよいが、keep/modify/merge/retire の決定自体は工程6の `designer` に委ねる——本手順は確認にとどまり設計判断は行わない。

### 工程2: 要件ヒアリング（inline）→ P2

`/canon` と同一の手順だが、**「今回の最適化の狙いを1点に絞る」ことを追加で確認する**。現行 `.claude/` は agents 19体・skills 14件と規模が大きい。全量作り直しではなく「大半を keep・対象の1〜数点のみ modify」という設計になるよう、要件を狭く取ることをユーザーに促す（工程6 の keep 判定・G8 のバイト同一検証を成立させやすくするため）。

### 工程3〜9

`/canon` と完全に同一（工程3: 深掘り調査 → P3、工程4: spec → P4、工程5+6: 機能選定+設計 → P5、工程7: 生成 → P6、工程8: 検証、工程9: eval → P7）。判断内容はすべて既存の Skill/Subagent（`spec-writer`・`selector`・`designer`・`generator`・`eval-reviewer` 等）に委ねる。既存カスタマイズがある前提（§8）なので keep/modify/merge/retire 判定（G2・C1〜C5）と G8（keep のバイト同一非退行）が働く。

### 工程10（代替）: 世代ステージング → 人間へ差し戻し

配置（デプロイ）は行わない。代わりに候補世代として `generations/candidate-<label>/` へ取り込む。

1. **ステージング**: `npm run stage -- output/<ts> <label>` を Bash で実行する。前提（`generation.done`・`generation.approved`・uncaptured 0件・生成物が `.claude/` 配下のみ）を1件でも満たさなければ拒否され、候補は無傷のまま残る。
2. **run の終了**: `npm run selfopt:end` を Bash で実行し、`work/.self-optim` を削除する（self-optimize-scope-guard が非適用に戻る）。**`--dry-run` より先に行うこと**——`tools/promote.js` は自己最適化 run が in-flight（`.self-optim` 在中）の間は `--dry-run` も含め昇格検査そのものを拒否する（§13.2.1「run 途中の昇格を防ぐ」・実測で確認済み）。
3. **候補の健全性確認（検査のみ・スワップしない）**: `npm run promote -- <label> --dry-run` を Bash で実行する。G13（自己欺瞞封鎖）＋G3〜G6＋`.claude/settings.json` 必須検査だけを行い、現行 `.claude/` には一切触れない。
4. **人間へ報告して停止**: 生成された候補（`generations/candidate-<label>/.claude/`）の内容・`--dry-run` の結果・工程9 の eval-report を提示する。**実昇格（`npm run promote -- <label>`）は行わない**——着手はユーザー判断（詳細設計書 §13.2「前提」）。実昇格を試すかどうかは本 Skill の範囲外の、別の明示的な依頼として扱う。

---

## 各ゲートで停止する（自動遷移しない）

`/canon` と同じ規律（P1〜P7 で必ずチャット上でユーザー確認を取り停止する・§4.1）。ブロックラッチが立っていれば原因を提示し人間の判断を仰ぐ（無限再生成しない・§3.3）。工程10 の代替手順（ステージング・`--dry-run`・`selfopt:end`）は人間ゲートではないが、**いずれかが失敗したら run を中断し状態をそのまま報告する**（`work/.self-optim` を残したまま黙って別作業に移らない——次回セッションが in-flight と誤認する）。
