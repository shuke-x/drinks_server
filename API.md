# 「今晚喝什么」后端 API 使用手册

## 1. 基本信息

- 本地服务地址：`http://localhost:3000`
- API 前缀：`/api/v1`
- Swagger：`http://localhost:3000/docs`
- 请求与响应编码：`UTF-8`
- JSON 字段命名：`camelCase`
- 用户、收藏接口需要登录；其余酒单接口仍可匿名访问。

## 认证与用户

认证接口使用一次性 RSA-OAEP(SHA-256) challenge，避免密码以明文 JSON 形式进入业务请求。HTTPS 仍然是必须的；RSA 不是 TLS 的替代品。

1. `GET /api/v1/auth/challenge` 返回 `challengeId`、PEM `publicKey`、`nonce` 与 `expiresAt`（2 分钟）。
2. 注册时将 `{ email, password, name?, code? }`（登录时为 `{ email, password }`）序列化为 UTF-8 JSON，以该公钥 RSA-OAEP SHA-256 加密并 Base64 编码。`code` 是为后续邀请码/验证码流程预留的可选字段，当前不校验。
3. 发送 `{ "challengeId":"…", "ciphertext":"…" }` 至 `POST /api/v1/auth/register` 或 `/login`。

challenge 为一次性且有效期为两分钟，服务端会原子消费它，重复提交会失败。注册密码必须至少 8 位，且含大写、小写、数字、标点。服务端仅保存 Argon2id 哈希。

