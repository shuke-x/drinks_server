# Drinks Server VPS 生产部署指南

本文档适用于将本仓库部署到全新安装的 Debian 12 VPS。

项目运行组件：

- NestJS 10 / Node.js 20 / pnpm 9
- PostgreSQL 16
- Redis 7
- TypeORM migrations
- 本地上传文件卷 `uploads`
- Nginx + Let's Encrypt HTTPS

推荐使用 Docker Compose。项目已有 `Dockerfile` 和 `docker-compose.yml`，但仓库中的 Compose 配置包含开发用固定数据库密码，并将 API 暴露在全部公网接口上。生产环境应使用本文的独立配置。

## 按当前部署情况选择步骤

当前假设：VPS 已重装、使用 `root` 登录、Docker 已安装，后端项目中已有可用的 `.env`。

| 步骤 | 当前是否需要 | 说明 |
| --- | --- | --- |
| 检查网络和 DNS | 必做 | VPS 必须能解析域名并访问软件源 |
| 创建 `deploy` 用户 | 可跳过 | 当前选择直接使用 `root` |
| 安装 Docker | 可跳过 | `docker version` 和 `docker compose version` 成功即可 |
| 上传后端代码 | 必做 | Git clone 或 rsync 二选一 |
| 创建 PostgreSQL 数据库 | 不需要手动做 | Compose 首次启动时自动创建 |
| 创建数据库表 | 不需要手动做 | API 启动时自动执行 TypeORM migrations |
| 配置 RSA 公钥 | 不需要 | 后端根据 `AUTH_RSA_PRIVATE_KEY` 自动生成公钥 |
| 重新生成 RSA/JWT 密钥 | 条件执行 | 已有正式环境密钥时复用；全新正式环境可生成新密钥 |
| 导入 seed 酒单 | 条件执行 | 空数据库且需要内置酒单时只执行一次 |
| 设置超级管理员 | 条件执行 | 需要后台管理员时执行 |
| Nginx 和 HTTPS | 本机测试可跳过，正式发布必做 | 正式环境不直接暴露 3000 端口 |
| 数据备份 | 正式发布必做 | 同时备份 PostgreSQL 和 uploads |

最短执行路径为：检查网络 → 上传代码 → 准备 `.env` → 创建生产 Compose → `up -d --build` → 检查日志。不要因为文档列出了可选的加固步骤而重复生成现有密钥。

## 1. 网络和域名准备

在 VPS 服务商后台设置安全组：

| 端口 | 协议 | 来源 | 用途 |
| ---: | --- | --- | --- |
| 22 | TCP | 管理员公网 IP | SSH |
| 80 | TCP | `0.0.0.0/0`、`::/0` | HTTP 和证书申请 |
| 443 | TCP | `0.0.0.0/0`、`::/0` | HTTPS |

不要开放 PostgreSQL `5432` 或 Redis `6379`。

为 API 域名添加 A 记录，例如：

```text
api.example.com -> VPS_PUBLIC_IP
```

登录 VPS 控制台并确认网络与 DNS：

```bash
ip -4 addr
ip route
ping -c 3 1.1.1.1
getent hosts deb.debian.org
```

如果 `1.1.1.1` 可达但 DNS 失败，可临时修复：

```bash
cp -a /etc/resolv.conf /etc/resolv.conf.bak
rm -f /etc/resolv.conf
printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf
```

## 2. 初始化 Debian

```bash
apt update
apt full-upgrade -y
apt install -y ca-certificates curl git nginx ufw openssl
timedatectl set-timezone Asia/Hong_Kong
```

### 可选：创建非 root 部署用户

当前直接使用 `root` 部署时，跳过本小节。需要进一步收紧权限时再创建部署用户：

```bash
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

将本机 SSH 公钥放入 `/home/deploy/.ssh/authorized_keys`，然后执行：

```bash
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

用新终端确认 `ssh deploy@VPS_PUBLIC_IP` 成功之前，不要禁用 root 登录或关闭当前控制台。

### 必做：配置 VPS 本机防火墙

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status verbose
```

## 3. 安装 Docker Engine 和 Compose

如果以下命令都成功，说明已经安装，整节可以跳过：

```bash
docker version
docker compose version
systemctl is-active docker
```

使用 Docker 官方 Debian 软件源：

```bash
apt remove -y docker.io docker-compose docker-doc podman-docker containerd runc || true
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```bash
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker run --rm hello-world
docker compose version
usermod -aG docker deploy
```

