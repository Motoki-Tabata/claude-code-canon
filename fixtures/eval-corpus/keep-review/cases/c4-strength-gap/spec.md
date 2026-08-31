# spec（eval コーパス: c4-strength-gap）

## 新要件

- id: R1
  want: 認証情報を含むコミットを機械的に阻止する（人の注意に依存しない）
  rationale: 過去に API キーが2度コミットされ、履歴の書き換えが必要になった
  project_grounding: hooks 未設定・pre-commit 相当の仕組みは無い

## 統合方針

阻止の担い手は新設する PreToolUse Hook とする。既存の手順書 Skill は
**Hook が弾いたときの背景説明**として位置づけ、役割の重複は無いものとして扱う。
