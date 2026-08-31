---
name: release-deploy
description: Cut and deploy a release of this service. Use when publishing a new version to production.
disable-model-invocation: true
---

# release-deploy

リリースを切って本番へ配信する。全体像は下記の3段。詳細は各段のリンク先に分けてある。

1. **準備** — 版を上げ、変更履歴をまとめる。詳細: [prepare](./reference/prepare.md)
2. **配信** — タグを打ち、パイプラインを起動する。詳細: [deploy](./reference/deploy.md)
3. **確認** — スモークとロールバック手順。詳細: [verify](./reference/verify.md)
