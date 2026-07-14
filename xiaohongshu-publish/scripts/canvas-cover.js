// Canvas 封面图生成脚本 —— 在任意页面上下文用 evaluate_script 执行
//
// 返回 data:image/png;base64,... 格式的 data URI。
// agent 拿到返回值后，需要：
//   1. 读取 evaluate_script 写入的 txt 缓存文件
//   2. 提取 base64 部分
//   3. 用 python3 base64.b64decode 保存为本地 PNG 文件
//   4. 用 upload_file MCP 工具上传到创作页
//
// agent 可自定义 COVER_TITLE、COVER_SUBTITLE、BG_COLOR_1/2、TEXT_COLOR 等常量。

() => {
  // ===== 可自定义 =====
  const COVER_TITLE    = "NMAX 155";
  const COVER_SUBTITLE = "不是参数党，只聊日常好不好骑";
  const COVER_TAG      = "通勤 / 周末绕路 / 150级踏板";
  const COVER_FOOTER   = "摩友随手记";
  const BG_COLOR_1     = '#171717';
  const BG_COLOR_2     = '#34302a';
  const TEXT_COLOR      = '#f2eee8';
  const ACCENT_COLOR   = '#d8c4a8';
  // ===================

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');

  // 渐变背景
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, BG_COLOR_1);
  bg.addColorStop(1, BG_COLOR_2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 卡片边框
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(88, 100, 904, 1240);

  // 标题
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '700 88px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(COVER_TITLE, 150, 330);

  // 副标题
  ctx.font = '500 44px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(COVER_SUBTITLE, 150, 430);

  // 标签
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = '400 34px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(COVER_TAG, 150, 520);

  // 简单图示：两个车轮 + 车架线条
  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(345, 1015, 110, 0, Math.PI * 2);
  ctx.arc(735, 1015, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(345, 1015);
  ctx.lineTo(505, 860);
  ctx.lineTo(650, 1015);
  ctx.lineTo(735, 1015);
  ctx.moveTo(505, 860);
  ctx.lineTo(665, 835);
  ctx.stroke();

  // 底部水印
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = '500 38px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(COVER_FOOTER, 150, 1240);

  return canvas.toDataURL('image/png');
}
