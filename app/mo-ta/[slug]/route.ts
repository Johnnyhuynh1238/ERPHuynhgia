import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Báo chiều cao trang cho khung xem trong ERP (iframe cao đúng bằng nội dung → xem trọn trang).
const EMBED_SCRIPT = `<script>(function(){function s(){try{parent.postMessage({type:"hg-mota-height",h:Math.max(document.body.scrollHeight,document.documentElement.offsetHeight)},"*")}catch(e){}}
window.addEventListener("load",s);window.addEventListener("resize",s);try{new ResizeObserver(s).observe(document.body)}catch(e){}s();setTimeout(s,800)})();</script>`;

// File mô tả thường có khối cao 100vh (side-menu). Trong khung cao-theo-nội-dung, vh = chiều cao khung
// → phải chặn để không tự phình.
const EMBED_STYLE = `<style>html,body{overflow:hidden!important}</style>`;

function page(title: string, status: number) {
  return new Response(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#FBF7F2;color:#2B1810;display:grid;place-items:center;min-height:90vh;margin:0"><div style="text-align:center;padding:24px"><h1 style="font-size:20px">${title}</h1><p><a href="https://huynhgia6.com/" style="color:#A55A35">Về trang chủ Huỳnh Gia</a></p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

// Trang mô tả gói thi công công khai (khách mở huynhgia6.com/<slug>). HTML do admin tải lên,
// phục vụ kèm CSP sandbox → chạy ở origin "rỗng", không đọc được cookie/phiên của ERP hay website.
export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const slug = (params.slug || "").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(slug)) return page("Không tìm thấy trang", 404);

  const row = await prisma.projectPipeline.findUnique({
    where: { slug },
    select: { descriptionHtml: true },
  });
  if (!row) return page("Không tìm thấy trang", 404);
  if (!row.descriptionHtml) return page("Bản mô tả đang được chuẩn bị", 200);

  let html = row.descriptionHtml;
  if (new URL(request.url).searchParams.get("embed") === "1") {
    const inject = EMBED_STYLE + EMBED_SCRIPT;
    const idx = html.toLowerCase().lastIndexOf("</body>");
    html = idx >= 0 ? html.slice(0, idx) + inject + html.slice(idx) : html + inject;
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy":
        "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation",
    },
  });
}
