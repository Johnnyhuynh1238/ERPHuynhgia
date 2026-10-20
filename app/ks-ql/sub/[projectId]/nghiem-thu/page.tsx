import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { SubLayout } from "@/app/ks-ql/sub/_components/sub-layout";
import { findKsProject } from "@/lib/ks-ql-project-docs";
import { KsAcceptanceClient } from "./_components/ks-acceptance-client";

export const dynamic = "force-dynamic";

// Nghiệm thu cho KS màn gọn: admin tạo sẵn các đợt (mốc) ở /projects/[id]/acceptance,
// KS chỉ tải BB giấy đã ký + ảnh công trình cho từng đợt (dùng chung API photos).
export default async function KsAcceptancePage({
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
    <SubLayout title="Nghiệm thu chủ nhà" subtitle={project.name} backHref={`/ks-ql/sub/${project.id}/menu`}>
      <KsAcceptanceClient projectId={project.id} userId={user.id} initialOpen={searchParams.open} />
    </SubLayout>
  );
}
