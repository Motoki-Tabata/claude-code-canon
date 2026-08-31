# correctness 判定: corr-a1-met

## 対象
- `.claude/skills/add-endpoint/SKILL.md`

## 判定

### A1 functional（spec §8）
受け入れ基準は「ルータ登録・入力バリデーション・テスト追加の3手順を、プロジェクトの実体
（`src/routes/`・`tests/`）に即して具体的に示していること」。

生成物の3節を系統B（プロジェクト実態）と突き合わせる。

1. **ルータ登録**: 「`src/routes/<name>.js` にハンドラを1ファイルで作り、`src/routes/index.js`
   の登録表に1行足す」→ プロジェクト実態「`src/routes/` に1ファイル1エンドポイントで定義。
   `src/routes/index.js` で登録する」と一致。ファイル配置規約・登録先ファイル名まで具体的。
2. **入力バリデーション**: 「`src/validate/` に zod スキーマを追加し、ハンドラ入口で parse する。
   失敗は 400 を返す」→ プロジェクト実態「`src/validate/` の zod スキーマを使う」と一致。
   400 という具体的な失敗時の振る舞いまで書かれており、単なる抽象論ではなく実装可能な手順。
3. **テスト追加**: 「`tests/<name>.test.js` に正常系と 400 系の統合テストを足し、`npm test` が
   緑になることを確認する」→ プロジェクト実態「`tests/` に統合テスト。`npm test` で実行
   （有効・実在）」と一致。かつ手順2で定めた400系との整合も取れている（バリデーション失敗時の
   挙動をテストで検証する導線になっている）。

3手順すべてがプロジェクト実態の記述と語彙・パスレベルで一致しており、「それらしい」抽象的な
記述ではなく、このプロジェクト固有の配置規約（1ファイル1エンドポイント・登録表・zod・400・
`npm test`）に即して具体的に書かれている。A1 の受け入れ基準を実質的に満たしていると判断する。

### プロジェクト接地
- `src/routes/<name>.js` / `src/routes/index.js`: 系統Bの記述と一致。実在しないパスの創作なし。
- `src/validate/`: 系統Bの記述と一致。
- `tests/<name>.test.js` / `npm test`: 系統Bで「有効・実在」と明記されたコマンドと一致。
- SKILL.md 内に、系統Bに存在しない独自コマンド・スクリプト・lint 手順等の記述は無い。
  過去に問題となった「README を鵜呑みにした実在しないコマンドの創作」に該当する記述は見当たらない。

### 結論
A1 functional・プロジェクト接地のいずれも違反なし（clean）。3手順の具体性・プロジェクト実態
との一致度ともに高く、confidence は high とする。

```json
{
  "axis": "correctness",
  "ts": "corpus",
  "coverage": [".claude/skills/add-endpoint/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/add-endpoint/SKILL.md",
      "condition": null,
      "verdict": "clean",
      "confidence": "high",
      "rationale": "ルータ登録（src/routes/<name>.js・src/routes/index.js登録表）・入力バリデーション（src/validate/ の zod スキーマ・400応答）・テスト追加（tests/<name>.test.js・npm test）の3手順が、系統Bのプロジェクト実態と語彙・パスレベルで一致しており、A1の受け入れ基準を実際に満たしている。実在しないコマンドやパスの創作も見られない。",
      "evidence": [
        "spec.md#A1",
        "SKILL.md 1節: src/routes/<name>.js, src/routes/index.js",
        "SKILL.md 2節: src/validate/, zod, 400",
        "SKILL.md 3節: tests/<name>.test.js, npm test",
        "系統B: プロジェクト実態（ルータ/バリデーション/テストの記述）"
      ]
    }
  ]
}
```
