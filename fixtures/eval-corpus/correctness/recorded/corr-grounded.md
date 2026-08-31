# correctness 判定: corr-grounded

## 対象
- `.claude/skills/run-tests/SKILL.md`（全文がバンドルに含まれる、唯一の判定対象）

## 判定根拠

### A1 functional（spec §8）
基準: 「生成された Skill が、このプロジェクトで実際に通るテスト実行手順を示していること
（実在しないコマンドを書かない）」。

生成物の記述内容とプロジェクト実態（系統B）を1行ずつ突き合わせる。

| 生成物の記述 | プロジェクト実態 | 一致 |
|---|---|---|
| `npm test` を実行する。統合テストを含むため docker が要る（`docker compose` 経由で起動する） | `npm test` は `docker compose` 経由で統合テストを起動する（実在・有効） | 一致 |
| 失敗時は `logs/test.log` の末尾のスタックトレースから読む | 失敗ログは `logs/test.log` に出力される | 一致 |

生成物が言及するコマンド・パスは「`npm test`」「`docker compose`」「`logs/test.log`」の3点のみで、
いずれもプロジェクト実態の記述と完全に一致する。プロジェクト実態に「lint: 設定なし（`npm run lint`
は未定義・eslint 設定ファイルも無い）」という注記があるが、生成物は lint について一切言及しておらず、
存在しない `npm run lint` を手順として書く、といった典型的な事故（実態を鵜呑みにして無い手順を
書く）は起きていない。むしろ設定が無い項目には触れないという安全側の記述になっている。

R1 の want（テストの実行手順と失敗時の読み方を Skill 化する）・project_grounding（統合テストは
docker compose 前提）の両方を、生成物の「実行」節と「失敗時」節がそれぞれ過不足なくカバーしている。

### プロジェクト接地
- `npm test`: 実在・有効（プロジェクト実態に明記）。
- `docker compose` 経由での統合テスト起動: 実在・有効（プロジェクト実態に明記）。
- `logs/test.log`: 実在の失敗ログ出力先（プロジェクト実態に明記）。
- 実在しないコマンド・スクリプト・パスの記載は無い。特に「README の記述を鵜呑みにして実在しない
  lint 手順を書く」という典型事故パターンに該当する記述（例: `npm run lint` の言及）も無い。

### 結論
生成物は spec の A1 functional 基準を実際に満たしており、プロジェクト実態への接地も正確である。
finding としては「違反なし」を明示的に記録する（判定を実施した証跡として）。

```json
{
  "axis": "correctness",
  "ts": "corpus",
  "coverage": [".claude/skills/run-tests/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/run-tests/SKILL.md", "condition": null,
      "verdict": "clean", "confidence": "high",
      "rationale": "生成物が言及する npm test・docker compose 経由の統合テスト起動・logs/test.log の3点は、いずれもプロジェクト実態（系統B）の記述と完全に一致する。実在しないコマンド（例: 未定義の npm run lint）への言及も無く、R1の want・project_grounding をSKILL.mdの「実行」「失敗時」節が過不足なくカバーしているため、A1 functional 基準（実際に通るテスト実行手順を示し実在しないコマンドを書かない）を満たす。",
      "evidence": ["spec.md#R1", "spec.md#A1", "生成物: SKILL.md 実行/失敗時節", "系統B: プロジェクト実態（npm test/docker compose/logs/test.log）"] }
  ]
}
```
