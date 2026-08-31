---
name: env-vars-guide
description: Configure the environment variables this service needs. Use when setting up a new environment.
---

# env-vars-guide

`.env.example` を `.env` にコピーし、以下を設定する。

- `DATABASE_URL`: Postgres の接続文字列。
- `REDIS_URL`: キャッシュ用 Redis。
- `LOG_LEVEL`: 既定 info。デバッグ時は debug。
