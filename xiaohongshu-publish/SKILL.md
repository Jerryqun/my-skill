---
name: xiaohongshu-publish
description: 通过浏览器页面交互发布图文笔记到小红书创作平台。在已登录的浏览器里模拟真实操作（上传图片→填标题→填正文→点发布），等同于用户自己在网页上操作，不易触发风控。当用户要"发小红书""发布小红书图文/笔记""把内容发到小红书""自动发小红书"时使用。依赖 browser-use MCP 和浏览器已登录小红书创作平台。
---

# 小红书图文笔记发布（页面交互）

## 能力概述

通过 **browser-use MCP 模拟真实页面交互** 发布图文笔记，等效于用户在网页上手动操作。

**为什么不走接口直连？**
> 直接调 `POST /web_api/sns/v2/note` 接口即使返回 `code:0 / success:true`，也可能因 HTTP 461（小红书自定义状态码）被风控拦截——接口返回假成功但笔记实际未创建。页面交互方式走的是平台自身 UI 流程，不触发风控。

## 前置条件

- **browser-use MCP** 可用（`navigate_page` / `evaluate_script` / `take_snapshot` / `upload_file` / `click` 等）。
- **登录态**：浏览器已登录小红书创作平台（`creator.xiaohongshu.com`）。
  - 若未登录，先 `navigate_page` 到 `https://www.xiaohongshu.com`，`evaluate_script` 注入用户提供的 Cookie，再导航到创作页。
  - `web_session` 常为 httpOnly，`document.cookie` 写入可能无效；最可靠的方式是让用户在浏览器里手动登录一次。
- **图片**：用户提供的本地图片路径，或 agent 在浏览器内用 Canvas 生成的封面图。

## 工作流

复制以下清单跟踪进度：

```
- [ ] Step 1: 打开创作页并确认登录态
- [ ] Step 2: 准备图片（用户提供 或 Canvas 生成封面）
- [ ] Step 3: 上传图片到创作页
- [ ] Step 4: 填写标题和正文
- [ ] Step 5: 点击发布
- [ ] Step 6: 验证发布结果
```

### Step 1: 打开创作页并确认登录态

`navigate_page` 到 `https://creator.xiaohongshu.com/publish/publish?source=official`。

用 `evaluate_script` 检查是否需要登录（只读探测）：

```javascript
async () => {
  const path = '/api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=1&version=1&source=web';
  const r = await fetch('https://creator.xiaohongshu.com' + path, { method: 'GET', credentials: 'include' });
  const j = await r.json();
  return { status: r.status, code: j.code, loggedIn: r.status === 200 && j.code === 0 };
}
```

- `loggedIn:true` → 登录态有效，继续。
- 否则 → 提示用户在浏览器里登录，或注入 Cookie。

### Step 2: 准备图片

**方案 A：用户提供本地图片路径**
直接使用用户提供的 `.jpg/.jpeg/.png/.webp` 文件路径。

**方案 B：Canvas 生成文字封面图**

若用户没有图片，可在浏览器里用 Canvas 生成封面。执行 [scripts/canvas-cover.js](scripts/canvas-cover.js)（替换其中的常量即可）：

```
evaluate_script → 返回 data URI（写入 txt 缓存文件）
→ python3 提取 base64 并保存为 /tmp/cover.png
→ upload_file 上传到创作页
```

> Canvas 返回的 data URI 很长（300KB+），MCP 会将其写入 txt 缓存文件。agent 需要读取该文件、提取 `data:image/png;base64,` 后面的部分，用 `python3 base64.b64decode` 保存为本地 PNG。

### Step 3: 上传图片到创作页

1. 确保当前在图文发布页（已切到「上传图文」Tab）。
2. 找到文件选择控件（`take_snapshot` 中的 `button "选择文件"`），用 `upload_file` 上传图片：

```
upload_file: { uid: "选择文件的uid", filePath: "/path/to/image.png" }
```

3. 上传成功后页面自动跳转到编辑界面（出现 `textbox "填写标题会有更多赞哦"` 和 `.tiptap.ProseMirror` 编辑器）。

> **注意**：`fill` MCP 工具对小红书的 input 可能会超时，标题和正文应使用 `evaluate_script` 填写。

