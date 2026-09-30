---
name: review
description: 生成物のレビューの観点と出力の契約。reviewer が correctness・security・正典の意図・context の4観点で生成物を判定するとき、keep-reviewer が keep と merge の妥当性（K2・K4・統合先）を判定するときに参照する。verify（V1〜V9）が見た項目は再判定しない。
user-invocable: false
---

# review（意味判断のレビュー）

レビューは、機械では真偽が決まらない**意味の判断**だけを担う。スキーマ・ツール名・パス・secret・参照の実在・sha256・スナップショットの完全性は、verify（V1〜V9）がすでに決定論で判定している。レビューがそれを判定し直すと、非決定の判定が決定論の判定を上書きする経路ができ、真偽の権威が壊れる。あなたの結果は工程を進める権威ではなく、P4 で人間が読む材料である。

## 誰が何を見るか

| 役割 | 見るもの | 読む |
|---|---|---|
| reviewer | correctness・security・正典の意図・context の4観点 | [references/perspectives.md](references/perspectives.md) |
| keep-reviewer | keep の K2（要件非抵触）・K4（強度整合）と、merge 先の妥当性 | [references/keep-review.md](references/keep-review.md) |
| 両方 | 書き方 | [references/output-contract.md](references/output-contract.md) |

## 見ないもの（verify の領分）

| あなたが見る（意味の判断） | 見ない（verify が判定済み） |
|---|---|
| 要件を実際に満たすか・設計判断の妥当性 | frontmatter のキー・ツール名・パス規約（V1〜V3） |
| 権限設計が実質的に最小か | secret の直書き・`${VAR}` の展開（V4） |
| 正典の**趣旨**への適合 | 参照の実在・sha256 の一致（V6・V7） |
| K2・K4 の意味・merge 先の妥当性 | K1・K3・K5 の事実照合（V7）・スナップショットの完全性（V8）・constraints の遵守（V9） |

## 共通の規律

- **不在を根拠にする前に、Grep で確かめる**。「〜への言及が無い」「〜が実在しない」と書く前に、Grep か Glob で探す。不在は、探した範囲に対してしか成り立たない。確かめられなかったときは「見つけられなかった（探索範囲: …）」と書き、確信度を下げる。
- **判定の対象が0件のときに、「問題なし」と報告しない**。0件は「確認した」ではない。対象が渡されなかったことを、そのまま報告する。
- 迷いは、clean にして握りつぶさず、確信度を下げた指摘として出す。低い確信度の指摘は P4 で人間が確認して終わるが、握りつぶした違反は誰も気づかないまま配置される。
- 根拠の無い判定は無効。各指摘に根拠を書く。
- 判定は、生成物を書き換えずに行う。書くのは、自分のレビュー結果のファイルだけ。
