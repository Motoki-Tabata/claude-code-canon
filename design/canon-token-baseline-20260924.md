# トークン消費の基準値（改修前）

`npm run tokens -- <session-id>`（tools/token-usage.js）で採取。改修後の run と比較するための基準。
総入力 = input + cache_creation + cache_read。message.id 重複は最後のレコードを採用。

| 指標 | run 20260919_023121 (c437d49e) | run 20260922_172924 (44b530d3) |
|---|---|---|
| 総入力の合計 | 76,871,036 | 68,152,025 |
| main（Opus）の総入力 / 全体比 | 27,856,424 / 36.2%（139ターン） | 32,794,815 / 48.1%（178ターン） |
| designer（Opus） | 12,468,773 / 16.2%（64ターン） | 7,838,266 / 11.5%（47ターン） |
| generator | 9,098,688 / 11.8%（**Opus**） | 7,590,288 / 11.1%（sonnet） |
| spec-writer | 3,880,254 / 5.0%（**Opus**） | 1,093,856 / 1.6%（sonnet） |
| eval 5軸＋reviewer の合計（2周） | 12.3M（12,294,721） | 13.4M（13,370,744・上限到達で5体が空振り） |
| design-map.md の Read 回数（全 agent） | 30 | 19 |
| 5時間枠の上限到達 | なし（13h43m、うち承認待ち約7.4h） | あり（開始から約2時間04分） |

## モデル解決の食い違い（run 20260919）
- spec-writer・generator: frontmatter は sonnet だが Opus で動いた（オーケストレーターが Agent 起動時に `model:"opus"` を渡したため）。
- eval-keep-review: frontmatter は opus だが sonnet で動いた。
- 対策: 起動時に `model` 引数を渡さない（tests/self_application.test.js の回帰テスト）。

## 改修後に確認する指標
main の総入力、design-map の Read 回数、Opus で動いた agent（designer と eval-keep-review のみが期待値）、
eval 2周目の総入力、各セッションが5時間枠に収まること。
