// 页面交互：填写标题 + 正文（单次 evaluate_script 调用）
//
// 在创作页编辑界面（图片上传后出现的表单页）用 evaluate_script 执行。
// agent 替换 PLACEHOLDER_TITLE 和 PLACEHOLDER_DESC 即可。
//
// 注意：
// - 标题 input 必须用 native setter 才能触发 Vue/React 状态更新
// - 正文编辑器是 TipTap（ProseMirror），必须用 execCommand('insertText') 注入
// - MCP 的 fill 工具对小红书 input 可能超时，所以用 evaluate_script 代替

async () => {
  const TITLE = "PLACEHOLDER_TITLE"; // ≤20字
  const DESC  = "PLACEHOLDER_DESC";  // 正文，可含 #话题

  // ---- 填写标题 ----
  const titleInput = document.querySelector('input[placeholder="填写标题会有更多赞哦"]');
  if (!titleInput) return { ok: false, error: "title input not found" };
  titleInput.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeSetter.call(titleInput, TITLE.slice(0, 20));
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));

  // ---- 填写正文 ----
  const editor = document.querySelector('.tiptap.ProseMirror');
  if (!editor) return { ok: false, error: "editor not found", titleOk: true };
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, DESC);
  editor.dispatchEvent(new Event('input', { bubbles: true }));

  return {
    ok: true,
    titleValue: titleInput.value,
    bodyText: editor.innerText.slice(0, 200)
  };
}
