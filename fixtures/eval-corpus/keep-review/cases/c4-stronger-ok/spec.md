# spec（eval コーパス: c4-stronger-ok）

## 新要件

- id: R1
  want: 認証情報をコミットしないよう開発者に注意喚起する
  rationale: 新規参加者が気づかず認証情報を含めてコミットしかける
  project_grounding: PreToolUse hook で commit をブロックする既存機構がある

## 統合方針

R1 の注意喚起は、既存の secret-block-runbook（PreToolUse hook で認証情報を含む変更を
機械的に阻止し、その運用と復旧手順を記す）が**既に包含している**。新たな advisory の
生成物は作らず、既存機構を維持することで R1 を満たす。
