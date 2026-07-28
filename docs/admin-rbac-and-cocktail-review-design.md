# 后台管理、RBAC 与酒单审核设计

> 适用对象：NestJS + TypeORM + PostgreSQL 的内容型应用。本文以本项目的“酒单”为例；将 `cocktail` 替换为任意需要审核发布的内容实体即可复用。

## 当前实施状态（2026-07-28）

已完成并在本地 Docker 环境验证：

- 后台与 App 共用 `/api/v1/auth/challenge`、`/auth/login`、`/auth/refresh`、`/auth/logout`。密码登录使用 RSA-OAEP SHA-256 challenge；后台不维护独立密码或管理员用户表。
- 后台接口统一使用 `/api/v1/admin/*`，登录后继续由 RBAC 校验 `super_admin`、`operator`、`reviewer` 的具体权限；普通用户直接调用后台接口返回 403。
- 用户状态、RBAC、酒单审核状态机、审核日志、管理员审计日志已实现。
- JSON/XLSX 异步批量导入、任务查询、失败重试、逐行错误报告和 XLSX 模板下载已实现；导入权限 `imports.manage` 只授予 `super_admin`。
- migrations `1750000000000`、`1760000000000`、`1770000000000` 已在 Docker PostgreSQL 执行，当前无待执行 migration。
- Docker API 容器启动时会先执行编译后的 TypeORM migration，再启动 NestJS，避免新代码早于数据库结构启动。
- 导入解析相关测试 6 项通过，NestJS 编译通过，Docker 中 PostgreSQL、Redis、API 均已运行。

尚未完成：

- 酒单分类表及分类 CRUD。目前 `gin / whiskey / rum / tequila / vodka / other` 仍是代码中的 `Spirit` enum；后续需要新增分类表、回填旧数据，并将客户端筛选与导入校验切换到动态分类。
- `cocktail_revisions` 数据表已经建立，但“已发布版本保持在线、新修订版本独立审核并替换”的完整业务接口仍需继续实现。
- 当前数据库尚未分配首位 `super_admin`；部署环境需要设置 `ADMIN_BOOTSTRAP_EMAIL` 为一个已注册邮箱后重启 API。

## 1. 目标与边界

本方案在不拆分用户系统的前提下，为同一套 API 增加独立的后台管理能力。后台路由统一使用 `/api/v1/admin/*`，客户端路由仍使用原有的 `/api/v1/*`。

解决的问题：

- 客户端提交的酒单不再立即公开；必须经审核才可在公开列表、随机推荐、收藏中出现。
- 管理员有最小权限集合，权限不再只依赖一个难以扩展的 `isAdmin` 布尔值。
- 审核、上架、下架、用户封禁等关键动作可追溯。
- 所有数据库调整通过向前兼容的 TypeORM migration 交付，支持灰度与回滚。

不包含的范围：后台 Web UI 的具体技术选型、内容智能审核、消息推送、复杂的多租户隔离。它们可在此模型上新增模块。

## 2. 当前项目的差距与必须收口的行为

当前 `POST /cocktails` 可匿名创建，且新酒单会以公开状态进入客户端读取路径。这与“先审核后上架”冲突。因此上线本设计时，必须同时完成以下切换：

1. 创建、修改、提交审核均要求已登录。
2. 新创建的用户酒单默认为 `draft`；只有用户调用“提交审核”后才成为 `pending`。
3. 客户端公开查询只能读取 `published` 状态的、未软删除的酒单。
4. 用户只能读取和编辑自己的非已发布内容；已发布内容修改后必须重新进入审核流程，不能直接影响线上版本。
5. 所有后台写操作都要进行权限校验，并写入后台操作日志。

## 3. 核心领域模型

### 3.1 酒单状态机

`isPrivate` 不再承担发布状态职责：它只表示“用户仅自己可见”，私密酒单不能提交审核或发布。新增 `status` 表示公开内容生命周期。

