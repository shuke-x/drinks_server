# 管理端 Cookie 会话部署与验收

后台使用同源 `/api/v1` 代理。原生 App 的 RSA challenge / Bearer / JSON refresh 协议保持兼容。浏览器后台从 challenge 开始携带 `X-Auth-Mode: cookie`，请求层同时使用 `credentials: include`。请配套部署本次前后端，旧前端未发送此标记。

## 生产配置

在服务器后端 `.env` 设置（保留原有 App / Web 所需的其他来源）：

```dotenv
NODE_ENV=production
AUTH_COOKIE_ENABLED=true
AUTH_COOKIE_SAME_SITE=strict
CORS_ORIGINS=https://dash.shuke.me
```

来源是完整 origin，不带路径或末尾 `/`。白名单同时用于 Cookie 写请求的 Origin 校验，同源代理部署也必须配置。保持现有 RSA 私钥和 JWT secret。无需新增数据库迁移；复用 refresh_tokens 表及 tokenHash 唯一索引。

在服务器后端项目目录运行：

```sh
docker compose up -d --build api
docker compose logs --tail=100 api
```

随后构建和上传前端：

```sh
cd /Users/shuke/Downloads/backbar-admin
pnpm run build
rsync -az --delete /Users/shuke/Downloads/backbar-admin/dist/ shuke-server:/var/www/dash/
```

`.env.production` 保持 `VITE_AUTH_MODE=cookie`。本地 rsync 只更新静态站点，不更新服务器后端源码或镜像；应先通过现有后端发布流程同步此次后端变更，再执行 Docker 构建。

Nginx 必须转发 `/api/v1` 到 API、保留 Origin / X-Auth-Mode / X-CSRF-Token，并把 Set-Cookie 原样返回。不要缓存 `/api/v1/auth/*`，不要用 `proxy_hide_header Set-Cookie`，不要把 Cookie Path 改成页面无法读取的 `/api`。Cookie 不设置 Domain，Path=/，生产全部 Secure；认证 Cookie 为 HttpOnly，CSRF Cookie 可由 JS 读取。不要为修复此问题放开任意 Origin。

## 认证契约

- challenge：Cookie 模式签发 CSRF，并在 Redis 的一次性挑战中存储该凭据摘要。挑战有效 120 秒，原子消费；不能切换 Bearer 模式绕过绑定。JSON 不回传 CSRF token。
- login/register：校验来源、Cookie/header 一致性和挑战绑定；建立 backbar_access / backbar_refresh / backbar_csrf。Cookie 模式响应仅含 expiresIn，后台再请求 /auth/me 获取用户与权限。
- 写请求（含上传）：有 Cookie 或显式 Cookie 模式时必须校验 Origin 和 CSRF。会话 CSRF 是绑定 refresh token 的 HMAC；伪造相同 Cookie/header 仍会失败，添加 Bearer header 也不能绕过。
- refresh：接受无 body 请求，从 HttpOnly Cookie 读 refresh token。PostgreSQL 事务及行锁保证并发使用同一 refresh token 仅一次成功；同步轮换认证与 CSRF Cookie。
- access：新签发 JWT 有 sid，指向对应 refresh token 的摘要；每次鉴权检查会话撤销、过期及账号状态。access TTL 为 600 秒。权限仍按现有 PermissionsGuard 实时读取。
- logout：撤销当前会话并清除三个 Cookie；旧 access / refresh 均失效。刷新轮换同样令上一对凭据失效。
- Bearer 客户端不携带 Cookie / X-Auth-Mode，仍接收 JSON token 对。发布前签发、没有 sid 的旧 Bearer JWT 保持原有到期行为；Cookie 鉴权不接受无 sid 的旧 JWT。

## 自动验证

```sh
pnpm exec jest --runInBand src/modules/auth/cookie-auth.spec.ts
pnpm run build

# 本机隔离 PostgreSQL/Redis，固定端口 55439 / 56389；不读取生产连接变量
# 集成测试为自身生成随机 schema，结束后只清理该 schema。
docker compose -f compose.security-test.yml up -d --wait
AUTH_TEST_DB=true pnpm exec jest --runInBand src/modules/auth/cookie-auth.spec.ts
```

测试覆盖实际 Nest HTTP / RSA 加密登录 / Cookie 属性 / /me / 写请求、缺失及伪造 CSRF、非法 Origin、Bearer 绕过尝试、挑战串用/重放/降级、无 body 刷新、旧凭据重放、注销撤销、禁用账号和原生 Bearer 兼容。数据库模式还验证并发轮换。

## HTTPS 上线验收

1. 强制刷新后台，Network 中 challenge 请求有 X-Auth-Mode: cookie，响应 Set-Cookie 包含 backbar_csrf；浏览器 Application 中能看到它。
2. 登录请求有 Origin、Cookie 和 X-CSRF-Token；响应建立两个 HttpOnly Cookie，JSON 无 accessToken / refreshToken。
3. /auth/me 200，刷新页面后仍登录；超过 access 有效期后触发一次 refresh，并重试原请求成功。
4. 修改权限、上传等写请求成功；缺失/伪造 CSRF 或非法 Origin 的请求为 403，业务数据不变。
5. 注销后 /auth/me 与旧 refresh 均 401；再次登录成功。旧凭据测试应在隔离账号/测试环境完成，不在日志中记录 Cookie/token。
6. 验证 App 登录和刷新仍成功。

本地 HTTP / 数据库测试不能证明生产 HTTPS、代理转发和浏览器 Cookie 策略正确；以上浏览器验收需在真实部署后执行。
