import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AcceptanceSignForm } from "../../_components/acceptance-sign-form";

export const dynamic = "force-dynamic";

export default async function CustomerAcceptancePage({ params }: { params: { token: string; milestoneId: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const milestone = await prisma.acceptanceMilestone.findFirst({
    where: { id: params.milestoneId, projectId: project.id },
  });
  if (!milestone) notFound();

  return (
    <div className="owner-portal-page">
      <section className="owner-section">
        <Link href={`/cn/${params.token}/timeline`} className="text-xs text-orange-300 underline">
          ← Tiến độ
        </Link>
        <div className="mt-2 owner-section-title">MỐC NGHIỆM THU #{milestone.seq}</div>
        <h1 className="mt-1 text-lg font-bold text-white">{milestone.title}</h1>
        {milestone.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm owner-muted">{milestone.description}</p>
        ) : null}
      </section>

      {milestone.status === "signed" ? (
        <section className="owner-section border border-emerald-500/30 bg-emerald-500/10">
          <div className="text-sm text-emerald-200">
            ✓ Đã ký nghiệm thu lúc {milestone.signedAt?.toLocaleString("vi-VN")}
            {milestone.signerName ? ` bởi ${milestone.signerName}` : ""}. Cảm ơn quý chủ nhà.
          </div>
        </section>
      ) : (
        <AcceptanceSignForm
          action={`/cn/${params.token}/acceptance/${milestone.id}/sign`}
          defaultSignerName={project.customerName}
        />
      )}
    </div>
  );
}
