import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { KsQlTodayClient } from "./_components/today-client";

export const dynamic = "force-dynamic";

type SearchParams = { p?: string };

export default async function KsQlTodayPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const where = buildProjectAccessWhere({ id: user.id, role: user.role as string });

  const projects = await prisma.project.findMany({
    where: {
      ...where,
      status: { in: ["planning", "in_progress"] },
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      address: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const selectedProjectId = searchParams?.p && projects.some((p) => p.id === searchParams.p)
    ? searchParams.p
    : projects[0]?.id ?? null;

  return (
    <KsQlTodayClient
      user={{ id: user.id, name: user.name ?? "KS", role: user.role as string }}
      projects={projects}
      selectedProjectId={selectedProjectId}
    />
  );
}
