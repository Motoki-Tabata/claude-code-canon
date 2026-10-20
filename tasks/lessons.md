# canon 改修要求（教訓台帳）

claude-canon 本体（`.claude/**`・`lib/`・`tools/`・`design/`・`guide/`）への改修要求を置く唯一の台帳。

- **即時記録**: canon 側の欠陥・浪費・規律の穴を見つけたら、その場で下の軽量書式で追記する。
  run の途中でも、本台帳に直接書く（`design/architecture.md` §8）。
- **反映したら削除**: 項目を直したコミットの中で、その項目を本台帳から削除する（履歴は commit・PR 本文・`git log` で追う）。
  未反映が0件でもファイルは消さない（`.claude/rules/workflow.md` が参照する）。
- **ID を振らない**: 見出しは日付＋要約にする。
- `design/` には `architecture.md` 1冊だけを置く。未対応の backlog は本台帳だけに置く。
- **一部だけ反映したら書き直す**: 項目の一部を直したコミットの中で、項目を残りの部分だけに書き直す（直した部分を残さない）。
- **canon 本体の要求だけを置く**: 対象プロジェクト側の生成物や文書の直しは、対象の台帳への申し送りにして本台帳に置かない。
- **主張の確度を書く**: 根拠を実物（コード・成果物・transcript）で確かめたか、文言（分析ファイル・他の台帳の記述）だけかを `確度` に書く。数値・行番号は起票の前に数え直す。

書式:

```
## YYYY-MM-DD <1行の要約>（run <ts>・<plan|design|build> | 保守作業）
- 種別: 欠陥修正 | 効率化 | 規律昇華
- 何が起きたか: <1〜3行。根拠の所在（transcript の session-id と行・コード path:line）>
- 確度: 実物で確認 | 文言のみ（<出典>） | 推測
- 提案: <行き先（ファイルと節）と直し方を1〜3行。行き先は1つに決める>
- 未決: <行き先や直し方を決めきれないときだけ、論点を1行で。決まっていれば書かない>
- 予定: <解消する予定の作業があるときだけ（例: tasks/<dir>/ の段階N）>
```

---

## 2026-10-12 designer のコンテキストが約12kから約313kまで増え、入力の94%がキャッシュ読みになる（run 20261012_030955・Phase B）
- 種別: 効率化
- 何が起きたか: Phase B の designer の総入力は 9,485,334 で、そのうち 8,911,375（94%）が cache_read だった。コンテキストは約12kから約313kまで単調に増え、後半の約18ターンは 206k 以上だった。増加の主因は、入力外の読み込み（agent 8体・Phase Skill 4件・generation の references）と、`lib/`・`tests/`・canon-reference の grep の出力だった（`retro/session-analysis-B.md`）。
- 確度: 実物で確認（`work/20261012_030955/retro/session-analysis-B.md` の56〜67行。キャッシュの作り直しと advisor の上乗せは推測）
- 提案: v3 は designer を廃止し、`/canon-design` を inline にした（段階4）。同じ増え方が inline のメインで起きないかを、大の経路を通したときに `npm run tokens` で実測する。増えるなら、change-plan を節ごとに書いて1回の Write を小さくし、読む正典の節を `design` Skill の references に置く。
- 未決: 大の経路の実測が無い（段階6のベンチマークは小の経路）
- 予定: 大の経路の最初の run

## 2026-10-17 /canon-build の許可の画面を対話で確かめていない（v3 段階4）
- 種別: 効率化
- 何が起きたか: worktree の diff・status は `npm run worktree -- diff|status` に寄せ、`git -C <worktree> …` は /canon-build の手順から外した。`Bash(npm run *)` に当たる前提だが、`npm run worktree` と worktree の Read・Edit が、対話のセッションで許可の画面を出さずに通るかは確かめていない（transcript に画面は残らない）。
- 確度: 推測（allow 規則の文字列と Skill の手順の照合。画面は未確認）
- 提案: 対話で `/canon-build` を通し、画面が出たかを人間が確かめる。出たコマンドがあれば、allow を直す。
- 予定: tasks/20261021-canon-lessons/ の C（大の経路の実 run）