成功登录/注册返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "accessToken": "…", "refreshToken": "…", "expiresIn": 900 }
}
```

accessToken 有效 15 分钟。`POST /api/v1/auth/refresh` 的 body 为 `{ "refreshToken":"…" }`，每次刷新都会撤销旧 refreshToken 并返回新 token 对；`POST /api/v1/auth/logout` 使用相同 body 撤销 refreshToken。数据库只保存 refreshToken 的 SHA-256 哈希。

携带 API accessToken：`Authorization: Bearer <accessToken>`。

用户资料接口：

| 方法   | 路径                         | body                                      | 说明                                   |
| ------ | ---------------------------- | ----------------------------------------- | -------------------------------------- |
| GET    | `/api/v1/users/me`           |                                           | 当前用户（id、email、name、avatarUrl） |
| PATCH  | `/api/v1/users/me`           | `{ "name":"…", "avatarUrl":"https://…" }` | 更新展示资料                           |
| GET    | `/api/v1/users/me/cocktails` |                                           | 当前用户创建的公开与私人酒单           |
| GET    | `/api/v1/users/me/favorites` |                                           | 返回按收藏时间倒序的酒单               |
| POST   | `/api/v1/users/me/favorites` | `{ "cocktailId":"ne" }`                   | 收藏酒单                               |
| DELETE | `/api/v1/users/me/favorites` | `{ "cocktailId":"ne" }`                   | 取消收藏                               |

启动服务：

```bash
docker compose up -d
docker compose exec api pnpm seed
```

## 2. 统一返回结构

普通成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

列表成功响应会额外返回分页信息：

```json
{
  "code": 0,
  "message": "ok",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 12
  }
}
```

业务错误返回：

```json
{
  "code": 1404,
  "message": "Cocktail not found",
  "data": null
}
```

错误码：

|   code | 含义               | HTTP 状态说明                                        |
| -----: | ------------------ | ---------------------------------------------------- |
|    `0` | 成功               | HTTP 200                                             |
| `1400` | 参数校验失败       | DTO 校验通常为 HTTP 400；业务参数错误可能为 HTTP 200 |
| `1404` | 资源不存在         | 业务异常为 HTTP 200                                  |
| `1409` | 资源冲突或禁止操作 | 业务异常为 HTTP 200                                  |
| `1500` | 服务器内部错误     | HTTP 500                                             |

前端应优先判断响应 JSON 中的 `code`，不要只判断 HTTP 状态码。

## 3. 鸡尾酒数据结构

```json
{
  "id": "ne",
  "zh": "内格罗尼",
  "en": "Negroni",
  "spirit": "gin",
  "base": "金酒",
  "abv": 24,
  "color": "#C44732",
  "tags": ["苦甜"],
  "images": [],
  "glass": "古典杯",
  "garnish": "橙皮",
  "flavor": "苦甜交织。",
  "story": "落日慢舞。",
  "recipe": [
    { "n": "金酒", "ml": 30 },
    { "n": "橙味苦精", "t": "1 dash" }
  ],
  "steps": ["加冰搅拌。"],
  "isOfficial": true,
  "createdAt": "2026-07-26T07:29:42.841Z",
  "updatedAt": "2026-07-26T07:29:42.841Z"
}
```

`spirit` 与 `base` 的对应关系：

| spirit    | base   |
| --------- | ------ |
| `gin`     | 金酒   |
| `whiskey` | 威士忌 |
| `rum`     | 朗姆   |
| `tequila` | 龙舌兰 |
| `vodka`   | 伏特加 |
| `other`   | 其他   |

查询、创建和修改时，`spirit` 或 `base` 都可以传中文或英文。中文 `全部` 表示不筛选。

### 图片字段说明

所有酒单对象都包含 `images` 数组：

```json
{
  "images": [
    "http://localhost:3000/static/cocktail-cover.webp",
    "http://localhost:3000/static/cocktail-detail-1.webp"
  ]
}
```

- 数组第一项建议作为列表封面图。
- 后续项目作为详情页轮播图。
- 没有图片时返回空数组 `[]`，官方与用户酒单一致。
- 创建和修改接口只接收完整 URL，不接收 Base64 数据。
- 本地图片应先调用上传接口，再将返回的 `data.url` 放进 `images`。

## 4. 获取鸡尾酒列表

```http
GET /api/v1/cocktails
```

用途：Home 页面酒单列表，支持分页和基酒筛选。

查询参数：

| 参数     | 必填 | 默认值 | 说明                                   |
| -------- | ---- | ------ | -------------------------------------- |
| `page`   | 否   | `1`    | 页码，最小为 1                         |
| `limit`  | 否   | `20`   | 每页数量，范围 1～50                   |
| `spirit` | 否   | 无     | 基酒，中英文都可，例如 `gin` 或 `金酒` |

请求示例：

```bash
curl 'http://localhost:3000/api/v1/cocktails?spirit=gin&page=1&limit=2'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "ne",
      "zh": "内格罗尼",
      "en": "Negroni",
      "spirit": "gin",
      "base": "金酒",
      "abv": 24,
      "color": "#C44732",
      "tags": ["苦甜"],
      "glass": "古典杯",
      "garnish": "橙皮",
      "flavor": "苦甜交织。",
      "story": "落日慢舞。",
      "recipe": [{ "n": "金酒", "ml": 30 }],
      "steps": ["加冰搅拌。"],
      "isOfficial": true,
      "createdAt": "2026-07-26T07:29:42.841Z",
      "updatedAt": "2026-07-26T07:29:42.841Z"
    }
  ],
  "meta": { "page": 1, "limit": 2, "total": 2 }
}
```

## 5. 获取今日推荐

```http
GET /api/v1/cocktails/recommendations
```

用途：Home 页今日推荐。同一天重复请求得到相同的 4 款官方鸡尾酒，次日自动轮换。

```bash
curl 'http://localhost:3000/api/v1/cocktails/recommendations'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    { "id": "ne", "zh": "内格罗尼", "spirit": "gin", "base": "金酒" },
    { "id": "of", "zh": "古典", "spirit": "whiskey", "base": "威士忌" },
    { "id": "mo", "zh": "莫吉托", "spirit": "rum", "base": "朗姆" },
    { "id": "ma", "zh": "玛格丽特", "spirit": "tequila", "base": "龙舌兰" }
  ]
}
```

实际对象包含第 3 节列出的全部字段。

## 6. 随机抽选鸡尾酒

```http
GET /api/v1/cocktails/random
```

用途：Next 页面服务端随机抽选。可限定基酒范围，不缓存结果。

```bash
curl 'http://localhost:3000/api/v1/cocktails/random?spirit=whiskey'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "of",
    "zh": "古典",
    "en": "Old Fashioned",
    "spirit": "whiskey",
    "base": "威士忌",
    "abv": 32,
    "images": []
  }
}
```

筛选范围内没有酒时：

```json
{
  "code": 1404,
  "message": "Cocktail not found",
  "data": null
}
```

## 7. 获取鸡尾酒详情

```http
GET /api/v1/cocktails/:id
```

```bash
curl 'http://localhost:3000/api/v1/cocktails/ne'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "ne",
    "zh": "内格罗尼",
    "en": "Negroni",
    "spirit": "gin",
    "base": "金酒",
    "abv": 24,
    "color": "#C44732",
    "tags": ["苦甜"],
    "glass": "古典杯",
    "garnish": "橙皮",
    "flavor": "苦甜交织。",
    "story": "落日慢舞。",
    "recipe": [{ "n": "金酒", "ml": 30 }],
    "steps": ["加冰搅拌。"],
    "isOfficial": true,
    "createdAt": "2026-07-26T07:29:42.841Z",
    "updatedAt": "2026-07-26T07:29:42.841Z"
  }
}
```

ID 不存在：

```json
{ "code": 1404, "message": "Cocktail not found", "data": null }
```

## 8. 创建鸡尾酒

```http
POST /api/v1/cocktails
Content-Type: application/json
```

用途：System 页上传用户酒单。创建记录的 `isOfficial` 固定为 `false`，ID 由服务端生成。

`isPrivate` 是可选布尔值，默认 `false`。登录后才应在 Flutter 创建页展示“私人酒单”开关：勾选后带 `Authorization: Bearer <accessToken>` 和 `"isPrivate":true`；服务端将酒单绑定至 token 对应用户，且只会在 `GET /users/me/cocktails` 与该所有者的详情请求中出现。未带 Token 的请求仍会创建公开酒单；未登录却提交 `isPrivate:true` 会被拒绝。

请求字段：

| 字段              | 必填   | 默认值/规则                               |
| ----------------- | ------ | ----------------------------------------- |
| `zh`              | 是     | 1～64 字符                                |
| `en`              | 否     | `House Original`                          |
| `spirit` / `base` | 二选一 | 中英文均可                                |
| `abv`             | 否     | `20`，整数 0～99                          |
| `color`           | 否     | `#0A84FF`，必须是 Hex 颜色                |
| `tags`            | 否     | `["私藏"]`                                |
| `images`          | 否     | `[]`，图片 URL 数组，可保存一张或多张图片 |
| `glass`           | 否     | `依你所好`                                |
| `garnish`         | 否     | `自由发挥`                                |
| `flavor`          | 否     | `来自你自己的酒单。`                      |
| `story`           | 否     | `这一杯由你定义。`                        |
| `recipe`          | 是     | 原料数组                                  |
| `steps`           | 否     | `[]`，字符串数组                          |

