# Dynamic RBAC permissions

权限记录由管理员动态维护，应用启动时不写入硬编码权限目录。

## 职责

- Controller 使用 `@RequirePermissions("resource.action")` 声明 API 安全策略；该元数据不写数据库。
- `POST /api/v1/admin/permissions` 创建权限记录，调用者必须拥有 `roles.manage`。
- 创建权限时自动授予 `super_admin`，并写入 `permissions.create` 审计记录。
- 其他角色通过 `PATCH /api/v1/admin/roles/:id` 由管理员显式授权。
- Migration 只负责数据库结构变化；新增业务权限由管理端注册。

## 新增受保护能力

1. 在后端 Route 上绑定 `@RequirePermissions(...)`。
2. 发布并执行功能所需的结构 migration。
3. 在 Backbar Admin 的“角色与权限”中创建权限码和名称。
4. 按需把权限分配给非 Super 角色。
5. 前端导航、页面和操作入口使用同一个权限码。
6. 重新请求 `/auth/me`，分别验证允许和拒绝场景。

完整操作流程与排查清单见管理端仓库的 `docs/permissions.md`。
