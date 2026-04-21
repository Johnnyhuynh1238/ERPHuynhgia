import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectMembersClient } from "./_components/project-members-client";

export default async function ProjectMembersPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) {
    redirect("/login");
  }

  if (user.role !== UserRole.admin) {
    redirect(`/projects/${params.id}`);
  }

  return <ProjectMembersClient projectId={params.id} />;
}