## 2026-10-19 investigator の findings.md の Write がハーネスに拒否され、成果物をメインが書き写した（run 20261019_190415・plan）
- 種別: 欠陥修正
- 何が起きたか: `/canon-plan` の計画2 の3で起動した investigator が書込先 `work/20261019_190415/investigation/findings.md` へ Write したところ、ツールが「Subagents should return findings as text, not write report files」と拒否した。findings は応答の本文で返り、メインが手順の外で書込先に保存した（約 3 万字の転記でメインの出力トークンを使った）。
- 確度: 拒否は実物で確認（plan の transcript 7f4f7a65 の `subagents/agent-ab5b01a3d20307…` の Write の結果が `tool_use_error`）。同じ日の build（01b70c47）では、reviewer 4体・prompt-auditor・session-analyst の `work/<ts>/review/`・`retro/` への Write はすべて成功した。拒否の条件は分かっていない。run 20261020_192336・plan（session 4c0e6f27）でも同じ文言で拒否され再発した（書込先 `work/20261020_192336/investigation/findings.md`、プロンプトに書込先の絶対パスを明記）。同じ回の claude-code-guide 2体は書込を伴わない。同じ回の build（1b1a6954）でも reviewer 2体・prompt-auditor・session-analyst 2体の Write は成功し、2回の run で拒否されたのは investigator の `findings.md` だけだった。拒否文（本文を最終応答に含めよ）は、`.claude/agents/investigator/investigator.md` の制約「本文を会話に再掲しない」と逆のことを求める。転記の費用は、plan のメインの Write の入力 26,609 字（4c0e6f27 のターン17/48）が残り30ターンの文脈に残る分
- 提案: 拒否が investigator だけに起きる条件（書込先の名前・プロンプトの言い方・定義の文面）を、`claude -p` で investigator を findings.md と別名の書込先で起動して切り分ける。条件が分かるまでは、canon-plan の「ワーカーの起動規則」に「Write が拒否されたら、応答の本文を書込先に保存してから続ける」を足す。

## 2026-10-20 reviewer の割当を直して減った分を、plan のメインの増分が打ち消した（run 20261020_192336・plan と build）
- 種別: 効率化
- 何が起きたか: 2回目の run の plan のメイン（opus）は 1回目より +0.69M（6.87M → 7.55M・48ターン）。内訳は、(a) impact.json をファイル別に整形して scratchpad から Read した 54,462 字（ターン34・35/48、持ち越し 688,995 字ターン）と、(b) 1ターン目の総入力の増加（7f4f7a65 の 46,972 → 4c0e6f27 の 53,936、×48 で約 +0.33M）でほぼ説明できる。(b) の増えた理由は確かめていない。investigator と振り返りの分は直した（investigator の Grep の制約・`impact-ids.txt`・`tokens --turns` と session-analyst の手順1）。
- 確度: 数値は実物で確認（`npm run tokens -- <id> --turns`）。(b) の理由は確かめていない
- 提案: (a) は `impact-ids.txt`（ID と行の抜粋の一覧）で整形の手間をなくした。その効果（読む字数が減ったか）と、次の run の plan のメインの総入力を、`tokens --turns` で測る。(b) は次の plan の run の1ターン目で見る。
- 予定: tasks/20261021-canon-lessons/ の T16（大の経路の実 run の plan で測る）

## 2026-10-20 `check` の節ごとのサイズの上限を、大の経路の実測で確かめていない（保守作業）
- 種別: 規律昇華
- 何が起きたか: 小の経路の2回の run（20261019_190415・20261020_192336）を数えた結果は、要件1件の最大 1302 バイト（上限 1.5KB）・constraints 652（2KB）・requirements 全体 16.0KB（20KB）・ファイル1件の変更指示の最大 1532（2.5KB）・参照元の扱い1件の最大 241（300）・change-plan 全体 38.1KB（小 48KB）で、どの上限も超えていない。大の経路の `## 機能と責務`（8KB）・`## モデル割当`（3KB）・change-plan 全体（大 64KB）は、大の経路の run がまだ無く、実測が無い。
- 確度: 実物で確認（`lib/requirements.js`・`lib/change-plan.js` の `bytes` で数えた）
- 提案: 大の経路の最初の run で、`機能と責務`・`モデル割当`・change-plan 全体を数え、`tools/check.js` の `LIMITS` と `design/architecture.md` §4.1 の表を直す（直さなければ、直さない理由を残して本項目を消す）。
- 予定: tasks/20261021-canon-lessons/ の T16

## 2026-10-20 v3 で一度も通していない経路が4つある（v3 段階6）
- 種別: 規律昇華
- 何が起きたか: 段階6の2回の run（どちらも小の経路・op は modify だけ・検証コマンドは node の組込みだけで動き、依存の導入が要らなかった）で、次の経路を通していない。(1) 依存の導入を要する検証コマンド（`/canon-build` 構築2 の1 の導入の手順）。(2) 対話のセッションで `~/.claude-canon/wt/**` の allow 規則と `git -C` に許可の画面が出たか（transcript に残らない。2026-10-17 の `git -C` の項目）。(3) builder の Write での新規作成（change-plan の `op: new`。`Edit(~/.claude-canon/wt/**)` の規則が Write に効くかは未確認）。(4) 大の経路（`/canon-design`。2026-10-12 の designer の項目）。
- 確度: 実物で確認（2回の run の change-plan.md の `op` と `## 検証コマンド`）
- 提案: 次の run で、通していない経路を含む対象を選ぶか、`claude -p` で (1)・(3) を単独で確かめる。確かめた経路は、この項目から消す。
