# brief: canon-v3

## 目的
claude-canon を骨格から作り直す（v3）。生成の精度とトークンのコストを両方よくする。2回の run（20261012_030955・20261014_232320）は、どちらも既存一式への小さな改修だった。それなのに全量スナップショット方式で全件を判定・再生成し、run 1回の総入力は約41〜53M になった。手戻りの原因も2回とも同じだった。

## 決めたこと
- 骨格から作り直す。過去の run の `work/`・`output/`・handoff の書式・npm scripts の名前とは互換を取らない（理由: 中途半端に互換を残すと、廃止する機構の依存が残る）。
- 用途は4つ（既存一式の継続的な改修・新規の構築・全面的な作り直し・canon 自身への適用）すべてを対象にする。承認ゲートの数は規模で変える。
- **変更集合方式**: 対象リポジトリの worktree（ブランチ `canon/<ts>`）の上で、変えるファイルだけを Edit し、削除は `git rm` で行う。差分は `git diff`、反映は人間のマージ。対象は git で管理されていることを前提にする（理由: R2 では79件中55件が modify になり、23件は内容を変えないのに全文を書き写した。触らないファイルの判定と配置の仕組みがコストの大半を生んでいた）。
- 廃止するもの: keep・modify・merge・retire と K1〜K5、MANIFEST と README の決定論の生成、管理パス集合、`copy-keep`・`emit-manifest`・`review-bundle`・`emit-run-manifest`・`pre-deploy-check`・`deploy`・`self-target-guard`、V7・V8、spec-writer・keep-reviewer。
- **経路は2つ**: 小（改修）は `/canon-plan`（Opus）→ `/canon-build`（Sonnet）で、ゲートは G1 計画 → G2 差分 → 人間のマージ。大（新規・作り直し）は `/canon-plan` → `/canon-design`（Opus）→ `/canon-build` で、ゲートは G1 要件 → G2 設計 → G3 差分 → 人間のマージ。ゲートは別々の問いで取る。番号は1から振り直す。
- **spec は廃止**して requirements.md に統合する。中間文書は `requirements.md`（要件ごとの want・根拠の確度〔実物で確認 / 公式で確認 / 文言のみ〕・触る見込みのファイル・受入基準）と `change-plan.md`（ファイルごとの変更指示・影響を受ける参照元の扱い。大の経路では機能選定・責務・モデル割当も持つ）の2つだけにする。前の段を再掲せず、ID で参照する。節ごとのサイズの上限を check で検査する（理由: requirements 10KB → spec 101KB → design-map 81KB と膨らみ、下流の全員がそれを読み直していた）。
- 「文言のみ」の要件は G1 で確定させない（理由: 2回とも、実物や公式で確かめる前に確定して取り直した）。
- **決定論で済むことはスクリプトに移す**: `inventory`（カスタマイズの一覧・frontmatter・参照のグラフ。プレースホルダを区別する）、`impact`（変えるファイル・語・コマンドに触れている、触らないファイルの列挙。K2 の見落としを機械で表に出す）、`worktree`（作業ブランチの作成・コミット・片付け）。開始時の照合（canon の版・承認・入力の実在）は1コマンドにまとめる。スクリプトはメインに要約だけを返す。
- **ワーカーは6体**（investigator・designer〔大の経路だけ〕・builder〔Edit だけ〕・reviewer〔変えたファイルと impact の参照元を見る。keep-reviewer の役割を吸収する〕・prompt-auditor・session-analyst）。小の経路の変更計画は、事実確認の文脈を持っているメインが書く。
- verify は変えたファイルだけを見る。判定のコードの2系統（`canon-c/scripts/verify/` と `canon-update/scripts/`）は1系統にまとめる。対象のテストは worktree でそのまま実行する。生成物が hooks か permissions を持つときは、trust の前提を verify の警告と差分のゲートで示す。
- 設計書は `design/architecture.md` 1冊（人間向けの「なぜそうしたか」、目安20KB以下）にまとめる。契約は Skill の references とテストだけに置く。rules は v3 の語彙で縮める。
- canon-reference は中身を変えない。変えるのは、ワーカーが読む範囲と `SKILL.md` の索引だけ。canon-update は対象外。
- **model と effort も見直す**（canon 自身の割当と、生成物に割り当てる基準 `.claude/skills/design/references/model-selection.md` の両方）。案は次のとおりで、段階1で確定する: `/canon-plan` は Opus・medium。`/canon-design` は設計をメインの inline で行い、designer を廃止する案と比べる。`/canon-build` は Sonnet・medium（advisor は同じエラーが2回出たときと差分のゲートの前だけ）。investigator は Sonnet・medium。棚卸しはスクリプトにし、足りない部分は haiku・high。builder は Sonnet・medium。reviewer は Sonnet・high で、Opus・high を残すかは段階6で比べる。prompt-auditor は Sonnet・medium。session-analyst は haiku・high。
- 実装は段階ごとに別のセッション・別の PR で行う。v3 は新しい名前で並べて作り、v2 は最後に1つの PR でまとめて消す（理由: どの PR も `npm test` を通した状態で main に入れるため）。

