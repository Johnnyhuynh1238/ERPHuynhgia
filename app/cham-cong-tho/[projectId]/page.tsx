import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ChamCongThoClient } from "./_components/cham-cong-tho-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { session?: string };
}) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  if (user.role !== "admin") {
    const membership = await prisma.projectMemberAssignment.findFirst({
      where: { userId: user.id, projectId: params.projectId },
      select: { id: true },
    });
    if (!membership) redirect("/reports");
  }

  const session = searchParams.session === "afternoon" ? "afternoon" : "morning";

  return <ChamCongThoClient projectId={params.projectId} initialSession={session} />;
}
