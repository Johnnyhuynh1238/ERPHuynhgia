import { prisma } from "@/lib/prisma";
import { PIPELINE_CONTRACT_DOC_KEY, PIPELINE_DOC_KEYS } from "@/lib/pipeline";
import { renderPipelinePortal } from "@/lib/pipeline-portal";
import { renderBidPortal } from "@/lib/bid-portal";
import {
  isBidSlug,
  isBidViewableDoc,
  loadBidAssets,
  minioKey,
  renderBidImage,
} from "@/lib/bid-invite";
import { getCurrentUser } from "@/lib/auth-helpers";
import {
  fillPipelineQuoteDates,
  guardPipelineContract,
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
//   ?doc=hop-dong          → file hợp đồng (chỉ khi admin đã chốt gửi khách; chặn in / lưu / sao chép).
// Link mời thầu nhân công huynhgia6.com/moi-thau-<mã> cũng về đây → bidResponse().
// HTML tải lên phục vụ kèm CSP sandbox → chạy ở origin "rỗng", không đọc được cookie/phiên của ERP hay website.
export async function GET(
  request: Request,
  { params }: { params: { slug: string } },
) {
  const slug = (params.slug || "").toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(slug))
    return page("Không tìm thấy trang", 404);
  if (isBidSlug(slug)) return bidResponse(request, slug);

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
    // HĐ chưa ký: khách chỉ xem trong cổng, không in / lưu / sao chép.
    const html = guardPipelineContract(c.contractHtml);
    return docResponse(
      q.get("embed") === "1" ? injectPipelineEmbed(html) : html,
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dayVn(d: Date | null | undefined) {
  if (!d) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// Trang mời thầu nhân công: chỉ mở khi admin bật (bidPublishedAt); admin đăng nhập ERP xem trước được.
//   không tham số  → trang mời thầu (thông tin + bản vẽ + phối cảnh + mô tả + HĐ mẫu)
//   ?img=d|p|c.<id>.<trang>[&z=1] → ảnh JPEG có dấu chìm (bản vẽ / phối cảnh / HĐ mẫu), không trả file gốc
//   ?doc=mo-ta     → mô tả phiên bản mới nhất (khung sandbox, chặn sao chép)
async function bidResponse(request: Request, slug: string) {
  const pipe = await prisma.projectPipeline.findUnique({
    where: { bidSlug: slug },
    select: {
      id: true,
      name: true,
      address: true,
      projectId: true,
      contractTerms: true,
      bidPublishedAt: true,
      bidNote: true,
      bidDocKeys: true,
      project: {
        select: {
          address: true,
          areaM2: true,
          startDate: true,
          expectedEndDate: true,
        },
      },
    },
  });
  if (!pipe) return page("Không tìm thấy trang", 404);
  let preview = false;
  if (!pipe.bidPublishedAt) {
    const user = await getCurrentUser().catch(() => null);
    if (user?.role !== "admin") return page("Link mời thầu đã đóng", 404);
    preview = true;
  }

  const q = new URL(request.url).searchParams;
  const docKeys = Array.isArray(pipe.bidDocKeys)
    ? (pipe.bidDocKeys as unknown[]).filter(
        (k): k is string => typeof k === "string",
      )
    : [];

  const img = q.get("img");
  if (img) {
    const m = /^([dpc])\.([0-9a-f-]{1,36})\.(\d{1,3})$/i.exec(img);
    if (!m) return new Response("Not found", { status: 404 });
    const [, kind, id, pageStr] = m;
    const pageNo = Number(pageStr);
    let key: string | null = null;
    if (kind === "d" && pipe.projectId && UUID_RE.test(id)) {
      const d = await prisma.projectDocument.findFirst({
        where: { id, projectId: pipe.projectId },
        select: { fileUrl: true },
      });
      key = minioKey(d?.fileUrl);
    } else if (kind === "p" && pipe.projectId && UUID_RE.test(id)) {
      const p = await prisma.designPhoto.findFirst({
        where: {
          id,
          group: { projectId: pipe.projectId, designStep: "phoi_canh" },
        },
        select: { photoUrl: true },
      });
      key = minioKey(p?.photoUrl);
    } else if (kind === "c" && /^\d+$/.test(id)) {
      const k = docKeys[Number(id)];
      key = k && isBidViewableDoc(k) ? k : null;
    }
    if (!key || pageNo < 1) return new Response("Not found", { status: 404 });
    const zoom = q.get("z") === "1";
    const maxSide =
      kind === "p" ? (zoom ? 2000 : 1100) : zoom ? 2800 : 1500;
    try {
      const buf = await renderBidImage(key, pageNo, maxSide);
      return new Response(buf as BodyInit, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=3600",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    } catch (e) {
      console.error("[moi-thau] render fail", key, pageNo, e);
      return new Response("Not found", { status: 404 });
    }
  }

  const latestDesc = await prisma.projectPipelineVersion.findFirst({
    where: { pipelineId: pipe.id, descriptionUpdatedAt: { not: null } },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true },
  });

  if (q.get("doc") === PIPELINE_DOC_KEYS.description) {
    if (!latestDesc) return page("Không tìm thấy trang", 404);
    const row = await prisma.projectPipelineVersion.findUnique({
      where: {
        pipelineId_versionNo: {
          pipelineId: pipe.id,
          versionNo: latestDesc.versionNo,
        },
      },
      select: { descriptionHtml: true },
    });
    if (!row?.descriptionHtml) return page("Không tìm thấy trang", 404);
    return docResponse(
      injectPipelineEmbed(guardPipelineContract(row.descriptionHtml)),
    );
  }
  if (q.get("doc")) return page("Không tìm thấy trang", 404);

  const assets = await loadBidAssets(pipe.projectId, docKeys);
  const terms = pipe.contractTerms as { areaM2?: unknown } | null;
  const area =
    typeof terms?.areaM2 === "number" && terms.areaM2 > 0
      ? terms.areaM2
      : pipe.project
        ? Number(pipe.project.areaM2) || null
        : null;
  const html = renderBidPortal({
    name: pipe.name,
    address: pipe.address || pipe.project?.address || "",
    areaM2: area,
    startDate: dayVn(pipe.project?.startDate),
    endDate: dayVn(pipe.project?.expectedEndDate),
    note: pipe.bidNote || "",
    drawings: assets.drawings,
    photos: assets.photos,
    docs: assets.docs,
    hasDescription: Boolean(latestDesc),
    preview,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
