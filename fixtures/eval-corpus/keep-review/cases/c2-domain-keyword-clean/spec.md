# spec（eval コーパス: c2-domain-keyword-clean）

## 新要件

- id: R1
  want: Redis への接続設定（ホスト・ポート・認証・TLS）の手順を Skill 化する
  rationale: ローカルと本番で接続設定が違い、新規参加者が接続でつまずく
  project_grounding: config/redis.yml に接続設定・キャッシュ層に Redis を使用

## 統合方針

Redis の**接続設定の手順**を新規 Skill に置く。既存のキャッシュ無効化 FAQ
（どのキーがいつ無効化されるか・stale なとき何を見るか）は別責務として維持する。
