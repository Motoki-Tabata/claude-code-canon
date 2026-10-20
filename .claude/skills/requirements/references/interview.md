# ヒアリングの進め方

ヒアリングの目的は、「何を達成したいか」と「何を使ってよいか」を、後工程が判定に使える形で固めることである。自明な質問は避け、判断が割れるところ（エッジケース・トレードオフ）に踏み込む。AskUserQuestion で要点を掘り下げる。

## 冒頭: 調査サマリを見せて経路を確かめる

`inventory` の要約（既存の件数と機能ごとの内訳）と、profile があればその要点を示す。profile に `learning_history` があれば、その要点（既知の落とし穴・過去の申し送り）も示す。要件が、対象が過去に踏んだ問題を繰り返さないようにするためである。既存が0件なら新規の構築（大の経路）、1件以上なら改修（小の経路になりうる）。

対象が claude-canon 自身のときは、要件を確定する前に `tests/self_application.test.js` の契約（Agent の件数・知識 Skill の件数・段階 Skill の旧語など）をユーザーに示す。契約と衝突する要件は、change-plan の段階で成り立たなくなる。

## lessons・README の文言を要件にするとき

対象の lessons・README・他人の記述は「文言のみ」である。要件にする前に、要件1件ごとに、文言の主張（ファイルの形・設定値・挙動）を対象の実物で確かめ、確度を `confidence` に書く。公式の仕様に依存する主張は、公式のドキュメントで確かめる（`investigation/official-check.md`）。確かめるまでは `## 未確定` に置き、G1 で確定させない。2回の run で、確かめる前に確定した要件が、G1 の取り直しになった。

## 質問のカテゴリ（この順で聞く）

1. **経路の見込み**: 新規の構築か既存の改修か（`inventory` の件数を示したうえで）。経路は change-plan を書いたあとに確定する。
2. **対象と目的**: どのプロジェクトに、何を達成するカスタマイズを入れたいか。
3. **必要機能の兆候**: 常時必要な規約（claude-md・rules）・繰り返す手順（skills）・専門への委譲（subagents）・イベントでの自動化や外部連携（hooks・mcp）・配布（plugins）。機能の選定そのものは大の経路の `/canon-design` の仕事なので、ここでは兆候を拾うだけにする。
4. **制約（constraints）**: シークレットの扱い・hooks／mcp／plugins／experimental の使用可否・組織ポリシー。機能選定の探索空間を先に絞る入力になる。禁止と「今は使っていない」は別なので、禁止なのかを必ず確かめる。
   - 既存改修で「対象が既にその機能を使っていて、維持したいが新規には足さない」と言われたら、`allowed: false` にしない。`allowed: false` は「差分のどこにも現れてはならない」を意味し、既存のファイルがその機能を使っているだけで、そのファイルを変える差分が機械的に止まる（verify の V8）。`allowed: true` にして `reason` に「既存を維持・新規追加なし」と書く。この区別をユーザーに確かめる。
   - 選択肢を作る前に、既存（参照元があれば参照元も）の `permissions`・frontmatter・本文を grep し、使っている依存（Hooks・MCP・`context: fork`・組込み Skill の `/名前` など）を示す。参照元で使っていないことだけを理由に禁止を推奨しない。
5. **要件ごとの強度**: 各要件が advisory（CLAUDE.md の助言）・deterministic（Hooks による確実な実行）・enforced（permissions による強制）のどれを要るか。deterministic を望むのに hooks を禁止している、のような衝突を見つける材料になる。
6. **検証基準**: 成功をどう確かめるか。要件の `accept`（受入基準）の出典になる。diff を見るか実行すれば真偽が分かる形にする。
7. **変える語・コマンド**: want が変えるコマンド名・既定の挙動・設定キー・語を挙げてもらう。change-plan の `## 影響の語` になり、`impact` が触らないファイルの参照を表に出す。

## 衝突の扱い

`conflicts` に載せるのは、**未解消の衝突だけ**（`constraints` の実在キーが `allowed: false` で、当該の要件を禁止しているもの）。ヒアリング中に解消した衝突の経緯、`constraints` に由来しない方針の相違、配置後の手作業メモは `conflicts` に入れず、requirements.md の散文の小節に書く。`conflicts` は `requirement` が確定要件の実在 id、`constraint` が `constraints` の実在キーを指している必要があり、機械が照合する。

## AskUserQuestion の使い方

- preview が表示されない環境がある。判断材料は質問文か直前の本文に書き、「右の」「上のプレビューの」のように位置で参照しない。
- 選択肢は互いに排他的にし、推奨があれば先頭に置く。
- 選択肢の軸が複数あるときは、組み合わせを選択肢に網羅する。片方の軸だけで選択肢を作ると、ユーザーが残りの組み合わせを尋ね返し、1往復増える。

## ユーザーが過去のセッション履歴（transcript）の分析を要件の材料に指定したとき

1. 先に `npm run tokens -- <session-id>` で区分別の消費を出し、分析で読む範囲を絞る。
2. 分析は `session-analyst` に委ねる（transcript 1件につき1体。複数なら1つのメッセージで並列に起動する）。渡すもの: transcript の jsonl の絶対パス・tokens の集計結果・分析の観点・書込先 `work/<ts>/session-analysis-<名前>.md` の絶対パス。Explore や general-purpose に任せて応答をメインが書き写す方式は採らない（転記だけにメインの出力トークンを使う）。
3. session-analyst が自分で書込先に保存する。メインは書込先の実在と、応答の要旨（観点ごとの1行）だけを確かめ、本文は必要な箇所だけを読む。

## 合意したら

[requirements-template.md](requirements-template.md) の書式で `work/<ts>/requirements.md` を書き、`npm run check -- <ts> requirements` を通す。小の経路は、続けて change-plan.md を書いて `check` を通し、requirements.md と change-plan.md を合わせて G1 の承認を求める。大の経路は requirements.md だけで G1 の承認を求める。承認を得たら `npm run approvals -- <ts> record` で handoff.md の承認行に記録する。
