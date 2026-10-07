import { prisma } from "@/lib/prisma";
import { requireCustomerPortalApiAccess } from "@/lib/customer-portal-v2";

// Cổng chủ nhà: hợp đồng đã ký (file HĐ của dự án theo tiến độ gắn với dự án này).
// Phục vụ kèm CSP sandbox như /mo-ta (HTML tải lên không đọc được cookie cổng).
export async function GET(
  _request: Request,
  { params }: { params: { token: string } },
) {
  const access = await requireCustomerPortalApiAccess(params.token);
  if (!access.ok)
    return new Response(access.message, {
      status: access.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  const pipe = await prisma.projectPipeline.findUnique({
    where: { projectId: access.project.id },
    select: { contractHtml: true, contractPublishedAt: true },
  });
  if (!pipe?.contractHtml || !pipe.contractPublishedAt)
    return new Response("Chưa có hợp đồng", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  return new Response(pipe.contractHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy":
        "sandbox allow-scripts allow-modals allow-popups allow-popups-to-escape-sandbox",
    },
  });
}