## 捨てた案
- 骨格を保ったまま最適化する案と、lessons の反映だけにする案: 全量スナップショット方式そのものがコストと手戻りの元なので、部分的な最適化では効果が小さい。
- 差分の overlay を `output/` に置いて、スクリプトで配置する案: git に頼らずに済むが、配置の仕組み（管理パス・退避・照合）が残る。
- 全量スナップショットを維持する案: R2 の実績（内容を変えない23件の書き写し・K2 の見落とし）が解消しない。
- spec・design-map の3文書を残して再掲だけを禁止する案: 文書の数が多いことによる読み直しと承認の数が減らない。
- canon-reference も作り直す案: 規模が大きく増える。中身は公式から作られていて、問題は読み方の側にある。

## 範囲外
- canon-reference の中身と canon-update。
- 対象側の課題（skillweave の canon-boundary.md が README の「管理境界」節を参照している件、生成物 lessons-ledger の監査行の件数表示）。対象の台帳への申し送りにする。

## 未決事項
- 小の経路の閾値（変えるファイルの件数、「新しい機能種別」の定義）。
- worktree の置き場所。canon のルートの下（`work/<ts>/wt`）に置くと、サブディレクトリの CLAUDE.md と `.claude/skills/` が読み込まれる（`.claude/skills/canon-reference/references/features/claude-md.md:21`、`skills.md:72`）。その結果、対象の指示が canon のセッションに混ざる。今の `output/<ts>/generated/` にも同じ問題がある。canon のルートの外に置く場合の権限（`additionalDirectories`・Write の許可）と比べ、小さな実験で決める。
- model と effort の案のうち「段階1で確定」のもの。単価は `claude-api` Skill の価格表から引く。
- 中間文書の節ごとのサイズ上限の値。
- canon 自身に適用するときに、worktree のブランチを PR にする手順。

## 調査の出典
- `work/20261012_030955/retro/tokens-{A,B,C,D}.txt`: R1 の総入力は 53,528,932。役ごとの内訳と cache_read（約94%）。
- `work/20261014_232320/retro/session-analysis-{A,B,C}.md`: R2 の総入力（A 12.7M・B 8.9M・C 18.7M）、P1・P2・P3 の取り直しとその原因。
- `work/20261012_030955/retro/session-analysis-B.md:56-67`: designer の文脈が 12k から約313k に増えた経緯。
- `output/20261014_232320/design-map.md:498`: modify 55件のうち、内容を変えないものが23件。
- `output/20261014_232320/spec.md`（101KB）・`design-map.md`（81KB）・`work/20261014_232320/investigation/existing.md`（85KB）・`requirements.md`（10KB）: 中間文書の大きさ。
- `output/20261014_232320/verify-report.md`・`work/20261012_030955/retro/session-analysis-C.md`: verify の違反は2回とも0件。欠陥を見つけたのは keep-review・prompt-audit・公式照合。
- `work/20261014_232320/eval/haiku/profile.md`: haiku の profile は本番とほぼ同じ質（版の情報は多く、repo_scale は数えられていない）。
- `.claude/skills/canon-c/SKILL.md`（24KB）・`design/architecture.md`（38KB）・`design/artifacts.md`（82KB）: 手順と契約の重複。
