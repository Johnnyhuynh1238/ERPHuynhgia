import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildConstructionGuide } from "@/lib/construction-guide";
import { loadTechniques } from "@/lib/construction-technique-db";
import type { GuideAdjust, GuideMode } from "@/lib/purchase-guide";
import { HdDoc } from "./_components/hd-doc";

export const metadata = { title: "HD thi công" };
export const dynamic = "force-dynamic";

const ALLOWED: UserRole[] = [UserRole.admin, UserRole.engineer, UserRole.construction_manager];

// HD thi công & nghiệm thu — tài liệu A4 để IN cho giám sát dùng giấy tại công trình.
// Route ngoài /projects/[id] để không dính AppShell (bản in sạch). Nội dung đọc từ HĐ
// (quote_data) + phụ lục (purchase_guide_adjusts) + mẫu Kỹ thuật thi công (construction_techniques).
export default async function HdThiCongPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const role = user.role as UserRole;
  if (!ALLOWED.includes(role)) redirect(`/projects/${params.id}?denied=hd-thi-cong`);

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role }) },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      address: true,
      designContract: { select: { signedAt: true, quoteData: true } },
      purchaseGuideAdjusts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const adjusts: GuideAdjust[] = project.purchaseGuideAdjusts.map((a) => ({
    itemKey: a.itemKey,
    mode: a.mode as GuideMode,
    groupName: a.groupName,
    ten: a.ten,
    loai: a.loai,
    quycach: a.quycach,
    note: a.note,
    source: a.source,
  }));
  const dc = project.designContract;
  // điểm dừng + trình tự lấy từ thư viện mẫu Kỹ thuật thi công (tile /ky-thuat-thi-cong)
  const guide = dc?.quoteData ? buildConstructionGuide(dc.quoteData, adjusts, await loadTechniques()) : null;
  const plSources = Array.from(new Set(adjusts.map((a) => a.source).filter((s): s is string => !!s)));

  return (
    <HdDoc
      projectCode={project.code}
      projectName={project.name}
      customerName={project.customerName}
      address={project.address}
      signedAt={dc?.signedAt ? dc.signedAt.toISOString() : null}
      plSources={plSources}
      guide={guide}
      backHref={`/projects/${project.id}/hd-thi-cong`}
    />
  );
}