重新登录 `deploy` 用户，使 Docker 用户组生效。Docker 用户组拥有接近 root 的权限，不要加入不可信用户。

## 4. 上传后端代码

当前使用 `root`，在 VPS 上创建目录：

```bash
mkdir -p /opt/nextdrinks
cd /opt/nextdrinks
```

如果代码已推送到 Git 仓库：

```bash
git clone YOUR_GIT_REPOSITORY /opt/nextdrinks
cd /opt/nextdrinks
```

也可以从开发机直接上传当前仓库：

```bash
rsync -az --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='uploads/*' \
  /Users/shuke/Desktop/develop/drinks_server/ \
  root@VPS_PUBLIC_IP:/opt/nextdrinks/
```

使用 `--delete` 前必须确认目标确实是 `/opt/nextdrinks/`，它会删除目标目录中源端不存在的文件。`.env` 和持久化数据已被排除。

## 5. 准备生产环境变量和密钥

项目不需要单独配置 RSA 公钥。`AuthService` 会从 `AUTH_RSA_PRIVATE_KEY` 自动派生公钥。

下面两种方案只能选择一种。

### 方案 A：复用已有 `.env` 和密钥

适用于以下任一情况：

- 当前项目 `.env` 就是要继续使用的正式环境配置；
- 正在迁移旧生产数据库并希望保留现有认证配置；
- 不希望现有 access token 因更换 `AUTH_JWT_SECRET` 立即失效。

从 Mac 单独上传 `.env`：

```bash
scp /Users/shuke/Desktop/develop/drinks_server/.env \
  root@VPS_PUBLIC_IP:/opt/nextdrinks/.env
```

然后在 VPS 编辑：

```bash
cd /opt/nextdrinks
chmod 600 .env
nano .env
```

至少确认这些值符合 VPS 环境：

```env
PORT=3000
NODE_ENV=production
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com
SWAGGER_ENABLED=false
TRUST_PROXY=loopback
DB_HOST=postgres
DB_PORT=5432
DB_USER=drinks
DB_NAME=tonight_drinks
DB_SYNC=false
REDIS_HOST=redis
REDIS_PORT=6379
```

保留原来的以下密钥值，不要重新生成或发送到聊天：

```env
AUTH_RSA_PRIVATE_KEY=保留现有值
AUTH_JWT_SECRET=保留现有值
```

`DB_PASS` 可以复用现有强密码。生产 Compose 会使用同一个 `.env` 同时配置 PostgreSQL 和 API，因此两边会自动保持一致。

### 方案 B：为全新正式环境生成密钥

仅在全新数据库、没有必须保留的正式环境密钥时使用。执行本方案后不要再上传旧 `.env` 覆盖它。

以下命令在 VPS 的 `/opt/nextdrinks` 中执行。先替换真实域名和管理员邮箱：

```bash
cd /opt/nextdrinks

DB_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
RSA_PRIVATE_KEY=$(openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:2048 2>/dev/null | \
  awk 'NF { printf "%s\\n", $0 }')

cat > .env <<EOF
PORT=3000
PUBLIC_BASE_URL=https://api.example.com

DB_HOST=postgres
DB_PORT=5432
DB_USER=drinks
DB_PASS=${DB_PASSWORD}
DB_NAME=tonight_drinks
DB_SYNC=false

REDIS_HOST=redis
REDIS_PORT=6379

AUTH_RSA_PRIVATE_KEY=${RSA_PRIVATE_KEY}
AUTH_JWT_SECRET=${JWT_SECRET}
AUTH_REFRESH_DAYS=30

ADMIN_BOOTSTRAP_EMAIL=admin@example.com
EOF

chmod 600 .env
```

注意：

