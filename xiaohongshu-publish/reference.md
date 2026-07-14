# 小红书发布接口参考

> 已实测验证的部分标注 ✅；基于抓包 URL/方法但请求体需校准的标注 ⚠️。

## 签名机制 ✅

所有 `creator.xiaohongshu.com` / `edith.xiaohongshu.com` 接口都要签名头 `X-s` / `X-t`。

```javascript
const sign = window._webmsxyw(path, body);
// path: 不含域名的完整路径（GET 要带 query，如 '/api/xxx?a=1'）
// body: POST 传请求体对象；GET 传 null
// 返回: { 'X-s': 'XYW_...', 'X-t': 1784011855570 }
```

裸 fetch（不带签名）→ HTTP 406。带 `X-s`/`X-t` → 200、`code:0`。

若 `_webmsxyw` 不存在（改版），用以下脚本重新定位签名函数：

```javascript
() => Object.keys(window).filter(k =>
  typeof window[k] === 'function' && /msxyw|sign|xhs|xyw/i.test(k))
```

## 接口 1：获取上传凭证 ✅

```
GET https://creator.xiaohongshu.com/api/media/v1/upload/creator/permit
    ?biz_name=spectrum&scene=image&file_count=N&version=1&source=web
Headers: X-s, X-t
```

响应 `data.uploadTempPermits[0]`（实测字段）：

```json
{
  "token": "Ll2_juEc...:eyJkZWFkbGluZSI6...",
  "fileIds": ["spectrum/9HrwlQLTgmvcP8maxygeApbFrPEdm-b3Qu53sLH302BWhSc"],
  "uploadAddr": "ros-upload-d4.xhscdn.com",
  "region": "unknown", "storageType": 5, "cloudType": ...,
  "bucket": ..., "uploadId": 403, "expireTime": 1784098294730
}
```

- `file_count=N`：一次要发几张图就填几，`fileIds` 会返回对应数量。
- `fileIds[i]` 即笔记里引用的 `file_id`。

## 接口 2：上传图片二进制 ⚠️（鉴权头需校准）

```
PUT https://{uploadAddr}/{fileId}
Body: 图片二进制（Blob / ArrayBuffer）
```

- `{uploadAddr}` = permit 返回的 `uploadAddr`；`{fileId}` = `fileIds[i]`。
- 鉴权：小红书 ROS 上传通常用 `token`（permit 返回值）放在请求头。**具体头名需用 capture.js 校准**，常见候选：
  - `X-Cos-Security-Token: {token}`，或
  - `Authorization: {token}`，或 querystring `?token={token}`
- `Content-Type` 用图片实际类型（`image/png` / `image/jpeg`）。
- 页面里从 data URI 得到 Blob：`const blob = await (await fetch(dataUri)).blob();`

## 接口 3：发布笔记 ⚠️（请求体需校准）

```
POST https://edith.xiaohongshu.com/web_api/sns/v2/note
Headers: X-s, X-t, Content-Type: application/json
```

请求体**模板**（图文 normal note，字段随版本变化，以校准结果为准）：

```json
{
  "common": {
    "type": "normal",
    "title": "标题(≤20字)",
    "note_id": "",
    "desc": "正文，可含 #话题 标签",
    "source": "{\"type\":\"web\"}",
    "business_binds": "{\"version\":1,\"noteId\":0,\"bizType\":0,\"noteOrderBind\":{},\"notePostTiming\":{},\"noteCollectionBind\":{\"id\":\"\"}}",
    "hash_tag": [],
    "at_users": [],
    "privacy_info": { "op_type": 1, "type": 0 },
    "post_loc": {}
  },
  "image_info": {
    "images": [
      {
        "file_id": "spectrum/xxxxx",
        "metadata": { "source": -1 },
        "stickers": { "version": 2, "floating": [] },
        "extra_info_json": "{\"mimeType\":\"image/png\"}"
      }
    ]
  },
  "video_info": null
}
```

响应 `{ code:0, success:true, data:{ id/noteId } }` 即发布成功。

## 校准 note 请求体（首次必做）

`edith` 接口无法通过 browser-use 抓到请求体，用注入 hook 抓取真实结构：

1. 打开创作页，`evaluate_script` 注入 [scripts/capture.js](scripts/capture.js)（hook `fetch` + `XMLHttpRequest`，把 permit/upload/note 的 url+headers+body 存入 `window.__xhsCap`）。
2. 用 DOM 方式手动发一篇最简图文（或让用户点一次发布）。
3. `evaluate_script` 读取 `window.__xhsCap`，得到：
   - 接口 2 的真实鉴权头名（校准上传）
   - 接口 3 的完整请求体（作为权威模板，替换 publish.js 里的模板）

校准一次后即可长期纯接口发布，直到小红书改版。

## 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| `status:406` | 缺签名或签名无效 | 确认 `_webmsxyw` 存在且 path 与实际请求完全一致（含 query） |
| `code:-1` / 401 | 登录态无效 | Cookie 未生效，改用浏览器已登录会话 |
| `_webmsxyw is not a function` | 前端改版 | 用签名函数定位脚本重新查找 |
| note 返回字段校验失败 | 请求体模板过期 | 重新执行"校准 note 请求体" |
| 图片上传 403 | 鉴权头名/位置不对 | 用 capture.js 校准接口 2 的头 |
| 标题报错 | 标题超 20 字 | 截断到 ≤20 字 |

## 已知辅助接口（非必需）

- `POST /api/galaxy/v2/creator/servicegw/v2/search/topics` — 话题搜索（拿话题热度/ID）
- `POST /api/galaxy/v2/creator/recommend/overt/topics` — 推荐话题
- `GET /api/media/v1/upload/creator/permit?scene=video` — 视频上传凭证（发视频用）
