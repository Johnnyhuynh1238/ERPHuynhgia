import { RouteToast } from "@/app/_components/route-toast";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ProjectsSwitch } from "./_components/projects-switch";

type ProjectsPageProps = {
  searchParams?: {
    denied?: string;
    deleted?: string;
  };
};

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const user = await getCurrentUser();
  const deletedName = searchParams?.deleted || undefined;

  return (
    <ProtectedLayout>
      <RouteToast denied={searchParams?.denied} deletedName={deletedName} />
      <ProjectsSwitch currentRole={(user?.role as string) || ""} />
    </ProtectedLayout>
  );
}
