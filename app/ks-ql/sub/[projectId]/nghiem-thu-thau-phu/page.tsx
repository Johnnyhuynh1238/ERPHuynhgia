import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { findKsProject } from "@/lib/ks-ql-project-docs";
import { KsAcceptanceClient } from "../nghiem-thu/_components/ks-acceptance-client";

export const dynamic = "force-dynamic";

// Nghiệm thu thầu phụ (đội khoán): các đợt thanh toán theo Phụ lục 03 HĐ khoán, mỗi đợt kèm
// BB công tác NT-xx phải ký đạt. KS + tổ trưởng ký giấy, KS up BB + ảnh. Không hiện cổng CN.
export default async function KsSubAcceptancePage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { open?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");

  const project = await findKsProject(params.projectId, user.id);
  if (!project) notFound();

  return (
    <SubLayout title="Nghiệm thu thầu phụ" subtitle={project.name} backHref={`/ks-ql/sub/${project.id}/menu`}>
      <KsAcceptanceClient projectId={project.id} userId={user.id} initialOpen={searchParams.open} group="thau_phu" />
    </SubLayout>
  );
}
