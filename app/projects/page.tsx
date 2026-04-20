import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectsClient } from "./_components/projects-client";

export default async function ProjectsPage() {
  const user = await getCurrentUser();

  return (
    <ProtectedLayout>
      <ProjectsClient currentRole={(user?.role as string) || ""} />
    </ProtectedLayout>
  );
}
