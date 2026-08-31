---
name: pr-size-guide
description: Keep pull requests small and reviewable. Use when a change is growing large.
---

# pr-size-guide

## 差分の大きさの目安
1つの PR は概ね 400 行以内に収める。超えるなら機能単位で分割する。

## 分割の仕方
リファクタと機能追加は別 PR にする。前提となる下ごしらえ（型定義・移動）は先行 PR にする。

## レビュー依頼のとき
大きくなった理由を本文に一言添える。分割できない事情があるなら明記する。
