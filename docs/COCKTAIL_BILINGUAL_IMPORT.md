# 酒单双语导入与接口约定

同一张 `cocktails` 表的一条记录保存中英文；数量、酒精度、图片、基酒编码等共用。上传时无需选择语言，一行对应一款酒。

## Excel 字段

下载模板：`GET /api/v1/admin/import-jobs/template`。上传：`POST /api/v1/admin/import-jobs`，multipart 字段为 `file`，需要 `imports.manage` 权限。

| 中文/共用列 | 英文列 | 说明 |
| --- | --- | --- |
| `name` | `nameEn` | 中文名称必填，英文可选 |
| `description` | `descriptionEn` | 介绍；内部对应 `story` / `storyEn` |
| `tags` | `tagsEn` | JSON 字符串数组，也支持逗号或换行分隔；英文标签建议使用 JSON |
| `glass` | `glassEn` | 杯型，英文最多 64 字符 |
| `garnish` | `garnishEn` | 装饰，英文最多 128 字符 |
| `flavor` | `flavorEn` | 风味描述，英文最多 255 字符 |
| `steps` | `stepsEn` | JSON 字符串数组或单元格内换行；普通文本不按逗号拆分 |
| `ingredients` | 同一配方项的 `nameEn`、`amountTextEn` | 配方必填，见下方示例 |
| `baseSpirit` | 共用 | 必填，建议用 `gin` 等已启用分类编码 |
| `abv` | 共用 | 0～99 整数，不带百分号 |
| `imageUrl` / `images` | 共用 | 单张 URL 或多张 URL 数组，选一种 |
| `color` | 共用 | 可选十六进制颜色 |
| `id` | 共用 | 可选，1～32 位字母、数字、下划线或连字符；重复 ID 报错，不会覆盖更新 |
| `isPrivate` | 共用 | 默认 false，直接发布官方酒单；true 保存为导入管理员的私密草稿 |

配方单元格使用 JSON，将翻译直接绑定到对应原料，避免两个配方数组错位：

```json
[
  {"name":"金酒","nameEn":"Gin","amount":30,"unit":"ml"},
  {"name":"橙皮","nameEn":"Orange peel","amount":1,"unit":"片","amountTextEn":"1 piece"}
]
```

`amountTextEn` 是完整英文用量，仅用于非数值毫升的文字用量；数值毫升只需共用 `amount`。内部 `recipe` 格式也可用：`{"n":"橙皮","nEn":"Orange peel","t":"1 片","tEn":"1 piece"}`。

原有多行配方文本继续支持；需要原料翻译时用上述 JSON 格式。旧表不增加英文列也能导入。新增英文列留空时读取回退中文。新记录不填写英文名时不再自动使用 `House Original`；已有名称不作批量改写。

只读取第一个工作表，首行为精确字段名，最多 5000 条、10 MB，不支持公式。任务可能部分成功，需查看 `summary.failed` 和逐行错误。

## 前端读取

以下入口支持 `?lang=zh` 或 `?lang=en`，默认中文，其他值返回 400：

- `/api/v1/cocktails`、`/api/v1/cocktails/:id`
- `/api/v1/cocktails/random`、`/api/v1/cocktails/recommendations`、`/api/v1/cocktails/today-recommendations`
- `/api/v1/users/me/cocktails`、`/api/v1/users/me/favorites`
- `/api/v1/cocktail-categories`

分类接口的 `name` 和 `description` 按语言返回，字段名不变，缺少英文时分别回退中文；原有 `nameEn` 字段保留，新增 `descriptionEn` 仅在后台维护接口返回。酒单内嵌 `category` 使用同一规则。分类后台创建和修改支持 `descriptionEn`，已有 `nameEn` 继续使用。

显示字段名称及类型不变。英文时，`zh` 返回英文酒名（保留历史字段名），`en` 仍保留英文名；`story`、`tags`、`glass`、`garnish`、`flavor`、`steps`、`recipe[].n` 和 `recipe[].t` 返回英文内容。公开显示记录不附加 `storyEn` 等新字段，也不附加配方的 `nEn` / `tEn`。基酒 `spirit` 编码不变，存在分类英文名时 `base` 和内嵌 `category.name` 使用英文名。

没有英文翻译时按字段回退中文；标签和步骤按整组回退（空数组或有空白项均回退），原料名和文字用量按每项回退。后端不自动翻译。

缓存保存双语数据，响应拦截器在缓存读取之后创建本次语言的副本，因此不需按语言分裂服务层缓存，也不会改写缓存中的中文。

管理后台 `/api/v1/admin/...` 不做语言投影，读取保留两套字段。更新酒单使用内部字段 `storyEn`、`glassEn`、`garnishEn`、`flavorEn`、`tagsEn`、`stepsEn` 和带 `nEn` / `tEn` 的 `recipe`。用户接口的 `revision` / `latestRevision` 是编辑文档，也保留原始双语内容，审核通过会保存英文字段。

## 数据库上线

上线前执行 `pnpm migration:run`，应用迁移 `1890000000000-AddCocktailTranslations.ts`，再启动新代码。迁移仅增加六个可空英文列并调整新记录英文名默认值，不修改已有酒单内容。回滚迁移会删除新增英文列，先备份翻译数据。

分类双语补充迁移为 `1900000000000-AddCategoryTranslation.ts`，增加可空的分类英文描述列，也需要在启动新代码前执行；现有分类名称、描述不改写。
