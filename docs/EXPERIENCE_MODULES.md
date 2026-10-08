# 新增模块：品饮记录与风味配置

## 本地启动

```sh
pnpm run start:experience-local
```

此命令构建服务、启动 `compose.experience.yml` 中独立的 PostgreSQL 和 Redis，运行迁移，创建本地验收账户，然后启动真实 NestJS 服务。固定使用本机 55438 / 56388 端口及 `tonight_experience_local` 数据库，不使用项目 `.env` 的数据库、Redis或签名密钥。数据库通过独立 Docker volume 持久化。每次启动生成临时签名密钥，重启后请重新登录。

- API：`http://127.0.0.1:3007/api/v1`
- Swagger：`http://127.0.0.1:3007/docs`
- 本地管理员：`local-admin@example.test`
- 本地普通用户：`local-user@example.test`
- 两个本地验收账户的初始密码：`LocalSync123!`

后台项目运行 `pnpm run dev:experience-local`，浏览器打开 `http://127.0.0.1:5178`。

Flutter iOS 模拟器运行：

```sh
flutter run --dart-define=FLAVOR=dev --dart-define=API_BASE_URL=http://127.0.0.1:3007/api/v1
```

Android 模拟器把主机地址改为 `10.0.2.2`；真机使用开发电脑局域网地址。

## 数据表与迁移

`1850000000000-AddExperienceModules.ts` 创建：

- `drink_records`：以 `ownerId + id` 为主键；按账户和品饮时间索引；事件快照、文字用量、币种价格与照片存入私有 JSONB；删除保留无内容 tombstone，阻止旧设备重新导入已删记录；账户删除级联清理。
- `flavor_directions`：稳定标识、双语名称和描述、关键词、匹配权重、图标、颜色、启停和顺序；初始化 App 现有五种风味。
- `records.manage`、`flavors.manage`：默认授予已有 `super_admin`；其他角色按现有角色管理流程授权。

其他环境使用现有 `pnpm migration:run` 流程。本次仅本地运行。

## 接口

所有地址以下列路径加 `/api/v1` 前缀，成功响应沿用 `{code:0,message:'ok',data:...}`。

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/users/me/drink-records` | GET / POST | 当前账户分页列表 / 新增 |
| `/users/me/drink-records/:id` | GET / PATCH / DELETE | 查看 / 完整表单更新 / 删除 |
| `/users/me/drink-records/import` | POST | 单条幂等导入；已有记录及删除标记优先 |
| `/admin/drink-records` | GET / POST | 管理列表 / 为指定账户新增 |
| `/admin/drink-records/:ownerId/:id` | GET / PATCH / DELETE | 管理记录详情 / 更新 / 删除 |
| `/flavor-directions` | GET | 公开启用风味配置，按顺序返回 |
| `/admin/flavor-directions` | GET / POST | 全部配置 / 新增 |
| `/admin/flavor-directions/:id` | PATCH / DELETE | 完整配置更新 / 删除 |

记录列表返回 `{items,total,page,limit}`，支持 `page`、`limit`（1–100）、`scene` 和 `search`（酒名/酒吧）；后台另支持 `ownerId`。用户端账户始终来自令牌，不能通过查询参数更换。App 发送 `X-Record-Account` 绑定发起请求时的账户，令牌切换后拒绝旧账户请求。

记录请求字段：`id,name,occurredAt,scene(home/out),verdict(loved/liked/notForMe),actualRecipe`；可选 `note,venue,price,adjustments,photoBase64,reference`。后台新增/更新另需 `ownerId`，路由 ID 与请求 ID 必须一致。`actualRecipe` 每项为 `{n,ml}` 或 `{n,t}`。照片最大 2 MB，采用规范 Base64 JPEG/PNG/WebP，请求最大 3 MB。参考配方为历史快照，不修改公共原配方。

风味请求字段：`id,zh,en,zhSubtitle,enSubtitle,keywords,color,imageUrl,icon,primaryWeight,secondaryWeight,isActive,sortOrder`。`imageUrl` 为可选的 HTTP(S) 封面 URL，由管理端通过图片上传接口取得。同一关键词优先命中风味/标签，否则命中酒名/基酒；分数相同保留原始顺序。停用与删除风味不会再出现在新加载的 App 列表。

## App 同步行为

- 本机旧记录逐条导入，全部确认后原文件改名为 `.migrated` 留作恢复副本；失败保留原文件，重试不会覆盖云端编辑或恢复云端删除。
- 新增、编辑、删除逐条调用云端；写入成功后才更新界面；失败保留输入。新建表单使用稳定 ID，网络重试不会生成重复记录。
- 记录页下拉读取其他设备或后台变更；当前版本需要网络，不提供离线写入队列或推送同步。
- 不同记录的编辑彼此独立；同一条记录的并发编辑采用最后一次成功保存的内容。
- 管理操作与审计写入同一事务；记录日志只记操作者、动作、记录与账户标识，不复制私人笔记或照片。

## 验证

普通服务端回归：`pnpm test -- --runInBand`。

真实数据库接口集成测试：先启动独立 PostgreSQL（127.0.0.1:55437，用户/密码 drinks，数据库 experience_test），再执行：

```sh
EXPERIENCE_TEST_DB=true pnpm test -- --runInBand src/modules/experience/experience.integration.spec.ts
```

该集成测试只连接固定测试地址，验证所有迁移、新表回滚重建、账户隔离、管理权限、CRUD、导入与审计；默认回归跳过，不连接开发数据库。
