import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { StageClient } from "./_components/stage-client";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Màn dự án theo giai đoạn (admin). ?gd=n mở sẵn giai đoạn n để xem lại.
export default async function DuAnStagePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { gd?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/?denied=1");
  if (!UUID_RE.test(params.id)) notFound();

  const p = await prisma.projectPipeline.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      customerName: true,
      customerPhone: true,
      address: true,
      slug: true,
      stage: true,
      status: true,
      stageDates: true,
      descriptionUpdatedAt: true,
      projectId: true,
      createdAt: true,
    },
  });
  if (!p) notFound();

  const gd = Number(searchParams?.gd);
  const initialView = Number.isInteger(gd) && gd >= 1 && gd <= p.stage ? gd : p.stage;

  return (
    <ProtectedLayout>
      <StageClient
        initialView={initialView}
        pipeline={{
          id: p.id,
          name: p.name,
          customerName: p.customerName,
          customerPhone: p.customerPhone,
          address: p.address,
          slug: p.slug,
          stage: p.stage,
          status: p.status,
          stageDates: (p.stageDates || {}) as Record<string, string>,
          descriptionUpdatedAt: p.descriptionUpdatedAt ? p.descriptionUpdatedAt.toISOString() : null,
          projectId: p.projectId,
          createdAt: p.createdAt.toISOString(),
        }}
      />
    </ProtectedLayout>
  );
}
