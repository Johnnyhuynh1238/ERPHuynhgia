import { RouteToast } from "@/app/_components/route-toast";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectsClient } from "./_components/projects-client";

type ProjectsPageProps = {
  searchParams?: {
    denied?: string;
  };
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const user = await getCurrentUser();

  return (
    <ProtectedLayout>
      <RouteToast denied={searchParams?.denied} />
      <ProjectsClient currentRole={(user?.role as string) || ""} />
    </ProtectedLayout>
  );
}
