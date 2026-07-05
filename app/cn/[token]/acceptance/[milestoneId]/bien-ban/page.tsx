import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AcceptanceBienBan } from "@/components/acceptance-bien-ban";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function CustomerBienBanPage({ params }: { params: { token: string; milestoneId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: project.id, status: "signed" },
  });
  if (!milestone) notFound();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-[720px] items-center justify-between px-8 pt-4 print:hidden">
        <Link href={`/cn/${params.token}/timeline`} className="text-sm text-orange-600 hover:underline">
          ← Tiến độ
        </Link>
        <PrintButton />
      </div>
      <AcceptanceBienBan
        milestone={milestone}
        project={{
          code: project.code,
          name: project.name,
          customerName: project.customerName,
          address: project.address,
        }}
      />
    </div>
  );
}
