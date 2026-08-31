# spec（eval コーパス: c2-semantic-overlap）

## 新要件

- id: R1
  want: リリース公開の手順（バージョン付け・レジストリ公開・アナウンス）を CLAUDE.md に一元化し唯一の出典にする
  rationale: 公開手順の記述が複数箇所にあり、バージョン付けの規則が食い違っている
  project_grounding: package.json に publish スクリプト・GitHub Releases でアナウンス

## 統合方針

**リリース公開の手順は CLAUDE.md に集約し、他所には残さない**（手順が複数箇所にあると
バージョン規則が食い違う事故を止めるのが本要件の主眼）。