每个 `recipe` 元素必须包含 `n`，并且 `ml` 和 `t` 必须二选一：

```json
{ "n": "金酒", "ml": 50 }
```

或：

```json
{ "n": "橙味苦精", "t": "1 dash" }
```

请求示例：

```bash
curl -X POST 'http://localhost:3000/api/v1/cocktails' \
  -H 'Content-Type: application/json' \
  -d '{
    "zh": "午夜花园",
    "en": "Midnight Garden",
    "base": "金酒",
    "abv": 22,
    "color": "#4FB3A6",
    "tags": ["花香", "清新"],
    "images": [
      "http://localhost:3000/static/uploaded-cover.webp",
      "https://cdn.example.com/cocktails/midnight-detail.webp"
    ],
    "glass": "碟形杯",
    "garnish": "迷迭香",
    "flavor": "清凉花香与草本尾韵。",
    "story": "为安静的午夜准备。",
    "recipe": [
      { "n": "金酒", "ml": 50 },
      { "n": "接骨木花糖浆", "ml": 15 },
      { "n": "橙味苦精", "t": "1 dash" }
    ],
    "steps": ["加入冰块摇匀。", "双重过滤到冰镇杯中。"]
  }'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "V1StGXR8_Z5j",
    "zh": "午夜花园",
    "en": "Midnight Garden",
    "spirit": "gin",
    "base": "金酒",
    "images": [],
    "isOfficial": false
  }
}
```

校验失败示例：

```json
{
  "code": 1400,
  "message": "recipe items require n and exactly one of positive integer ml or non-empty t",
  "data": null
}
```

## 9. 修改鸡尾酒

```http
PATCH /api/v1/cocktails/:id
Content-Type: application/json
```

用途：修改用户自己上传的酒单。所有字段均为可选，只提交需要修改的字段。

```bash
curl -X PATCH 'http://localhost:3000/api/v1/cocktails/V1StGXR8_Z5j' \
  -H 'Content-Type: application/json' \
  -d '{
    "abv": 24,
    "tags": ["花香", "草本"]
  }'
```

