// Copy text vào clipboard, KHÔNG hiện dialog/prompt cho người dùng.
// navigator.clipboard chỉ chạy trong secure context (https) — fallback dùng
// textarea ẩn + execCommand để vẫn copy được mà không phải copy tay.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // rơi xuống fallback bên dưới
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Đặt ngoài màn hình để không nhấp nháy / không đẩy layout.
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length); // iOS Safari cần range mới copy được
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
