import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { buildPurchaseGuide, type GuideAdjust, type GuideMode } from "@/lib/purchase-guide";
import { HuongDanClient } from "./_components/huong-dan-client";

export const metadata = { title: "Hướng dẫn mua hàng" };
export const dynamic = "force-dynamic";

const ALLOWED: UserRole[] = [
  UserRole.admin,
  UserRole.accountant,
  UserRole.engineer,
  UserRole.construction_manager,
];

// Hướng dẫn mua hàng = phụ lục vật tư HĐ ký với khách (quote_data của HĐ gắn dự án)
// + điều chỉnh theo phụ lục (AI ghi thẳng bảng purchase_guide_adjusts, không sửa trên UI).
// KT: căn cứ mua. Giám sát: căn cứ nhận hàng.
export default async function HuongDanMuaHangPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const role = user.role as UserRole;
  if (!ALLOWED.includes(role)) redirect(`/projects/${params.id}?denied=huong-dan-mua-hang`);

  const project = await prisma.project.findFirst({
    where: { id: params.id, ...buildProjectAccessWhere({ id: user.id, role }) },
    select: {
      id: true,
      code: true,
      name: true,
      customerName: true,
      designContract: { select: { id: true, signedAt: true, quoteData: true, quoteUpdatedAt: true } },
      purchaseGuideAdjusts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) notFound();

  const dc = project.designContract;
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
  const guide = dc?.quoteData ? buildPurchaseGuide(dc.quoteData, adjusts) : null;

  return (
    <HuongDanClient
      projectCode={project.code}
      projectName={project.name}
      customerName={project.customerName}
      contractId={dc?.id ?? null}
      signedAt={dc?.signedAt ? dc.signedAt.toISOString() : null}
      quoteUpdatedAt={dc?.quoteUpdatedAt ? dc.quoteUpdatedAt.toISOString() : null}
      guide={guide}
      isAdmin={role === UserRole.admin}
      backHref={role === UserRole.engineer ? `/ks-ql/project/${project.id}` : `/projects/${project.id}`}
    />
  );
}
