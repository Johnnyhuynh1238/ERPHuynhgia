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
