import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCustomerPortalSessionByToken } from "@/lib/auth-helpers";

export default async function CustomerJournalPage({ params }: { params: { token: string } }) {
  const { project, session } = await getCustomerPortalSessionByToken(params.token);
  if (!project || !session) notFound();

  const entries = await prisma.eveningReport.findMany({
    where: { projectId: project.id, submittedAt: { not: null } },
    orderBy: { reportDate: "desc" },
    take: 60,
    select: {
      id: true,
      reportDate: true,
      issues: true,
      overallRating: true,
      overallNote: true,
      reporter: { select: { fullName: true } },
    },
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Nhật ký thi công</h1>
          <Link className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1 text-xs" href={`/cn/${params.token}/journal/export.pdf`}>
            Tải PDF
          </Link>
        </div>
      </div>

      {entries.map((entry) => (
        <div key={entry.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm">
          <div className="font-semibold">{new Date(entry.reportDate).toLocaleDateString("vi-VN")}</div>
          <div className="text-[#8892b0]">Người báo cáo: {entry.reporter.fullName}</div>
          <div>Đánh giá: {entry.overallRating}</div>
          <div className="mt-1 text-[#d9def3]">{entry.overallNote || entry.issues || "-"}</div>
          <form action={`/cn/${params.token}/comments/new`} method="post" className="mt-3">
            <input type="hidden" name="eveningReportId" value={entry.id} />
            <textarea
              required
              name="content"
              rows={2}
              className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              placeholder="Bình luận cho nhật ký ngày này"
            />
            <button className="mt-2 rounded-lg bg-[#f97316] px-3 py-1 text-xs font-semibold text-black">Gửi bình luận</button>
          </form>
        </div>
      ))}
    </div>
  );
}