成功返回更新后的完整鸡尾酒对象：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "V1StGXR8_Z5j",
    "zh": "午夜花园",
    "abv": 24,
    "tags": ["花香", "草本"],
    "images": [
      "http://localhost:3000/static/uploaded-cover.webp",
      "http://localhost:3000/static/detail-1.webp"
    ],
    "isOfficial": false
  }
}
```

官方酒单不允许修改：

```json
{
  "code": 1409,
  "message": "Official cocktails cannot be modified",
  "data": null
}
```

## 10. 删除鸡尾酒

```http
DELETE /api/v1/cocktails/:id
```

用途：软删除用户上传的酒单，数据库记录仍保留，但普通查询不再返回。

```bash
curl -X DELETE 'http://localhost:3000/api/v1/cocktails/V1StGXR8_Z5j'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "id": "V1StGXR8_Z5j" }
}
```

官方酒单不允许删除：

```json
{
  "code": 1409,
  "message": "Official cocktails cannot be deleted",
  "data": null
}
```

## 11. 上传封面图片

```http
POST /api/v1/upload/image
Content-Type: multipart/form-data
```

要求：

- 文件字段名必须是 `file`。
- 最大 5MB。
- 仅支持 JPG/JPEG、PNG、WebP。

```bash
curl -X POST 'http://localhost:3000/api/v1/upload/image' \
  -F 'file=@/absolute/path/cocktail.webp'
```

成功返回：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "url": "http://localhost:3000/static/2VfB5kP1Qx8mN4Za.webp"
  }
}
```

返回的 URL 可以直接作为 Flutter `Image.network` 地址使用。

### 多图片完整操作流程

第一步，分别上传每一张图片：

```bash
curl -X POST 'http://localhost:3000/api/v1/upload/image' \
  -F 'file=@/absolute/path/cover.webp'

curl -X POST 'http://localhost:3000/api/v1/upload/image' \
  -F 'file=@/absolute/path/detail.webp'
```

分别取得两个 `data.url` 后，创建酒单：

```bash
curl -X POST 'http://localhost:3000/api/v1/cocktails' \
  -H 'Content-Type: application/json' \
  -d '{
    "zh": "午夜花园",
    "base": "金酒",
    "images": [
      "http://localhost:3000/static/cover.webp",
      "http://localhost:3000/static/detail.webp"
    ],
    "recipe": [{ "n": "金酒", "ml": 50 }]
  }'
```

修改图片时，PATCH 传入的是更新后的完整数组。例如在原有图片后追加一张：

```bash
curl -X PATCH 'http://localhost:3000/api/v1/cocktails/V1StGXR8_Z5j' \
  -H 'Content-Type: application/json' \
  -d '{
    "images": [
      "http://localhost:3000/static/cover.webp",
      "http://localhost:3000/static/detail.webp",
      "http://localhost:3000/static/new-detail.webp"
    ]
  }'
```

清空图片数组：

```json
{ "images": [] }
```

格式错误示例：

```json
{
  "code": 1400,
  "message": "Only jpg/png/webp allowed",
  "data": null
}
```

## 12. 接口汇总

| 方法   | 路径                                | 用途               |
| ------ | ----------------------------------- | ------------------ |
| GET    | `/api/v1/cocktails`                 | 分页列表与基酒筛选 |
| GET    | `/api/v1/cocktails/recommendations` | 今日 4 款推荐      |
| GET    | `/api/v1/cocktails/random`          | 随机抽选           |
| GET    | `/api/v1/cocktails/:id`             | 酒单详情           |
| POST   | `/api/v1/cocktails`                 | 创建私人酒单       |
| PATCH  | `/api/v1/cocktails/:id`             | 修改私人酒单       |
| DELETE | `/api/v1/cocktails/:id`             | 软删除私人酒单     |
| POST   | `/api/v1/upload/image`              | 上传封面图片       |

## 13. Flutter 调用注意事项

1. 所有响应先读取 `code`；只有 `code == 0` 才视为业务成功。
2. 列表数据在 `data`，分页信息在 `meta`。
3. UI 显示基酒时使用 `base`；后台筛选可以使用 `spirit`。
4. 主题色 `color` 是 `#RRGGBB` 字符串，Flutter 解析时需补 `0xFF` Alpha。
5. `recipe` 的用量可能是数字 `ml`，也可能是文字 `t`。
6. 图片 URL 来自 `PUBLIC_BASE_URL`。真机调试时不能使用手机自身的 `localhost`，需要把它配置为电脑局域网 IP 或正式域名。
7. 酒单图片统一读取 `images` 数组；列表封面通常使用 `images.first`，详情页可以展示完整数组。
