import { prisma } from "@/lib/prisma";
import { PIPELINE_CONTRACT_DOC_KEY, PIPELINE_DOC_KEYS } from "@/lib/pipeline";
import { renderPipelinePortal } from "@/lib/pipeline-portal";
import {
  fillPipelineQuoteDates,
  injectPipelineEmbed,
} from "@/lib/pipeline-server";

export const dynamic = "force-dynamic";

function page(title: string, status: number) {
  return new Response(
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#FBF7F2;color:#2B1810;display:grid;place-items:center;min-height:90vh;margin:0"><div style="text-align:center;padding:24px"><h1 style="font-size:20px">${title}</h1><p><a href="https://huynhgia6.com/" style="color:#A55A35">Về trang chủ Huỳnh Gia</a></p></div></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

// Link khách huynhgia6.com/<slug> (nginx proxy về đây) — 1 link cho cả dự án:
//   không tham số        → trang cổng: tab Mô tả / Báo giá + chọn phiên bản V1, V2…
//   ?doc=mo-ta|bao-gia&v=n → HTML admin tải lên của phiên bản đó (trang cổng và ERP nhúng vào khung).
//   ?doc=hop-dong          → file hợp đồng (chỉ khi admin đã chốt gửi khách).
// HTML tải lên phục vụ kèm CSP sandbox → chạy ở origin "rỗng", không đọc được cookie/phiên của ERP hay website.
export async function GET(
  request: Request,
  { params }: { params: { slug: string } },
) {
  const slug = (params.slug || "").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(slug))
    return page("Không tìm thấy trang", 404);

  const pipe = await prisma.projectPipeline.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      customerName: true,
      contractUpdatedAt: true,
      contractPublishedAt: true,
    },
  });
  if (!pipe) return page("Không tìm thấy trang", 404);

  const q = new URL(request.url).searchParams;
  const doc = q.get("doc");

  if (!doc) {
    const versions = await prisma.projectPipelineVersion.findMany({
      where: { pipelineId: pipe.id },
      orderBy: { versionNo: "asc" },
      select: {
        versionNo: true,
        createdAt: true,
        descriptionUpdatedAt: true,
        quoteUpdatedAt: true,
        quotePublishedAt: true,
      },
    });
    if (!versions.length) return page("Hồ sơ dự án đang được chuẩn bị", 200);
    const p2 = (n: number) => String(n).padStart(2, "0");
    const portal = renderPipelinePortal({
      name: pipe.name,
      customerName: pipe.customerName,
      hasContract: Boolean(pipe.contractUpdatedAt && pipe.contractPublishedAt),
      versions: versions.map((v) => {
        // ngày theo giờ Việt Nam (server chạy UTC)
        const d = new Date(v.createdAt.getTime() + 7 * 3600 * 1000);
        return {
          no: v.versionNo,
          date: `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`,
          hasDescription: Boolean(v.descriptionUpdatedAt),
          hasQuote: Boolean(v.quoteUpdatedAt && v.quotePublishedAt),
        };
      }),
    });
    return new Response(portal, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  if (doc === PIPELINE_CONTRACT_DOC_KEY) {
    if (!pipe.contractPublishedAt)
      return page("Hợp đồng đang được chuẩn bị", 200);
    const c = await prisma.projectPipeline.findUnique({
      where: { id: pipe.id },
      select: { contractHtml: true },
    });
    if (!c?.contractHtml) return page("Hợp đồng đang được chuẩn bị", 200);
    return docResponse(
      q.get("embed") === "1"
        ? injectPipelineEmbed(c.contractHtml)
        : c.contractHtml,
    );
  }

  const isQuote = doc === PIPELINE_DOC_KEYS.quote;
  if (!isQuote && doc !== PIPELINE_DOC_KEYS.description)
    return page("Không tìm thấy trang", 404);
  const versionNo = Number(q.get("v"));
  if (!Number.isInteger(versionNo) || versionNo < 1)
    return page("Không tìm thấy trang", 404);

  const row = await prisma.projectPipelineVersion.findUnique({
    where: { pipelineId_versionNo: { pipelineId: pipe.id, versionNo } },
    select: { descriptionHtml: true, quoteHtml: true, quotePublishedAt: true },
  });
  if (!row) return page("Không tìm thấy trang", 404);

  let html = (isQuote ? row.quoteHtml : row.descriptionHtml) || "";
  // Báo giá chưa chốt công bố: khách chưa thấy giá. Admin xem trước trong ERP qua /api/admin/pipeline/.../doc.
  if (isQuote && !row.quotePublishedAt) html = "";
  if (!html)
    return page(
      isQuote ? "Báo giá đang được chuẩn bị" : "Bản mô tả đang được chuẩn bị",
      200,
    );

  if (isQuote) html = fillPipelineQuoteDates(html, row.quotePublishedAt);
  if (q.get("embed") === "1") html = injectPipelineEmbed(html);
  return docResponse(html);
}

function docResponse(html: string) {
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