| 状态 | 含义 | 客户端公开可见 | 用户可编辑 | 管理员可操作 |
| --- | --- | --- | --- | --- |
| `draft` | 用户草稿，尚未提交 | 否 | 是 | 查看、删除 |
| `pending` | 等待审核 | 否 | 否；可撤回为草稿 | 审核通过/驳回 |
| `rejected` | 已驳回 | 否 | 是，修改后可重新提交 | 查看 |
| `published` | 已上架 | 是 | 编辑会生成/切换为待审版本 | 下架、编辑、删除 |
| `offline` | 管理员下架 | 否 | 是，修改后可重新提交 | 再上架或删除 |

允许的状态转换：

```text
draft    --提交--> pending --通过--> published --下架--> offline
  ^                    |                    |                 |
  |                    └--驳回--> rejected --修改/提交--> pending
  └------------------------撤回-------------------------------+
```

规则：

- `isPrivate = true` 时状态固定为 `draft`，且不能提交审核。
- 提交前做完整字段校验：名称、基酒、配方、步骤、图片 URL 等；不合格返回清晰字段错误。
- `pending` 内容不允许作者直接修改，避免审核内容与审核结果不一致；作者只能撤回后修改。
- 对已发布酒单，推荐采用“编辑即下架并转 `draft`/`pending`”的 MVP 规则。若线上展示稳定性要求更高，后续升级为“主表 + revisions 版本表”。
- 审核通过/驳回必须使用数据库事务，并同时写审核日志。

### 3.2 RBAC（基于角色的访问控制）

权限是系统的最小授权单位，角色只是权限集合。不要在业务代码中散落 `role === 'admin'` 判断。

建议首批权限：

| 资源 | 权限 |
| --- | --- |
| 用户 | `users.read`、`users.update_status`、`users.assign_roles` |
| 酒单 | `cocktails.read`、`cocktails.update`、`cocktails.delete`、`cocktails.publish`、`cocktails.offline` |
| 审核 | `cocktails.review` |
| 权限系统 | `roles.read`、`roles.manage` |
| 日志 | `audit_logs.read` |

预置角色及边界：

| 角色 | 权限范围 |
| --- | --- |
| `super_admin` | 全部权限；仅该角色可管理角色与分配管理员权限 |
| `operator` | 用户启停、酒单查看/编辑/上架/下架；不可分配角色 |
| `reviewer` | 查看酒单、审核通过/驳回；不可改变用户状态或角色 |
| `user` | 不配置后台权限，仅使用客户端接口 |

约束：最后一个启用的 `super_admin` 不允许被禁用、移除该角色或删除；管理员不能修改高于自身的角色；禁止通过“编辑用户资料”间接修改 email、密码或角色。

### 3.3 建议数据表

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `users`（扩展） | `status`、`disabledAt`、`disabledReason` | `status`: `active` / `disabled`；保留现有 id、email、资料字段 |
| `roles` | `id`、`code`、`name`、`description`、`isSystem` | `code` 唯一，例如 `reviewer` |
| `permissions` | `id`、`code`、`name` | `code` 唯一，例如 `cocktails.review` |
| `user_roles` | `userId`、`roleId`、`assignedBy`、`createdAt` | `(userId, roleId)` 唯一 |
| `role_permissions` | `roleId`、`permissionId` | `(roleId, permissionId)` 唯一 |
| `cocktails`（扩展） | `status`、`submittedAt`、`reviewedAt`、`reviewerId`、`rejectReason`、`publishedAt`、`offlineReason` | 保留 `ownerId`、软删除和原字段 |
| `cocktail_review_logs` | `id`、`cocktailId`、`action`、`fromStatus`、`toStatus`、`reviewerId`、`reason`、`createdAt` | 保存 submit/approve/reject/withdraw/offline/publish 等生命周期事件 |
| `admin_audit_logs` | `id`、`actorId`、`action`、`targetType`、`targetId`、`before`、`after`、`requestId`、`ip`、`userAgent`、`createdAt` | 管理后台关键写操作的不可变审计记录 |

