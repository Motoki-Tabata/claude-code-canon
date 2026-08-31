# context 軸 判定結果: ctx-distinct

## 対象
- `.claude/skills/env-vars-guide/SKILL.md`（design-map 責務: 必要な環境変数の一覧と設定方法）
- `.claude/skills/git-hooks-setup/SKILL.md`（design-map 責務: ローカル git hooks を導入する手順）

## 判定

### 重複（複数ファイルに同じ内容が書かれ、更新時に片方が腐る構造）
2ファイルの内容領域は完全に分離している（環境変数の設定 vs git hooks の導入）。
変数名（`DATABASE_URL` / `REDIS_URL` / `LOG_LEVEL`）・コマンド（`npm run hooks:install` /
`HOOKS=0 git commit`）のいずれも他方に再掲されておらず、同一事実が2箇所に存在する構造は無い。
更新時にどちらか一方が腐るリスクは見当たらない。violation なし。

### 読まれない冗長・責務の肥大
- `env-vars-guide/SKILL.md`: `.env.example` → `.env` のコピー手順＋3変数の一行説明のみ。
  すべての行が「環境変数の一覧と設定方法」という1文責務に直結しており、判断に使われない
  一般論や自明な前置きは無い。責務の肥大なし。
- `git-hooks-setup/SKILL.md`: 導入コマンド1行＋「導入後に何が起きるか（lint/test が走る）」
  ＋無効化コマンド（`HOOKS=0 git commit`）の2文構成。後者2文は「hooks を導入する手順」という
  1文責務そのものの一部（導入後の挙動と、詰まった場合の回避策）として機能しており、
  読み手の判断に使われない冗長な注意書きではない。分量も1〜2文程度で、実効的な指示が
  埋もれるほどの厚みは無い。責務の肥大とまでは言えない。

両ファイルとも、行数・情報量ともに1文責務の範囲に収まっており、preload の是非を問うような
Skill 本体でもない（実行手順の断片であり、常時読み込みコストを議論する対象ではない）。

## 結論
両 target とも clean（重複・冗長・責務肥大いずれも検出されず）。

```json
{
  "axis": "context",
  "ts": "corpus",
  "coverage": [".claude/skills/env-vars-guide/SKILL.md", ".claude/skills/git-hooks-setup/SKILL.md"],
  "findings": [
    { "target": ".claude/skills/env-vars-guide/SKILL.md", "condition": null,
      "verdict": "clean", "confidence": "high",
      "rationale": "3変数の一行説明とコピー手順のみで、design-map の1文責務（環境変数の一覧と設定方法）の範囲に収まっている。他方の git-hooks-setup とは内容領域が重ならず重複もない。",
      "evidence": ["DATABASE_URL/REDIS_URL/LOG_LEVEL の記述", "design-map: 必要な環境変数の一覧と設定方法"] },
    { "target": ".claude/skills/git-hooks-setup/SKILL.md", "condition": null,
      "verdict": "clean", "confidence": "high",
      "rationale": "導入コマンド・導入後の挙動・無効化方法の3点はいずれも「hooks を導入する手順」という1文責務の一部として機能しており、判断に使われない冗長な注意書きや別責務の抱え込みは見られない。env-vars-guide との内容重複もない。",
      "evidence": ["npm run hooks:install / HOOKS=0 git commit の記述", "design-map: ローカル git hooks を導入する手順"] }
  ]
}
```
