import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { buildProjectAccessWhere } from "@/lib/project-permissions";
import { AcceptanceBienBan } from "@/components/acceptance-bien-ban";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function StaffBienBanPage({ params }: { params: { id: string; milestoneId: string } }) {
  const user = await getCurrentUser();
  if (!user?.id || !user.role) redirect("/login");

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: {
      id: params.milestoneId,
      projectId: params.id,
      project: buildProjectAccessWhere({ id: user.id, role: user.role }),
    },
    include: { project: { select: { code: true, name: true, customerName: true, address: true } } },
  });
  if (!milestone) notFound();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-[720px] items-center justify-between px-8 pt-4 print:hidden">
        <Link href={`/projects/${params.id}/acceptance`} className="text-sm text-orange-600 hover:underline">
          ← Danh sách mốc
        </Link>
        <PrintButton />
      </div>
      <AcceptanceBienBan milestone={milestone} project={milestone.project} />
    </div>
  );
}
