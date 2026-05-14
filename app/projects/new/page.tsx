import Link from "next/link";
import { redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { RouteToast } from "@/app/_components/route-toast";
import { ProjectsNewForm } from "./_components/projects-new-form";

export default async function ProjectsNewPage({ searchParams }: { searchParams?: { draftId?: string } }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/?denied=1");
  }

  return (
    <ProtectedLayout>
      <RouteToast denied={undefined} />
      <div className="space-y-4">
        <div className="text-sm text-slate-500">
          <Link href="/projects" className="hover:underline">
            Dự án
          </Link>
          <span className="mx-2">&gt;</span>
          <span>Tạo mới</span>
        </div>

        <h1 className="text-2xl font-semibold text-[#1F4E79]">Tạo dự án mới</h1>

        <ProjectsNewForm
          currentUserId={user.id}
          currentUserRole={user.role}
          currentUserName={user.name ?? ""}
          initialDraftId={searchParams?.draftId}
        />
      </div>
    </ProtectedLayout>
  );
}
