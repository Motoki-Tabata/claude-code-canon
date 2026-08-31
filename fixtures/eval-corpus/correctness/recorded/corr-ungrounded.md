# correctness 判定: corr-ungrounded

## 対象
- `.claude/skills/lint-fix/SKILL.md`（全文がバンドルに含まれる）

## 判定

### A1 functional（spec §8）
A1 の受け入れ基準は「生成された Skill が、このプロジェクトで実際に通る手順を示していること
（実在しないコマンド・設定ファイルを既存であるかのように書かない）」。

生成物は以下を「実行」節・「設定」節・「CI」節で**既存の・現在通る手順**として断定的に記述している。

- `npm run lint` を実行する（「洗い出す」と、実行して結果が返る前提で書いている）
- `npm run lint -- --fix` で自動修正する
- ルールは `.eslintrc.json` に定義されている、と既存ファイルであるかのように明記
- CI で `npm run lint` が走り、赤なら PR がマージできないと、既存の CI 挙動として断定

しかし系統B（プロジェクト実態）によれば、
- `package.json` に `scripts.lint` は無く、`npm run lint` はコマンドとして未定義（実行すれば
  npm がエラーを返す＝「洗い出す」どころか動かない）
- `.eslintrc.json` はおろか `eslint.config.js` も存在しない。ルール定義ファイルの言及は虚偽
- CI が `npm run lint` を実行しているという記述も、lint 自体が未導入である以上根拠がない

spec の R1 側の `project_grounding` にも「ヒアリング時に lint 導入を希望として挙げたが、
現状は未導入」と明記されており、これは「まだ存在しないものを、あたかも今動く手順として書いた」
ケースである。生成物のどこにも「lint は未導入なので導入手順が必要」「`npm install eslint` 等の
セットアップが要る」という記述がなく、既存のコマンド・既存の設定ファイルとして扱っている。
よって A1 は満たされていない。

### プロジェクト接地
- `npm run lint` / `npm run lint -- --fix`: 実在しないコマンドを実在する手順として記載 → 接地違反
- `.eslintrc.json`: 実在しない設定ファイルを実在するものとして記載 → 接地違反
- CI の lint 実行・赤でマージ不可という挙動: 未導入の lint に依存した記述であり、実態と矛盾

これは preload skill が名指しする「README の記述を鵜呑みにして実在しない lint 手順を書く」事故と
同型であり、しかも今回は README の誤読以前に、ヒアリングで「未導入」と明言されている情報を
無視して既存であるかのように書いている点でより重い。

### 判断しなかったこと
frontmatter のキー・ツール名・パス規約（G3〜G5・G12）、参照実在や sha256（G7・G8）等の決定論ゲート
領分には触れていない。今回の finding は本文中の手順記述が指す対象（npm script・設定ファイル・CI 挙動）
の実在性という、A1 functional の意味判断に属する。

```json
{
  "axis": "correctness",
  "ts": "corpus",
  "coverage": [".claude/skills/lint-fix/SKILL.md"],
  "findings": [
    {
      "target": ".claude/skills/lint-fix/SKILL.md",
      "condition": null,
      "verdict": "violation",
      "confidence": "high",
      "rationale": "生成された Skill は「npm run lint」「npm run lint -- --fix」「.eslintrc.json」「CIでのlint実行」を、このプロジェクトで既に通る既存手順として断定的に記述しているが、プロジェクト実態は scripts.lint 未定義・eslint設定ファイル不在であり、いずれも実在しない。spec自身のR1 project_groundingにも『現状は未導入』と明記されており、生成物は導入未了であることに一切触れず既存の手順として提示している。A1（実在しないコマンド・設定ファイルを既存であるかのように書かない）に明確に反する。",
      "evidence": [
        "生成物: `npm run lint` を実行/`.eslintrc.json` に定義されている/CI でも `npm run lint` が走り…",
        "spec R1.project_grounding: ヒアリング時に lint 導入を希望として挙げたが、現状は未導入",
        "系統B: `npm run lint` は未定義（package.json に scripts.lint 無し）。eslint 設定ファイルも無い",
        "spec A1: 実在しないコマンド・設定ファイルを既存であるかのように書かない"
      ]
    }
  ]
}
```
