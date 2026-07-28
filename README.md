# 今晚喝什么 API

NestJS 10、PostgreSQL 16、Redis 7。API 前缀 `/api/v1`，Swagger 为 `/docs`。

数据库结构通过 TypeORM migration 维护；不要在常规环境启用 `DB_SYNC`。常用命令：`pnpm migration:show`、`pnpm migration:run`、`pnpm migration:revert`。

后台 RBAC 与酒单审核发布流程见 [docs/admin-rbac-and-cocktail-review-design.md](docs/admin-rbac-and-cocktail-review-design.md)。首次设置超级管理员时，在部署环境配置 `ADMIN_BOOTSTRAP_EMAIL` 为一个已注册用户的邮箱；应用启动后会幂等地授予该用户 `super_admin`，绝不会自动提权首位注册用户。

```bash
cp .env.example .env
docker compose up -d
docker compose exec api pnpm seed
```

本地开发使用 `corepack enable && pnpm install && pnpm start:dev`。开发环境可设置 `DB_SYNC=true`；生产设置为 `false` 后执行 `pnpm migration:run`。
