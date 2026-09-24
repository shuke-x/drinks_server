# 数据安全与品饮记录治理

## 已实现规则

- 品饮记录自数据库创建时间起保留 7 天，用户修改的品饮日期不影响到期时间，编辑、提交审核、审批均不续期。
- 升级前已有记录从迁移执行时开始获得 7 天保留期。
- 到期立即拒绝列表、详情、编辑、审核与公开读取。启动时和每分钟清理一次，每轮最多 500 条，删除私有 JSON、内嵌照片及分享副本；删除操作先清空内容，墓碑保留至原到期时间。
- 记录审计不复制笔记、照片、地点、价格、分享正文或驳回原因，仅记录操作者、动作、记录标识、版本和状态。相关审计元数据也按 7 天清理。
- 备份排除 drink_records 表数据，因此灾备不会复活过期记录，也不能恢复临时记录。恢复工具清除记录类审计副本。
- 用户保留配方的独立“另存为我的配方”操作仍创建正常私人酒单，不属于临时品饮记录。

## 公开审批

用户在确认页主动提交酒名、评价、实际配方、独立填写的分享文字和勾选照片。私人笔记、地点、价格、参考配方原始对象均不自动复制。分享照片重新编码，去除 EXIF 等原始元数据。

状态：private → pending → published / rejected。用户可撤回，编辑记录自动恢复 private 并清空分享副本。审批必须匹配版本，只有 pending 可审核，不允许审核自己的记录。记录过期时公开副本一起删除。

新增权限 `records.review` 只赋予 super_admin；其他审核角色需由授权管理员分配。原 `records.manage` 不再提供私人记录读取或编辑入口。后台仅返回待审分享副本，读取和审批均记审计。没有新增社区信息流。

API：

- `POST /api/v1/users/me/drink-records/:id/submit`：version、caption、photoIndexes。
- `POST /api/v1/users/me/drink-records/:id/withdraw`：version。
- `GET /api/v1/admin/drink-records`：分页待审分享副本。
- `POST /api/v1/admin/drink-records/:ownerId/:id/review`：version、action（approve/reject）、reason（驳回必填）。
- `GET /api/v1/public/drink-records/:ownerId/:id`：仅已通过且未过期的分享内容，不缓存。

## 图片访问

旧 `/static/:key` 地址现在由应用鉴权，不能再交给 express 静态目录或反向代理直接读取 uploads。

- 已发布非私密酒单的引用图片、用户当前头像可公开读取。
- 其他图片需要短期、绑定图片和用户的访问凭据，每次读取仍校验账号状态、归属或待审内容权限。
- 审核权限不能读取无关的私人上传。
- 访问凭据有效 5 分钟，仅服务端签发；响应 no-store。提交表单前移除短期凭据，以规范地址持久化。
- 用户不能把其他账户的上传挂到自己的配方或头像中。
- 所有对象桶保持私有。本地模式同样通过权限入口读取。

## 部署前必须执行

1. 暂停写入并备份，执行全部数据库迁移，尤其是 1870000000000 和 1880000000000。迁移成功后再启动新 API。
2. 先部署 API，再发布配套 App / 管理端；旧客户端缺失版本号会被拒绝更新。
3. 移除 Nginx/CDN 对 `/static/` 的磁盘直出，转发到 API；清理旧公开图片缓存。否则会绕过新权限。
4. 使用 Node 22。容器以 node 用户运行，绑定的 uploads 卷需允许该用户读写。
5. 先保留 STORAGE_DRIVER=local。R2 配置完成后运行迁移工具 dry run，再暂停写入以 --apply 复制和逐文件校验。
6. 迁移工具不删除源文件。仅在全部校验成功后切换 s3；旧源文件继续隔离保留，不能恢复公开目录直出。
7. 配置 Redis；公开查询与图片接口的限流依赖 Redis。健康检查会检查实际选择的存储。

## 迁移与备份工具

```sh
pnpm media:migrate              # dry run，生成文件大小与 SHA-256 清单
pnpm media:migrate --apply      # 复制到已配置的私有 S3 桶，并读回校验
pnpm backup                    # 需要暂停写入及 BACKUP_WRITES_PAUSED=true
pnpm backup:restore /secure/path/backup.tdbackup
```

环境变量见 `.env.storage.example`。备份使用 AES-256-GCM，BACKUP_KEY_BASE64 是独立的 32 字节密钥，不能与备份放在同一位置。生成方式：`openssl rand -base64 32`，结果只保存到服务器密钥管理工具。

恢复必须设置 RESTORE_CONFIRM=isolated、RESTORE_DB_NAME（以 restore_ 或 verify_ 开头）、RESTORE_DB_HOST/PORT/USER/PASS 和尚不存在的 RESTORE_DIR。工具新建数据库，不覆盖已有库，先验证密文完整性、图片校验和，再恢复。系统需安装 pg_dump、pg_restore、createdb、psql 与 tar；也可通过 PG_DOCKER_CONTAINER 使用数据库容器内的工具。

备份命令产生独立加密文件。自动定时执行、异地上传、备份桶生命周期和密钥保管需要按实际部署环境配置；本轮未连接生产服务器、未上传真实备份到 R2。

## 验证边界

已经验证本地权限逻辑、真实隔离 PostgreSQL 的7天保留和审批、合成图片加密备份及隔离恢复。R2 尚未创建，不能把这些结果表述为线上迁移或生产灾备验收完成。
