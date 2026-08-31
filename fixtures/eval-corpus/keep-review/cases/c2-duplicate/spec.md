# spec（eval コーパス: c2-duplicate）

## 新要件

- id: R1
  want: PR レビューを code-reviewer Subagent に委譲し、レビュー観点をその Subagent 定義へ集約する
  rationale: 観点が複数箇所に散っていて、どれが最新か分からなくなっている
  project_grounding: .github/pull_request_template.md と Skill に同じ観点が重複記載されている

## 統合方針

レビュー観点の置き場を **code-reviewer Subagent の1箇所に寄せる**。
観点を保持する既存カスタマイズは、集約後に同じ役割を二重に持たない状態にする。
