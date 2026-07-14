# 小红书发布参考文档

## 页面交互 DOM 选择器参考

> 以下选择器基于 2025-07 实测。小红书前端可能更新，如失效请用 `take_snapshot` 重新确认。

### 发布页关键元素

| 用途 | 选择器 | 说明 |
|------|---------|------|
| 图文 Tab | `.creator-tab`（文本含"上传图文"） | 点击切换到图文发布模式 |
| 文件上传 input | `input.upload-input` (type=file) | 用 `upload_file` MCP 工具上传图片 |
| 标题输入框 | `input.d-text[placeholder="填写标题会有更多赞哦"]` | 必须用 native setter 填值 |
| 正文编辑器 | `div.tiptap.ProseMirror` (contenteditable) | 用 `execCommand('insertText')` 填值 |
| 发布按钮 | `button`（文本="发布"） | 点击后变为 disabled，等 URL 跳转 |
| 暂存离开按钮 | `button`（文本="暂存离开"） | 保存为草稿不发布 |

### 笔记管理页 (`/new/note-manager`)

| 用途 | 选择器 | 说明 |
|------|---------|------|
| 笔记列表 | 页面 body innerText | 包含所有笔记标题和状态 |
| "审核中" Tab | 文本="审核中" 的 tab 元素 | 新发布的笔记默认在此状态 |
| 草稿箱入口 | 文本含"草稿箱(N)" 的元素 | 点击展开草稿箱面板 |
| 草稿"编辑"按钮 | 草稿项内的"编辑"文本 | 不是标准 button，需用 dispatchEvent 点击 |

### 填写表单的正确方式

```javascript
// 标题：必须用 native setter
const nativeSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value').set;
nativeSetter.call(titleInput, title);
titleInput.dispatchEvent(new Event('input', { bubbles: true }));
titleInput.dispatchEvent(new Event('change', { bubbles: true }));

// 正文：必须用 execCommand
const editor = document.querySelector('.tiptap.ProseMirror');
editor.focus();
document.execCommand('insertText', false, desc);
editor.dispatchEvent(new Event('input', { bubbles: true }));
```

### 点击非标准按钮的 workaround

草稿箱的"编辑"按钮不是标准 `<button>`，MCP click 会超时。用 dispatchEvent：

```javascript
() => {
  const draftItems = document.querySelectorAll('[class*="draft"]');
  // 找到目标草稿项内的"编辑"文本元素
  const editEl = /* 定位逻辑 */;
  editEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
```

## 接口直连参考（FALLBACK ONLY）

> ⚠️ 接口直连可能返回 HTTP 461 + `code:0` 假成功，笔记实际未创建。
> 仅当页面交互方式失效时使用，且发布后必须到笔记管理页验证。

### 签名机制 ✅

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

## 接口直连详细参考（FALLBACK ONLY）

> 以下内容仅供页面交互失效时参考。正常情况下不需要。

### 接口 1：获取上传凭证

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

### 页面交互问题

| 现象 | 原因 | 处理 |
|------|------|------|
| MCP `fill` 超时 | 小红书前端框架对 fill 事件响应慢 | 改用 `evaluate_script` + native setter |
| MCP `click` 超时 | 非标准按钮元素（如草稿"编辑"） | 改用 `evaluate_script` + dispatchEvent |
| `upload_file` 后页面未跳转 | 上传触发慢或 Tab 未切换 | 等 2-3 秒，或手动点击"上传图文" Tab |
| 标题显示为空 | 未用 native setter | 必须用 `HTMLInputElement.prototype.value.set` |
| 正文无内容 | 直接操作 innerText | 必须用 `execCommand('insertText')` |
| 草稿箱出现"暂无笔记标题" | 页面自动保存 | 正常现象，可手动删除 |
| 笔记管理页找不到笔记 | 仍在审核中 | 切到"审核中" Tab 查看 |
| uid 失效 | snapshot 每次重新生成 | 每次操作前重新 `take_snapshot` |

### 接口直连问题（FALLBACK）

| 现象 | 原因 | 处理 |
|------|------|------|
| HTTP 461 + `code:0` | 风控拦截，假成功 | 笔记未创建，改用页面交互 |
| `status:406` | 缺签名或签名无效 | 确认 `_webmsxyw` 存在且 path 一致 |
| `code:-1` / 401 | 登录态无效 | Cookie 未生效，改用浏览器已登录会话 |
| `_webmsxyw is not a function` | 前端改版 | 用签名函数定位脚本重新查找 |
| note 返回字段校验失败 | 请求体模板过期 | 重新执行"校准 note 请求体" |
| 图片上传 403 | 鉴权头名/位置不对 | 用 capture.js 校准接口 2 的头 |
| 标题报错 | 标题超 20 字 | 截断到 ≤20 字 |

## 已知辅助接口（非必需）

- `POST /api/galaxy/v2/creator/servicegw/v2/search/topics` — 话题搜索（拿话题热度/ID）
- `POST /api/galaxy/v2/creator/recommend/overt/topics` — 推荐话题
- `GET /api/media/v1/upload/creator/permit?scene=video` — 视频上传凭证（发视频用）
