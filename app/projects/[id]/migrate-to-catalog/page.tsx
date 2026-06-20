import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { MigrateClient } from "./_components/migrate-client";

type Props = { params: { id: string } };

export default async function MigrateToCatalogPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.role !== "construction_manager") {
    redirect("/?denied=1");
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, code: true },
  });
  if (!project) notFound();

  return (
    <ProtectedLayout>
      <MigrateClient projectId={params.id} projectName={project.name} projectCode={project.code} />
    </ProtectedLayout>
  );
}
