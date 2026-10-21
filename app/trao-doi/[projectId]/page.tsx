import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { findTopicProject } from "@/lib/project-topics";

export const dynamic = "force-dynamic";

// Link chung trong thông báo/Zalo của ô trao đổi → chuyển về màn đúng vai trò:
// KS phụ trách dự án → màn KS (menu dự án); admin/KT → màn dự án (/projects/[id], ô nằm sẵn trong màn);
// vai trò khác → /projects/[id]/trao-doi.
export default async function TraoDoiRedirect({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { t?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");
  const project = await findTopicProject(params.projectId, { id: user.id, role: user.role });
  if (!project) notFound();

  const q = searchParams.t && /^[0-9a-f-]{36}$/i.test(searchParams.t) ? `?t=${searchParams.t}` : "";
  const isKs =
    user.role === "engineer" &&
    (await prisma.projectMemberAssignment.count({
      where: { projectId: project.id, userId: user.id, role: "pm_engineer" },
    })) > 0;
  if (isKs) redirect(`/ks-ql/sub/${project.id}/menu${q}`);
  if (user.role === "admin" || user.role === "accountant") redirect(`/projects/${project.id}${q}`);
  redirect(`/projects/${project.id}/trao-doi${q}`);
}
