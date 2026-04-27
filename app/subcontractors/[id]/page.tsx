import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProtectedLayout } from "@/components/protected-layout";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { serializeSubcontractor } from "@/lib/subcontractor-utils";
import { SubcontractorDetailClient } from "./_components/subcontractor-detail-client";

export default async function SubcontractorDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  if (!user?.id || !user.role) {
    redirect("/login");
  }

  const subcontractor = await prisma.subcontractor.findUnique({
    where: { id: params.id },
    include: {
      specialties: {
        include: {
          specialty: {
            select: { id: true, code: true, name: true, icon: true },
          },
        },
      },
      contracts: {
        select: {
          evaluations: {
            select: {
              willHireAgain: true,
            },
          },
        },
      },
    },
  });

  if (!subcontractor) {
    notFound();
  }

  const evaluations = subcontractor.contracts.flatMap((contract) => contract.evaluations);
  const evaluationCount = evaluations.length;
  const hireAgainCount = evaluations.filter((x) => x.willHireAgain).length;

  const payload = {
    ...serializeSubcontractor(subcontractor),
    specialties: subcontractor.specialties.map((m) => m.specialty),
    evaluationCount,
    hireAgainRate: evaluationCount > 0 ? Math.round((hireAgainCount / evaluationCount) * 100) : 0,
  };

  return (
    <ProtectedLayout>
      <div className="space-y-3">
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0] slide-up">
          <Link href="/subcontractors" className="hover:underline">Thầu phụ</Link>
          <span className="mx-2">&gt;</span>
          <span>{subcontractor.code}</span>
        </div>

        <SubcontractorDetailClient subcontractor={JSON.parse(JSON.stringify(payload))} />
      </div>
    </ProtectedLayout>
  );
}
