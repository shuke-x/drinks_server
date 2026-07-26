# 今晚喝什么 API

NestJS 10、PostgreSQL 16、Redis 7。API 前缀 `/api/v1`，Swagger 为 `/docs`。

```bash
cp .env.example .env
docker compose up -d
docker compose exec api pnpm seed
```

本地开发使用 `corepack enable && pnpm install && pnpm start:dev`。开发环境可设置 `DB_SYNC=true`；生产设置为 `false` 后执行 `pnpm migration:run`。
