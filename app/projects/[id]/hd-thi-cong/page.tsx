import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildConstructionGuide } from "@/lib/construction-guide";
import type { GuideAdjust, GuideMode } from "@/lib/purchase-guide";
import { HdThiCongClient } from "./_components/hd-thi-cong-client";

export const metadata = { title: "HD thi công" };
export const dynamic = "force-dynamic";

const ALLOWED: UserRole[] = [UserRole.admin, UserRole.engineer, UserRole.construction_manager];

// HD thi công & nghiệm thu — màn app trong ERP (card theo hạng mục HĐ).
// Nút "In" mở bản A4 /hd-thi-cong/[id] (kèm biên bản ký tay) để giao giám sát dùng giấy.
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
      designContract: { select: { id: true, signedAt: true, quoteData: true } },
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
  const guide = dc?.quoteData ? buildConstructionGuide(dc.quoteData, adjusts) : null;

  return (
    <HdThiCongClient
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      customerName={project.customerName}
      contractId={dc?.id ?? null}
      signedAt={dc?.signedAt ? dc.signedAt.toISOString() : null}
      guide={guide}
      isAdmin={role === UserRole.admin}
      backHref={role === UserRole.engineer ? `/ks-ql/project/${project.id}` : `/projects/${project.id}`}
    />
  );
}
