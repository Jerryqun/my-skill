// 小红书图文笔记发布脚本 —— 在创作页（creator.xiaohongshu.com）上下文用 evaluate_script 执行。
//
// 用法：agent 复制本函数体，替换 PLACEHOLDER（TITLE / DESC / IMAGE_DATA_URIS），
// 作为 evaluate_script 的 function 参数执行。图片必须以 data:image/...;base64,... 内联，
// 因为页面上下文无法读取本地文件。
//
// 依赖：window._webmsxyw（签名函数，已验证存在）+ 已登录 Cookie。
// 接口 2（上传）鉴权头 UPLOAD_TOKEN_HEADER 与接口 3（note）请求体，
// 首次使用请先用 capture.js 校准后再替换本文件对应部分。

async () => {
  // ===== 需填充 =====
  const TITLE = "PLACEHOLDER_TITLE";              // ≤20 字
  const DESC  = "PLACEHOLDER_DESC";               // 正文，可含 #话题
  const IMAGE_DATA_URIS = [
    "PLACEHOLDER_DATA_URI_1"                        // "data:image/png;base64,...."，多图加多项
  ];
  const UPLOAD_TOKEN_HEADER = "X-Cos-Security-Token"; // 校准后确认；候选见 reference.md
  // ==================

  const CREATOR = "https://creator.xiaohongshu.com";
  const EDITH   = "https://edith.xiaohongshu.com";
  const log = [];

  const signed = (path, body) => {
    const s = window._webmsxyw(path, body || null);
    return { "X-s": s["X-s"], "X-t": String(s["X-t"]) };
  };

  try {
    // ---- 接口 1：拿上传凭证 ----
    const n = IMAGE_DATA_URIS.length;
    const permitPath = `/api/media/v1/upload/creator/permit?biz_name=spectrum&scene=image&file_count=${n}&version=1&source=web`;
    const permitRes = await fetch(CREATOR + permitPath, {
      method: "GET", credentials: "include", headers: signed(permitPath, null)
    });
    const permitJson = await permitRes.json();
    if (permitJson.code !== 0) return { ok: false, step: "permit", resp: permitJson };
    const permits = permitJson.data.uploadTempPermits;
    log.push("permit ok, fileIds=" + n);

    // ---- 接口 2：逐张上传图片 ----
    const fileIds = [];
    for (let i = 0; i < n; i++) {
      const p = permits[Math.min(i, permits.length - 1)];
      const fileId = p.fileIds[0] || p.fileIds[i];
      const blob = await (await fetch(IMAGE_DATA_URIS[i])).blob();
      const uploadUrl = `https://${p.uploadAddr}/${fileId}`;
      const upHeaders = { "Content-Type": blob.type || "image/png" };
      upHeaders[UPLOAD_TOKEN_HEADER] = p.token;
      const upRes = await fetch(uploadUrl, { method: "PUT", body: blob, headers: upHeaders });
      if (!upRes.ok) return { ok: false, step: "upload", index: i, status: upRes.status, log };
      fileIds.push(fileId);
      log.push("uploaded " + fileId);
    }

    // ---- 接口 3：发布笔记（请求体模板，校准后替换）----
    const notePath = "/web_api/sns/v2/note";
    const noteBody = {
      common: {
        type: "normal",
        title: TITLE.slice(0, 20),
        note_id: "",
        desc: DESC,
        source: "{\"type\":\"web\"}",
        business_binds: "{\"version\":1,\"noteId\":0,\"bizType\":0,\"noteOrderBind\":{},\"notePostTiming\":{},\"noteCollectionBind\":{\"id\":\"\"}}",
        hash_tag: [],
        at_users: [],
        privacy_info: { op_type: 1, type: 0 },
        post_loc: {}
      },
      image_info: {
        images: fileIds.map(fid => ({
          file_id: fid,
          metadata: { source: -1 },
          stickers: { version: 2, floating: [] },
          extra_info_json: "{\"mimeType\":\"image/png\"}"
        }))
      },
      video_info: null
    };
    const noteRes = await fetch(EDITH + notePath, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...signed(notePath, noteBody) },
      body: JSON.stringify(noteBody)
    });
    const noteJson = await noteRes.json();
    log.push("note status=" + noteRes.status + " code=" + noteJson.code);
    return { ok: noteJson.code === 0 || noteJson.success === true, step: "note", resp: noteJson, log };

  } catch (e) {
    return { ok: false, error: e.message, log };
  }
}
