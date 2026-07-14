// 小红书发布请求校准脚本 —— 在创作页上下文用 evaluate_script 注入。
//
// 目的：hook fetch 与 XMLHttpRequest，抓取 permit / 图片上传 PUT / 发布 note 的
// 真实 url + method + headers + body，用于校准 publish.js 里的上传鉴权头名和 note 请求体。
//
// 用法：
//   1) evaluate_script 执行本脚本（返回 "hooked"），完成注入。
//   2) 用 DOM 方式手动发一篇最简图文（或让用户点一次“发布”）。
//   3) evaluate_script 执行 READ_CAPTURE（见文件底部注释）读取 window.__xhsCap。

() => {
  if (window.__xhsCapInstalled) return "already hooked";
  window.__xhsCap = [];
  const KEY = /(upload\/creator\/permit|ros-upload|xhscdn\.com\/spectrum|\/web_api\/sns\/v2\/note)/;

  // hook fetch
  const rawFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (KEY.test(url)) {
        const rec = {
          via: "fetch",
          url,
          method: (init && init.method) || (input && input.method) || "GET",
          headers: init && init.headers ? JSON.parse(JSON.stringify(init.headers)) : {},
          body: init && typeof init.body === "string" ? init.body.slice(0, 4000) : (init && init.body ? "[binary]" : null),
          t: Date.now()
        };
        window.__xhsCap.push(rec);
      }
    } catch (e) {}
    return rawFetch.apply(this, arguments);
  };

  // hook XMLHttpRequest
  const RawOpen = XMLHttpRequest.prototype.open;
  const RawSend = XMLHttpRequest.prototype.send;
  const RawSetH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__cap = { via: "xhr", method: m, url: u, headers: {} };
    return RawOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this.__cap) this.__cap.headers[k] = v;
    return RawSetH.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__cap && KEY.test(this.__cap.url)) {
        this.__cap.body = typeof body === "string" ? body.slice(0, 4000) : (body ? "[binary]" : null);
        this.__cap.t = Date.now();
        window.__xhsCap.push(this.__cap);
      }
    } catch (e) {}
    return RawSend.apply(this, arguments);
  };

  window.__xhsCapInstalled = true;
  return "hooked";
}

// READ_CAPTURE（第 3 步单独执行）:
// () => (window.__xhsCap || []).map(r => ({ via:r.via, method:r.method, url:r.url, headerKeys:Object.keys(r.headers||{}), body:r.body }))