索引建议：`cocktails(status, createdAt DESC)`、`cocktails(ownerId, status, updatedAt DESC)`、`cocktail_review_logs(cocktailId, createdAt DESC)`、`admin_audit_logs(targetType, targetId, createdAt DESC)`、`admin_audit_logs(actorId, createdAt DESC)`。审核人、操作者关联删除策略使用 `SET NULL`，避免删除用户破坏历史。

## 4. API 与鉴权设计

### 4.1 认证上下文

保留现有 access token；认证后在 request 中注入 `authUser.id`。新增 `RequirePermissions(...codes)` 装饰器和 `PermissionsGuard`：

1. `AccessTokenGuard` 验证 token。
2. `PermissionsGuard` 查询用户的角色及权限（可短期缓存），判断是否拥有每一个所需权限。
3. 无 token 返回 `401`；有 token 但无权限返回 `403`。

用户被禁用时，应让认证、刷新 token、受保护接口均拒绝访问；已签发的短期 token 也在 guard 中检查 `users.status`，保证禁用即时生效。

### 4.2 客户端酒单接口调整

| 方法 | 路径 | 权限/归属 | 行为 |
| --- | --- | --- | --- |
| `POST` | `/cocktails` | 登录用户 | 创建自己的 `draft`（私密内容也为 draft） |
| `PATCH` | `/cocktails/:id` | 所有者 | 仅 draft/rejected/offline；published 编辑按选定规则转草稿 |
| `POST` | `/cocktails/:id/submit` | 所有者 | 完整校验后 `draft/rejected/offline → pending` |
| `POST` | `/cocktails/:id/withdraw` | 所有者 | `pending → draft` |
| `GET` | `/users/me/cocktails` | 所有者 | 返回本人所有状态及必要审核信息 |
| `GET` | `/cocktails`、`/random`、`/recommendations` | 匿名 | 只返回 `published` 且非私密内容 |

客户端对象不要向非作者泄露 `rejectReason`、审核人、后台操作日志等内部字段。

### 4.3 后台接口

统一加 `@ApiBearerAuth()`、`AccessTokenGuard` 与权限装饰器。分页、筛选、排序均限制白名单字段和最大 limit。

| 方法 | 路径 | 所需权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/admin/users` | `users.read` | 用户列表；按状态、email、创建时间筛选 |
| `GET` | `/admin/users/:id` | `users.read` | 用户、角色、提交内容摘要 |
| `PATCH` | `/admin/users/:id/status` | `users.update_status` | 启用/禁用，必须记录原因 |
| `PUT` | `/admin/users/:id/roles` | `users.assign_roles` | 替换角色集合，含越权保护 |
| `GET` | `/admin/cocktails` | `cocktails.read` | 按状态、作者、基酒、时间筛选 |
| `GET` | `/admin/cocktails/:id` | `cocktails.read` | 内容、作者、审核历史 |
| `POST` | `/admin/cocktails/:id/approve` | `cocktails.review` | `pending → published` |
| `POST` | `/admin/cocktails/:id/reject` | `cocktails.review` | `pending → rejected`，原因必填 |
| `POST` | `/admin/cocktails/:id/offline` | `cocktails.offline` | 已发布内容下架，原因必填 |
| `POST` | `/admin/cocktails/:id/publish` | `cocktails.publish` | 将符合要求的 offline 内容重新上架 |
| `PATCH` | `/admin/cocktails/:id` | `cocktails.update` | 运营修订；要保留审计前后快照 |
| `DELETE` | `/admin/cocktails/:id` | `cocktails.delete` | 软删除；不得物理删除审核/审计历史 |
| `GET` | `/admin/audit-logs` | `audit_logs.read` | 管理操作审计记录 |
| `GET/POST/PATCH` | `/admin/roles` | `roles.read` / `roles.manage` | 角色权限管理；系统角色限制删除 |

## 5. 模块边界与代码组织

建议新增 `src/modules/admin/`，但不要将所有后台逻辑塞入一个 service：

```text
admin/
  controllers/  admin-users.controller.ts, admin-cocktails.controller.ts, admin-roles.controller.ts
  services/     admin-users.service.ts, review.service.ts, roles.service.ts, audit-log.service.ts
  entities/     role.entity.ts, permission.entity.ts, user-role.entity.ts, role-permission.entity.ts, audit-log.entity.ts
  guards/       permissions.guard.ts
  decorators/   require-permissions.decorator.ts
  dto/          分资源维护 query、status、review、role DTO
