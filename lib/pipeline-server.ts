import { prisma } from "@/lib/prisma";

export type PipelineVersionMeta = {
  versionNo: number;
  note: string | null;
  descriptionUpdatedAt: string | null;
  quoteUpdatedAt: string | null;
  quoteTotal: number | null;
  quotePublishedAt: string | null;
  costUpdatedAt: string | null;
  costTotal: number | null;
  createdAt: string;
};

export type PipelineState = {
  id: string;
  name: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  slug: string;
  stage: number;
  status: string;
  stageDates: Record<string, string>;
  contractVersionNo: number | null;
  contractUpdatedAt: string | null;
  contractPublishedAt: string | null;
  projectId: string | null;
  createdAt: string;
  versions: PipelineVersionMeta[];
};

// Báo chiều cao trang cho khung xem trong ERP (iframe cao đúng bằng nội dung → xem trọn trang).
const EMBED_SCRIPT = `<script>(function(){function s(){try{parent.postMessage({type:"hg-mota-height",h:Math.max(document.body.scrollHeight,document.documentElement.offsetHeight)},"*")}catch(e){}}
window.addEventListener("load",s);window.addEventListener("resize",s);try{new ResizeObserver(s).observe(document.body)}catch(e){}s();setTimeout(s,800)})();</script>`;

// File mô tả thường có khối cao 100vh (side-menu). Trong khung cao-theo-nội-dung, vh = chiều cao khung
// → phải chặn để không tự phình.
const EMBED_STYLE = `<style>html,body{overflow:hidden!important}</style>`;

export function injectPipelineEmbed(html: string): string {
  const inject = EMBED_STYLE + EMBED_SCRIPT;
  const idx = html.toLowerCase().lastIndexOf("</body>");
  return idx >= 0
    ? html.slice(0, idx) + inject + html.slice(idx)
    : html + inject;
}

// HĐ gửi khách khi CHƯA ký: chỉ xem, không in / lưu / sao chép.
// File có bản xem A4 dạng ảnh (.a4v) → bỏ hẳn lớp chữ, khách chỉ nhận ảnh trang (không bôi đen / tìm chữ được).
// Chặn chuột phải, bôi đen, kéo ảnh, Ctrl+P/S/C/A/U; khi in → trang trắng kèm lời nhắc.
// Không chặn được chụp màn hình — lời nhắc trên cổng nói rõ.
const NOCOPY_STYLE = `<style>html,body{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
img{pointer-events:none!important;-webkit-user-drag:none}
.hg-nocopy{display:none}
@media print{body>*:not(.hg-nocopy){display:none!important}.hg-nocopy{display:block!important;font:16px/1.5 system-ui,sans-serif;padding:40px;text-align:center}}</style>`;
const NOCOPY_SCRIPT = `<script>(function(){function no(e){e.preventDefault();return false}
["contextmenu","copy","cut","dragstart","selectstart"].forEach(function(t){document.addEventListener(t,no,true)});
document.addEventListener("keydown",function(e){var k=(e.key||"").toLowerCase();if((e.ctrlKey||e.metaKey)&&"pscau".indexOf(k)>=0||k==="printscreen")no(e)},true)})();</script>`;
const NOCOPY_NOTE = `<div class="hg-nocopy">Hợp đồng chưa ký — Huỳnh Gia không cho phép in hoặc lưu bản này.</div>`;

export function guardPipelineContract(html: string): string {
  const lower = html.toLowerCase();
  const a4 = lower.indexOf('<div class="a4v">');
  const head = lower.indexOf("</head>");
  if (a4 >= 0 && head >= 0 && head < a4) {
    const end = lower.indexOf("</div>", a4);
    if (end > a4)
      html =
        html.slice(0, head) +
        "</head><body>" +
        html.slice(a4, end + 6) +
        "</body></html>";
  }
  const h = html.toLowerCase().indexOf("</head>");
  html =
    h >= 0
      ? html.slice(0, h) + NOCOPY_STYLE + html.slice(h)
      : NOCOPY_STYLE + html;
  const b = html.toLowerCase().lastIndexOf("</body>");
  const tail = NOCOPY_NOTE + NOCOPY_SCRIPT;
  return b >= 0 ? html.slice(0, b) + tail + html.slice(b) : html + tail;
}

// File báo giá có thể đặt {{HG_NGAY_BAO_GIA}} / {{HG_HAN_BAO_GIA}}: ngày anh bấm chốt (giờ Việt Nam)
// và ngày hết hiệu lực (chốt + 30 ngày). Chưa chốt → ghi rõ để admin xem trước không nhầm.
export const QUOTE_VALID_DAYS = 30;

export function fillPipelineQuoteDates(
  html: string,
  publishedAt: Date | null,
): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const fmt = (t: number) => {
    const d = new Date(t + 7 * 3600 * 1000);
    return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  };
  const day = publishedAt ? fmt(publishedAt.getTime()) : "(chưa chốt)";
  const due = publishedAt
    ? fmt(publishedAt.getTime() + QUOTE_VALID_DAYS * 86400 * 1000)
    : "(chưa chốt)";
  return html
    .split("{{HG_NGAY_BAO_GIA}}")
    .join(day)
    .split("{{HG_HAN_BAO_GIA}}")
    .join(due);
}

// Trạng thái đầy đủ của 1 dự án pipeline cho màn giai đoạn (không kèm HTML — HTML xem qua /mo-ta/...).
export async function loadPipelineState(
  id: string,
): Promise<PipelineState | null> {
  const p = await prisma.projectPipeline.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      customerName: true,
      customerPhone: true,
      address: true,
      slug: true,
      stage: true,
      status: true,
      stageDates: true,
      contractVersionNo: true,
      contractUpdatedAt: true,
      contractPublishedAt: true,
      projectId: true,
      createdAt: true,
      versions: {
        orderBy: { versionNo: "asc" },
        select: {
          versionNo: true,
          note: true,
          descriptionUpdatedAt: true,
          quoteUpdatedAt: true,
          quoteTotal: true,
          quotePublishedAt: true,
          costUpdatedAt: true,
          costTotal: true,
          createdAt: true,
        },
      },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    customerName: p.customerName,
    customerPhone: p.customerPhone,
    address: p.address,
    slug: p.slug,
    stage: p.stage,
    status: p.status,
    stageDates: (p.stageDates || {}) as Record<string, string>,
    contractVersionNo: p.contractVersionNo,
    contractUpdatedAt: p.contractUpdatedAt
      ? p.contractUpdatedAt.toISOString()
      : null,
    contractPublishedAt: p.contractPublishedAt
      ? p.contractPublishedAt.toISOString()
      : null,
    projectId: p.projectId,
    createdAt: p.createdAt.toISOString(),
    versions: p.versions.map((v) => ({
      versionNo: v.versionNo,
      note: v.note,
      descriptionUpdatedAt: v.descriptionUpdatedAt
        ? v.descriptionUpdatedAt.toISOString()
        : null,
      quoteUpdatedAt: v.quoteUpdatedAt ? v.quoteUpdatedAt.toISOString() : null,
      quoteTotal: v.quoteTotal === null ? null : Number(v.quoteTotal),
      quotePublishedAt: v.quotePublishedAt
        ? v.quotePublishedAt.toISOString()
        : null,
      costUpdatedAt: v.costUpdatedAt ? v.costUpdatedAt.toISOString() : null,
      costTotal: v.costTotal === null ? null : Number(v.costTotal),
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
