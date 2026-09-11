---
name: existing-disposition
description: Decide the disposition (keep / modify / merge / retire / out_of_scope) of each existing customization when refactoring an existing project, and enforce the 5 keep-conditions C1-C5 before keep may be chosen. Use when designer is generating design-map.md for a project that has existing customizations. Preloaded by designer.
user-invocable: false
---

# existing-disposition（既存カスタマイズの5判定・維持5条件）

既存カスタマイズ1件ずつに disposition（維持/改修/統廃合/廃止）を割り当てる判断系 Skill。`designer` に preload されるため `context: fork` は付与しない。基本設計書 §8 が唯一の内容源。

> **シナリオ(1)（新規・既存なし）では本 Skill は発動しない**（keep 判定が発生しない）。既存ありプロジェクトでのみ使う。

## 参照
- 基本設計書 §8（全体最適化）・§8.1（4選択肢）・§8.2（維持5条件）・§8.4（P5 レビュー形式）
- 系統A `work/<ts>/existing_customizations.md`（棚卸し・canon_conformance・depends_on）
- 系統B `work/<ts>/project_profile.md` の `ref_resolution`（project_refs の実在照合）

## 5判定（§8.1）
- **維持(keep)**: 既存実体を output へ **verbatim コピー**（新規書き起こししない）。generator が Read→Write。
- **改修(modify)**: 新内容で再生成する。対外インタフェース（frontmatter `name`）を変えない改修は design-map に `interface_change: none` を宣言する（未記載は `breaking` 扱い。他レコードの C3 判定材料になる・§9.2）。
- **統廃合(merge)**: 他と統合。複数を1つに、または新規に吸収する。
- **廃止(retire)**: output から外す。**MANIFEST に明示**する（黙って消える事故と区別）。
- **管理集合外(out_of_scope)**: canon の `MANAGED_PATTERNS`（`gates/lib/managed-paths.js`）に含まれない既存実体（例: `tasks/` 配下のファイル）で、設計判断としては言及したいが keep/modify/merge/retire のいずれにも当てはまらないもの。**`retire` にすると配置時に削除される**（対象がまだ使われている実体なら事故になる）が、`keep`/`modify` にすると G9（スナップショット完全性）が管理集合外として弾く——この板挟みを表す正式な第5の値（S3-2・ライブ run `20260910_220906` で designer が同型の値を発明した実例がある）。**管理集合内のパスに `out_of_scope` を付けてはならない**（G2 が `isManaged(path)` を実照合する）。`keep_conditions`・`interface_change` は不要。`manifest_note` に「なぜ canon の管理対象外か」を書く。

## 維持は「積極的維持」— 5条件すべてクリアで初めて keep 可（§8.2）
改修/統廃合/廃止は diff に出て人間ゲートで気づけるが、**維持は「変えない」判断で diff に出ない**。ゆえに維持だけ厳しい条件を課す。次の**すべて**を満たすときのみ keep:

| 条件 | 内容 | 判定元 |
|---|---|---|
| **C1 正典適合** | 系統A `canon_conformance` が clean（unknown_frontmatter_keys 空・deprecated_notation 空・frontmatter_keys_valid true・tool_names_valid true） | 系統A・実照合（機械） |
| **C2 要件非抵触** | 統合 spec 新要件・統合方針と競合/重複せず、requirements.md の conflicts に登場しない | spec 突合・意味判断（eval 回付） |
| **C3 依存健全** | 系統A `depends_on.customization_refs` の参照先が今回の design-map で `retire`/`merge` されない。参照先が `modify` の場合は、当該レコードが `interface_change: none` を宣言している | 系統A＋design-map・実照合（機械） |
| **C4 強度整合** | 既存が担う強度が requirements.md の strength_needed・constraints と矛盾しない | requirements.md・意味判断（形式検査のみ機械） |
| **C5 プロジェクト実態整合** | 系統A `depends_on.project_refs`（paths glob・supporting file・path）が系統B `ref_resolution` で全て resolved=true | 系統B・実照合（機械） |

1つでも欠けたら維持不可＝改修/統廃合/廃止へ回す。**判定元の性質を区別する**: C1/C3/C5 は実データ照合（G2 が真偽確定）。C2/C4 は意味判断を含み、designer が立てた boolean の**形式検査のみ** G2 が行い、意味的妥当性は eval（工程9）へ回付する。C3 の `interface_change: none` 宣言自体は design 段階では実照合できない（生成物が未存在）——宣言の裏取りは generation 段階の G8 が担う。**検査手段は種別ごとに違う**（`gates/lib/interface-signature.js`・S1-2）: frontmatter を持つもの（SKILL.md・Subagent）は `name`、rules は `paths:` の値集合、`CLAUDE.md`/`.claude/README.md` は `##` 見出し構造、JSON（`settings.json`/`.mcp.json`）はトップレベルキー集合、付随スクリプト（`.mjs`/`.js`）は export される識別子の集合。検査手段が無い種別への宣言は違反にせず「検査対象外」として通過メッセージに出す。

## design-map への記録（§9.2）
```
existing_disposition:
  - path: .claude/agents/reviewer/reviewer.md
    disposition: keep
    keep_conditions:            # 5条件を明示（1つでも false なら keep 不可）
      C1_canon_clean: true
      C2_no_requirement_conflict: true
      C3_dependency_healthy: true
      C4_strength_consistent: true
      C5_project_refs_resolved: true
    rationale: "..."
  - path: .claude/skills/self-optimize/SKILL.md
    disposition: modify
    interface_change: none               # modify のみで有効。未記載は breaking 扱い（詳細設計書 §9.2）
    rationale: "本文に節を追加するのみ。frontmatter name は不変"
  - path: .claude/skills/old-test-gen/SKILL.md
    disposition: retire
    reason_code: superseded_by_new
    superseded_by: .claude/skills/test-gen/SKILL.md
    manifest_note: "既存 old-test-gen は廃止。新 test-gen へ移行"
```

## P5 レビューへの注意集中（§8.4）
全既存精査は負荷が高いため、注意を要するものに絞る: **廃止(retire)全件**（1件ずつ確認）・**維持のうち C2 が eval 未通過のもの**（強制表示）・**統廃合(merge)の統合先**。5条件が明確にクリアな維持はサマリ提示に留める。
