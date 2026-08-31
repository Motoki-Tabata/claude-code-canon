# spec（eval コーパス: c4-constraint-conflict）

## 新要件

- id: R1
  want: コード生成物の扱い（再生成手順・手編集しない約束）を文書として整える
  rationale: 生成物を手で直して次の codegen で消える事故が続いている
  project_grounding: schema.generated.graphql・npm run codegen が実在

## 統合方針

生成物の扱いは**文書（L1/L2）で案内する**方針とする。決定論的な阻止の仕組みは
今回の環境では採用できない（制約を参照）。
