---
name: xiaohongshu-publish
description: 通过接口自动发布图文笔记到小红书创作平台，不依赖页面点击。核心是在已登录的浏览器页面上下文里调用小红书自带签名函数 window._webmsxyw 生成 x-s/x-t 签名后直接 fetch 接口（获取上传凭证→上传图片→发布）。当用户要"发小红书""发布小红书图文/笔记""把内容发到小红书""自动发小红书"时使用。依赖 browser-use MCP 和用户提供的登录 Cookie。
---

# 小红书图文笔记自动发布（走接口）

## 能力概述

通过**接口**发布图文笔记，比 DOM 点击快得多。核心机制已实测验证：

- 小红书接口需要签名 `x-s` / `x-t`，**手动裸 fetch 会返回 406**。
- 页面里存在签名函数 `window._webmsxyw(path, body)`，返回 `{'X-s','X-t'}`；带上后接口返回 `200 / code:0`（已验证）。
- 因此不需要逆向签名算法，只需**在已登录的小红书页面上下文里**调用该函数再 fetch。

发布链路（3 个接口，域名 `creator.xiaohongshu.com` 与 `edith.xiaohongshu.com`）：

1. `GET /api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=N&version=1&source=web` — 拿上传凭证（`token` + `fileIds` + `uploadAddr`）
2. `PUT https://{uploadAddr}/{fileId}` — 上传图片二进制
3. `POST https://edith.xiaohongshu.com/web_api/sns/v2/note` — 提交发布

## 前置条件

- **browser-use MCP** 可用（`navigate_page` / `evaluate_script` / `take_snapshot` 等）。
- **登录态**：用户提供 Cookie（至少 `web_session`，通常还需 `a1`、`webId`、`gid`），或浏览器已登录小红书创作平台。
- **图片**：可用 `ImageGen` 生成本地图片，或使用用户提供的图片路径。

## 工作流

复制以下清单跟踪进度：

```
- [ ] Step 1: 注入登录 Cookie 并打开创作页
- [ ] Step 2: 探测签名函数是否就绪
- [ ] Step 3: 首次使用 → 校准 note 请求体模板（见 reference.md）
- [ ] Step 4: 准备内容与图片（转 base64 data URI）
- [ ] Step 5: 执行发布脚本（permit→upload→note）
- [ ] Step 6: 验证发布结果
```

### Step 1: 注入 Cookie 并打开创作页

先 `navigate_page` 到 `https://www.xiaohongshu.com`（拿到域），再用 `evaluate_script` 写入用户提供的 Cookie，然后导航到创作页：

```javascript
// evaluate_script：注入非 httpOnly 可写的 cookie（web_session 等）
() => {
  const raw = "web_session=XXX; a1=XXX; webId=XXX; gid=XXX"; // 用户提供
  raw.split(';').forEach(p => {
    const s = p.trim(); if (!s) return;
    document.cookie = s + "; domain=.xiaohongshu.com; path=/";
  });
  return document.cookie.length;
}
```

再 `navigate_page` 到 `https://creator.xiaohongshu.com/publish/publish?source=official`。

> 注意：`web_session` 常为 httpOnly，`document.cookie` 写入的同名值不一定被服务器接受。若 Step 2 探测失败或接口返回 401/-1，改用"浏览器已登录会话"（让用户在浏览器里手动登录一次），这是最可靠的登录态来源。

### Step 2: 探测签名函数

用 `evaluate_script` 确认签名函数与登录态就绪（只读、安全）：

```javascript
async () => {
  const path = '/api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=1&version=1&source=web';
  const sign = window._webmsxyw(path, null);
  const r = await fetch('https://creator.xiaohongshu.com' + path, {
    method: 'GET', credentials: 'include',
    headers: { 'X-s': sign['X-s'], 'X-t': String(sign['X-t']) }
  });
  const j = await r.json();
  return { signOk: !!sign['X-s'], status: r.status, code: j.code, hasData: !!j.data };
}
```

期望 `{ signOk:true, status:200, code:0, hasData:true }`。若 `status:406` → 签名未生效；若 `code:-1`/401 → 登录态无效（回到 Step 1 用浏览器会话）。

### Step 3: 首次使用先校准请求体模板

`POST /web_api/sns/v2/note` 的请求体字段会随小红书版本变化。**首次接入必须校准一次**，方法见 [reference.md](reference.md) 的"校准 note 请求体"章节（注入抓包 hook → 手动 DOM 发一篇 → 读取真实请求体作为权威模板）。校准后把模板固化到发布脚本里。

### Step 4: 准备内容与图片

- 标题 ≤ 20 字（超限接口/页面会报"标题最多输入20字"）。
- 正文可含话题标签 `#xxx`，建议带 3-5 个高热度标签。
- 图片：`ImageGen` 生成后，用 `base64 -i 图片路径` 读出 base64，拼成 `data:image/png;base64,....` 供页面脚本 `fetch(dataUri)` 转 Blob 上传（`evaluate_script` 无法读本地文件，必须内联 data URI）。

### Step 5: 执行发布脚本

读取并按注释填充 [scripts/publish.js](scripts/publish.js)（内联 data URI、title、desc），通过 `evaluate_script` 在创作页上下文执行。脚本内部完成 permit→PUT 上传→POST note 全链路，每个请求都用 `_webmsxyw` 签名。

### Step 6: 验证结果

发布接口返回 `code:0 / success:true` 即成功。可再 `navigate_page` 到 `https://creator.xiaohongshu.com/publish/publish?published=true` 或笔记管理页确认。

## 关键约束与安全

- **仅用于发布用户本人账号、本人授权的内容**，属于合法自动化；不得用于批量养号、刷量、绕过风控等违规用途。
- 依赖内部函数名 `_webmsxyw`，小红书前端更新可能改名/改签名逻辑；若失效，用 `reference.md` 的探测脚本重新定位签名函数。
- 直接调私有接口可能触及平台服务条款，使用频率应克制、拟人化。

## 参考

- 接口字段、请求体模板、校准方法、故障排查：[reference.md](reference.md)
- 发布核心脚本模板：[scripts/publish.js](scripts/publish.js)
- 抓包校准脚本：[scripts/capture.js](scripts/capture.js)