### Step 4: 填写标题和正文

执行 [scripts/fill-form.js](scripts/fill-form.js)（替换 `PLACEHOLDER_TITLE` 和 `PLACEHOLDER_DESC`），一次调用完成标题 + 正文填写。

关键技术点：
- **标题**（≤ 20 字）：必须用 `HTMLInputElement.prototype.value` 的 native setter 触发 Vue/React 状态更新，直接 `input.value = ...` 不生效。
- **正文**：编辑器是 TipTap（ProseMirror），必须用 `document.execCommand('insertText', false, desc)` 注入，直接操作 innerText/innerHTML 不触发编辑器状态。

### Step 5: 点击发布

1. `take_snapshot` 确认标题、正文、图片都已正确填入。
2. 找到 `button "发布"` 的 uid，用 `click` 点击：

```
click: { uid: "发布按钮uid" }
```

3. 点击后按钮变为 `disabled`，页面自动处理上传和提交。
4. 等待 3-5 秒后，URL 会跳转到 `?published=true`，草稿箱数量减 1。

### Step 6: 验证发布结果

`navigate_page` 到 `https://creator.xiaohongshu.com/new/note-manager`，用 `evaluate_script` 读取页面文本：

```javascript
async () => {
  await new Promise(r => setTimeout(r, 2000));
  return document.body.innerText.slice(0, 600);
}
```

确认列表中出现刚发布的标题。笔记可能处于以下状态之一：
- **已发布** — 直接上线
- **审核中** — 等待平台审核（正常，通常几分钟到几小时）
- **未通过** — 审核未通过，需检查内容

## 实战踩坑记录

> 以下为 2025-07 实测发布流程时遇到的问题，后续使用时可直接跳过。

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| MCP `fill` 工具超时 | 小红书前端框架对 fill 事件模拟响应慢 | 改用 `evaluate_script` + native setter（见 fill-form.js） |
| MCP `click` 工具超时 | 部分元素（如草稿箱的"编辑"按钮）不是标准可点击元素 | 用 `evaluate_script` + `dispatchEvent(new MouseEvent('click'))` |
| 草稿箱出现"暂无笔记标题" | 页面自动保存未完成的内容到 localStorage | 正常现象，不影响发布。可在草稿箱里点"删除"清理 |
| 接口返回 `code:0` 但笔记不存在 | HTTP 461 风控拦截，返回假成功 | 改用页面交互方式；发布后务必到笔记管理页验证 |
| 发布后笔记状态为"审核中" | 小红书所有新笔记都需审核 | 正常，通常几分钟到几小时 |
| `take_snapshot` 的 uid 跨次调用变化 | 每次 snapshot 重新生成 uid | 每次操作前重新 `take_snapshot` 获取最新 uid |

## 内容建议

- **标题**：≤ 20 字，简洁有力，带关键词吸引目标用户。
- **正文**：口语化、真实感，避免营销腔和模板化用语。可含 3-5 个 `#话题` 标签。
- **图片**：支持 `.jpg/.jpeg/.png/.webp`，单张最大 32MB，推荐 3:4 竖版，分辨率不低于 720×960。

## 关键约束

- **仅用于发布用户本人账号、本人授权的内容**。
- **不得用于批量养号、刷量、绕过风控**等违规用途。
- 使用频率应克制，避免短时间内高频发布触发风控。
- 草稿箱内容存储在浏览器 localStorage，清除浏览器数据时会被删除。

## 备用方案：接口直连（不推荐）

若页面交互方式因改版失效，可参考 [reference.md](reference.md) 的接口直连方式。

> **风险警告**：接口直连可能返回 HTTP 461 假成功（`code:0` 但笔记未实际创建），需额外验证笔记管理页确认。

## 参考

- 页面 DOM 选择器、接口字段、故障排查：[reference.md](reference.md)
- 填写标题+正文脚本：[scripts/fill-form.js](scripts/fill-form.js)
- Canvas 封面图生成脚本：[scripts/canvas-cover.js](scripts/canvas-cover.js)
- 接口直连脚本模板（备用）：[scripts/publish.js](scripts/publish.js)
- 抓包校准脚本：[scripts/capture.js](scripts/capture.js)