cocktails/
  entities/     cocktail.entity.ts, cocktail-review-log.entity.ts
  services/     cocktails.service.ts（客户端归属及公开读取）, review.service（可被 admin 调用）
```

业务层应提供显式的方法，如 `submitByOwner`、`withdrawByOwner`、`approveByReviewer`，而不是一个可任意传 `status` 的通用更新 DTO。这样可防止客户端伪造 `published` 状态。

缓存：任何发布、下架、删除、审核通过操作后，必须清除现有酒单列表及推荐缓存；审核日志和权限变更不应依赖可陈旧的缓存结果。

## 6. 迁移与发布步骤

迁移必须是追加式，不修改已经在生产执行过的历史 migration。每一步先在 staging 执行 `pnpm migration:show` 与 `pnpm migration:run`，再发布应用代码。

1. **基础准备 migration**：在 CLI DataSource 中登记所有新增 entity；创建 RBAC、审核、审计表；给 `users`、`cocktails` 添加可空的新字段与索引。
2. **数据回填 migration**：将已有公开酒单设为 `published`，写入 `publishedAt`（可用原 `createdAt`）；将既有私密酒单设为 `draft`；创建预置权限、角色，并将首位指定管理员赋予 `super_admin`。首位管理员应由环境变量/一次性受控 seed 指定，不能按“第一个注册用户”自动授予。
3. **应用兼容发布**：代码可同时读取空状态与新状态，公开查询已加 `status = published`；新增的创建默认草稿、提交/撤回和后台审核接口上线。
4. **强制约束 migration**：确认回填无遗漏后，把 `status` 改为 NOT NULL、设置默认 `draft`，增加必要 CHECK 约束或 enum。
5. **前端切换**：客户端改为“保存草稿/提交审核/查看审核状态”；后台 UI 再接入后台 API。

回滚原则：只回滚未被后续 migration 依赖的版本。对于已产生审核或审计记录的生产库，优先发新的“修正 migration”，不要回滚并丢失历史。

## 7. 验收清单

- 未登录用户无法创建、修改、提交酒单；非所有者无法访问他人的草稿或待审内容。
- 新提交酒单不会出现在公开列表、随机抽选、推荐、收藏或搜索结果中。
- 审核通过后才公开；驳回和下架会立即从公开读取路径消失并清理 Redis 缓存。
- 用户被禁用后无法登录/刷新/调用任何受保护接口。
- 审核员能审核但不能禁用用户或改角色；运营人员不能改自己或更高角色的权限；最后一个超级管理员受保护。
- 每次后台写操作和审核状态变化都有操作者、原因、时间和对象记录。
- migration 在空库与含既有数据的库均可成功执行；`migration:show` 无 pending 后启动服务正常。
- 覆盖单元测试（状态迁移、权限 guard）和 e2e 测试（创建→提交→审核→公开、驳回、禁用、越权）。

## 8. 后台批量导入

酒单导入接口位于 `/api/v1/admin/import-jobs`，后端强制要求 `imports.manage` 权限，该权限只授予 `super_admin`。

支持 `.json` 和 `.xlsx`，单文件最大 10 MB、最多 5000 条。标准字段如下：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 中文名称，对应酒单 `zh` |
| `nameEn` | 否 | 英文名称，对应 `en` |
| `baseSpirit` | 是 | 基酒编码或中文名称，如 `gin` / `金酒` |
| `abv` | 否 | 酒精度，0～99 |
| `description` | 否 | 酒单介绍，对应 `story` |
| `tags` | 否 | JSON 数组；Excel 中也可使用逗号分隔文本 |
| `ingredients` | 是 | JSON 数组，每项为 `{name, amount, unit}` |
| `steps` | 否 | JSON 数组；Excel 中也可使用逗号分隔文本 |
| `imageUrl` | 否 | 封面图片完整 URL |
| `isPrivate` | 否 | `true/false`，也接受 `是/否`；默认 false |

`isPrivate=false` 的合法记录直接成为已发布官方酒单；`isPrivate=true` 的记录归属于导入管理员并保存为私密草稿，不会公开。单行失败不会回滚其他成功行，任务详情会返回行号、可选 ID 和错误原因。服务重启后会恢复未完成任务。

接口：

- `POST /api/v1/admin/import-jobs`：multipart 字段 `file`，创建异步任务。
- `GET /api/v1/admin/import-jobs`：任务分页列表。
- `GET /api/v1/admin/import-jobs/template`：下载 XLSX 模板。
- `GET /api/v1/admin/import-jobs/:id`：任务详情及逐行错误。
- `POST /api/v1/admin/import-jobs/:id/retry`：重试整体失败的任务。

## 9. 供其他项目复用的实施提示词

将下方内容复制到目标项目的 AI 编程助手中，并替换尖括号内的值。先要求助手审查项目，再授权实施，避免它基于假设修改数据库。

```text
你正在维护一个 <技术栈，例如 NestJS + TypeORM + PostgreSQL> 项目。请为 <内容实体，例如酒单/文章/商品> 实现独立后台管理模块，采用可扩展的 RBAC 与审核发布流程。

