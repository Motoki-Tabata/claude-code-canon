/**
 * keep-review バンドル（canon-c/scripts/review-bundle.js）の入力ケース。{ ケース名: { 相対パス: 内容 } }。
 *
 * 1ケースが1つの run に相当する（design-map.md・spec.md・requirements.md・investigation/existing.md と、
 * 対象原本 target/・生成物 generated/）。design-map には designer の宣言（keep_conditions・rationale・
 * manifest_note）を実在させてあり、バンドルがそれを構造的に読まないことをテストで固定する。
 *
 * - k4-strength-gap: keep 1件（existing.md の強度 advisory ＜ 要件の deterministic）
 * - merge-target-bad: merge 1件（統合先の実体つき・manifest_note あり）
 */

export const KEEP_REVIEW_CASES = {
  "k4-strength-gap": {
    "design-map.md": `# design-map（keep-review ケース: k4-strength-gap）

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: .claude/skills/secret-hygiene/SKILL.md
    disposition: keep
    keep_conditions:
      K1_canon_clean: true
      K2_no_requirement_conflict: true
      K3_dependency_healthy: true
      K4_strength_consistent: true
      K5_project_refs_resolved: true
    rationale: "手順書として引き続き有用なので維持する"
\`\`\`
`,
    "investigation/existing.md": `# existing.md（keep-review ケース: k4-strength-gap）

## レコード（1ファイル1件）
- path: .claude/skills/secret-hygiene/SKILL.md
  layer: L2
  kind: skill
  strength: advisory
  depends_on:
    customization_refs: []
    project_refs: []
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
`,
    "requirements.md": `# requirements（keep-review ケース: k4-strength-gap）

## 確定要件
- id: R1
  want: 認証情報のコミットを機械的に阻止する
  strength_needed: deterministic
  priority: must

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true, reason: "決定論的な阻止に必要なので許可" }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
`,
    "spec.md": `# spec（keep-review ケース: k4-strength-gap）

## §2 新要件

- id: R1
  want: 認証情報を含むコミットを機械的に阻止する（人の注意に依存しない）
  rationale: 過去に API キーが2度コミットされ、履歴の書き換えが必要になった
  project_grounding: hooks 未設定・pre-commit 相当の仕組みは無い

## §4 統合方針（方向づけ。最終判定は designer）

阻止の担い手は新設する PreToolUse Hook とする。既存の手順書 Skill は
**Hook が弾いたときの背景説明**として位置づけ、役割の重複は無いものとして扱う。
`,
    "target/.claude/skills/secret-hygiene/SKILL.md": `---
name: secret-hygiene
description: Explain how to keep credentials out of the repository. Use when the user asks about secrets handling.
---

# secret-hygiene

認証情報をリポジトリに入れないための手順を説明する。\`.env\` を使う・\`.gitignore\` に入れる・
コミット前に目視で確認する、の3点を案内する。強制力は無く、読み手の遵守に依存する。
`,
  },
  "merge-target-bad": {
    "design-map.md": `# design-map（keep-review ケース: merge-target-bad）

## 既存判定

\`\`\`yaml
existing_disposition:
  - path: .claude/skills/db-migration/SKILL.md
    disposition: merge
    superseded_by: .claude/skills/contribution-rules/SKILL.md
    manifest_note: "db-migration は contribution-rules へ統合"
\`\`\`
`,
    "investigation/existing.md": `# existing.md（keep-review ケース: merge-target-bad）

## レコード（1ファイル1件）
- path: .claude/skills/db-migration/SKILL.md
  layer: L2
  kind: skill
  strength: advisory
  depends_on:
    customization_refs: []
    project_refs:
      - kind: path  value: "db/migrations"
  canon_conformance:
    frontmatter_keys_valid: true
    unknown_frontmatter_keys: []
    tool_names_valid: true
    deprecated_notation: []
`,
    "generated/.claude/skills/contribution-rules/SKILL.md": `---
name: contribution-rules
description: Apply the repository contribution rules for commits and pull requests. Use when committing or opening a PR.
---

# contribution-rules

## コミット
件名は \`<type>: <要約>\`。本文は72桁で折り返す。

## プルリクエスト
本文に変更理由・影響範囲・確認手順を書く。
`,
    "requirements.md": `# requirements（keep-review ケース: merge-target-bad）

## 確定要件
- id: R1
  want: コミット・PR 規約を1箇所に統合する
  strength_needed: advisory
  priority: should

## 使用可能なカスタマイズ機能
constraints:
  hooks:        { allowed: true }
  mcp:          { allowed: false }
  plugins:      { allowed: false }
  experimental: { allowed: false }

## 制約と要件の衝突
conflicts:
  (なし)
`,
    "spec.md": `# spec（keep-review ケース: merge-target-bad）

## §2 新要件

- id: R1
  want: コミットと PR の作法を1つの置き場にまとめる
  rationale: 規約が分散している
  project_grounding: CONTRIBUTING.md と Skill に規約が分散

## §4 統合方針（方向づけ。最終判定は designer）

コミット規約と PR 規約を contribution-rules へ統合する。スキーマ運用の手順は本要件の対象外。
`,
    "target/.claude/skills/db-migration/SKILL.md": `---
name: db-migration
description: Run and roll back database migrations safely. Use when changing the schema.
---

# db-migration

マイグレーションの作成・適用・巻き戻しの手順。適用前に必ずダンプを取る。
巻き戻しは down スクリプトの存在を確認してから実行する。本番適用は保守時間帯に限る。
`,
  },
};