- 将 `api.example.com` 换成真实 API 域名。
- `CORS_ORIGINS` 填写允许访问 API 的 Web 前端来源；多个来源用逗号分隔。原生 App 请求不受浏览器 CORS 限制。
- 生产环境保持 `SWAGGER_ENABLED=false`；需要临时排错时才开启，并在使用后立即关闭。
- Nginx 与 API 位于同一主机时保持 `TRUST_PROXY=loopback`，确保限流读取真实客户端地址且不信任公网伪造的转发头。
- `ADMIN_BOOTSTRAP_EMAIL` 应填写要授予 `super_admin` 的已注册用户邮箱。
- `.env` 不能提交到 Git、发到聊天或出现在截图中。
- `DB_SYNC` 在生产环境必须保持 `false`，数据库结构由 migration 管理。
- RSA 私钥在 `.env` 中以字面量 `\n` 保存，这是当前认证代码所需格式。
- 更换 `AUTH_JWT_SECRET` 会使已签发的 access token 失效，用户需要重新登录。
- 更换 RSA 私钥会改变客户端获取到的公钥；客户端重新获取认证公钥后才能继续认证。

可检查变量名是否齐全，但不要直接输出密钥值：

```bash
grep -E '^[A-Z0-9_]+=' .env | cut -d= -f1
```

## 6. 创建生产 Compose 配置

在 VPS 创建 `/opt/nextdrinks/compose.production.yaml`：

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20
    networks:
      - internal
    logging: *default-logging

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
    networks:
      - internal
    logging: *default-logging

  api:
    build:
      context: .
    restart: unless-stopped
    init: true
    command:
      - sh
      - -c
      - >-
        pnpm exec typeorm
        -d dist/src/config/typeorm.datasource.js
        migration:run &&
        node dist/src/main.js
    env_file:
      - .env
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - internal
    logging: *default-logging

networks:
  internal:

volumes:
  postgres_data:
  redis_data:
  uploads:
```

这份配置不会把 PostgreSQL 或 Redis 发布到宿主机；API 也只绑定到 `127.0.0.1:3000`，公网必须经过 Nginx。

## 7. 首次启动（必做）

```bash
cd /opt/nextdrinks
docker compose --env-file .env -f compose.production.yaml config --quiet
docker compose --env-file .env -f compose.production.yaml build
docker compose --env-file .env -f compose.production.yaml up -d
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs --tail=150 api
```

API 容器每次启动前会幂等执行：

```text
typeorm migration:run
```

测试本机 API：

```bash
curl -i http://127.0.0.1:3000/api/v1
curl -i http://127.0.0.1:3000/docs
```

API 根路径没有对应路由时会返回 404；生产环境 `/docs` 也应返回 404。以业务接口、容器状态和日志为准。

### 可选：导入内置酒单

仅当数据库为空且需要仓库内置酒单时执行一次：

```bash
docker compose --env-file .env -f compose.production.yaml exec api pnpm seed
```

## 8. 配置 Nginx（正式发布必做）

以 root 用户创建 `/etc/nginx/sites-available/nextdrinks-api`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
```

替换真实域名，然后启用：

```bash
ln -s /etc/nginx/sites-available/nextdrinks-api /etc/nginx/sites-enabled/nextdrinks-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
curl -i http://api.example.com/docs
```

## 9. 配置 HTTPS（有域名时必做）

确认域名已指向 VPS，且公网 80、443 端口已放行：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.example.com
certbot renew --dry-run
```

把 `.env` 中的 `PUBLIC_BASE_URL` 确认为同一个 HTTPS 域名，然后重启 API：

```bash
cd /opt/nextdrinks
docker compose --env-file .env -f compose.production.yaml up -d api
```

最终测试：

```bash
curl -i https://api.example.com/docs
```

生产环境 `/docs` 默认关闭并返回 404；业务 API 前缀为 `https://api.example.com/api/v1`。

## 10. 可选：设置首位超级管理员

生产 `.env` 中的 `ADMIN_BOOTSTRAP_EMAIL` 不会自动创建用户，它只会给同邮箱的已有用户幂等授予 `super_admin`。

推荐流程：

1. 在客户端正常注册目标管理员邮箱。
2. 确认 `.env` 中 `ADMIN_BOOTSTRAP_EMAIL` 完全一致。
3. 重启 API，使 bootstrap 服务再次运行。

```bash
cd /opt/nextdrinks
docker compose --env-file .env -f compose.production.yaml restart api
docker compose --env-file .env -f compose.production.yaml logs --tail=100 api
```

确认授权成功后，可以清空 `.env` 中的 `ADMIN_BOOTSTRAP_EMAIL` 并再次重启 API，减少误配置风险。