先只做只读审查：列出当前认证方式、实体、数据库迁移配置、公开读取路径、内容创建/编辑入口、缓存机制和现有测试；说明与下面目标的差距。不要修改代码，等待我确认。

确认后按以下约束实现：
1. 复用现有用户与 access token 认证；后台 API 前缀为 <例如 /api/v1/admin>，客户端 API 不与后台混用。
2. 使用 RBAC 表：roles、permissions、user_roles、role_permissions；权限代码采用 resource.action，例如 contents.review。不要使用单一 isAdmin 布尔值作为唯一授权依据。
3. 预置 super_admin、operator、reviewer、user 角色；实现最小权限、禁止权限提升、保护最后一个启用的 super_admin。
4. 内容状态使用 draft、pending、rejected、published、offline。客户端创建默认 draft；提交审核后 pending；仅 published 内容可进入任何公开列表/搜索/随机/推荐/收藏。私密内容不可提交审核。
5. 所有者只能操作自己的内容；pending 不可直接编辑，只能撤回后编辑；驳回原因只对作者和后台可见。
6. 后台审核、上下架、用户禁用、角色分配等写操作必须写不可变 audit log；内容状态变化另写 review log。审核通过/驳回必须在事务内更新内容和日志。
7. 所有 schema 变更只能新增 migration，不能修改已执行 migration，也不要依赖生产 synchronize。提供既有数据回填和预置角色/权限 seed；首位超级管理员使用受控配置指定，绝不能自动赋予第一个注册用户。
8. 对后台路由实施认证与权限 guard；401 表示未认证、403 表示无权限。被禁用用户应无法登录、刷新 token 和使用受保护接口。
9. 保持项目现有响应格式、DTO 校验风格、软删除策略和模块结构。内容状态变化要失效相关缓存。
10. 先提交详细实施计划、实体/迁移变更、API 表、风险及兼容策略；得到确认后分阶段编码。每阶段执行 lint、单元测试、e2e 测试和 migration 验证，并报告结果。

额外上下文：
- 内容实体：<名称及现有字段>
- 首位超级管理员：<受控 email 或部署配置名>
- 已有数据应映射：<例如 公开 -> published，私密 -> draft>
- 后台 UI：<本期实现 API / 同期实现 Web 管理端>
```
