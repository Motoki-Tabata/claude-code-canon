---
name: review
description: 変えたファイルのレビューの観点と出力の契約。reviewer が correctness・security・正典の意図・context の4観点で差分を判定し、impact の参照元（触らないファイル）が変更と食い違っていないかを見るときに参照する。verify（V1〜V9）が見た項目は再判定しない。
user-invocable: false
---

# review（意味判断のレビュー）

レビューは、機械では真偽が決まらない**意味の判断**だけを担う。スキーマ・ツール名・パス・secret・参照の実在・計画との一致・constraints の遵守は、verify（V1〜V9）がすでに決定論で判定している。あなたの結果は工程を進める権威ではなく、差分のゲートで人間が読む材料である。

## 誰が何を見るか

| 見るもの | 読む |
|---|---|
| 変えたファイル（差分）の correctness・security・正典の意図・context の4観点 | [references/perspectives.md](references/perspectives.md) |
| 触らないファイルのうち `impact` が挙げた参照元が、変更と食い違っていないか | [references/perspectives.md](references/perspectives.md) の「5. 参照元の整合」 |
| 書き方 | [references/output-contract.md](references/output-contract.md) |

## 見ないもの（verify の領分）

| あなたが見る（意味の判断） | 見ない（verify が判定済み） |
|---|---|
| 要件の受入基準を実際に満たすか・設計判断の妥当性 | frontmatter のキー・ツール名・パス規約（V1〜V3） |
| 権限設計が実質的に最小か | secret の直書き・`${VAR}` の展開（V4） |
| 正典の**趣旨**への適合 | 書式片（V5）・参照の実在（V6） |
| 「変えない（理由）」と答えた参照元の理由が成り立つか | 差分のファイル集合と change-plan の一致（V7）・constraints の遵守（V8）・trust の前提の警告（V9） |

## 共通の規律

- **不在を根拠にする前に、Grep で確かめる**。「〜への言及が無い」「〜が実在しない」と書く前に、Grep か Glob で探す。不在は、探した範囲に対してしか成り立たない。確かめられなかったときは「見つけられなかった（探索範囲: …）」と書き、確信度を下げる。
- **判定の対象が0件のときに、「問題なし」と報告しない**。0件は「確認した」ではない。対象が渡されなかったことを、そのまま報告する。
- 迷いは、clean にして握りつぶさず、確信度を下げた指摘として出す。
- 根拠の無い判定は無効。各指摘に根拠を書く。
- 判定は、対象を書き換えずに行う。書くのは、自分のレビュー結果のファイルだけ。
