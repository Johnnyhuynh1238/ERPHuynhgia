import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { ACCEPTANCE_UPLOAD_ROLES } from "@/lib/acceptance-photos";
import { ESIGN_CHU_NHA_ON, ensureEsign, esignSummary, sendKsLink } from "@/lib/acceptance-esign";

export const runtime = "nodejs";

/**
 * Bắt đầu ký online cho 1 mốc nghiệm thu: tạo phiên (hoặc dùng lại phiên đang mở) và
 * gửi Zalo link điền + ký cho KS. Trả về link để KS mở thẳng trên máy.
 */
export async function POST(_req: Request, { params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  if (!ACCEPTANCE_UPLOAD_ROLES.has(user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const m = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: params.id, project: buildProjectAccessWhere({ id: user.id, role: user.role }) },
    select: { id: true, status: true, kind: true },
  });
  if (!m) return NextResponse.json({ message: "Không tìm thấy mốc nghiệm thu" }, { status: 404 });
  if (m.status === "signed") return NextResponse.json({ message: "Mốc này đã nghiệm thu rồi" }, { status: 400 });
  if (m.kind === "chu_nha" && !ESIGN_CHU_NHA_ON)
    return NextResponse.json({ message: "Ký online với chủ nhà chưa mở — dùng BB giấy" }, { status: 400 });

  const { esign, created } = await ensureEsign(m.id, { id: user.id, role: user.role });
  // Phiên mới hoặc đang chờ KS → gửi (lại) link Zalo cho KS.
  const zalo = esign.status === "ks_draft" ? await sendKsLink(esign) : null;
  const fresh = (await prisma.acceptanceEsign.findUnique({ where: { id: esign.id } }))!;
  return NextResponse.json({
    created,
    zalo,
    esign: esignSummary(fresh),
    message:
      esign.status === "ks_draft"
        ? zalo
          ? "Đã gửi link ký qua Zalo cho KS"
          : "Chưa gửi được Zalo cho KS — mở link trực tiếp"
        : "Biên bản đang chờ khách ký",
  });
}