## 11. 数据备份（正式发布必做）

需要同时备份 PostgreSQL 和用户上传文件。Docker volume 本身不是异地备份。

创建备份目录：

```bash
mkdir -p /var/backups/nextdrinks
chmod 700 /var/backups/nextdrinks
```

备份数据库：

```bash
cd /opt/nextdrinks
set -a
. ./.env
set +a

docker compose --env-file .env -f compose.production.yaml exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc \
  > "/var/backups/nextdrinks/postgres-$(date +%F-%H%M%S).dump"
```

备份上传文件：

```bash
cd /opt/nextdrinks
docker compose --env-file .env -f compose.production.yaml exec -T api \
  tar -C /app -czf - uploads \
  > "/var/backups/nextdrinks/uploads-$(date +%F-%H%M%S).tar.gz"
```

检查备份：

```bash
ls -lh /var/backups/nextdrinks
```

至少每天备份一次，并将备份同步到另一台服务器或对象存储。定期在非生产环境验证恢复流程。

数据库恢复会覆盖数据，执行前必须先备份当前数据库：

```bash
cd /opt/nextdrinks
set -a
. ./.env
set +a

docker compose --env-file .env -f compose.production.yaml exec -T postgres \
  pg_restore --clean --if-exists --no-owner \
  -U "$DB_USER" -d "$DB_NAME" \
  < /var/backups/nextdrinks/POSTGRES_BACKUP.dump
```

## 12. 发布新版本

发布前先备份数据库。通过 Git 更新：

```bash
cd /opt/nextdrinks
git pull --ff-only
docker compose --env-file .env -f compose.production.yaml build api
docker compose --env-file .env -f compose.production.yaml up -d
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs --tail=150 api
```

通过 rsync 更新时，继续排除 `.env`、`uploads`、`.git`、`node_modules` 和 `dist`，避免覆盖生产密钥或持久化数据。

## 13. 常用维护和排错

```bash
cd /opt/nextdrinks

# 服务状态
docker compose --env-file .env -f compose.production.yaml ps

# API 日志
docker compose --env-file .env -f compose.production.yaml logs -f --tail=200 api

# 数据库日志
docker compose --env-file .env -f compose.production.yaml logs -f --tail=200 postgres

# Redis 日志
docker compose --env-file .env -f compose.production.yaml logs -f --tail=200 redis

# migration 状态
docker compose --env-file .env -f compose.production.yaml exec api \
  pnpm exec typeorm -d dist/src/config/typeorm.datasource.js migration:show

# 主机监听端口
ss -lntp

# Nginx 配置
nginx -t
systemctl status nginx --no-pager
```

生产主机正常只应公网监听 SSH、80 和 443。API 应显示为 `127.0.0.1:3000`，不应看到 `0.0.0.0:5432` 或 `0.0.0.0:6379`。

## 14. 上线检查清单

- [ ] VPS DNS 和默认路由正常
- [ ] 云安全组只开放必要端口
- [ ] `deploy` 用户可通过 SSH 密钥登录
- [ ] `.env` 权限是 `600` 且未提交到 Git
- [ ] `DB_SYNC=false`
- [ ] PostgreSQL 和 Redis 未开放公网端口
- [ ] API 只绑定 `127.0.0.1:3000`
- [ ] TypeORM migrations 执行成功
- [ ] Nginx 和 HTTPS 工作正常
- [ ] `PUBLIC_BASE_URL` 使用真实 HTTPS 域名
- [ ] `CORS_ORIGINS` 只包含可信 Web 前端来源
- [ ] `SWAGGER_ENABLED=false`
- [ ] 登录、注册和上传接口超过限额时返回 HTTP 429
- [ ] 上传接口返回的 URL 可从公网访问
- [ ] 超级管理员已按指定邮箱授予
- [ ] PostgreSQL 和 uploads 均已建立异地备份
- [ ] 已实际验证备份恢复

## 官方参考

- Docker Engine on Debian: https://docs.docker.com/engine/install/debian/
- Docker Compose plugin: https://docs.docker.com/compose/install/linux/
- PostgreSQL backup and restore: https://www.postgresql.org/docs/current/backup.html
- Certbot instructions: https://certbot.eff.org/instructions
